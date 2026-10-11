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
 *        accion "turno"           { ids, pagado?, valor? }
 *        accion "guardarAjustes"  { ajustes }
 * ---------------------------------------------------------------------------
 */
import {
  obtenerAjustes, guardarAjustes, responsablesUsados,
  listarArqueosAdmin, marcarRecogido, marcarTurno, congelarValorTurno,
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

async function resumen(env) {
  const [ajustes, arqueos] = await Promise.all([obtenerAjustes(env), listarArqueosAdmin(env)]);
  const dias = agruparPorSesion(arqueos);

  // Arqueos viejos (de antes de registrar la base): la base es el saldo de
  // apertura de esa sesión en Odoo.
  const sinBase = dias.filter((d) => d.base == null && d.sesion_odoo).map((d) => d.sesion_odoo);
  let aperturas = {};
  try { aperturas = await obtenerAperturas(env, sinBase); } catch { /* si Odoo falla, base 0 */ }

  return {
    ajustes,
    dias: dias.map((d) => {
      const fecha = d.creado_en ? fechaBogota(d.creado_en) : d.fecha;
      const base = d.base != null ? Number(d.base) : aperturas[d.sesion_odoo] ?? 0;
      const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
      return {
        ids: d.ids,
        fecha,
        responsable: d.responsable,
        sesion: d.sesion_odoo,
        contado: Number(d.contado),
        base,
        aRecoger: Math.max(0, Number(d.contado) - base),
        recogido: !!d.recogido,
        recogidoEn: d.recogido_en,
        valorTurno: d.valor_turno != null ? Number(d.valor_turno) : Number(ajustes.tarifas[diaSemana]) || 0,
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
      return res.status(200).json(nombres);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    const { contrasena, accion, ids, recogido, pagado, valor, ajustes } = req.body || {};
    if (contrasena !== env.VITE_APP_PASSWORD) {
      return res.status(401).json({ error: "Contraseña de administrador incorrecta." });
    }

    if (accion === "resumen") return res.status(200).json(await resumen(env));

    if (accion === "recogido") {
      if (!ids?.length) return res.status(400).json({ error: "Faltan los días." });
      await marcarRecogido(env, ids, !!recogido);
      return res.status(200).json({ ok: true });
    }

    if (accion === "turno") {
      if (!ids?.length) return res.status(400).json({ error: "Falta el turno." });
      await marcarTurno(env, ids, {
        pagado: pagado === undefined ? undefined : !!pagado,
        valor: valor === undefined ? undefined : Number(valor) || 0,
      });
      if (pagado) {
        const { tarifas } = await obtenerAjustes(env);
        await congelarValorTurno(env, ids, tarifas, (f) => (f.creado_en ? fechaBogota(f.creado_en) : f.fecha));
      }
      return res.status(200).json({ ok: true });
    }

    if (accion === "guardarAjustes") {
      const empleados = [...new Set((ajustes?.empleados || []).map((n) => String(n).trim()).filter(Boolean))];
      const tarifas = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, Number(ajustes?.tarifas?.[d]) || 0]));
      await guardarAjustes(env, { empleados, tarifas });
      return res.status(200).json({ ok: true });
    }

    res.status(400).json({ error: "Acción desconocida." });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
