/**
 * api/arqueo-admin.js
 * ---------------------------------------------------------------------------
 * Lo que solo ve el administrador en /arqueo:
 *   - Dinero por recoger: lo que se va acumulando guardado día a día (contado
 *     menos la base que se deja en caja) hasta que el administrador lo recoge.
 *   - Pago de turnos: un turno por cada día que alguien cerró la caja.
 *   - Ajustes: lista de empleados (para la lista desplegable) y valor del
 *     turno por día de la semana.
 *
 *   GET  -> nombres para la lista desplegable (sin clave, la usa el conteo)
 *   POST { contrasena, accion, ... }
 *        accion "resumen"         -> días (recolección + turnos) y ajustes
 *        accion "recogido"        { ids, recogido }
 *        accion "turno"           { ids, pagado?, medio?, valor?, adicional? }
 *                                 (medio "nequi" | "efectivo", obligatorio al pagar;
 *                                  en efectivo se descuenta del dinero por recoger
 *                                  de ese día)
 *        accion "guardarAjustes"  { ajustes }
 * ---------------------------------------------------------------------------
 */
import {
  obtenerAjustes, guardarAjustes, responsablesUsados,
  listarArqueosAdmin, marcarRecogido, marcarTurno, congelarTurno, obtenerMediosTurno,
} from "../scripts/lib/supabase.mjs";
import { obtenerAperturas } from "../scripts/lib/valor-teorico.mjs";

const fechaBogota = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// Si se guardó más de un arqueo para la misma sesión de Odoo (lo volvieron a
// guardar), solo cuenta el más reciente — si no, se sumaría doble.
function agruparPorSesion(arqueos) {
  const grupos = new Map();
  for (const a of arqueos) { // vienen del más nuevo al más viejo
    const clave = a.sesion_odoo || `id-${a.id}`;
    if (!grupos.has(clave)) grupos.set(clave, { ...a, ids: [a.id] });
    else grupos.get(clave).ids.push(a.id);
  }
  return [...grupos.values()];
}

const fechaDe = (f) => (f.creado_en ? fechaBogota(f.creado_en) : f.fecha);

// Venta total por día (la misma "Ventas brutas" del balance), del JSON que la
// sincronización con Odoo deja publicado junto a la app.
async function ventasPorDia(origen) {
  try {
    const resp = await fetch(`${origen}/datos-ventas.json`, { cache: "no-store" });
    const datos = await resp.json();
    return Object.fromEntries(datos.map((d) => [d.fecha, Number(d.ventasBrutas) || 0]));
  } catch {
    return {};
  }
}

// Turno + comisión tal como se ven hoy (antes de pagar). Al pagar se congelan.
function calcularTurno(f, ajustes, ventas) {
  const fecha = fechaDe(f);
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const venta = ventas[fecha] ?? 0;
  return {
    venta,
    valor: f.valor_turno != null ? Number(f.valor_turno) : Number(ajustes.tarifas[diaSemana]) || 0,
    comision: f.comision_turno != null ? Number(f.comision_turno) : Math.round((venta * (Number(ajustes.pctComision) || 0)) / 100),
  };
}

const MEDIOS_PAGO = ["nequi", "efectivo"];

const origenDe = (req) => `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

async function resumen(env, origen) {
  const [ajustes, arqueos, ventas, medios] = await Promise.all([
    obtenerAjustes(env), listarArqueosAdmin(env), ventasPorDia(origen), obtenerMediosTurno(env),
  ]);
  const dias = agruparPorSesion(arqueos);

  // Arqueos viejos (de antes de registrar la base): la base es el saldo de
  // apertura de esa sesión en Odoo.
  const sinBase = dias.filter((d) => d.base == null && d.sesion_odoo).map((d) => d.sesion_odoo);
  let aperturas = {};
  try { aperturas = await obtenerAperturas(env, sinBase); } catch { /* si Odoo falla, base 0 */ }

  // Antes el nombre se escribía a mano ("sebas", "Sebas "...): se unifica sin
  // importar mayúsculas, prefiriendo como aparece en la lista de empleados.
  const canonico = new Map(ajustes.empleados.map((n) => [n.toLowerCase(), n]));
  const nombreDe = (n) => {
    const limpio = (n || "").trim();
    const clave = limpio.toLowerCase();
    if (!canonico.has(clave)) canonico.set(clave, limpio.charAt(0).toUpperCase() + limpio.slice(1));
    return canonico.get(clave);
  };

  return {
    ajustes,
    dias: dias.map((d) => {
      const fecha = fechaDe(d);
      const base = d.base != null ? Number(d.base) : aperturas[d.sesion_odoo] ?? 0;
      const turno = calcularTurno(d, ajustes, ventas);
      const adicional = Number(d.adicional_turno) || 0;
      const totalTurno = turno.valor + turno.comision + adicional;
      const medioPago = d.turno_pagado ? d.ids.map((id) => medios[id]).find(Boolean) || null : null;
      // El turno pagado en efectivo salió de la plata de ese día.
      const turnoEfectivo = medioPago === "efectivo" ? totalTurno : 0;
      return {
        ids: d.ids,
        fecha,
        responsable: nombreDe(d.responsable),
        sesion: d.sesion_odoo,
        contado: Number(d.contado),
        base,
        turnoEfectivo,
        aRecoger: Math.max(0, Number(d.contado) - base - turnoEfectivo),
        recogido: !!d.recogido,
        recogidoEn: d.recogido_en,
        valorTurno: turno.valor,
        ventaDia: turno.venta,
        comision: turno.comision,
        adicional,
        totalTurno,
        medioPago,
        turnoPagado: !!d.turno_pagado,
        turnoPagadoEn: d.turno_pagado_en,
      };
    }),
  };
}

export default async function handler(req, res) {
  const env = process.env;
  try {
    if (req.method === "GET") {
      const ajustes = await obtenerAjustes(env);
      const nombres = ajustes.empleados.length ? ajustes.empleados : await responsablesUsados(env);
      return res.status(200).json({ empleados: nombres, baseCaja: Number(ajustes.baseCaja) || 0 });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    const { contrasena, accion, ids, recogido, pagado, medio, valor, adicional, ajustes } = req.body || {};
    if (contrasena !== env.VITE_APP_PASSWORD) {
      return res.status(401).json({ error: "Contraseña de administrador incorrecta." });
    }

    if (accion === "resumen") return res.status(200).json(await resumen(env, origenDe(req)));

    if (accion === "recogido") {
      if (!ids?.length) return res.status(400).json({ error: "Faltan los días." });
      await marcarRecogido(env, ids, !!recogido);
      return res.status(200).json({ ok: true });
    }

    if (accion === "turno") {
      if (!ids?.length) return res.status(400).json({ error: "Falta el turno." });
      if (pagado && !MEDIOS_PAGO.includes(medio)) {
        return res.status(400).json({ error: "Elige si el turno se paga por Nequi o en efectivo." });
      }
      await marcarTurno(env, ids, {
        pagado: pagado === undefined ? undefined : !!pagado,
        medio: pagado ? medio : undefined,
        valor: valor === undefined ? undefined : Number(valor) || 0,
        adicional: adicional === undefined ? undefined : Number(adicional) || 0,
      });
      if (pagado) {
        const [ajustesActuales, ventas] = await Promise.all([obtenerAjustes(env), ventasPorDia(origenDe(req))]);
        await congelarTurno(env, ids, (f) => calcularTurno(f, ajustesActuales, ventas));
      }
      return res.status(200).json({ ok: true });
    }

    if (accion === "guardarAjustes") {
      const empleados = [...new Set((ajustes?.empleados || []).map((n) => String(n).trim()).filter(Boolean))];
      const tarifas = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, Number(ajustes?.tarifas?.[d]) || 0]));
      const pctComision = Math.max(0, Number(ajustes?.pctComision) || 0);
      const baseCaja = Math.max(0, Number(ajustes?.baseCaja) || 0);
      await guardarAjustes(env, { empleados, tarifas, pctComision, baseCaja });
      return res.status(200).json({ ok: true });
    }

    res.status(400).json({ error: "Acción desconocida." });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
