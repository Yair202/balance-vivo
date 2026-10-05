/**
 * scripts/lib/datos-odoo.mjs
 * ---------------------------------------------------------------------------
 * Trae y procesa todos los datos reales de Odoo (ventas día a día, detalle de
 * líneas, catálogo de inventario y movimientos de bodega). NO escribe ningún
 * archivo — solo devuelve los datos ya listos. Dos cosas lo usan:
 *   - scripts/sync-odoo.mjs: lo corre el robot de GitHub Actions, escribe los
 *     archivos localmente y los commitea con git normal.
 *   - api/sync-odoo.js: lo corre el botón "Sincronizar ahora" en producción
 *     (Vercel), escribe los archivos directo en GitHub vía su API.
 * ---------------------------------------------------------------------------
 */

let idContador = 1;

async function odoo(odooUrl, service, method, args) {
  const resp = await fetch(`${odooUrl.replace(/\/$/, "")}/jsonrpc`, {
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

function fechaLocalISO(fechaOdooUTC, tzOffsetHoras) {
  const utc = new Date(fechaOdooUTC.replace(" ", "T") + "Z");
  const local = new Date(utc.getTime() + tzOffsetHoras * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function horaLocalHHMM(fechaOdooUTC, tzOffsetHoras) {
  const utc = new Date(fechaOdooUTC.replace(" ", "T") + "Z");
  const local = new Date(utc.getTime() + tzOffsetHoras * 60 * 60 * 1000);
  return local.toISOString().slice(11, 16);
}

function formatoCOPSimple(valor) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

export async function obtenerDatosOdoo(env, { log = () => {} } = {}) {
  const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD } = env;
  const TZ_OFFSET_HORAS = Number(env.TZ_OFFSET_HORAS ?? -5); // Colombia = UTC-5
  const DIAS_HISTORICO = Number(env.SYNC_DIAS ?? 730); // ~2 años por defecto

  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    throw new Error("Faltan las variables de entorno de Odoo (ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD).");
  }

  log(`Conectando a ${ODOO_URL} (base "${ODOO_DB}")...`);
  const uid = await odoo(ODOO_URL, "common", "authenticate", [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]);
  if (!uid) throw new Error("Login rechazado — revisa ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD.");
  log(`Conectado (uid ${uid}).`);

  async function executeKw(modelo, metodo, args, kwargs = {}) {
    return odoo(ODOO_URL, "object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, modelo, metodo, args, kwargs]);
  }
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

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - DIAS_HISTORICO * 24 * 60 * 60 * 1000);
  const desdeStr = desde.toISOString().slice(0, 19).replace("T", " ");
  const hastaStr = hasta.toISOString().slice(0, 19).replace("T", " ");

  log(`Trayendo órdenes desde ${desdeStr} hasta ${hastaStr} (UTC)...`);
  const ordenes = await buscarTodo(
    "pos.order",
    [["date_order", ">=", desdeStr], ["date_order", "<", hastaStr], ["state", "in", ["paid", "done", "invoiced"]]],
    ["id", "name", "date_order", "amount_total"]
  );
  log(`${ordenes.length} órdenes encontradas.`);
  const idsOrdenes = ordenes.map((o) => o.id);
  const fechaPorOrden = new Map(ordenes.map((o) => [o.id, fechaLocalISO(o.date_order, TZ_OFFSET_HORAS)]));
  const horaPorOrden = new Map(ordenes.map((o) => [o.id, horaLocalHHMM(o.date_order, TZ_OFFSET_HORAS)]));
  const numeroPorOrden = new Map(ordenes.map((o) => [o.id, o.name]));

  const camposPosOrder = await executeKw("pos.order", "fields_get", [], { attributes: ["type"] });
  const esquemaNuevo = "payment_ids" in camposPosOrder;

  const clasificarMetodo = (nombre) => {
    const n = (nombre || "").toLowerCase();
    if (/(^|[^a-z])addi([^a-z]|$)/.test(n)) return "addi";
    if (/(efect|cash|caja)/.test(n)) return "efectivo";
    if (/(tarjet|card|datafono|dataphone|credit|debit|sistecredito)/.test(n)) return "tarjetas";
    if (/(transfer|nequi|daviplata|bancolombia|pse|consignaci|banco|daviv|bbva|bogota|occidente|popular|caja\s?social|colpatria|av\s?villas)/.test(n)) return "transferencias";
    return "otros";
  };

  let nombresPorMetodoId, pagos;
  if (esquemaNuevo) {
    const metodosPago = await buscarTodo("pos.payment.method", [], ["id", "name"]);
    nombresPorMetodoId = new Map(metodosPago.map((m) => [m.id, m.name]));
    pagos = idsOrdenes.length
      ? (await buscarTodo("pos.payment", [["pos_order_id", "in", idsOrdenes]], ["pos_order_id", "amount", "payment_method_id"]))
          .map((p) => ({ pos_order_id: p.pos_order_id, amount: p.amount, metodo_id: p.payment_method_id }))
      : [];
  } else {
    const diarios = await buscarTodo("account.journal", [], ["id", "name"]);
    nombresPorMetodoId = new Map(diarios.map((j) => [j.id, j.name]));
    pagos = idsOrdenes.length
      ? (await buscarTodo("account.bank.statement.line", [["pos_statement_id", "in", idsOrdenes]], ["pos_statement_id", "amount", "journal_id"]))
          .map((p) => ({ pos_order_id: p.pos_statement_id, amount: p.amount, metodo_id: p.journal_id }))
      : [];
  }
  const grupoDeMetodo = new Map([...nombresPorMetodoId.entries()].map(([id, nombre]) => [id, clasificarMetodo(nombre)]));

  const lineas = idsOrdenes.length
    ? await buscarTodo("pos.order.line", [["order_id", "in", idsOrdenes]], ["order_id", "product_id", "qty", "price_subtotal_incl", "price_unit"])
    : [];
  const idsProductos = [...new Set(lineas.map((l) => l.product_id?.[0]).filter(Boolean))];
  const productos = idsProductos.length ? await buscarTodo("product.product", [["id", "in", idsProductos]], ["id", "standard_price"]) : [];
  const costoPorProducto = new Map(productos.map((p) => [p.id, p.standard_price || 0]));

  const detalleVentas = lineas
    .filter((l) => l.product_id)
    .map((l) => ({
      fecha: fechaPorOrden.get(l.order_id?.[0]),
      hora: horaPorOrden.get(l.order_id?.[0]),
      numeroFactura: numeroPorOrden.get(l.order_id?.[0]),
      productoId: l.product_id[0],
      producto: l.product_id[1],
      cantidad: l.qty,
      precioUnitario: l.price_unit || 0,
      subtotal: l.price_subtotal_incl || l.qty * (l.price_unit || 0),
    }))
    .filter((l) => l.fecha);

  const porDia = new Map();
  const asegurarDia = (fecha) => {
    if (!porDia.has(fecha)) {
      porDia.set(fecha, { fecha, ventasBrutas: 0, efectivo: 0, tarjetas: 0, transferencias: 0, addi: 0, otros: 0, costoVentas: 0, gastosFijos: 0, gastosVariables: 0, numeroVentas: 0 });
    }
    return porDia.get(fecha);
  };
  for (const orden of ordenes) {
    const fecha = fechaPorOrden.get(orden.id);
    asegurarDia(fecha).ventasBrutas += orden.amount_total;
    asegurarDia(fecha).numeroVentas += 1;
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
    .map(({ otros, ...r }) => ({ ...r, transferencias: r.transferencias + otros }));

  log(`Listo: ${registros.length} días, ${detalleVentas.length} líneas de venta.`);

  // --- Inventario ---
  log("Trayendo catálogo de productos...");
  const catalogo = await buscarTodo(
    "product.product", [["active", "=", true]],
    ["id", "default_code", "name", "categ_id", "qty_available", "standard_price", "list_price", "attribute_value_ids"]
  );
  const valoresAtributo = await buscarTodo("product.attribute.value", [], ["id", "name", "attribute_id"]);
  const infoValorAtributo = new Map(valoresAtributo.map((v) => [v.id, { nombre: v.name, atributo: v.attribute_id ? v.attribute_id[1] : null }]));
  const NOMBRE_ATRIBUTO_TALLA = "TALLA";
  const NOMBRE_ATRIBUTO_COLOR = "COLOR";
  const productosInventario = catalogo.map((p) => {
    let talla = null, color = null;
    for (const vid of p.attribute_value_ids) {
      const info = infoValorAtributo.get(vid);
      if (!info) continue;
      if (info.atributo === NOMBRE_ATRIBUTO_TALLA && !talla) talla = info.nombre;
      if (info.atributo === NOMBRE_ATRIBUTO_COLOR && !color) color = info.nombre;
    }
    return {
      id: p.id, codigo: p.default_code || "", nombre: p.name,
      categoria: p.categ_id ? p.categ_id[1] : "Sin categoría",
      talla, color, stockActual: p.qty_available, costo: p.standard_price || 0, precioVenta: p.list_price || 0,
    };
  });

  const ubicaciones = await buscarTodo("stock.location", [], ["id", "usage"]);
  const usoPorUbicacion = new Map(ubicaciones.map((u) => [u.id, u.usage]));
  const movimientosRaw = await buscarTodo(
    "stock.move",
    [["date", ">=", desdeStr], ["date", "<", hastaStr], ["state", "=", "done"]],
    ["date", "product_id", "product_qty", "location_id", "location_dest_id", "reference"]
  );
  // "tipo" (entrada/salida/otro) se deja EXACTA como estaba — de eso dependen
  // los gráficos de compras/ventas reales (Reabastecimientos, Más vendidos).
  // Lo nuevo es "detalle" (clasificación más fina, para explicarle al usuario
  // QUÉ paso con un movimiento que antes caía todo en el cajón "otro": ajuste
  // manual de inventario, merma, traslado entre bodegas, producción) y
  // "efecto" (cuánto cambió REALMENTE el stock total con ese movimiento — un
  // traslado interno no cambia el total aunque mueva unidades de un lado a
  // otro, por eso su efecto es 0). "referencia" es el documento de origen en
  // Odoo (factura/picking/ajuste) para poder rastrear el movimiento allá.
  const movimientos = movimientosRaw
    .filter((m) => m.product_id)
    .map((m) => {
      const usoOrigen = usoPorUbicacion.get(m.location_id?.[0]);
      const usoDestino = usoPorUbicacion.get(m.location_dest_id?.[0]);
      let tipo = "otro";
      if (usoOrigen === "supplier" && usoDestino === "internal") tipo = "entrada";
      else if (usoOrigen === "internal" && usoDestino === "customer") tipo = "salida";

      let detalle = "Otro movimiento";
      let efecto = 0;
      if (usoOrigen === "internal" && usoDestino === "internal") {
        detalle = "Traslado interno";
        efecto = 0;
      } else if (usoDestino === "internal" && usoOrigen !== "internal") {
        efecto = m.product_qty;
        detalle = usoOrigen === "supplier" ? "Entrada (compra a proveedor)"
          : usoOrigen === "inventory" ? "Ajuste de inventario (+)"
          : usoOrigen === "production" ? "Entrada (producción)"
          : "Entrada";
      } else if (usoOrigen === "internal" && usoDestino !== "internal") {
        efecto = -m.product_qty;
        detalle = usoDestino === "customer" ? "Salida (venta)"
          : usoDestino === "inventory" ? "Ajuste de inventario / merma (−)"
          : usoDestino === "production" ? "Salida (producción)"
          : "Salida";
      }

      return {
        fecha: fechaLocalISO(m.date, TZ_OFFSET_HORAS), productoId: m.product_id[0], cantidad: m.product_qty, tipo,
        detalle, efecto, referencia: m.reference || "",
      };
    });
  log(`Listo: ${productosInventario.length} productos, ${movimientos.length} movimientos.`);

  const inventario = { actualizado: new Date().toISOString(), productos: productosInventario, movimientos };

  return { registros, detalleVentas, inventario };
}
