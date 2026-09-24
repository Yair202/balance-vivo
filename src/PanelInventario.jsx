/**
 * PanelInventario.jsx
 * ---------------------------------------------------------------------------
 * Módulo de inventario: comportamiento de la mercancía, rotación,
 * reabastecimientos, movimientos de bodega, más vendidos y qué tallas se
 * mueven más. Todo calculado en el navegador a partir de UN solo archivo
 * (public/datos-inventario.json) que escribe scripts/sync-odoo.mjs —
 * mismo patrón que PanelFinanciero.jsx con datos-ventas.json.
 *
 * ►► SUSTITUIR AQUÍ: si cambias de POS/ERP, lo único que necesitas producir
 * es un JSON con esta forma (ver también el comentario en sync-odoo.mjs):
 *   {
 *     productos: [{ id, codigo, nombre, categoria, talla, color,
 *                    stockActual, costo, precioVenta }],
 *     movimientos: [{ fecha:'YYYY-MM-DD', productoId, cantidad,
 *                      tipo:'entrada'|'salida'|'otro' }],
 *   }
 * "entrada" = reabastecimiento (llega de proveedor). "salida" = venta o
 * despacho a cliente. El resto del componente no cambia.
 * ---------------------------------------------------------------------------
 */
import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import {
  Package, PackageX, Layers, Warehouse, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Ruler, X, Search,
} from "lucide-react";

const formatoCOP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
const formatoNum = (v) => new Intl.NumberFormat("es-CO").format(Math.round(v || 0));
const COLORES_SERIE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#9085e9", "#e34948", "#199e70", "#c98500"];
const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function inicioSemanaISO(fechaIso) {
  const d = new Date(`${fechaIso}T00:00:00`);
  const dia = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1)); // retrocede al lunes
  return d.toISOString().slice(0, 10);
}
function etiquetaPeriodo(clave, granularidad) {
  if (granularidad === "dia") return clave;
  if (granularidad === "semana") {
    const [a, m, d] = clave.split("-");
    return `Semana del ${Number(d)} ${NOMBRES_MES[Number(m) - 1]} ${a}`;
  }
  const [a, m] = clave.split("-");
  return `${NOMBRES_MES[Number(m) - 1]} ${a}`;
}

function Tarjeta({ titulo, icono, acciones, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">{icono}{titulo}</h2>
        {acciones}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function TarjetaKPI({ etiqueta, valor, Icono, tono = "normal", onClick }) {
  const colorIcono = tono === "alerta" ? "text-red-600" : tono === "aviso" ? "text-amber-600" : "text-emerald-700";
  const Contenedor = onClick ? "button" : "div";
  return (
    <Contenedor
      onClick={onClick}
      className={`rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-2 text-left w-full ${onClick ? "hover:border-emerald-300 hover:shadow-md transition cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500"><Icono size={16} className={colorIcono} />{etiqueta}</div>
      <div className="text-2xl font-semibold tabular-nums truncate">{valor}</div>
    </Contenedor>
  );
}

function BarraHorizontal({ datos, campoEtiqueta, campoValor, formato = formatoNum, colorPorIndice, onClickItem }) {
  const max = Math.max(...datos.map((d) => d[campoValor]), 1);
  const Fila = onClickItem ? "button" : "div";
  return (
    <div className="flex flex-col gap-2.5">
      {datos.map((d, i) => (
        <Fila
          key={d.id ?? d[campoEtiqueta]}
          onClick={onClickItem ? () => onClickItem(d) : undefined}
          className={`flex items-center gap-3 w-full text-left ${onClickItem ? "cursor-pointer group" : ""}`}
        >
          <div className={`w-32 sm:w-40 text-xs truncate ${onClickItem ? "text-gray-600 group-hover:text-emerald-700 group-hover:underline" : "text-gray-600"}`} title={d[campoEtiqueta]}>
            {d[campoEtiqueta]}
          </div>
          <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md flex items-center justify-end px-2"
              style={{ width: `${Math.max(4, (d[campoValor] / max) * 100)}%`, background: colorPorIndice ? colorPorIndice(i) : "#0f6e5c" }}
            >
              <span className="text-[10px] font-semibold text-white tabular-nums">{formato(d[campoValor])}</span>
            </div>
          </div>
        </Fila>
      ))}
    </div>
  );
}

const PERIODOS = [
  { valor: 30, etiqueta: "30 días" },
  { valor: 90, etiqueta: "90 días" },
  { valor: 365, etiqueta: "1 año" },
  { valor: 0, etiqueta: "Todo" },
];

/* -----------------------------------------------------------------------
   Buscar un producto puntual y ver su historial de movimientos agrupado
   por día, semana o mes — para responder "¿cómo se ha movido ESTA
   referencia?" en vez de solo agregados generales.
----------------------------------------------------------------------- */
function PanelMovimientosProducto({ productos, movimientos }) {
  const [busqueda, setBusqueda] = useState("");
  const [productoId, setProductoId] = useState(null);
  const [granularidad, setGranularidad] = useState("semana"); // 'dia' | 'semana' | 'mes'

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || productoId) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)).slice(0, 15);
  }, [productos, busqueda, productoId]);

  const productoSel = productos.find((p) => p.id === productoId);

  const serie = useMemo(() => {
    if (!productoId) return [];
    const claveDe = (fecha) => (granularidad === "dia" ? fecha : granularidad === "mes" ? fecha.slice(0, 7) : inicioSemanaISO(fecha));
    const buckets = new Map();
    for (const m of movimientos) {
      if (m.productoId !== productoId || (m.tipo !== "entrada" && m.tipo !== "salida")) continue;
      const clave = claveDe(m.fecha);
      if (!buckets.has(clave)) buckets.set(clave, { clave, entradas: 0, salidas: 0 });
      const b = buckets.get(clave);
      if (m.tipo === "entrada") b.entradas += m.cantidad; else b.salidas += m.cantidad;
    }
    return [...buckets.values()].sort((a, b) => b.clave.localeCompare(a.clave));
  }, [productoId, movimientos, granularidad]);

  const elegir = (id) => { setProductoId(id); setBusqueda(""); };

  return (
    <Tarjeta titulo="Movimientos de un producto específico" icono={<Search size={16} className="text-emerald-700" />}>
      {!productoSel ? (
        <div className="relative">
          <input
            type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca por nombre o código del producto…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          {coincidencias.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {coincidencias.map((p) => (
                <button
                  key={p.id} onClick={() => elegir(p.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                >
                  <span className="truncate">{p.nombre}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{p.categoria} {p.talla ? `· ${p.talla}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-semibold text-sm">{productoSel.nombre}</div>
              <div className="text-xs text-gray-400">{productoSel.categoria}{productoSel.talla ? ` · Talla ${productoSel.talla}` : ""} · Stock actual: {formatoNum(productoSel.stockActual)}</div>
            </div>
            <button onClick={() => { setProductoId(null); }} className="text-xs font-semibold text-emerald-700 hover:underline">Cambiar producto</button>
          </div>

          <div className="flex gap-1.5">
            {[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([v, l]) => (
              <button
                key={v} onClick={() => setGranularidad(v)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${granularidad === v ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {serie.length ? (
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs text-gray-400 border-b border-gray-200">
                    <th className="text-left font-medium py-1.5 px-3">Período</th>
                    <th className="text-right font-medium py-1.5 px-3">Entradas</th>
                    <th className="text-right font-medium py-1.5 px-3">Salidas</th>
                    <th className="text-right font-medium py-1.5 px-3">Saldo neto</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((s) => (
                    <tr key={s.clave} className="border-b border-gray-50">
                      <td className="py-1.5 px-3">{etiquetaPeriodo(s.clave, granularidad)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-blue-700">{s.entradas ? `+${formatoNum(s.entradas)}` : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-emerald-700">{s.salidas ? `−${formatoNum(s.salidas)}` : "—"}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums font-semibold ${s.entradas - s.salidas >= 0 ? "text-gray-700" : "text-red-600"}`}>
                        {s.entradas - s.salidas >= 0 ? "+" : ""}{formatoNum(s.entradas - s.salidas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Esta referencia no tiene movimientos registrados.</p>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

export default function PanelInventario() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);
  const [modoPeriodo, setModoPeriodo] = useState("preset"); // 'preset' | 'dia' | 'rango'
  const [diasPreset, setDiasPreset] = useState(90);
  const [fechaUnica, setFechaUnica] = useState("");
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const [modalAgotadosAbierto, setModalAgotadosAbierto] = useState(false);
  const [productoDesglose, setProductoDesglose] = useState(null); // grupo de "Más vendidos" elegido para ver tallas
  const [agruparRotacionPor, setAgruparRotacionPor] = useState("categoria"); // 'categoria' | 'talla'

  useEffect(() => {
    fetch("/datos-inventario.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDatos)
      .catch(() => setError(true));
  }, []);

  const analisis = useMemo(() => {
    if (!datos) return null;
    const { productos, movimientos } = datos;
    const productoPorId = new Map(productos.map((p) => [p.id, p]));

    const hoy = movimientos.reduce((max, m) => (m.fecha > max ? m.fecha : max), "0000-00-00");
    let desde, hasta = hoy;
    if (modoPeriodo === "dia" && fechaUnica) {
      desde = hasta = fechaUnica;
    } else if (modoPeriodo === "rango" && rangoDesde && rangoHasta) {
      desde = rangoDesde; hasta = rangoHasta;
    } else {
      desde = diasPreset === 0 ? "0000-00-00" : (() => { const d = new Date(`${hoy}T00:00:00`); d.setDate(d.getDate() - diasPreset); return d.toISOString().slice(0, 10); })();
    }
    const movsPeriodo = movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);

    const sumarPorProducto = (lista, tipo) => {
      const mapa = new Map();
      for (const m of lista) {
        if (m.tipo !== tipo) continue;
        mapa.set(m.productoId, (mapa.get(m.productoId) || 0) + m.cantidad);
      }
      return mapa;
    };
    const salidasPorProducto = sumarPorProducto(movsPeriodo, "salida");
    const entradasPorProducto = sumarPorProducto(movsPeriodo, "entrada");

    // --- Más vendidos (agrupado por NOMBRE de producto, no por variante —
    // así "JEANS OCHENTERO" suma todas sus tallas en una sola barra; el
    // desglose por talla se ve al hacer clic, ver ModalDesgloseTallas) ---
    const porNombre = new Map();
    for (const [id, unidades] of salidasPorProducto) {
      const p = productoPorId.get(id);
      if (!p) continue;
      if (!porNombre.has(p.nombre)) porNombre.set(p.nombre, { nombre: p.nombre, categoria: p.categoria, unidades: 0, tallas: [] });
      const g = porNombre.get(p.nombre);
      g.unidades += unidades;
      g.tallas.push({ talla: p.talla || "Sin talla", unidades, ingresos: unidades * p.precioVenta, stockActual: p.stockActual });
    }
    const masVendidos = [...porNombre.values()]
      .map((g) => ({ ...g, tallas: g.tallas.sort((a, b) => b.unidades - a.unidades) }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 12);

    // --- Tallas que más se mueven ---
    const porTalla = new Map();
    for (const [id, unidades] of salidasPorProducto) {
      const p = productoPorId.get(id);
      if (!p?.talla) continue;
      porTalla.set(p.talla, (porTalla.get(p.talla) || 0) + unidades);
    }
    const ventasPorTalla = [...porTalla.entries()].map(([talla, unidades]) => ({ talla, unidades })).sort((a, b) => b.unidades - a.unidades).slice(0, 15);

    // --- Rotación por categoría ---
    const categorias = new Map(); // categoria -> { stock, vendido, costo }
    for (const p of productos) {
      if (!categorias.has(p.categoria)) categorias.set(p.categoria, { categoria: p.categoria, stock: 0, vendido: 0, valorStock: 0 });
      const c = categorias.get(p.categoria);
      c.stock += Math.max(0, p.stockActual);
      c.valorStock += Math.max(0, p.stockActual) * p.costo;
    }
    for (const [id, unidades] of salidasPorProducto) {
      const p = productoPorId.get(id);
      if (!p) continue;
      categorias.get(p.categoria).vendido += unidades;
    }
    const rotacionPorCategoria = [...categorias.values()]
      .map((c) => ({ ...c, rotacion: c.stock > 0 ? c.vendido / c.stock : c.vendido > 0 ? Infinity : 0 }))
      .sort((a, b) => b.vendido - a.vendido);

    // --- Rotación por talla (misma cuenta, agrupada por talla en vez de categoría) ---
    const tallas = new Map();
    for (const p of productos) {
      const talla = p.talla || "Sin talla";
      if (!tallas.has(talla)) tallas.set(talla, { categoria: talla, stock: 0, vendido: 0, valorStock: 0 });
      const t = tallas.get(talla);
      t.stock += Math.max(0, p.stockActual);
      t.valorStock += Math.max(0, p.stockActual) * p.costo;
    }
    for (const [id, unidades] of salidasPorProducto) {
      const p = productoPorId.get(id);
      if (!p) continue;
      tallas.get(p.talla || "Sin talla").vendido += unidades;
    }
    const rotacionPorTalla = [...tallas.values()]
      .map((t) => ({ ...t, rotacion: t.stock > 0 ? t.vendido / t.stock : t.vendido > 0 ? Infinity : 0 }))
      .sort((a, b) => b.vendido - a.vendido);

    // --- Reabastecimientos recientes (por producto, en el período) ---
    const reabastecimientos = [...entradasPorProducto.entries()]
      .map(([id, unidades]) => {
        const p = productoPorId.get(id);
        return p ? { id, nombre: p.nombre, categoria: p.categoria, talla: p.talla, unidades } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 12);

    // --- Movimientos recientes (detalle, más reciente primero) ---
    const movimientosRecientes = [...movsPeriodo]
      .filter((m) => m.tipo === "entrada" || m.tipo === "salida")
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 60)
      .map((m) => ({ ...m, producto: productoPorId.get(m.productoId) }));

    // --- Agotados (priorizados por lo que más se vendía antes de agotarse) ---
    const agotados = productos
      .filter((p) => p.stockActual <= 0)
      .map((p) => ({ ...p, ventasHistoricas: salidasPorProducto.get(p.id) || 0 }))
      .sort((a, b) => b.ventasHistoricas - a.ventasHistoricas);

    // --- KPIs ---
    const totalSKUs = productos.length;
    const unidadesEnStock = productos.reduce((s, p) => s + Math.max(0, p.stockActual), 0);
    const valorInventarioCosto = productos.reduce((s, p) => s + Math.max(0, p.stockActual) * p.costo, 0);
    const totalAgotados = agotados.length;

    return {
      hoy, masVendidos, ventasPorTalla, rotacionPorCategoria, rotacionPorTalla, reabastecimientos, movimientosRecientes, agotados,
      totalSKUs, unidadesEnStock, valorInventarioCosto, totalAgotados,
    };
  }, [datos, modoPeriodo, diasPreset, fechaUnica, rangoDesde, rangoHasta]);

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        No se encontró <code>public/datos-inventario.json</code> todavía. Corre <code>npm run sync-odoo</code>
        (o el botón "Sincronizar ahora") para traer el catálogo y los movimientos de bodega desde Odoo.
      </div>
    );
  }
  if (!analisis) {
    return <div className="text-sm text-gray-400 py-8 text-center">Cargando inventario…</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <span className="text-xs font-semibold text-gray-400">Movimiento de:</span>
        <div className="flex gap-1.5 flex-wrap">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              onClick={() => { setModoPeriodo("preset"); setDiasPreset(p.valor); }}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${modoPeriodo === "preset" && diasPreset === p.valor ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}
            >
              {p.etiqueta}
            </button>
          ))}
          <button
            onClick={() => { setModoPeriodo("dia"); if (!fechaUnica) setFechaUnica(analisis.hoy); }}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${modoPeriodo === "dia" ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}
          >
            Día específico
          </button>
          <button
            onClick={() => { setModoPeriodo("rango"); if (!rangoDesde) setRangoDesde(analisis.hoy); if (!rangoHasta) setRangoHasta(analisis.hoy); }}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${modoPeriodo === "rango" ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}
          >
            Rango
          </button>
        </div>

        {modoPeriodo === "dia" && (
          <input
            type="date" value={fechaUnica} onChange={(e) => setFechaUnica(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
          />
        )}
        {modoPeriodo === "rango" && (
          <div className="flex items-center gap-2">
            <input type="date" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
            <span className="text-gray-400 text-sm">a</span>
            <input type="date" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
        )}

        <span className="text-xs text-gray-400 ml-auto">Corte de stock al {analisis.hoy}</span>
      </div>

      {/* KPIs */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <TarjetaKPI etiqueta="Referencias (SKU)" valor={formatoNum(analisis.totalSKUs)} Icono={Layers} />
        <TarjetaKPI etiqueta="Unidades en stock" valor={formatoNum(analisis.unidadesEnStock)} Icono={Warehouse} />
        <TarjetaKPI etiqueta="Valor de inventario (costo)" valor={formatoCOP(analisis.valorInventarioCosto)} Icono={Package} />
        <TarjetaKPI
          etiqueta="Referencias agotadas"
          valor={formatoNum(analisis.totalAgotados)}
          Icono={PackageX}
          tono={analisis.totalAgotados > 0 ? "alerta" : "normal"}
          onClick={analisis.totalAgotados > 0 ? () => setModalAgotadosAbierto(true) : undefined}
        />
      </div>

      {/* Más vendidos + Tallas */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Tarjeta titulo="Más vendidos" icono={<TrendingUp size={16} className="text-emerald-700" />}>
          {analisis.masVendidos.length ? (
            <>
              <BarraHorizontal datos={analisis.masVendidos} campoEtiqueta="nombre" campoValor="unidades" onClickItem={setProductoDesglose} />
              <p className="text-[11px] text-gray-400 mt-2.5">Toca una referencia para ver el desglose por talla.</p>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Sin ventas en este período.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Tallas que más se mueven" icono={<Ruler size={16} className="text-emerald-700" />}>
          {analisis.ventasPorTalla.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analisis.ventasPorTalla}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="talla" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v) => [`${formatoNum(v)} unidades`, "Vendidas"]} />
                <Bar dataKey="unidades" radius={[4, 4, 0, 0]}>
                  {analisis.ventasPorTalla.map((_, i) => <Cell key={i} fill={COLORES_SERIE[i % COLORES_SERIE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No hay ventas con talla registrada en este período.</p>
          )}
        </Tarjeta>
      </div>

      {/* Rotación por categoría / talla */}
      <Tarjeta
        titulo={`Rotación por ${agruparRotacionPor === "categoria" ? "categoría" : "talla"}`}
        icono={<Layers size={16} className="text-emerald-700" />}
        acciones={
          <div className="flex gap-1">
            {[["categoria", "Categoría"], ["talla", "Talla"]].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setAgruparRotacionPor(v)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${agruparRotacionPor === v ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-500 hover:bg-gray-100"}`}
              >
                {l}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className="text-left font-medium py-2 px-2">{agruparRotacionPor === "categoria" ? "Categoría" : "Talla"}</th>
                <th className="text-right font-medium py-2 px-2">Stock actual</th>
                <th className="text-right font-medium py-2 px-2">Vendido</th>
                <th className="text-right font-medium py-2 px-2">Valor stock (costo)</th>
                <th className="text-right font-medium py-2 px-2">Rotación</th>
              </tr>
            </thead>
            <tbody>
              {(agruparRotacionPor === "categoria" ? analisis.rotacionPorCategoria : analisis.rotacionPorTalla).map((c) => (
                <tr key={c.categoria} className="border-b border-gray-50">
                  <td className="py-1.5 px-2 font-medium">{c.categoria}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{formatoNum(c.stock)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatoNum(c.vendido)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{formatoCOP(c.valorStock)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${c.rotacion === 0 ? "text-gray-300" : c.rotacion >= 1 ? "text-green-700" : "text-amber-600"}`}>
                    {c.rotacion === Infinity ? "∞" : `${c.rotacion.toFixed(2)}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Rotación = unidades vendidas en el período ÷ stock actual. 1.00× significa que vendiste el equivalente a todo el stock que tienes hoy.</p>
      </Tarjeta>

      {/* Reabastecimientos + Agotados */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Tarjeta titulo="Reabastecimientos recientes" icono={<ArrowDownToLine size={16} className="text-emerald-700" />}>
          {analisis.reabastecimientos.length ? (
            <BarraHorizontal datos={analisis.reabastecimientos} campoEtiqueta="nombre" campoValor="unidades" colorPorIndice={() => "#2a78d6"} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Sin entradas de mercancía en este período.</p>
          )}
        </Tarjeta>
        <Tarjeta
          titulo="Agotados (priorizados por demanda)"
          icono={<AlertTriangle size={16} className="text-red-600" />}
          acciones={analisis.agotados.length > 20 && (
            <button onClick={() => setModalAgotadosAbierto(true)} className="text-xs font-semibold text-emerald-700 hover:underline">
              Ver las {analisis.agotados.length} →
            </button>
          )}
        >
          {analisis.agotados.length ? (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs text-gray-400 border-b border-gray-200">
                    <th className="text-left font-medium py-1.5">Producto</th>
                    <th className="text-left font-medium py-1.5">Talla</th>
                    <th className="text-right font-medium py-1.5">Vendidas (período)</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.agotados.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="py-1.5 truncate max-w-[180px]" title={p.nombre}>{p.nombre}</td>
                      <td className="py-1.5 text-gray-500">{p.talla || "—"}</td>
                      <td className={`py-1.5 text-right tabular-nums font-medium ${p.ventasHistoricas > 0 ? "text-red-600" : "text-gray-400"}`}>{formatoNum(p.ventasHistoricas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No hay referencias agotadas 🎉</p>
          )}
        </Tarjeta>
      </div>

      <PanelMovimientosProducto productos={datos.productos} movimientos={datos.movimientos} />

      {/* Movimientos recientes (detalle) */}
      <Tarjeta titulo="Movimientos recientes de bodega" icono={<Warehouse size={16} className="text-emerald-700" />}>
        <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className="text-left font-medium py-2 px-3">Fecha</th>
                <th className="text-left font-medium py-2 px-3">Tipo</th>
                <th className="text-left font-medium py-2 px-3">Producto</th>
                <th className="text-left font-medium py-2 px-3">Talla</th>
                <th className="text-right font-medium py-2 px-3">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {analisis.movimientosRecientes.map((m, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 px-3 tabular-nums text-gray-500">{m.fecha}</td>
                  <td className="py-1.5 px-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${m.tipo === "entrada" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {m.tipo === "entrada" ? <ArrowDownToLine size={11} /> : <ArrowUpFromLine size={11} />}
                      {m.tipo === "entrada" ? "Entrada" : "Salida"}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 truncate max-w-[220px]" title={m.producto?.nombre}>{m.producto?.nombre || `#${m.productoId}`}</td>
                  <td className="py-1.5 px-3 text-gray-500">{m.producto?.talla || "—"}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-medium">{formatoNum(m.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {modalAgotadosAbierto && (
        <ModalAgotados agotados={analisis.agotados} onCerrar={() => setModalAgotadosAbierto(false)} />
      )}

      {productoDesglose && (
        <ModalDesgloseTallas producto={productoDesglose} onCerrar={() => setProductoDesglose(null)} />
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------
   Desglose por talla de una referencia de "Más vendidos" (que agrupa
   todas las tallas de un mismo producto en una sola barra).
----------------------------------------------------------------------- */
function ModalDesgloseTallas({ producto, onCerrar }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-50" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold">{producto.nombre}</h3>
            <p className="text-xs text-gray-400">{producto.categoria} · {formatoNum(producto.unidades)} unidades vendidas en total</p>
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className="text-left font-medium py-2">Talla</th>
                <th className="text-right font-medium py-2">Vendidas</th>
                <th className="text-right font-medium py-2">Ingresos</th>
                <th className="text-right font-medium py-2">Stock actual</th>
              </tr>
            </thead>
            <tbody>
              {producto.tallas.map((t, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 font-medium">{t.talla}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatoNum(t.unidades)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{formatoCOP(t.ingresos)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${t.stockActual <= 0 ? "text-red-600" : "text-gray-700"}`}>
                    {formatoNum(t.stockActual)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
   Modal con la lista completa de referencias agotadas (la tarjeta y el KPI
   solo muestran una vista previa) — con buscador por nombre/categoría.
----------------------------------------------------------------------- */
function ModalAgotados({ agotados, onCerrar }) {
  const [buscar, setBuscar] = useState("");
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return agotados;
    return agotados.filter((p) => p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q) || (p.talla || "").toLowerCase().includes(q));
  }, [agotados, buscar]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-50" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold flex items-center gap-2"><PackageX size={17} className="text-red-600" />Referencias agotadas ({agotados.length})</h3>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-5 pb-3">
          <input
            type="text" autoFocus placeholder="Buscar por nombre, categoría o talla…"
            value={buscar} onChange={(e) => setBuscar(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="overflow-y-auto px-5 pb-5 flex-1">
          {filtrados.length ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left font-medium py-2">Producto</th>
                  <th className="text-left font-medium py-2">Categoría</th>
                  <th className="text-left font-medium py-2">Talla</th>
                  <th className="text-right font-medium py-2">Vendidas (período)</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2">{p.nombre}</td>
                    <td className="py-1.5 pr-2 text-gray-500">{p.categoria}</td>
                    <td className="py-1.5 pr-2 text-gray-500">{p.talla || "—"}</td>
                    <td className={`py-1.5 text-right tabular-nums font-medium ${p.ventasHistoricas > 0 ? "text-red-600" : "text-gray-400"}`}>{formatoNum(p.ventasHistoricas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Sin resultados para "{buscar}".</p>
          )}
        </div>
      </div>
    </div>
  );
}
