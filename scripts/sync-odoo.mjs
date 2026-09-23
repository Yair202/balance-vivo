/**
 * sync-odoo.mjs
 * ---------------------------------------------------------------------------
 * Trae ventas reales desde tu Odoo (Punto de Venta) vía JSON-RPC y las
 * convierte al mismo formato de "registro" que usa PanelFinanciero.jsx —
 * agrupadas DÍA A DÍA (no mes a mes como el reporte de la interfaz de Odoo),
 * así el tablero puede armar cualquier comparativo (día, semana, mes, año)
 * sin que tú tengas que exportar nada a mano.
 *
 * Uso:
 *   1) Copia .env.example a .env y completa ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD
 *   2) npm run sync-odoo
 *   3) Se escribe public/datos-ventas.json — el tablero lo carga automático
 *      (y si no existe, sigue usando datos simulados, así nunca se rompe).
 *
 * Qué SÍ trae de Odoo (100% real):
 *   - Ventas brutas por día (pos.order, excluye canceladas)
 *   - Desglose por método de pago por día (pos.payment + pos.payment.method)
 *   - Costo de ventas aproximado por día (pos.order.line × costo actual del
 *     producto en product.product — OJO: es el costo ACTUAL, no el histórico
 *     del día en que se vendió; si tus costos cambian mucho en el tiempo,
 *     esto es una aproximación, no un número contable exacto)
 *
 * Qué NO trae (normalmente vive en Contabilidad, no en el POS):
 *   - Gastos fijos y variables — quedan en 0, sigue ajustándolos en el
 *     formulario "Cargar ventas del día" del tablero, o mejora este script
 *     más adelante para leer de account.move si los llevas ahí.
 * ---------------------------------------------------------------------------
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD } = process.env;
const TZ_OFFSET_HORAS = Number(process.env.TZ_OFFSET_HORAS ?? -5); // Colombia = UTC-5
const DIAS_HISTORICO = Number(process.env.SYNC_DIAS ?? 730); // ~2 años por defecto

if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
  console.error("Faltan variables en .env — revisa ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD (copia .env.example a .env).");
  process.exit(1);
}

let idContador = 1;
async function odoo(service, method, args) {
  const resp = await fetch(`${ODOO_URL.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: idContador++, params: { service, method, args } }),
  });
  const json = await resp.json();
  if (json.error) {
    throw new Error(`Odoo respondió un error en ${service}.${method}: ${json.error.data?.message || JSON.stringify(json.error)}`);
  }
  return json.result;
}

async function executeKw(modelo, metodo, args, kwargs = {}) {
  return odoo("object", "execute_kw", [ODOO_DB, globalThis.__uid, ODOO_PASSWORD, modelo, metodo, args, kwargs]);
}

// search_read con paginación — Odoo limita a ~80 registros si no se pide más.
async function buscarTodo(modelo, dominio, campos, tamanoPagina = 1000) {
  let offset = 0, resultados = [];
  while (true) {
    const pagina = await executeKw(modelo, "search_read", [dominio], { fields: campos, limit: tamanoPagina, offset });
    resultados = resultados.concat(pagina);
    if (pagina.length < tamanoPagina) break;
    offset += tamanoPagina;
  }
  return resultados;
}

function fechaLocalISO(fechaOdooUTC) {
  // Odoo entrega fechas en UTC como 'YYYY-MM-DD HH:MM:SS'. Las pasamos a la
  // fecha calendario LOCAL (según TZ_OFFSET_HORAS) para que "el mismo día"
  // coincida con lo que el usuario ve en su reloj, no en UTC.
  const utc = new Date(fechaOdooUTC.replace(" ", "T") + "Z");
  const local = new Date(utc.getTime() + TZ_OFFSET_HORAS * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function formatoCOPSimple(valor) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

async function main() {
  console.log(`Conectando a ${ODOO_URL} (base "${ODOO_DB}")...`);
  const uid = await odoo("common", "authenticate", [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]);
  if (!uid) throw new Error("Login rechazado — revisa ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD en .env");
  globalThis.__uid = uid;
  console.log(`Conectado (uid ${uid}).`);

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - DIAS_HISTORICO * 24 * 60 * 60 * 1000);
  const desdeStr = desde.toISOString().slice(0, 19).replace("T", " ");
  const hastaStr = hasta.toISOString().slice(0, 19).replace("T", " ");

  console.log(`Trayendo órdenes desde ${desdeStr} hasta ${hastaStr} (UTC)...`);
  const ordenes = await buscarTodo(
    "pos.order",
    [["date_order", ">=", desdeStr], ["date_order", "<", hastaStr], ["state", "in", ["paid", "done", "invoiced"]]],
    ["id", "date_order", "amount_total"]
  );
  console.log(`${ordenes.length} órdenes encontradas.`);
  if (ordenes.length === 0) {
    console.warn("No se encontraron órdenes en ese rango — revisa fechas/estado, o que el usuario tenga acceso al POS.");
  }
  const idsOrdenes = ordenes.map((o) => o.id);
  const fechaPorOrden = new Map(ordenes.map((o) => [o.id, fechaLocalISO(o.date_order)]));

  // --- Métodos de pago ---
  // Odoo 13+ usa el modelo pos.payment / pos.payment.method. Versiones
  // anteriores (como esta instancia) guardan los pagos como líneas de
  // extracto bancario: pos.order.statement_ids -> account.bank.statement.line
  // (campo pos_statement_id la enlaza de vuelta a la orden), con el método
  // de pago en journal_id -> account.journal. Detectamos cuál aplica.
  const camposPosOrder = await executeKw("pos.order", "fields_get", [], { attributes: ["type"] });
  const esquemaNuevo = "payment_ids" in camposPosOrder;

  const clasificarMetodo = (nombre) => {
    const n = (nombre || "").toLowerCase();
    if (/(efect|cash|caja)/.test(n)) return "efectivo";
    if (/(tarjet|card|datafono|dataphone|credit|debit|addi|sistecredito)/.test(n)) return "tarjetas";
    if (/(transfer|nequi|daviplata|bancolombia|pse|consignaci|banco|daviv|bbva|bogota|occidente|popular|caja\s?social|colpatria|av\s?villas)/.test(n)) return "transferencias";
    return "otros";
  };

  let nombresPorMetodoId, pagos;
  if (esquemaNuevo) {
    console.log("Esquema de pagos detectado: pos.payment (Odoo 13+).");
    const metodosPago = await buscarTodo("pos.payment.method", [], ["id", "name"]);
    nombresPorMetodoId = new Map(metodosPago.map((m) => [m.id, m.name]));
    console.log("Trayendo pagos...");
    pagos = idsOrdenes.length
      ? (await buscarTodo("pos.payment", [["pos_order_id", "in", idsOrdenes]], ["pos_order_id", "amount", "payment_method_id"]))
          .map((p) => ({ pos_order_id: p.pos_order_id, amount: p.amount, metodo_id: p.payment_method_id }))
      : [];
  } else {
    console.log("Esquema de pagos detectado: account.bank.statement.line (Odoo <=12).");
    const diarios = await buscarTodo("account.journal", [], ["id", "name"]);
    nombresPorMetodoId = new Map(diarios.map((j) => [j.id, j.name]));
    console.log("Trayendo pagos (líneas de extracto)...");
    pagos = idsOrdenes.length
      ? (await buscarTodo("account.bank.statement.line", [["pos_statement_id", "in", idsOrdenes]], ["pos_statement_id", "amount", "journal_id"]))
          .map((p) => ({ pos_order_id: p.pos_statement_id, amount: p.amount, metodo_id: p.journal_id }))
      : [];
  }
  const grupoDeMetodo = new Map([...nombresPorMetodoId.entries()].map(([id, nombre]) => [id, clasificarMetodo(nombre)]));

  // Solo avisamos de métodos que de verdad tuvieron plata en pagos reales
  // (no de todos los diarios contables del sistema, que incluyen cosas como
  // "Diario de stock" que nunca aparecen en un pago).
  const montoSinClasificarPorMetodo = new Map();
  for (const pago of pagos) {
    const id = pago.metodo_id?.[0];
    if (grupoDeMetodo.get(id) === "otros") {
      montoSinClasificarPorMetodo.set(id, (montoSinClasificarPorMetodo.get(id) || 0) + pago.amount);
    }
  }
  const metodosSinClasificar = [...montoSinClasificarPorMetodo.entries()]
    .filter(([, monto]) => Math.abs(monto) > 0)
    .map(([id, monto]) => `${nombresPorMetodoId.get(id)} (${formatoCOPSimple(monto)})`);

  // --- Costo de ventas (aproximado con el costo ACTUAL del producto) ---
  console.log("Trayendo líneas de venta para calcular costo de ventas...");
  const lineas = idsOrdenes.length
    ? await buscarTodo("pos.order.line", [["order_id", "in", idsOrdenes]], ["order_id", "product_id", "qty"])
    : [];
  const idsProductos = [...new Set(lineas.map((l) => l.product_id?.[0]).filter(Boolean))];
  const productos = idsProductos.length ? await buscarTodo("product.product", [["id", "in", idsProductos]], ["id", "standard_price"]) : [];
  const costoPorProducto = new Map(productos.map((p) => [p.id, p.standard_price || 0]));

  // --- Agregación día a día ---
  const porDia = new Map(); // fecha -> registro
  const asegurarDia = (fecha) => {
    if (!porDia.has(fecha)) {
      porDia.set(fecha, { fecha, ventasBrutas: 0, efectivo: 0, tarjetas: 0, transferencias: 0, otros: 0, costoVentas: 0, gastosFijos: 0, gastosVariables: 0 });
    }
    return porDia.get(fecha);
  };

  for (const orden of ordenes) {
    const fecha = fechaPorOrden.get(orden.id);
    asegurarDia(fecha).ventasBrutas += orden.amount_total;
  }
  for (const pago of pagos) {
    const fecha = fechaPorOrden.get(pago.pos_order_id?.[0]);
    if (!fecha) continue;
    const grupo = grupoDeMetodo.get(pago.metodo_id?.[0]) || "otros";
    asegurarDia(fecha)[grupo] += pago.amount;
  }
  for (const linea of lineas) {
    const fecha = fechaPorOrden.get(linea.order_id?.[0]);
    if (!fecha) continue;
    const costoUnitario = costoPorProducto.get(linea.product_id?.[0]) || 0;
    asegurarDia(fecha).costoVentas += costoUnitario * linea.qty;
  }

  const registros = [...porDia.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(({ otros, ...r }) => ({ ...r, transferencias: r.transferencias + otros })); // "otros" se suma a transferencias para no perder el dinero de la suma total

  const outDir = path.resolve(process.cwd(), "public");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "datos-ventas.json"), JSON.stringify(registros, null, 2), "utf-8");

  console.log(`\nListo: ${registros.length} días escritos en public/datos-ventas.json`);
  if (metodosSinClasificar.length) {
    console.log(`\nAviso: estos métodos de pago no se reconocieron por nombre y se sumaron a "transferencias": ${metodosSinClasificar.join(", ")}`);
    console.log(`Si alguno debería ser "efectivo" o "tarjetas", ajusta la función clasificarMetodo() en este archivo.`);
  }
  console.log(`\nRecuerda: el costo de ventas usa el costo ACTUAL de cada producto (product.product.standard_price), no el histórico del día de la venta — es una aproximación.`);
  console.log(`Gastos fijos y variables quedaron en 0 (no vienen del POS) — sigue ajustándolos manualmente en el tablero.`);
}

main().catch((err) => {
  console.error("\nError sincronizando con Odoo:", err.message);
  process.exit(1);
});
