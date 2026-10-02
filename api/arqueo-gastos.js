/**
 * api/arqueo-gastos.js
 * ---------------------------------------------------------------------------
 * Gastos de caja menor del día — se agregan uno por uno a lo largo del día,
 * quedan guardados aunque se cierre la página.
 *   GET    ?fecha=YYYY-MM-DD  -> lista los gastos de ese día sin arqueo aún
 *   POST   { fecha, descripcion, valor, creadoPor } -> agrega uno nuevo
 *   DELETE ?id=...            -> quita uno (por si se equivocaron)
 * ---------------------------------------------------------------------------
 */
import { listarGastosDelDia, agregarGasto, borrarGasto } from "../scripts/lib/supabase.mjs";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const fecha = req.query.fecha;
      if (!fecha) return res.status(400).json({ error: "Falta la fecha." });
      const gastos = await listarGastosDelDia(process.env, fecha);
      return res.status(200).json(gastos);
    }

    if (req.method === "POST") {
      const { fecha, descripcion, valor, creadoPor } = req.body || {};
      if (!fecha || !descripcion || !valor) return res.status(400).json({ error: "Faltan datos del gasto." });
      const gasto = await agregarGasto(process.env, { fecha, descripcion, valor: Number(valor), creadoPor });
      return res.status(200).json(gasto);
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Falta el id." });
      await borrarGasto(process.env, id);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
