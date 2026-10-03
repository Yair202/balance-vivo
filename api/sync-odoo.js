/**
 * api/sync-odoo.js
 * ---------------------------------------------------------------------------
 * El botón "Sincronizar ahora" del tablero, en producción. Trae los datos de
 * Odoo (misma lógica que el robot automático) y los publica directo en
 * GitHub en un solo commit — eso dispara un redeploy de Vercel con los datos
 * frescos. Cada clic gasta 1 despliegue del cupo diario, así que úsalo solo
 * cuando de verdad haga falta ver algo al instante.
 * ---------------------------------------------------------------------------
 */
import { obtenerDatosOdoo } from "../scripts/lib/datos-odoo.mjs";
import { commitArchivos } from "../scripts/lib/github-commit.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }
  try {
    const { registros, detalleVentas, inventario } = await obtenerDatosOdoo(process.env);

    await commitArchivos(process.env.GITHUB_TOKEN, {
      mensaje: "Actualizar datos de Odoo (sincronizar ahora, manual)",
      archivos: [
        { path: "public/datos-ventas.json", contenido: JSON.stringify(registros, null, 2) },
        { path: "public/datos-detalle-ventas.json", contenido: JSON.stringify(detalleVentas) },
        { path: "public/datos-inventario.json", contenido: JSON.stringify(inventario) },
      ],
    });

    res.status(200).json({ ok: true, dias: registros.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
