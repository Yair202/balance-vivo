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
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Ruler, X,
} from "lucide-react";

const formatoCOP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
const formatoNum = (v) => new Intl.NumberFormat("es-CO").format(Math.round(v || 0));
const COLORES_SERIE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#9085e9", "#e34948", "#199e70", "#c98500"];

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

function BarraHorizontal({ datos, campoEtiqueta, campoValor, formato = formatoNum, colorPorIndice }) {
  const max = Math.max(...datos.map((d) => d[campoValor]), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {datos.map((d, i) => (
        <div key={d.id ?? d[campoEtiqueta]} className="flex items-center gap-3">
          <div className="w-32 sm:w-40 text-xs text-gray-600 truncate" title={d[campoEtiqueta]}>{d[campoEtiqueta]}</div>
          <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md flex items-center justify-end px-2"
              style={{ width: `${Math.max(4, (d[campoValor] / max) * 100)}%`, background: colorPorIndice ? colorPorIndice(i) : "#0f6e5c" }}
            >
              <span className="text-[10px] font-semibold text-white tabular-nums">{formato(d[campoValor])}</span>
            </div>
          </div>
        </div>
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

export default function PanelInventario() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);
  const [periodo, setPeriodo] = useState(90);
  const [modalAgotadosAbierto, setModalAgotadosAbierto] = useState(false);

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
    const desde = periodo === 0 ? "0000-00-00" : (() => { const d = new Date(`${hoy}T00:00:00`); d.setDate(d.getDate() - periodo); return d.toISOString().slice(0, 10); })();
    const movsPeriodo = movimientos.filter((m) => m.fecha >= desde);

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

    // --- Más vendidos ---
    const masVendidos = [...salidasPorProducto.entries()]
      .map(([id, unidades]) => {
        const p = productoPorId.get(id);
        return p ? { id, nombre: p.nombre, categoria: p.categoria, talla: p.talla, unidades, ingresos: unidades * p.precioVenta } : null;
      })
      .filter(Boolean)
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
      hoy, masVendidos, ventasPorTalla, rotacionPorCategoria, reabastecimientos, movimientosRecientes, agotados,
      totalSKUs, unidadesEnStock, valorInventarioCosto, totalAgotados,
    };
  }, [datos, periodo]);

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
        <span className="text-xs font-semibold text-gray-400">Movimiento de los últimos:</span>
        <div className="flex gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              onClick={() => setPeriodo(p.valor)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${periodo === p.valor ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
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
            <BarraHorizontal datos={analisis.masVendidos} campoEtiqueta="nombre" campoValor="unidades" />
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

      {/* Rotación por categoría */}
      <Tarjeta titulo="Rotación por categoría" icono={<Layers size={16} className="text-emerald-700" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className="text-left font-medium py-2 px-2">Categoría</th>
                <th className="text-right font-medium py-2 px-2">Stock actual</th>
                <th className="text-right font-medium py-2 px-2">Vendido</th>
                <th className="text-right font-medium py-2 px-2">Valor stock (costo)</th>
                <th className="text-right font-medium py-2 px-2">Rotación</th>
              </tr>
            </thead>
            <tbody>
              {analisis.rotacionPorCategoria.map((c) => (
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
