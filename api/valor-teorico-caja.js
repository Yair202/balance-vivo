/**
 * api/valor-teorico-caja.js
 * ---------------------------------------------------------------------------
 * Función serverless de Vercel para la herramienta de Arqueo de caja: trae en
 * vivo, desde Odoo, el valor teórico de efectivo que debería haber ahora
 * mismo en la caja registradora abierta. Ver scripts/lib/valor-teorico.mjs
 * para la lógica real (compartida con el modo de desarrollo local).
 *
 * Solo lectura — no escribe nada en Odoo ni cierra ninguna sesión.
 * ---------------------------------------------------------------------------
 */
import { obtenerValorTeorico } from "../scripts/lib/valor-teorico.mjs";

export default async function handler(req, res) {
  try {
    const datos = await obtenerValorTeorico(process.env);
    res.status(200).json(datos);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
