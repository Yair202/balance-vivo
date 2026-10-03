/**
 * sync-odoo.mjs
 * ---------------------------------------------------------------------------
 * CLI que corre el robot de GitHub Actions (y se puede correr a mano con
 * "npm run sync-odoo"): trae los datos reales de Odoo y los escribe en
 * public/datos-ventas.json, datos-detalle-ventas.json y datos-inventario.json.
 *
 * La lógica real de traer/procesar los datos vive en scripts/lib/datos-odoo.mjs
 * (compartida con api/sync-odoo.js, que es lo que usa el botón "Sincronizar
 * ahora" del tablero en producción).
 * ---------------------------------------------------------------------------
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { obtenerDatosOdoo } from "./lib/datos-odoo.mjs";

async function main() {
  const { registros, detalleVentas, inventario } = await obtenerDatosOdoo(process.env, { log: console.log });

  const outDir = path.resolve(process.cwd(), "public");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "datos-ventas.json"), JSON.stringify(registros, null, 2), "utf-8");
  await writeFile(path.join(outDir, "datos-detalle-ventas.json"), JSON.stringify(detalleVentas), "utf-8");
  await writeFile(path.join(outDir, "datos-inventario.json"), JSON.stringify(inventario), "utf-8");

  console.log(`\nListo: ${registros.length} días escritos en public/datos-ventas.json`);
  console.log(`Listo: ${detalleVentas.length} líneas de venta escritas en public/datos-detalle-ventas.json`);
  console.log(`Listo: catálogo + movimientos escritos en public/datos-inventario.json`);
  console.log(`\nRecuerda: el costo de ventas usa el costo ACTUAL de cada producto (product.product.standard_price), no el histórico del día de la venta — es una aproximación.`);
}

main().catch((err) => {
  console.error("\nError sincronizando con Odoo:", err.message);
  process.exit(1);
});
