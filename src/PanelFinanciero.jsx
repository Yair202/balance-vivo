/**
 * PanelFinanciero.jsx
 * ---------------------------------------------------------------------------
 * Tablero de control financiero y de rendimiento para tienda/almacén.
 *
 * Requiere (instala en tu proyecto):
 *   npm install recharts lucide-react
 *   npm install -D tailwindcss @tailwindcss/postcss postcss   (o tu setup de Tailwind)
 *
 * Este archivo es UN SOLO componente autocontenido a propósito, para que sea
 * fácil de copiar y pegar en un proyecto Vite/CRA/Next existente. Si tu
 * proyecto ya tiene convenciones de carpetas, lo normal sería separar:
 *   - los "hooks"/funciones de datos (sección 1 y 2 de este archivo) en
 *     src/lib/finanzas.js
 *   - los sub-componentes de gráficos (sección 3) en src/components/graficos/
 *   - el componente principal (sección 4) en src/components/PanelFinanciero.jsx
 *
 * ►► DÓNDE CONECTAR TUS DATOS REALES: busca los bloques marcados con
 *    "SUSTITUIR AQUÍ" — son los únicos que necesitas tocar.
 * ---------------------------------------------------------------------------
 */
import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Target,
  CalendarDays, FileText, Percent, Package, Table2, X,
  SlidersHorizontal, RefreshCw, Home, Crown, Settings, Warehouse, LayoutDashboard,
  Clock, CheckCircle2, Receipt,
} from "lucide-react";
import PanelInventario from "./PanelInventario";

/* =============================================================================
   SECCIÓN 1 — DATOS SIMULADOS (MOCK DATA)
   -----------------------------------------------------------------------------
   ►► SUSTITUIR AQUÍ: cambia generarRegistrosSimulados() por una función que
   traiga tus datos reales. Tres caminos típicos, de más a menos automático:

     a) BACKEND QUE LEE LOS PDF DEL POS
        Un PDF no se puede parsear de forma confiable solo con JavaScript de
        navegador. Monta un endpoint (Node + pdf-parse, o Python + pdfplumber/
        camelot) que reciba el PDF, extraiga ventas/costos/gastos por día, y
        devuelva JSON con la MISMA FORMA que un "registro" de abajo. Luego,
        en el componente, reemplaza el useState inicial por:
          const [registros, setRegistros] = useState([]);
          useEffect(() => { fetch('/api/registros').then(r => r.json()).then(setRegistros); }, []);

     b) EXPORTACIÓN MANUAL (CSV/JSON) DE TU POS
        Si tu POS puede exportar un CSV/JSON con ventas diarias, transorma
        cada fila a la forma de "registro" (ver abajo) con un pequeño script,
        y carga ese archivo en vez de generar datos aleatorios.

     c) EL FORMULARIO "CARGAR VENTAS DEL DÍA" DE ESTE MISMO TABLERO
        Ya funciona de verdad: agrega un registro real al estado de React con
        exactamente esta forma — es el camino más simple si por ahora quieres
        digitar el cierre de caja a mano en vez de leer el PDF automáticamente.

   CONTRATO DE UN "REGISTRO" (un día de operación):
   {
     fecha: 'YYYY-MM-DD',
     ventasBrutas: number,       // = efectivo + tarjetas + transferencias
     efectivo: number,
     tarjetas: number,
     transferencias: number,
     costoVentas: number,        // COGS del día
     gastosFijos: number,        // arriendo/nómina/servicios, prorrateados por día
     gastosVariables: number,    // comisiones, empaques, domicilios, etc.
   }
   Mientras cada registro tenga estos campos, el resto del tablero (KPIs, PyG,
   proyecciones, gráficos) sigue funcionando sin que cambies nada más.
============================================================================= */
function crearGeneradorAleatorio(semilla) {
  let estado = semilla;
  return function siguiente() {
    estado |= 0; estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOY = new Date();
const INICIO_HISTORICO = new Date(HOY.getFullYear() - 2, HOY.getMonth(), 1);

function generarRegistrosSimulados() {
  const aleatorio = crearGeneradorAleatorio(20260922);
  const unDia = 24 * 60 * 60 * 1000;
  const totalDias = Math.round((HOY - INICIO_HISTORICO) / unDia);
  const registros = [];

  for (let i = 0; i <= totalDias; i++) {
    const fecha = new Date(INICIO_HISTORICO.getTime() + i * unDia);
    const diaSemana = fecha.getDay();
    const mes = fecha.getMonth();

    const VENTA_BASE = 3100000; // ajusta a la escala real de tu almacén
    const factorFinDeSemana = diaSemana === 5 || diaSemana === 6 ? 1.4 : diaSemana === 0 ? 0.72 : 1;
    const factorEstacional = 1 + 0.3 * Math.sin(((mes + 1) / 12) * 2 * Math.PI - 1.6); // pico en diciembre
    const anosTranscurridos = (fecha - INICIO_HISTORICO) / (365 * unDia);
    const factorCrecimiento = 1 + 0.16 * anosTranscurridos; // ~16% de crecimiento anual
    const ruido = 0.86 + aleatorio() * 0.28;

    const ventasBrutas = Math.round(
      (VENTA_BASE * factorFinDeSemana * factorEstacional * factorCrecimiento * ruido) / 1000
    ) * 1000;

    const pctEfectivo = 0.34 + aleatorio() * 0.08;
    const pctTransferencia = 0.24 + aleatorio() * 0.07;
    const pctAddi = 0.08 + aleatorio() * 0.05; // ADDI: crédito a mes vencido, aparte de tarjetas
    const pctTarjetas = Math.max(0.1, 1 - pctEfectivo - pctTransferencia - pctAddi);
    const suma = pctEfectivo + pctTransferencia + pctAddi + pctTarjetas;

    const efectivo = Math.round((ventasBrutas * pctEfectivo) / suma);
    const transferencias = Math.round((ventasBrutas * pctTransferencia) / suma);
    const addi = Math.round((ventasBrutas * pctAddi) / suma);
    const tarjetas = ventasBrutas - efectivo - transferencias - addi;

    const pctCosto = 0.55 + aleatorio() * 0.05; // costo de ventas ~55-60%
    const costoVentas = Math.round(ventasBrutas * pctCosto);
    const gastosFijos = 420000 + Math.round(aleatorio() * 30000);
    const gastosVariables = Math.round(ventasBrutas * (0.045 + aleatorio() * 0.02));
    const ticketPromedio = 55000 + aleatorio() * 20000; // valor promedio por factura, solo para la simulación
    const numeroVentas = Math.max(1, Math.round(ventasBrutas / ticketPromedio));

    registros.push({
      fecha: fecha.toISOString().slice(0, 10),
      ventasBrutas, efectivo, tarjetas, transferencias, addi,
      costoVentas, gastosFijos, gastosVariables, numeroVentas,
    });
  }
  return registros;
}

/* =============================================================================
   SECCIÓN 2 — CÁLCULO Y FORMATO
   No necesitas tocar nada de aquí: trabaja sobre la forma de "registro" de
   arriba, así que sigue funcionando igual con datos reales.
============================================================================= */
const claveMes = (iso) => iso.slice(0, 7);
const claveAno = (iso) => iso.slice(0, 4);
const NOMBRES_MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
// getDay(): 0=domingo...6=sábado
const NOMBRES_DIA_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_SEMANA_CHIPS = [
  { valor: 1, letra: "L" }, { valor: 2, letra: "M" }, { valor: 3, letra: "X" }, { valor: 4, letra: "J" },
  { valor: 5, letra: "V" }, { valor: 6, letra: "S" }, { valor: 0, letra: "D" },
];
const diaSemanaDe = (fechaIso) => new Date(`${fechaIso}T00:00:00`).getDay();
const diaDelMesDe = (fechaIso) => new Date(`${fechaIso}T00:00:00`).getDate();

function sumarRegistros(lista) {
  return lista.reduce((acc, r) => ({
    ventasBrutas: acc.ventasBrutas + r.ventasBrutas,
    efectivo: acc.efectivo + r.efectivo,
    tarjetas: acc.tarjetas + r.tarjetas,
    transferencias: acc.transferencias + r.transferencias,
    addi: acc.addi + (r.addi || 0),
    costoVentas: acc.costoVentas + r.costoVentas,
    gastosFijos: acc.gastosFijos + r.gastosFijos,
    gastosVariables: acc.gastosVariables + r.gastosVariables,
    numeroVentas: acc.numeroVentas + (r.numeroVentas || 0),
  }), { ventasBrutas:0, efectivo:0, tarjetas:0, transferencias:0, addi:0, costoVentas:0, gastosFijos:0, gastosVariables:0, numeroVentas:0 });
}

function calcularPyG(totales) {
  const utilidadBruta = totales.ventasBrutas - totales.costoVentas;
  const gastosOperativos = totales.gastosFijos + totales.gastosVariables;
  const utilidadNeta = utilidadBruta - gastosOperativos;
  const margenBruto = totales.ventasBrutas ? (utilidadBruta / totales.ventasBrutas) * 100 : 0;
  const margenNeto = totales.ventasBrutas ? (utilidadNeta / totales.ventasBrutas) * 100 : 0;
  return { ...totales, utilidadBruta, gastosOperativos, utilidadNeta, margenBruto, margenNeto };
}

const formatoCOP = (valor) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor || 0);
const formatoPct = (valor, dec = 1) => `${valor >= 0 ? "+" : "-"}${Math.abs(valor).toFixed(dec)}%`;
const formatoNumeroVentas = (valor) => new Intl.NumberFormat("es-CO").format(Math.round(valor || 0));
const formatoFechaCorta = (iso) => { const [, m, d] = iso.split("-"); return `${parseInt(d,10)} ${NOMBRES_MES[parseInt(m,10)-1]}`; };
const deltaPct = (actual, anterior) => (anterior ? ((actual - anterior) / Math.abs(anterior)) * 100 : 0);
const sumarMeses = (iso, delta) => {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Paleta categórica validada para lectores con daltonismo (azul/naranja/aqua/amarillo).
// Ver la skill "dataviz" si quieres regenerar/validar tu propia paleta de marca.
const COLORES_SERIE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const COLOR_ACENTO = "#0f6e5c";
const COLOR_CONTEXTO = "#a3a39c";
const COLOR_POSITIVO = "#006300";
const COLOR_NEGATIVO = "#b3221c";

/* =============================================================================
   SECCIÓN 3 — SUB-COMPONENTES DE UI
============================================================================= */
function TarjetaKPI({ etiqueta, valor, Icono, delta, deltaEtiqueta, onClickValor }) {
  const positivo = delta >= 0;
  const FlechaDelta = positivo ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <Icono size={16} className="text-emerald-700" />{etiqueta}
      </div>
      {onClickValor ? (
        <button onClick={onClickValor} title="Ver el detalle de productos vendidos" className="text-2xl font-semibold tabular-nums truncate text-left hover:text-emerald-700 hover:underline underline-offset-4 decoration-2 w-fit">
          {valor}
        </button>
      ) : (
        <div className="text-2xl font-semibold tabular-nums truncate">{valor}</div>
      )}
      {delta !== undefined && (
        <div className={`flex items-center gap-1 text-sm font-semibold ${positivo ? "text-green-700" : "text-red-700"}`}>
          <FlechaDelta size={14} />{formatoPct(delta)}
          <span className="text-gray-400 font-medium">{deltaEtiqueta}</span>
        </div>
      )}
    </div>
  );
}

function Medidor({ porcentaje, etiqueta, valorTexto, metaTexto }) {
  const pct = Math.max(0, Math.min(100, porcentaje));
  const color = porcentaje >= 95 ? "#0ca30c" : porcentaje >= 70 ? "#a5761f" : "#d03b3b";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-gray-600">{etiqueta}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>{porcentaje.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden border border-gray-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400 tabular-nums">
        <span>{valorTexto}</span><span>Meta: {metaTexto}</span>
      </div>
    </div>
  );
}

function TooltipMoneda({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>{p.name}: {formatoCOP(p.value)}</div>
      ))}
    </div>
  );
}

function FilaPyG({ etiqueta, valor, negativo, destacado, sub }) {
  return (
    <div className={`flex items-baseline justify-between py-2 ${destacado ? "border-t border-gray-200 mt-1 pt-2.5" : ""}`}>
      <span className={destacado ? "font-semibold text-gray-900" : "text-gray-500"} style={{ fontSize: destacado ? 14.5 : 13.5 }}>
        {etiqueta}{sub && <span className="text-gray-400 text-xs ml-1.5 tabular-nums">{sub}</span>}
      </span>
      <span
        className={`tabular-nums ${destacado ? "font-semibold" : ""}`}
        style={{
          fontSize: destacado ? 15.5 : 14,
          color: negativo ? COLOR_NEGATIVO : destacado ? (valor >= 0 ? COLOR_POSITIVO : COLOR_NEGATIVO) : "#111827",
        }}
      >
        {negativo ? "− " : ""}{formatoCOP(Math.abs(valor))}
      </span>
    </div>
  );
}

/* -----------------------------------------------------------------------
   ADDI pendiente por cobrar: ADDI paga el segundo miércoles HÁBIL del mes
   siguiente al de la venta, y descuenta 6.9% de comisión. Se agrupa lo
   vendido por ADDI mes a mes y se calcula cuándo entra la plata y cuánto
   neto — para poder controlar ese flujo de caja diferido.
   ►► Ojo: "hábil" aquí solo excluye sábados/domingos (el segundo miércoles
   del mes calendario), no festivos colombianos — si un 2do miércoles cae
   festivo, la fecha real de pago puede correrse uno o dos días.
----------------------------------------------------------------------- */
function segundoMiercolesHabilMesSiguiente(ano, mes) { // mes 1-12, calcula sobre el mes siguiente
  let m = mes + 1, a = ano;
  if (m > 12) { m = 1; a += 1; }
  const miercoles = [];
  const d = new Date(a, m - 1, 1);
  while (d.getMonth() === m - 1) {
    if (d.getDay() === 3) miercoles.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return miercoles[1];
}
const PCT_COMISION_ADDI = 0.069;

function PanelAddi({ registros }) {
  const meses = useMemo(() => {
    const porMes = new Map();
    for (const r of registros) {
      if (!r.addi) continue;
      const clave = claveMes(r.fecha);
      porMes.set(clave, (porMes.get(clave) || 0) + r.addi);
    }
    const hoy = new Date();
    return [...porMes.entries()]
      .map(([clave, vendido]) => {
        const [ano, mes] = clave.split("-").map(Number);
        const fechaPago = segundoMiercolesHabilMesSiguiente(ano, mes);
        const comision = vendido * PCT_COMISION_ADDI;
        const neto = vendido - comision;
        return { clave, ano, mes, vendido, comision, neto, fechaPago, pagado: fechaPago < hoy };
      })
      .sort((a, b) => b.clave.localeCompare(a.clave));
  }, [registros]);

  const pendientes = meses.filter((m) => !m.pagado);
  const totalPendiente = pendientes.reduce((s, m) => s + m.neto, 0);
  const proximoPago = [...pendientes].sort((a, b) => a.fechaPago - b.fechaPago)[0];

  if (meses.length === 0) return null;

  const formatoFechaPago = (d) => d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <Clock size={16} className="text-emerald-700" />ADDI — pendiente por cobrar
      </h2>
      <p className="text-xs text-gray-400 mb-4">ADDI paga el segundo miércoles hábil del mes siguiente a la venta, descontando 6,9% de comisión.</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-amber-50 px-3 py-2.5">
          <div className="text-xs text-gray-500">Total pendiente por cobrar (neto)</div>
          <div className="text-xl font-semibold tabular-nums">{formatoCOP(totalPendiente)}</div>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
          <div className="text-xs text-gray-500">Próximo pago</div>
          {proximoPago ? (
            <div className="text-sm font-semibold">
              <span className="tabular-nums">{formatoCOP(proximoPago.neto)}</span>
              <span className="text-gray-400 font-normal"> · {formatoFechaPago(proximoPago.fechaPago)}</span>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Nada pendiente</div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-200">
              <th className="text-left font-medium py-2 px-2">Mes de venta</th>
              <th className="text-right font-medium py-2 px-2">Vendido en ADDI</th>
              <th className="text-right font-medium py-2 px-2">Comisión (6,9%)</th>
              <th className="text-right font-medium py-2 px-2">Neto a recibir</th>
              <th className="text-left font-medium py-2 px-2">Fecha de pago</th>
              <th className="text-left font-medium py-2 px-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {meses.slice(0, 12).map((m) => (
              <tr key={m.clave} className="border-b border-gray-50">
                <td className="py-1.5 px-2 font-medium">{NOMBRES_MES[m.mes - 1]} {m.ano}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{formatoCOP(m.vendido)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-red-600">− {formatoCOP(m.comision)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{formatoCOP(m.neto)}</td>
                <td className="py-1.5 px-2 text-gray-500">{formatoFechaPago(m.fechaPago)}</td>
                <td className="py-1.5 px-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${m.pagado ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>
                    {m.pagado ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                    {m.pagado ? "Pagado" : "Pendiente"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
   Análisis por patrón: comparativos a la medida, ej. "los 15 de cada mes"
   o "los sábados después del día 15" — arma el patrón con checks de día
   de la semana + rango de día del mes + rango de fechas, y compara el
   promedio de esos días contra el promedio del resto.
----------------------------------------------------------------------- */
function PanelAnalisisPatron({ registros }) {
  const ordenados = useMemo(() => [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha)), [registros]);
  const fechaMin = ordenados[0]?.fecha;
  const fechaMax = ordenados[ordenados.length - 1]?.fecha;

  const [diasSemana, setDiasSemana] = useState(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [diaMesDesde, setDiaMesDesde] = useState(1);
  const [diaMesHasta, setDiaMesHasta] = useState(31);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const toggleDia = (v) => setDiasSemana((prev) => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  const analisis = useMemo(() => {
    const desde = fechaDesde || fechaMin;
    const hasta = fechaHasta || fechaMax;
    if (!desde || !hasta) return null;
    const coincide = [], resto = [];
    for (const r of ordenados) {
      if (r.fecha < desde || r.fecha > hasta) continue;
      const dm = diaDelMesDe(r.fecha);
      const cumple = diasSemana.has(diaSemanaDe(r.fecha)) && dm >= diaMesDesde && dm <= diaMesHasta;
      (cumple ? coincide : resto).push(r);
    }
    const promedio = (lista) => (lista.length ? lista.reduce((s, r) => s + r.ventasBrutas, 0) / lista.length : 0);
    const promedioPatron = promedio(coincide);
    const promedioResto = promedio(resto);

    // Resumen año a año DENTRO del patrón — para comparar, ej., "los sábados
    // después del 15" de 2025 vs. de 2026, sin tener que leer fila por fila.
    const grupos = new Map();
    for (const r of coincide) {
      const ano = claveAno(r.fecha);
      if (!grupos.has(ano)) grupos.set(ano, []);
      grupos.get(ano).push(r);
    }
    const anosOrdenados = [...grupos.keys()].sort();
    const porAno = anosOrdenados.map((ano, i) => {
      const lista = grupos.get(ano);
      const total = lista.reduce((s, r) => s + r.ventasBrutas, 0);
      const prom = total / lista.length;
      const listaAnterior = i > 0 ? grupos.get(anosOrdenados[i - 1]) : null;
      const promAnterior = listaAnterior ? listaAnterior.reduce((s, r) => s + r.ventasBrutas, 0) / listaAnterior.length : null;
      return { ano, cantidad: lista.length, total, promedio: prom, delta: promAnterior != null ? deltaPct(prom, promAnterior) : null };
    });

    return {
      coincidentes: [...coincide].reverse(), // más reciente primero
      cantidad: coincide.length,
      cantidadResto: resto.length,
      totalPatron: coincide.reduce((s, r) => s + r.ventasBrutas, 0),
      promedioPatron,
      promedioResto,
      delta: deltaPct(promedioPatron, promedioResto),
      porAno,
    };
  }, [ordenados, diasSemana, diaMesDesde, diaMesHasta, fechaDesde, fechaHasta, fechaMin, fechaMax]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <SlidersHorizontal size={16} className="text-emerald-700" />Análisis por patrón
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Arma tu propio comparativo: ej. "los 15 de cada mes" (marca solo el rango de día 15 a 15) o
        "los sábados después del 15" (marca solo Sábado + rango de día 16 a 31).
      </p>

      <div className="flex flex-wrap items-end gap-5 mb-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Día de la semana</label>
          <div className="flex gap-1">
            {DIAS_SEMANA_CHIPS.map(({ valor, letra }) => (
              <button
                key={valor}
                onClick={() => toggleDia(valor)}
                title={NOMBRES_DIA_SEMANA[valor]}
                className={`w-8 h-8 rounded-full text-xs font-bold border ${
                  diasSemana.has(valor) ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-400 hover:bg-gray-100"
                }`}
              >
                {letra}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Día del mes</label>
          <div className="flex items-center gap-2">
            <input type="number" min="1" max="31" value={diaMesDesde}
              onChange={(e) => setDiaMesDesde(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm tabular-nums" />
            <span className="text-gray-400 text-sm">a</span>
            <input type="number" min="1" max="31" value={diaMesHasta}
              onChange={(e) => setDiaMesHasta(Math.min(31, Math.max(1, Number(e.target.value) || 31)))}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm tabular-nums" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Rango de fechas</label>
          <div className="flex items-center gap-2">
            <input type="date" value={fechaDesde || fechaMin || ""} min={fechaMin} max={fechaMax}
              onChange={(e) => setFechaDesde(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-gray-400 text-sm">a</span>
            <input type="date" value={fechaHasta || fechaMax || ""} min={fechaMin} max={fechaMax}
              onChange={(e) => setFechaHasta(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
      </div>

      {analisis && analisis.cantidad > 0 ? (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <div className="text-xs text-gray-400">Días que cumplen el patrón</div>
              <div className="text-lg font-semibold tabular-nums">{analisis.cantidad}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <div className="text-xs text-gray-400">Venta promedio en el patrón</div>
              <div className="text-lg font-semibold tabular-nums">{formatoCOP(analisis.promedioPatron)}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2.5">
              <div className="text-xs text-gray-400">Vs. promedio de los demás días</div>
              {analisis.cantidadResto > 0 ? (
                <div className={`text-lg font-semibold tabular-nums flex items-center gap-1 ${analisis.delta >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {analisis.delta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}{formatoPct(analisis.delta)}
                </div>
              ) : (
                <div className="text-sm text-gray-400 pt-1">El patrón cubre todos los días — achícalo para comparar</div>
              )}
            </div>
          </div>
          {analisis.porAno.length > 1 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">Comparativo año a año (dentro de este patrón)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-200">
                      <th className="text-left font-medium py-1.5 px-3">Año</th>
                      <th className="text-right font-medium py-1.5 px-3">Días</th>
                      <th className="text-right font-medium py-1.5 px-3">Promedio</th>
                      <th className="text-right font-medium py-1.5 px-3">Total</th>
                      <th className="text-right font-medium py-1.5 px-3">Vs. año anterior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.porAno.map((a) => (
                      <tr key={a.ano} className="border-b border-gray-50">
                        <td className="py-1.5 px-3 font-semibold tabular-nums">{a.ano}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{a.cantidad}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{formatoCOP(a.promedio)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{formatoCOP(a.total)}</td>
                        <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${a.delta == null ? "text-gray-300" : a.delta >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {a.delta == null ? "—" : formatoPct(a.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-3">
            <span>Detalle día a día</span>
            <span className="flex items-center gap-1 font-normal text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />por encima del promedio del patrón
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block ml-2" />por debajo
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left font-medium py-2 px-3">Año</th>
                  <th className="text-left font-medium py-2 px-3">Mes</th>
                  <th className="text-right font-medium py-2 px-3">Día</th>
                  <th className="text-left font-medium py-2 px-3">Día semana</th>
                  <th className="text-right font-medium py-2 px-3">Ventas</th>
                </tr>
              </thead>
              <tbody>
                {analisis.coincidentes.map((r) => {
                  const [ano, mes, dia] = r.fecha.split("-");
                  const porEncima = r.ventasBrutas >= analisis.promedioPatron;
                  return (
                    <tr key={r.fecha} className={`border-b border-gray-50 ${porEncima ? "bg-green-50/60" : "bg-red-50/50"}`}>
                      <td className="py-1.5 px-3 tabular-nums text-gray-500">{ano}</td>
                      <td className="py-1.5 px-3">{NOMBRES_MES[Number(mes) - 1]}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{Number(dia)}</td>
                      <td className="py-1.5 px-3 text-gray-500">{NOMBRES_DIA_SEMANA[diaSemanaDe(r.fecha)]}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${porEncima ? "text-green-700" : "text-red-600"}`}>
                        {formatoCOP(r.ventasBrutas)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">Ningún día cumple ese patrón en el rango de fechas elegido.</p>
      )}
    </div>
  );
}

/* =============================================================================
   SECCIÓN 4 — COMPONENTE PRINCIPAL
============================================================================= */
export default function PanelFinanciero() {
  const [vista, setVista] = useState("financiero"); // 'financiero' | 'inventario'
  const [registros, setRegistros] = useState(generarRegistrosSimulados);
  const [detalleVentas, setDetalleVentas] = useState([]); // líneas de venta (producto/cantidad/precio) para el detalle de "Venta hoy"
  const [fuenteDatos, setFuenteDatos] = useState("simulados"); // 'simulados' | 'odoo'
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [modalDetalleAbierto, setModalDetalleAbierto] = useState(false);

  // Busca los datos reales que haya dejado `npm run sync-odoo`
  // (public/datos-ventas.json + datos-detalle-ventas.json). Si no existen
  // todavía, se queda con los datos simulados — así el tablero nunca se
  // rompe por no haber sincronizado aún.
  const cargarDatosSincronizados = () =>
    Promise.all([
      fetch("/datos-ventas.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/datos-detalle-ventas.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([datosReales, detalle]) => {
      if (Array.isArray(datosReales) && datosReales.length > 0) {
        setRegistros(datosReales);
        setFuenteDatos("odoo");
      }
      if (Array.isArray(detalle)) setDetalleVentas(detalle);
    });

  useEffect(() => { cargarDatosSincronizados().catch(() => {}); }, []);

  // Botón "Sincronizar ahora": llama al endpoint que expone vite.config.js
  // (corre scripts/sync-odoo.mjs de verdad, no es un truco visual) y, si
  // sale bien, vuelve a cargar el JSON recién escrito.
  const sincronizarAhora = async () => {
    setSincronizando(true);
    setMensajeSync(null);
    try {
      const resp = await fetch("/api/sync-odoo", { method: "POST" });
      const json = await resp.json();
      if (json.ok) {
        await cargarDatosSincronizados();
        setMensajeSync({ tipo: "ok", texto: "Datos al día" });
      } else {
        setMensajeSync({ tipo: "error", texto: "No se pudo sincronizar — revisa .env / conexión" });
      }
    } catch {
      setMensajeSync({ tipo: "error", texto: "No se pudo conectar con el servidor local" });
    } finally {
      setSincronizando(false);
      setTimeout(() => setMensajeSync(null), 5000);
    }
  };

  const [filtro, setFiltro] = useState("mensual"); // 'diario' | 'mensual' | 'anual' (granularidad del gráfico de tendencia)
  // Meta de ventas: por defecto se calcula sola (mismo mes del año pasado +
  // 20%). Si el usuario la edita a mano, esa cifra manda — pero solo para
  // el mes que está viendo; al cambiar de mes vuelve a calcularse sola.
  const [metaMensualOverride, setMetaMensualOverride] = useState(null);
  const [modalGastosAbierto, setModalGastosAbierto] = useState(false);

  // Gastos fijos y variables: Odoo (POS) no los trae, así que se configuran
  // UNA sola vez aquí y la app los reparte sola por período — no hay que
  // cargar nada día a día. Se guardan en este navegador (localStorage).
  const [gastosFijosMensuales, setGastosFijosMensuales] = useState(() => {
    try { return Number(localStorage.getItem("balance-vivo:gastos-fijos-mensuales")) || 0; } catch { return 0; }
  });
  const [pctGastosVariables, setPctGastosVariables] = useState(() => {
    try {
      const guardado = localStorage.getItem("balance-vivo:pct-gastos-variables");
      return guardado === null ? 5 : Number(guardado);
    } catch { return 5; }
  });
  useEffect(() => { try { localStorage.setItem("balance-vivo:gastos-fijos-mensuales", String(gastosFijosMensuales)); } catch {} }, [gastosFijosMensuales]);
  useEffect(() => { try { localStorage.setItem("balance-vivo:pct-gastos-variables", String(pctGastosVariables)); } catch {} }, [pctGastosVariables]);

  // Período que se está viendo en TODO el tablero (KPIs, PyG, proyección).
  // undefined = todavía no lo tocó el usuario -> usa el más reciente con datos.
  // anoSel: string 'YYYY' | undefined.  mesSel: 1-12 | null ("todo el año") | undefined (auto).
  // diaSel: 1-31 | null ("todo el mes", por defecto).
  const [anoSel, setAnoSel] = useState(undefined);
  const [mesSel, setMesSel] = useState(undefined);
  const [diaSel, setDiaSel] = useState(null);

  // Botón "Venta hoy": va directo al DÍA de calendario de hoy (distinto de
  // "Volver a hoy", que solo vuelve al mes actual).
  const irAVentaHoy = () => {
    const hoy = new Date();
    setAnoSel(String(hoy.getFullYear()));
    setMesSel(hoy.getMonth() + 1);
    setDiaSel(hoy.getDate());
  };

  const infoRango = useMemo(() => {
    const ordenados = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimaFecha = ordenados[ordenados.length - 1]?.fecha || "2026-01-01";
    const anosDisponibles = [...new Set(ordenados.map((r) => claveAno(r.fecha)))].sort();
    return { ordenados, ultimaFecha, anosDisponibles, anoDefecto: claveAno(ultimaFecha), mesDefecto: Number(ultimaFecha.slice(5, 7)) };
  }, [registros]);

  const anoActivo = anoSel ?? infoRango.anoDefecto;
  const mesActivo = mesSel !== undefined ? mesSel : (anoActivo === infoRango.anoDefecto ? infoRango.mesDefecto : null);
  const diaActivo = mesActivo ? diaSel : null; // el día solo aplica dentro de un mes concreto
  const nivelActivo = diaActivo ? "dia" : mesActivo ? "mes" : "ano";
  const diasEnMesActivo = mesActivo ? new Date(Number(anoActivo), mesActivo, 0).getDate() : 31;
  const etiquetaPeriodo = nivelActivo === "dia" ? "del día" : nivelActivo === "ano" ? "del año" : "del mes";
  const nombreMesCap = mesActivo ? NOMBRES_MES[mesActivo - 1].charAt(0).toUpperCase() + NOMBRES_MES[mesActivo - 1].slice(1) : "";
  const tituloPeriodo = nivelActivo === "dia" ? `${diaActivo} ${nombreMesCap} ${anoActivo}` : nivelActivo === "mes" ? `${nombreMesCap} ${anoActivo}` : anoActivo;
  const fechaDiaActivo = diaActivo ? `${anoActivo}-${String(mesActivo).padStart(2, "0")}-${String(diaActivo).padStart(2, "0")}` : null;

  // Si el usuario ajustó la meta a mano y luego cambia de mes, se vuelve a
  // calcular sola para el mes nuevo (el ajuste manual era solo para el mes
  // que estaba viendo).
  useEffect(() => { setMetaMensualOverride(null); }, [anoActivo, mesActivo]);

  const pad2 = (n) => String(n).padStart(2, "0");
  const diasEnMesDe = (fechaIso) => new Date(Number(fechaIso.slice(0, 4)), Number(fechaIso.slice(5, 7)), 0).getDate();

  // Reemplaza los gastos fijos/variables de un total agregado (que vienen en
  // 0 desde Odoo) por los que el usuario configuró, prorateados según el
  // tipo de período. `factorFijo` ya viene calculado por el llamador.
  const pctGastosVariablesSeguro = Math.min(100, Math.max(0, pctGastosVariables || 0));
  const aplicarGastosConfigurados = (totales, factorFijo) => ({
    ...totales,
    gastosFijos: Math.round(factorFijo),
    gastosVariables: Math.round(totales.ventasBrutas * (pctGastosVariablesSeguro / 100)),
  });

  const datos = useMemo(() => {
    const ordenados = infoRango.ordenados;
    const ultimaFecha = infoRango.ultimaFecha;
    const registroPorFecha = new Map(ordenados.map((r) => [r.fecha, r]));

    // mesReferencia: el mes que ancla los gráficos de tendencia/comparativo.
    // En modo "mes"/"día" es el mes elegido; en modo "año" es diciembre de
    // ese año (para que el comparativo de 12 meses cubra el año completo).
    const mesReferencia = mesActivo ? `${anoActivo}-${pad2(mesActivo)}` : `${anoActivo}-12`;
    const fechaFinReferencia = diaActivo
      ? `${anoActivo}-${pad2(mesActivo)}-${pad2(diaActivo)}`
      : mesActivo
        ? `${anoActivo}-${pad2(mesActivo)}-${pad2(diasEnMesActivo)}`
        : `${anoActivo}-12-31`;

    let pygActual, pygAnterior, pygAnoAnterior, diasEnMes, diasTranscurridos, etiquetaAnterior, etiquetaAnoAnterior;

    if (nivelActivo === "dia") {
      const fecha = fechaFinReferencia;
      const fechaAnteriorObj = new Date(`${fecha}T00:00:00`); fechaAnteriorObj.setDate(fechaAnteriorObj.getDate() - 1);
      const fechaAnterior = fechaAnteriorObj.toISOString().slice(0, 10);
      const [anoAnt] = fecha.split("-");
      const fechaAnoAnterior = `${Number(anoAnt) - 1}-${fecha.slice(5)}`;

      pygActual = calcularPyG(aplicarGastosConfigurados(
        sumarRegistros(registroPorFecha.has(fecha) ? [registroPorFecha.get(fecha)] : []), gastosFijosMensuales / diasEnMesDe(fecha)));
      pygAnterior = calcularPyG(aplicarGastosConfigurados(
        sumarRegistros(registroPorFecha.has(fechaAnterior) ? [registroPorFecha.get(fechaAnterior)] : []), gastosFijosMensuales / diasEnMesDe(fechaAnterior)));
      pygAnoAnterior = calcularPyG(aplicarGastosConfigurados(
        sumarRegistros(registroPorFecha.has(fechaAnoAnterior) ? [registroPorFecha.get(fechaAnoAnterior)] : []), gastosFijosMensuales / diasEnMesDe(fechaAnoAnterior)));
      diasEnMes = 1; diasTranscurridos = 1;
      etiquetaAnterior = "vs. día anterior"; etiquetaAnoAnterior = "mismo día, año anterior";
    } else if (nivelActivo === "mes") {
      const claveMesActivo = `${anoActivo}-${pad2(mesActivo)}`;
      const mesAnteriorClave = sumarMeses(claveMesActivo, -1);
      const mesAnoAnteriorClave = `${Number(anoActivo) - 1}-${pad2(mesActivo)}`;

      const regsMes = ordenados.filter((r) => claveMes(r.fecha) === claveMesActivo);
      pygActual = calcularPyG(aplicarGastosConfigurados(sumarRegistros(regsMes), gastosFijosMensuales));
      pygAnterior = calcularPyG(aplicarGastosConfigurados(sumarRegistros(ordenados.filter((r) => claveMes(r.fecha) === mesAnteriorClave)), gastosFijosMensuales));
      pygAnoAnterior = calcularPyG(aplicarGastosConfigurados(sumarRegistros(ordenados.filter((r) => claveMes(r.fecha) === mesAnoAnteriorClave)), gastosFijosMensuales));
      diasEnMes = diasEnMesActivo;
      diasTranscurridos = Math.min(regsMes.length || 1, diasEnMes);
      etiquetaAnterior = "vs. mes anterior"; etiquetaAnoAnterior = "mismo mes, año anterior";
    } else {
      // nivel "año": compara el año completo contra el año anterior completo.
      // Los gastos fijos se multiplican por los meses con datos (no siempre 12,
      // por ejemplo si el año va corrido hasta septiembre).
      const regsAno = ordenados.filter((r) => claveAno(r.fecha) === anoActivo);
      const regsAnoAnterior = ordenados.filter((r) => claveAno(r.fecha) === String(Number(anoActivo) - 1));
      const mesesConDatos = (lista) => new Set(lista.map((r) => claveMes(r.fecha))).size;
      pygActual = calcularPyG(aplicarGastosConfigurados(sumarRegistros(regsAno), gastosFijosMensuales * mesesConDatos(regsAno)));
      pygAnterior = calcularPyG(aplicarGastosConfigurados(sumarRegistros(regsAnoAnterior), gastosFijosMensuales * mesesConDatos(regsAnoAnterior)));
      pygAnoAnterior = pygAnterior;
      diasEnMes = anoActivo % 4 === 0 ? 366 : 365;
      diasTranscurridos = Math.min(regsAno.length || 1, diasEnMes);
      etiquetaAnterior = "vs. año anterior"; etiquetaAnoAnterior = "año anterior";
    }

    const proyeccion = (pygActual.ventasBrutas / diasTranscurridos) * diasEnMes;

    // Meta automática: mismo período del año anterior + 20%. Si no hay
    // venta el año pasado para comparar, no hay base — se deja en 0 y el
    // usuario tiene que poner una meta a mano.
    const metaAutomatica = Math.round(pygAnoAnterior.ventasBrutas * 1.2);
    const metaMensual = metaMensualOverride ?? metaAutomatica;

    const cumplimiento = metaMensual ? (pygActual.ventasBrutas / metaMensual) * 100 : 0;
    const proyeccionVsMeta = metaMensual ? (proyeccion / metaMensual) * 100 : 0;

    let serieLinea = [];
    if (filtro === "diario") {
      const hastaIdx = ordenados.findLastIndex ? ordenados.findLastIndex((r) => r.fecha <= fechaFinReferencia) : (() => {
        let idx = -1; ordenados.forEach((r, i) => { if (r.fecha <= fechaFinReferencia) idx = i; }); return idx;
      })();
      const ult30 = ordenados.slice(Math.max(0, hastaIdx - 29), hastaIdx + 1);
      const prev30 = ordenados.slice(Math.max(0, hastaIdx - 59), Math.max(0, hastaIdx - 29));
      serieLinea = ult30.map((r, i) => ({
        etiqueta: formatoFechaCorta(r.fecha), Actual: r.ventasBrutas,
        "Período anterior": prev30[i] ? prev30[i].ventasBrutas : null,
      }));
    } else if (filtro === "mensual") {
      const claves = []; for (let i = 11; i >= 0; i--) claves.push(sumarMeses(mesReferencia, -i));
      serieLinea = claves.map((clave) => {
        const [a, m] = clave.split("-");
        const claveAnoAnt = `${Number(a) - 1}-${m}`;
        return {
          etiqueta: `${NOMBRES_MES[Number(m) - 1]} ${a.slice(2)}`,
          Actual: sumarRegistros(ordenados.filter((r) => claveMes(r.fecha) === clave)).ventasBrutas,
          "Año anterior": sumarRegistros(ordenados.filter((r) => claveMes(r.fecha) === claveAnoAnt)).ventasBrutas || null,
        };
      });
    } else {
      const anos = infoRango.anosDisponibles;
      serieLinea = anos.map((a) => ({ etiqueta: a, Actual: sumarRegistros(ordenados.filter((r) => claveAno(r.fecha) === a)).ventasBrutas }));
    }

    const comparativoMensual = [];
    for (let i = 11; i >= 0; i--) {
      const clave = sumarMeses(mesReferencia, -i);
      const [a, m] = clave.split("-");
      const claveAnt = `${Number(a) - 1}-${m}`;
      comparativoMensual.push({
        etiqueta: NOMBRES_MES[Number(m) - 1],
        "Año actual": sumarRegistros(ordenados.filter((r) => claveMes(r.fecha) === clave)).ventasBrutas,
        "Año anterior": sumarRegistros(ordenados.filter((r) => claveMes(r.fecha) === claveAnt)).ventasBrutas,
      });
    }

    const metodosPago = [
      { nombre: "Efectivo", valor: pygActual.efectivo },
      { nombre: "Tarjetas", valor: pygActual.tarjetas },
      { nombre: "Transferencias", valor: pygActual.transferencias },
      { nombre: "ADDI (mes vencido)", valor: pygActual.addi || 0 },
    ];
    const composicionVenta = [
      { nombre: "Costo de ventas", valor: pygActual.costoVentas },
      { nombre: "Gastos fijos", valor: pygActual.gastosFijos },
      { nombre: "Gastos variables", valor: pygActual.gastosVariables },
      { nombre: "Utilidad neta", valor: Math.max(0, pygActual.utilidadNeta) },
    ];

    return {
      ultimaFecha, pygActual, pygAnterior, pygAnoAnterior, diasEnMes, diasTranscurridos,
      etiquetaAnterior, etiquetaAnoAnterior,
      proyeccion, cumplimiento, proyeccionVsMeta, serieLinea, comparativoMensual, metodosPago, composicionVenta,
      metaMensual, metaAutomatica,
    };
  }, [infoRango, filtro, metaMensualOverride, anoActivo, mesActivo, diaActivo, nivelActivo, diasEnMesActivo, gastosFijosMensuales, pctGastosVariables]);

  const { pygActual, pygAnterior, pygAnoAnterior } = datos;

  return (
    <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col gap-5 bg-gray-50 min-h-screen">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center">
            <Home size={20} />
            <Crown size={17} fill="currentColor" className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-amber-400 drop-shadow" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
              P&P Princesas y Princesitas
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  fuenteDatos === "odoo" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {fuenteDatos === "odoo" ? "Datos reales (Odoo)" : "Datos simulados"}
              </span>
            </h1>
            <p className="text-xs text-gray-400">Actualizado al {formatoFechaCorta(datos.ultimaFecha)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["diario", "mensual", "anual"].map((v) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border capitalize ${
                filtro === v ? "bg-emerald-700 text-white border-emerald-700" : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {v}
            </button>
          ))}
          <button
            onClick={sincronizarAhora}
            disabled={sincronizando}
            title="Trae las ventas más recientes de Odoo ahora mismo"
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
          >
            <RefreshCw size={16} className={sincronizando ? "animate-spin" : ""} />
            {sincronizando ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
          <button
            onClick={() => setModalGastosAbierto(true)}
            title="Arriendo, nómina, servicios — Odoo no los trae, se configuran una sola vez aquí"
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            <Settings size={16} />Configurar gastos
          </button>
        </div>
        {mensajeSync && (
          <div className={`w-full text-xs font-medium px-3 py-1.5 rounded-lg ${mensajeSync.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {mensajeSync.texto}
          </div>
        )}
      </header>

      {/* Pestañas principales */}
      <div className="flex gap-1.5 border-b border-gray-200">
        {[
          { valor: "financiero", etiqueta: "Financiero", Icono: LayoutDashboard },
          { valor: "inventario", etiqueta: "Inventario", Icono: Warehouse },
        ].map(({ valor, etiqueta, Icono }) => (
          <button
            key={valor}
            onClick={() => setVista(valor)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              vista === valor ? "border-emerald-700 text-emerald-700" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icono size={15} />{etiqueta}
          </button>
        ))}
      </div>

      {vista === "inventario" && <PanelInventario />}

      {vista === "financiero" && (
      <>
      {/* Selector de período: controla TODO el tablero (KPIs, PyG, proyección) */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5"><CalendarDays size={14} />Viendo:</span>
        <select
          value={anoActivo}
          onChange={(e) => setAnoSel(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-medium"
        >
          {infoRango.anosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={mesActivo === null ? "" : String(mesActivo)}
          onChange={(e) => { const v = e.target.value; setMesSel(v === "" ? null : Number(v)); setDiaSel(null); }}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-medium"
        >
          <option value="">Todo el año</option>
          {NOMBRES_MES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>{nombre.charAt(0).toUpperCase() + nombre.slice(1)}</option>
          ))}
        </select>
        {mesActivo !== null && (
          <select
            value={diaSel === null ? "" : String(diaSel)}
            onChange={(e) => { const v = e.target.value; setDiaSel(v === "" ? null : Number(v)); }}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-medium"
          >
            <option value="">Todo el mes</option>
            {Array.from({ length: diasEnMesActivo }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Día {d}</option>)}
          </select>
        )}
        <button
          onClick={irAVentaHoy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border border-emerald-700 text-emerald-700 hover:bg-emerald-50"
        >
          <Target size={14} />Venta hoy
        </button>
        {(anoSel !== undefined || mesSel !== undefined || diaSel !== null) && (
          <button
            onClick={() => { setAnoSel(undefined); setMesSel(undefined); setDiaSel(null); }}
            className="text-xs font-semibold text-emerald-700 hover:underline ml-1"
          >
            Volver al mes actual
          </button>
        )}
      </div>

      {/* KPIs */}
      <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))" }}>
        <TarjetaKPI etiqueta={`Ventas brutas ${etiquetaPeriodo}`} valor={formatoCOP(pygActual.ventasBrutas)} Icono={Package}
          delta={deltaPct(pygActual.ventasBrutas, pygAnterior.ventasBrutas)} deltaEtiqueta={datos.etiquetaAnterior}
          onClickValor={nivelActivo === "dia" && pygActual.ventasBrutas > 0 ? () => setModalDetalleAbierto(true) : undefined} />
        <TarjetaKPI etiqueta={`Utilidad neta ${etiquetaPeriodo}`} valor={formatoCOP(pygActual.utilidadNeta)} Icono={Wallet}
          delta={deltaPct(pygActual.utilidadNeta, pygAnterior.utilidadNeta)} deltaEtiqueta={datos.etiquetaAnterior} />
        <TarjetaKPI etiqueta="Margen neto" valor={`${pygActual.margenNeto.toFixed(1)}%`} Icono={Percent}
          delta={pygActual.margenNeto - pygAnterior.margenNeto} deltaEtiqueta={`pts. ${datos.etiquetaAnterior}`} />
        <TarjetaKPI etiqueta={`Vs. ${datos.etiquetaAnoAnterior}`} valor={formatoCOP(pygActual.ventasBrutas)} Icono={Target}
          delta={deltaPct(pygActual.ventasBrutas, pygAnoAnterior.ventasBrutas)} deltaEtiqueta="interanual" />
        <TarjetaKPI etiqueta={`Facturas ${etiquetaPeriodo}`} valor={formatoNumeroVentas(pygActual.numeroVentas)} Icono={Receipt}
          delta={deltaPct(pygActual.numeroVentas, pygAnterior.numeroVentas)} deltaEtiqueta={datos.etiquetaAnterior} />
      </section>

      {/* Gráficos principales */}
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><TrendingUp size={16} className="text-emerald-700" />Tendencia de ventas</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={datos.serieLinea}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<TooltipMoneda />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {filtro !== "anual" && (
                <Line type="monotone" dataKey={filtro === "diario" ? "Período anterior" : "Año anterior"} stroke={COLOR_CONTEXTO} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
              )}
              <Line type="monotone" dataKey="Actual" stroke={COLOR_ACENTO} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Table2 size={16} className="text-emerald-700" />Comparativo mensual · año actual vs. anterior</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={datos.comparativoMensual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<TooltipMoneda />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Año anterior" fill={COLOR_CONTEXTO} radius={[3, 3, 0, 0]} opacity={0.55} />
              <Bar dataKey="Año actual" fill={COLORES_SERIE[0]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* PyG + Proyección */}
      <section className={`grid gap-4 ${nivelActivo === "mes" ? "lg:grid-cols-2" : ""}`}>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileText size={16} className="text-emerald-700" />Estado de Pérdidas y Ganancias ({tituloPeriodo})</h2>
          <FilaPyG etiqueta="Ventas brutas" valor={pygActual.ventasBrutas} />
          <FilaPyG etiqueta="Costo de ventas (COGS)" valor={pygActual.costoVentas} negativo />
          <FilaPyG etiqueta="Utilidad bruta" valor={pygActual.utilidadBruta} destacado sub={`${pygActual.margenBruto.toFixed(1)}%`} />
          <FilaPyG etiqueta="Gastos fijos" valor={pygActual.gastosFijos} negativo />
          <FilaPyG etiqueta="Gastos variables" valor={pygActual.gastosVariables} negativo />
          <FilaPyG etiqueta="Utilidad neta" valor={pygActual.utilidadNeta} destacado sub={`${pygActual.margenNeto.toFixed(1)}%`} />
        </div>

        {nivelActivo === "mes" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Target size={16} className="text-emerald-700" />Proyección y meta del mes</h2>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-500">Meta de ventas mensual</label>
                {metaMensualOverride !== null && (
                  <button onClick={() => setMetaMensualOverride(null)} className="text-xs font-semibold text-emerald-700 hover:underline">
                    Usar automática
                  </button>
                )}
              </div>
              <input
                type="number" value={datos.metaMensual}
                onChange={(e) => setMetaMensualOverride(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {metaMensualOverride !== null
                  ? "Ajustada a mano para este mes."
                  : datos.metaAutomatica > 0
                    ? <>Calculada sola: {formatoCOP(pygAnoAnterior.ventasBrutas)} del mismo mes del año pasado + 20%.</>
                    : "No hay venta del mismo mes del año pasado para calcularla sola — ajústala a mano."}
              </p>
            </div>
            <Medidor porcentaje={datos.cumplimiento} etiqueta={`Cumplimiento (día ${datos.diasTranscurridos} de ${datos.diasEnMes})`}
              valorTexto={formatoCOP(pygActual.ventasBrutas)} metaTexto={formatoCOP(datos.metaMensual)} />
            <Medidor porcentaje={datos.proyeccionVsMeta} etiqueta="Proyección a fin de mes (run rate)"
              valorTexto={formatoCOP(datos.proyeccion)} metaTexto={formatoCOP(datos.metaMensual)} />
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-gray-600 flex items-start gap-2">
              <Target size={15} className="text-amber-700 mt-0.5 flex-shrink-0" />
              <span>Al ritmo actual, el mes cerraría en <b className="tabular-nums">{formatoCOP(datos.proyeccion)}</b> ({formatoPct(datos.proyeccionVsMeta - 100)} frente a la meta).</span>
            </div>
          </div>
        )}
      </section>

      {/* Donas */}
      <section className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Wallet size={16} className="text-emerald-700" />Ingresos por método de pago</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={datos.metodosPago} dataKey="valor" nameKey="nombre" isAnimationActive={false} innerRadius={55} outerRadius={85} paddingAngle={2} cornerRadius={4}>
                {datos.metodosPago.map((_, i) => <Cell key={i} fill={COLORES_SERIE[i % COLORES_SERIE.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatoCOP(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Package size={16} className="text-emerald-700" />Composición de la venta</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={datos.composicionVenta} dataKey="valor" nameKey="nombre" isAnimationActive={false} innerRadius={55} outerRadius={85} paddingAngle={2} cornerRadius={4}>
                {datos.composicionVenta.map((_, i) => <Cell key={i} fill={COLORES_SERIE[i % COLORES_SERIE.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatoCOP(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <PanelAddi registros={registros} />

      <PanelAnalisisPatron registros={registros} />

      <footer className="text-center text-xs text-gray-400 pt-2">
        {fuenteDatos === "odoo"
          ? <>Datos reales sincronizados desde Odoo · Corre <code>npm run sync-odoo</code> para refrescar (o espera la sincronización automática)</>
          : <>Datos simulados con fines demostrativos · Corre <code>npm run sync-odoo</code> para traer tus ventas reales de Odoo</>}
      </footer>
      </>
      )}

      {modalGastosAbierto && (
        <ModalConfigurarGastos
          onCerrar={() => setModalGastosAbierto(false)}
          gastosFijosMensuales={gastosFijosMensuales}
          setGastosFijosMensuales={setGastosFijosMensuales}
          pctGastosVariables={pctGastosVariables}
          setPctGastosVariables={setPctGastosVariables}
        />
      )}

      {modalDetalleAbierto && (
        <ModalDetalleVenta
          fecha={fechaDiaActivo}
          titulo={tituloPeriodo}
          lineas={detalleVentas.filter((l) => l.fecha === fechaDiaActivo)}
          numeroVentas={pygActual.numeroVentas}
          onCerrar={() => setModalDetalleAbierto(false)}
        />
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------
   Modal para configurar gastos fijos/variables — se define UNA vez
   (arriendo, nómina, servicios) y la app la reparte sola por período,
   en vez de tener que cargar cada día a mano. Odoo/el POS no trae estos
   datos porque viven en Contabilidad, no en el punto de venta.
----------------------------------------------------------------------- */
function ModalConfigurarGastos({ onCerrar, gastosFijosMensuales, setGastosFijosMensuales, pctGastosVariables, setPctGastosVariables }) {
  const [fijos, setFijos] = useState(String(gastosFijosMensuales));
  const [pctVar, setPctVar] = useState(String(pctGastosVariables));

  // Tope de 100% a propósito: es un % de las ventas, no un valor en pesos —
  // sin este tope, escribir por error una cifra grande (ej. "1500000"
  // pensando en pesos) dispara la utilidad neta a números absurdos.
  const pctInvalido = Number(pctVar) > 100 || Number(pctVar) < 0;

  const guardar = () => {
    setGastosFijosMensuales(Math.max(0, Number(fijos) || 0));
    setPctGastosVariables(Math.min(100, Math.max(0, Number(pctVar) || 0)));
    onCerrar();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-50" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold flex items-center gap-2"><Settings size={17} />Configurar gastos</h3>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-gray-400">
            Las ventas ya llegan solas desde Odoo. Esto es lo único que Odoo no trae: arriendo,
            nómina, servicios (gastos fijos) y comisiones/empaques/domicilios (gastos variables).
            Se configura una sola vez y el tablero lo reparte solo entre los días de cada mes.
          </p>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Gastos fijos mensuales (arriendo + nómina + servicios)</label>
            <input type="number" value={fijos} onChange={(e) => setFijos(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Gastos variables (% de las ventas — no en pesos, ej. 6 = 6%)</label>
            <div className="relative">
              <input
                type="number" step="0.1" min="0" max="100" value={pctVar}
                onChange={(e) => setPctVar(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 pr-8 text-sm tabular-nums ${pctInvalido ? "border-red-400 bg-red-50" : "border-gray-300"}`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            </div>
            {pctInvalido && (
              <p className="text-xs text-red-600 mt-1">Debe ser un número entre 0 y 100 — es un porcentaje, no un valor en pesos.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-600">Cancelar</button>
            <button onClick={guardar} disabled={pctInvalido} className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
   Modal de detalle de venta: qué productos se vendieron ese día y a qué
   precio — se abre al hacer clic en el valor de "Ventas brutas del día"
   (botón "Venta hoy" o cualquier día puntual del selector de período).
----------------------------------------------------------------------- */
function ModalDetalleVenta({ fecha, titulo, lineas, numeroVentas, onCerrar }) {
  const ordenadas = [...lineas].sort((a, b) => b.subtotal - a.subtotal);
  const totalUnidades = ordenadas.reduce((s, l) => s + l.cantidad, 0);
  const totalVenta = ordenadas.reduce((s, l) => s + l.subtotal, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-50" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold flex items-center gap-2"><Package size={17} className="text-emerald-700" />Detalle de venta — {titulo}</h3>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="px-5 pt-4 pb-2 flex items-center gap-4 text-sm text-gray-500 flex-wrap">
          <span><b className="text-gray-900">{formatoNumeroVentas(numeroVentas)}</b> facturas</span>
          <span><b className="text-gray-900">{ordenadas.length}</b> referencias</span>
          <span><b className="text-gray-900">{totalUnidades}</b> unidades</span>
          <span className="ml-auto font-semibold text-gray-900 tabular-nums">{formatoCOP(totalVenta)}</span>
        </div>
        <div className="overflow-y-auto px-5 pb-5 flex-1">
          {ordenadas.length ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left font-medium py-2">Producto</th>
                  <th className="text-right font-medium py-2">Cantidad</th>
                  <th className="text-right font-medium py-2">Precio unitario</th>
                  <th className="text-right font-medium py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2">{l.producto}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">{l.cantidad}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">{formatoCOP(l.precioUnitario)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{formatoCOP(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              No hay detalle de productos para el {fecha} — sincroniza de nuevo si esperabas verlo aquí.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
