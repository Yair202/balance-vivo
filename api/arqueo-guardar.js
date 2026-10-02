/**
 * api/arqueo-guardar.js
 * ---------------------------------------------------------------------------
 * Guarda un arqueo de caja ya contado: calcula diferencia/estado, lo inserta
 * en Supabase, y adjunta los gastos de caja menor usados a ese arqueo. No
 * toca Odoo para nada — es solo un registro propio del tablero.
 * ---------------------------------------------------------------------------
 */
import { guardarArqueo } from "../scripts/lib/supabase.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }
  try {
    const { fecha, responsable, sesionOdoo, teorico, contado, gastosTotal, gastosIds } = req.body || {};
    if (!fecha || !responsable || teorico == null || contado == null) {
      res.status(400).json({ error: "Faltan datos del arqueo." });
      return;
    }
    const arqueo = await guardarArqueo(process.env, {
      fecha, responsable, sesionOdoo,
      teorico: Number(teorico), contado: Number(contado),
      gastosTotal: Number(gastosTotal) || 0, gastosIds: gastosIds || [],
    });
    res.status(200).json(arqueo);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
