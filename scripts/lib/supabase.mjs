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
  if (resp.status === 204) return null;
  return resp.json();
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
  return [...new Set(filas.map((f) => (f.responsable || "").trim()).filter(Boolean))];
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

export async function marcarTurno(env, ids, { pagado, valor }) {
  const cambios = {};
  if (pagado !== undefined) {
    cambios.turno_pagado = pagado;
    cambios.turno_pagado_en = pagado ? new Date().toISOString() : null;
  }
  if (valor !== undefined) cambios.valor_turno = valor;
  await supaFetch(env, `arqueos?id=in.(${ids.join(",")})`, { method: "PATCH", body: JSON.stringify(cambios) });
}

// Al pagar un turno se deja fijo su valor: si después cambian la tarifa del
// día, los turnos ya pagados no deben cambiar.
export async function congelarValorTurno(env, ids, tarifas, fechaDe) {
  const filas = await supaFetch(env, `arqueos?id=in.(${ids.join(",")})&valor_turno=is.null&select=id,fecha,creado_en`);
  for (const f of filas) {
    const dia = new Date(`${fechaDe(f)}T12:00:00`).getDay();
    await supaFetch(env, `arqueos?id=eq.${f.id}`, {
      method: "PATCH",
      body: JSON.stringify({ valor_turno: Number(tarifas[dia]) || 0 }),
    });
  }
}
