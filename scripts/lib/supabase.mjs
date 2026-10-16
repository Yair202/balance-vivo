/**
 * scripts/lib/supabase.mjs
 * ---------------------------------------------------------------------------
 * Acceso a la base de datos de Supabase (gastos de caja menor + historial de
 * arqueos) vía su API REST (PostgREST), usando la llave secreta (server-side
 * nada más — nunca se expone al navegador). No usamos la librería oficial
 * @supabase/supabase-js a propósito: evita una dependencia más, fetch directo
 * a la API REST alcanza perfecto para lo que necesitamos.
 * ---------------------------------------------------------------------------
 */

import { randomInt } from "node:crypto";

function headers(env) {
  const key = env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function supaFetch(env, path, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const resp = await fetch(url, { ...options, headers: { ...headers(env), ...(options.headers || {}) } });
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Supabase ${resp.status}: ${texto}`);
  }
  // Sin "Prefer: return=representation" Supabase responde sin cuerpo.
  const texto = await resp.text();
  return texto ? JSON.parse(texto) : null;
}

export async function listarGastosDelDia(env, fecha) {
  return supaFetch(env, `gastos_caja?fecha=eq.${fecha}&arqueo_id=is.null&order=hora.asc`);
}

export async function agregarGasto(env, { fecha, descripcion, valor, creadoPor }) {
  const [fila] = await supaFetch(env, "gastos_caja", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fecha, descripcion, valor, creado_por: creadoPor || null }),
  });
  return fila;
}

export async function borrarGasto(env, id) {
  await supaFetch(env, `gastos_caja?id=eq.${id}`, { method: "DELETE" });
}

export async function guardarArqueo(env, datos) {
  const { fecha, responsable, sesionOdoo, teorico, contado, gastosTotal, gastosIds, base } = datos;
  const totalAjustado = contado + gastosTotal;
  const diferencia = totalAjustado - teorico;
  const estado = Math.abs(diferencia) < 50 ? "cuadra" : diferencia < 0 ? "faltante" : "sobrante";

  const [arqueo] = await supaFetch(env, "arqueos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      fecha, responsable, sesion_odoo: sesionOdoo || null,
      teorico, contado, gastos_total: gastosTotal, total_ajustado: totalAjustado,
      diferencia, estado, resuelto: estado === "cuadra",
      base: base ?? null,
    }),
  });

  if (gastosIds?.length) {
    await supaFetch(env, `gastos_caja?id=in.(${gastosIds.join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ arqueo_id: arqueo.id }),
    });
  }

  return arqueo;
}

export async function listarArqueos(env, { desde, hasta, limite = 60 } = {}) {
  let filtro = "";
  if (desde) filtro += `&fecha=gte.${desde}`;
  if (hasta) filtro += `&fecha=lte.${hasta}`;
  const arqueos = await supaFetch(env, `arqueos?order=creado_en.desc&limit=${limite}${filtro}`);
  if (!arqueos.length) return arqueos;

  // Gastos de caja menor que se usaron en cada arqueo, para mostrarlos en el historial.
  const gastos = await supaFetch(env, `gastos_caja?arqueo_id=in.(${arqueos.map((a) => a.id).join(",")})&order=hora.asc`);
  return arqueos.map((a) => ({ ...a, gastos: gastos.filter((g) => g.arqueo_id === a.id) }));
}

export async function ajustarArqueo(env, id, { notaAdmin, resuelto }) {
  const cambios = {};
  if (notaAdmin !== undefined) cambios.nota_admin = notaAdmin;
  if (resuelto !== undefined) cambios.resuelto = resuelto;
  const [fila] = await supaFetch(env, `arqueos?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(cambios),
  });
  return fila;
}

// --- Administrador: recolección de dinero y pago de turnos -----------------

const AJUSTES_DEFAULT = {
  empleados: [],
  pctComision: 0, // % sobre la venta total del día (ventas brutas del balance)
  // Valor del turno por día de la semana (0 = domingo ... 6 = sábado).
  tarifas: { 0: 60000, 1: 55000, 2: 55000, 3: 55000, 4: 55000, 5: 55000, 6: 55000 },
};

export async function obtenerAjustes(env) {
  const filas = await supaFetch(env, "ajustes?clave=eq.arqueo");
  const valor = filas[0]?.valor || {};
  return { ...AJUSTES_DEFAULT, ...valor, tarifas: { ...AJUSTES_DEFAULT.tarifas, ...(valor.tarifas || {}) } };
}

export async function guardarAjustes(env, valor) {
  await supaFetch(env, "ajustes?on_conflict=clave", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ clave: "arqueo", valor, actualizado_en: new Date().toISOString() }),
  });
}

// Nombres que ya aparecen en arqueos guardados — se usan para la lista
// desplegable mientras el administrador no haya configurado la suya.
export async function responsablesUsados(env) {
  const filas = await supaFetch(env, "arqueos?select=responsable&order=creado_en.desc&limit=300");
  const nombres = new Map();
  for (const f of filas) {
    const n = (f.responsable || "").trim();
    if (n && !nombres.has(n.toLowerCase())) nombres.set(n.toLowerCase(), n.charAt(0).toUpperCase() + n.slice(1));
  }
  return [...nombres.values()];
}

export async function listarArqueosAdmin(env, limite = 400) {
  return supaFetch(env, `arqueos?order=creado_en.desc&limit=${limite}`);
}

export async function marcarRecogido(env, ids, recogido) {
  await supaFetch(env, `arqueos?id=in.(${ids.join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ recogido, recogido_en: recogido ? new Date().toISOString() : null }),
  });
}

export async function marcarTurno(env, ids, { pagado, valor, adicional }) {
  const cambios = {};
  if (pagado !== undefined) {
    cambios.turno_pagado = pagado;
    cambios.turno_pagado_en = pagado ? new Date().toISOString() : null;
    // Si se des-marca, la comisión vuelve a calcularse con el % y la venta actuales.
    if (!pagado) cambios.comision_turno = null;
  }
  if (valor !== undefined) cambios.valor_turno = valor;
  if (adicional !== undefined) cambios.adicional_turno = adicional;
  await supaFetch(env, `arqueos?id=in.(${ids.join(",")})`, { method: "PATCH", body: JSON.stringify(cambios) });
}

// Al pagar un turno se deja fijo su valor: si después cambian la tarifa del
// día, los turnos ya pagados no deben cambiar.
// `calcular(fila)` devuelve { valor, comision } tal como se ven hoy.
export async function congelarTurno(env, ids, calcular) {
  const filas = await supaFetch(env, `arqueos?id=in.(${ids.join(",")})&or=(valor_turno.is.null,comision_turno.is.null)`);
  for (const f of filas) {
    const { valor, comision } = calcular(f);
    await supaFetch(env, `arqueos?id=eq.${f.id}`, {
      method: "PATCH",
      body: JSON.stringify({ valor_turno: f.valor_turno ?? valor, comision_turno: f.comision_turno ?? comision }),
    });
  }
}

// --- Rifa (/rifa) -----------------------------------------------------------

const AJUSTES_RIFA_DEFAULT = {
  valorBoleta: 130000,   // 1 número por cada $130.000 de una misma factura
  totalNumeros: 1000,    // números del 000 al 999
  inicio: "2026-10-15",  // solo cuentan compras desde esta fecha (hora Colombia)
  fin: "",               // vacío = sin fecha de cierre
  fechaSorteo: "",
  premio: "",
};

export async function obtenerAjustesRifa(env) {
  const filas = await supaFetch(env, "ajustes?clave=eq.rifa");
  return { ...AJUSTES_RIFA_DEFAULT, ...(filas[0]?.valor || {}) };
}

export async function guardarAjustesRifa(env, valor) {
  await supaFetch(env, "ajustes?on_conflict=clave", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ clave: "rifa", valor, actualizado_en: new Date().toISOString() }),
  });
}

export async function registroRifaPorFactura(env, factura) {
  const [fila] = await supaFetch(env, `rifa_registros?factura=eq.${encodeURIComponent(factura)}&select=*,rifa_boletas(numero)`);
  return fila || null;
}

// Crea el registro. Si la misma factura se registró al mismo tiempo desde otro
// celular, la base lo rechaza (factura es única) y se devuelve null.
export async function crearRegistroRifa(env, datos) {
  try {
    const [fila] = await supaFetch(env, "rifa_registros", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(datos),
    });
    return fila;
  } catch (e) {
    if (String(e.message).includes("Supabase 409")) return null;
    throw e;
  }
}

export async function borrarRegistroRifa(env, id) {
  await supaFetch(env, `rifa_registros?id=eq.${id}`, { method: "DELETE" });
}

export async function numerosRifaOcupados(env) {
  const filas = await supaFetch(env, "rifa_boletas?select=numero");
  return new Set(filas.map((f) => f.numero));
}

// Asigna `cantidad` números al azar entre los libres. El número es la llave de
// la tabla, así que si dos clientes se registran a la vez y les sale el mismo,
// la base rechaza el segundo y se vuelve a sortear (nunca hay repetidos).
export async function asignarNumerosRifa(env, registroId, cantidad, totalNumeros) {
  const asignados = [];
  for (let intento = 0; intento < 10 && asignados.length < cantidad; intento++) {
    const ocupados = await numerosRifaOcupados(env);
    const libres = [];
    for (let n = 0; n < totalNumeros; n++) if (!ocupados.has(n)) libres.push(n);
    if (!libres.length) break;
    for (let i = libres.length - 1; i > 0; i--) { // mezcla (Fisher-Yates)
      const j = randomInt(i + 1);
      [libres[i], libres[j]] = [libres[j], libres[i]];
    }
    for (const numero of libres.slice(0, cantidad - asignados.length)) {
      try {
        await supaFetch(env, "rifa_boletas", { method: "POST", body: JSON.stringify({ numero, registro_id: registroId }) });
        asignados.push(numero);
      } catch (e) {
        if (!String(e.message).includes("Supabase 409")) throw e;
      }
    }
  }
  return asignados.sort((a, b) => a - b);
}

export async function listarRegistrosRifa(env) {
  return supaFetch(env, "rifa_registros?select=*,rifa_boletas(numero)&order=creado_en.desc&limit=5000");
}

// Foto del premio: en su propia fila de `ajustes` (no junto a los demás ajustes
// de la rifa) para que la página no la descargue cada vez que pide la
// configuración — se pide aparte y el navegador la guarda en caché.
export async function obtenerFotoRifa(env) {
  const filas = await supaFetch(env, "ajustes?clave=eq.rifa_foto");
  return filas[0]?.valor?.dataUrl || null;
}

export async function guardarFotoRifa(env, dataUrl) {
  if (!dataUrl) {
    await supaFetch(env, "ajustes?clave=eq.rifa_foto", { method: "DELETE" });
    return;
  }
  await supaFetch(env, "ajustes?on_conflict=clave", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ clave: "rifa_foto", valor: { dataUrl }, actualizado_en: new Date().toISOString() }),
  });
}
