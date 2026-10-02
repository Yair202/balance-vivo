/**
 * api/arqueo-historial.js
 * ---------------------------------------------------------------------------
 * Consultar arqueos guardados, y (solo el administrador) ajustarlos cuando
 * quedaron con diferencia real — agregar una nota explicando qué pasó y
 * marcarlo como resuelto.
 *   GET   ?desde=&hasta=    -> lista de arqueos (cualquiera con acceso a /arqueo)
 *   PATCH { id, notaAdmin, resuelto, contrasena } -> ajustar (solo admin)
 * ---------------------------------------------------------------------------
 */
import { listarArqueos, ajustarArqueo } from "../scripts/lib/supabase.mjs";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { desde, hasta } = req.query;
      const arqueos = await listarArqueos(process.env, { desde, hasta });
      return res.status(200).json(arqueos);
    }

    if (req.method === "PATCH") {
      const { id, notaAdmin, resuelto, contrasena } = req.body || {};
      if (contrasena !== process.env.VITE_APP_PASSWORD) {
        return res.status(401).json({ error: "Solo el administrador puede ajustar un arqueo." });
      }
      if (!id) return res.status(400).json({ error: "Falta el id del arqueo." });
      const fila = await ajustarArqueo(process.env, id, { notaAdmin, resuelto });
      return res.status(200).json(fila);
    }

    res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
