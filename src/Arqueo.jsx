import React, { useState, useEffect, useMemo } from "react";
import { Lock, RefreshCw, Plus, Trash2, Calculator, History, ShieldAlert, CheckCircle2, Wallet, Users, Settings, X } from "lucide-react";
import logoCorona from "./assets/logo-corona.jpg";

const CLAVE_STORAGE = "arqueo_auth";
const NOMBRE_STORAGE = "arqueo_nombre";
const CLAVE_CORRECTA = import.meta.env.VITE_ARQUEO_PASSWORD || "";

const DENOMINACIONES = [
  { valor: 100000, tipo: "Billete" },
  { valor: 50000, tipo: "Billete" },
  { valor: 20000, tipo: "Billete" },
  { valor: 10000, tipo: "Billete" },
  { valor: 5000, tipo: "Billete" },
  { valor: 2000, tipo: "Billete" },
  { valor: 1000, tipo: "Billete" },
  { valor: 1000, tipo: "Moneda" },
  { valor: 500, tipo: "Moneda" },
  { valor: 200, tipo: "Moneda" },
  { valor: 100, tipo: "Moneda" },
  { valor: 50, tipo: "Moneda" },
];

const formatoCOP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
// Fecha en hora de Colombia (no UTC): con toISOString() todo lo que se
// guardaba después de las 7 pm quedaba con la fecha del día siguiente.
const fechaBogota = (d = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const hoyISO = () => fechaBogota();
const formatoHora = (iso) => iso ? new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "";

function LoginArqueo({ onIngresar }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState(false);

  const intentar = (e) => {
    e.preventDefault();
    if (clave === CLAVE_CORRECTA) {
      sessionStorage.setItem(CLAVE_STORAGE, "1");
      onIngresar();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
      <form onSubmit={intentar} className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-5">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-white ring-1 ring-gray-200 flex items-center justify-center">
          <img src={logoCorona} alt="P&P" className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-800">Arqueo de caja</h1>
          <p className="text-xs text-gray-400">P&P Princesas y Princesitas</p>
        </div>
        <div className="w-full">
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-1.5"><Lock size={13} /> Contraseña</label>
          <input
            type="password" autoFocus value={clave}
            onChange={(e) => { setClave(e.target.value); setError(false); }}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${error ? "border-red-400" : "border-gray-300 focus:border-emerald-600"}`}
            placeholder="Escribe la contraseña"
          />
          {error && <p className="text-xs text-red-600 mt-1.5">Contraseña incorrecta.</p>}
        </div>
        <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2.5 rounded-lg">Ingresar</button>
      </form>
    </div>
  );
}

export default function Arqueo() {
  const [autenticado, setAutenticado] = useState(() => {
    try { return sessionStorage.getItem(CLAVE_STORAGE) === "1"; } catch { return false; }
  });
  const [vista, setVista] = useState("conteo"); // 'conteo' | 'historial'

  const [responsable, setResponsable] = useState(() => {
    try { return sessionStorage.getItem(NOMBRE_STORAGE) || ""; } catch { return ""; }
  });
  useEffect(() => { try { sessionStorage.setItem(NOMBRE_STORAGE, responsable); } catch {} }, [responsable]);

  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cantidades, setCantidades] = useState(() => Array(DENOMINACIONES.length).fill(""));

  const [gastos, setGastos] = useState([]);
  const [cargandoGastos, setCargandoGastos] = useState(true);
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState("");

  const [empleados, setEmpleados] = useState([]);
  // Base que se deja en caja para el día siguiente — por defecto la misma con
  // la que abrió la sesión en Odoo. No se recoge: lo que se guarda es contado − base.
  const [base, setBase] = useState("");
  const [baseTocada, setBaseTocada] = useState(false);
  useEffect(() => {
    if (!baseTocada && sesion?.hayAbierta) setBase(String(sesion.saldoApertura || 0));
  }, [sesion, baseTocada]);

  const traerEmpleados = async () => {
    try {
      const resp = await fetch("/api/arqueo-admin", { cache: "no-store" });
      const data = await resp.json();
      if (resp.ok) setEmpleados(data);
    } catch {
      // sin lista: el select queda solo con el nombre ya elegido
    }
  };

  const traerValorTeorico = async () => {
    setCargando(true);
    setError("");
    try {
      const resp = await fetch("/api/valor-teorico-caja", { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo traer el valor del sistema.");
      setSesion(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCargando(false);
    }
  };

  const traerGastos = async () => {
    setCargandoGastos(true);
    try {
      const resp = await fetch(`/api/arqueo-gastos?fecha=${hoyISO()}`, { cache: "no-store" });
      const data = await resp.json();
      if (resp.ok) setGastos(data);
    } catch {
      // silencioso: si falla, el usuario sigue viendo la lista que tenía
    } finally {
      setCargandoGastos(false);
    }
  };

  useEffect(() => {
    if (autenticado) { traerValorTeorico(); traerGastos(); traerEmpleados(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado]);

  const totalContado = useMemo(
    () => DENOMINACIONES.reduce((s, d, i) => s + d.valor * (Number(cantidades[i]) || 0), 0),
    [cantidades]
  );
  const totalGastos = useMemo(() => gastos.reduce((s, g) => s + Number(g.valor), 0), [gastos]);
  const totalAjustado = totalContado + totalGastos;
  const teorico = sesion?.teorico || 0;
  const diferencia = totalAjustado - teorico;
  const CUADRA_TOLERANCIA = 50;
  const estadoDiferencia = Math.abs(diferencia) < CUADRA_TOLERANCIA ? "cuadra" : diferencia < 0 ? "faltante" : "sobrante";
  const paraGuardar = Math.max(0, totalContado - (Number(base) || 0));

  const cambiarCantidad = (i, v) => {
    const copia = [...cantidades];
    copia[i] = v;
    setCantidades(copia);
  };

  const agregarGasto = async () => {
    if (!nuevaDescripcion.trim() || !Number(nuevoValor)) return;
    try {
      const resp = await fetch("/api/arqueo-gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: hoyISO(), descripcion: nuevaDescripcion.trim(), valor: Number(nuevoValor), creadoPor: responsable || null }),
      });
      if (resp.ok) {
        setNuevaDescripcion("");
        setNuevoValor("");
        traerGastos();
      }
    } catch {
      // si falla la conexión, simplemente no se agrega — el usuario puede reintentar
    }
  };

  const quitarGasto = async (id) => {
    try {
      await fetch(`/api/arqueo-gastos?id=${id}`, { method: "DELETE" });
      traerGastos();
    } catch {
      // ignorar
    }
  };

  const guardarArqueo = async () => {
    if (!responsable.trim()) { setErrorGuardar("Elige el nombre de quién hace el arqueo."); return; }
    setGuardando(true);
    setErrorGuardar("");
    try {
      const resp = await fetch("/api/arqueo-guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: hoyISO(), responsable: responsable.trim(), sesionOdoo: sesion?.sesion || null,
          teorico, contado: totalContado, gastosTotal: totalGastos, gastosIds: gastos.map((g) => g.id),
          base: Number(base) || 0,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar el arqueo.");
      setGuardado(true);
      setCantidades(Array(DENOMINACIONES.length).fill(""));
      setBaseTocada(false);
      traerGastos();
    } catch (e) {
      setErrorGuardar(String(e.message || e));
    } finally {
      setGuardando(false);
    }
  };

  if (!autenticado) return <LoginArqueo onIngresar={() => setAutenticado(true)} />;

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-4 bg-gray-50 min-h-screen">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white ring-1 ring-gray-200 flex items-center justify-center">
          <img src={logoCorona} alt="P&P" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Arqueo de caja</h1>
          <p className="text-xs text-gray-400">Calculadora de apoyo — no cierra la caja en el sistema, solo te dice cuánto debería haber y cuánto contaste.</p>
        </div>
      </header>

      <div className="flex gap-1.5 border-b border-gray-200">
        <button
          onClick={() => setVista("conteo")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${vista === "conteo" ? "border-emerald-700 text-emerald-700" : "border-transparent text-gray-400"}`}
        >
          <Calculator size={14} />Conteo de hoy
        </button>
        <button
          onClick={() => setVista("historial")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${vista === "historial" ? "border-emerald-700 text-emerald-700" : "border-transparent text-gray-400"}`}
        >
          <History size={14} />Historial
        </button>
        <button
          onClick={() => setVista("admin")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${vista === "admin" ? "border-emerald-700 text-emerald-700" : "border-transparent text-gray-400"}`}
        >
          <Wallet size={14} />Administrador
        </button>
      </div>

      {vista === "historial" ? (
        <HistorialArqueos />
      ) : vista === "admin" ? (
        <PanelAdmin onAjustesGuardados={traerEmpleados} />
      ) : (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-1">Responsable del arqueo</label>
            <select
              value={responsable} onChange={(e) => setResponsable(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Elige tu nombre…</option>
              {[...new Set([...empleados, ...(responsable ? [responsable] : [])])].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={16} className="text-emerald-700" />Valor que debe haber en caja (según el sistema)</h2>
              <button onClick={traerValorTeorico} disabled={cargando} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />Actualizar
              </button>
            </div>
            {cargando ? (
              <p className="text-sm text-gray-400 py-2">Consultando el sistema...</p>
            ) : error ? (
              <p className="text-sm text-red-600 py-2">{error}</p>
            ) : !sesion?.hayAbierta ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">No hay ninguna caja abierta en el sistema ahora mismo.</p>
            ) : (
              <>
                {sesion.enControlDeCierre && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">
                    La caja ya se cerró en el punto de venta pero falta validar el cierre en Odoo. El valor sigue siendo el correcto.
                  </p>
                )}
                <div className="text-3xl font-bold tabular-nums text-emerald-800">{formatoCOP(sesion.teorico)}</div>
                <p className="text-xs text-gray-400 mt-1">
                  Sesión {sesion.sesion} · {sesion.cajero} · Apertura: {formatoCOP(sesion.saldoApertura)} + Ventas en efectivo: {formatoCOP(sesion.totalTransacciones)}
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold mb-3">Conteo de efectivo</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200">
                  <th className="text-left font-medium py-1.5">Denominación</th>
                  <th className="text-right font-medium py-1.5">Cantidad</th>
                  <th className="text-right font-medium py-1.5">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {DENOMINACIONES.map((d, i) => (
                  <tr key={`${d.tipo}-${d.valor}`} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-600">{d.tipo} {formatoCOP(d.valor)}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number" min="0" value={cantidades[i]}
                        onChange={(e) => cambiarCantidad(i, e.target.value)}
                        placeholder="0"
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{formatoCOP(d.valor * (Number(cantidades[i]) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between pt-3 mt-1 border-t border-gray-200 text-sm font-semibold">
              <span>Total contado</span>
              <span className="tabular-nums">{formatoCOP(totalContado)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-gray-100 text-sm">
              <span className="text-gray-600">Base que se deja en caja</span>
              <input
                type="number" min="0" value={base}
                onChange={(e) => { setBase(e.target.value); setBaseTocada(true); }}
                className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right tabular-nums"
              />
            </div>
            <div className="flex justify-between pt-2 text-sm font-semibold text-emerald-800">
              <span>Para guardar (lo recoge el administrador)</span>
              <span className="tabular-nums">{formatoCOP(paraGuardar)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold mb-1">Gastos de caja menor del día</h2>
            <p className="text-xs text-gray-400 mb-3">
              Plata que salió del cajón para algo (ej. domicilio, aseo) y por eso no está físicamente, pero es válida.
              Se guardan al momento — puedes ir agregando varios durante el día.
            </p>
            {cargandoGastos ? (
              <p className="text-sm text-gray-300 text-center py-2">Cargando...</p>
            ) : gastos.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-2">Sin gastos registrados hoy.</p>
            ) : (
              <div className="flex flex-col gap-1.5 mb-3">
                {gastos.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="text-gray-400 tabular-nums text-xs">{g.hora?.slice(0, 5)}</span>
                    <span className="flex-1">{g.descripcion}</span>
                    <span className="tabular-nums font-medium">{formatoCOP(g.valor)}</span>
                    <button onClick={() => quitarGasto(g.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text" value={nuevaDescripcion} onChange={(e) => setNuevaDescripcion(e.target.value)}
                placeholder="Descripción" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
              <input
                type="number" min="0" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)}
                placeholder="Valor" className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right tabular-nums"
              />
              <button onClick={agregarGasto} className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"><Plus size={14} />Agregar</button>
            </div>
            {gastos.length > 0 && (
              <div className="flex justify-between pt-3 mt-3 border-t border-gray-100 text-sm font-semibold">
                <span>Total gastos</span>
                <span className="tabular-nums">{formatoCOP(totalGastos)}</span>
              </div>
            )}
          </div>

          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              !sesion?.hayAbierta ? "border-gray-200 bg-white" :
              estadoDiferencia === "cuadra" ? "border-emerald-300 bg-emerald-50" :
              estadoDiferencia === "faltante" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
            }`}
          >
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-gray-500">Debe haber</div>
                <div className="text-lg font-bold tabular-nums">{formatoCOP(teorico)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Contado + gastos</div>
                <div className="text-lg font-bold tabular-nums">{formatoCOP(totalAjustado)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Diferencia</div>
                <div className={`text-lg font-bold tabular-nums ${
                  !sesion?.hayAbierta ? "text-gray-400" :
                  estadoDiferencia === "cuadra" ? "text-emerald-700" :
                  estadoDiferencia === "faltante" ? "text-red-600" : "text-amber-700"
                }`}>
                  {sesion?.hayAbierta ? `${diferencia >= 0 ? "+" : ""}${formatoCOP(diferencia)}` : "—"}
                </div>
              </div>
            </div>
            {sesion?.hayAbierta && (
              <p className={`text-center text-sm font-semibold mt-3 flex items-center justify-center gap-1.5 ${
                estadoDiferencia === "cuadra" ? "text-emerald-700" : estadoDiferencia === "faltante" ? "text-red-600" : "text-amber-700"
              }`}>
                {estadoDiferencia === "cuadra" && <><CheckCircle2 size={15} />Cuadra ✓ — puedes escribir este total en el cierre del sistema.</>}
                {estadoDiferencia === "faltante" && <><ShieldAlert size={15} />Tienes un faltante de {formatoCOP(Math.abs(diferencia))} — revisa el conteo antes de cerrar en el sistema.</>}
                {estadoDiferencia === "sobrante" && <><ShieldAlert size={15} />Te está sobrando {formatoCOP(diferencia)} — revisa qué pudo haber pasado.</>}
              </p>
            )}
          </div>

          {sesion?.hayAbierta && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              {guardado ? (
                <p className="text-sm text-emerald-700 font-semibold text-center flex items-center justify-center gap-1.5"><CheckCircle2 size={16} />Arqueo guardado — ya puedes consultarlo en "Historial".</p>
              ) : (
                <>
                  <button
                    onClick={guardarArqueo}
                    disabled={guardando}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
                  >
                    {guardando ? "Guardando..." : "Guardar este arqueo"}
                  </button>
                  {errorGuardar && <p className="text-xs text-red-600 mt-2 text-center">{errorGuardar}</p>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HistorialArqueos() {
  const [arqueos, setArqueos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ajustando, setAjustando] = useState(null); // id del arqueo que se está ajustando
  const [nota, setNota] = useState("");
  const [claveAdmin, setClaveAdmin] = useState("");
  const [errorAjuste, setErrorAjuste] = useState("");

  const cargar = async () => {
    setCargando(true);
    try {
      const resp = await fetch("/api/arqueo-historial", { cache: "no-store" });
      const data = await resp.json();
      if (resp.ok) setArqueos(data);
    } catch {
      // ignorar
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const guardarAjuste = async (id) => {
    setErrorAjuste("");
    try {
      const resp = await fetch("/api/arqueo-historial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, notaAdmin: nota, resuelto: true, contrasena: claveAdmin }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo guardar.");
      setAjustando(null);
      setNota("");
      setClaveAdmin("");
      cargar();
    } catch (e) {
      setErrorAjuste(String(e.message || e));
    }
  };

  if (cargando) return <p className="text-sm text-gray-400 text-center py-8">Cargando historial...</p>;
  if (arqueos.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Todavía no hay arqueos guardados.</p>;

  return (
    <div className="flex flex-col gap-3">
      {arqueos.map((a) => {
        const color = a.estado === "cuadra" ? "border-emerald-200 bg-emerald-50" : a.estado === "faltante" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
        const colorTexto = a.estado === "cuadra" ? "text-emerald-700" : a.estado === "faltante" ? "text-red-600" : "text-amber-700";
        return (
          <div key={a.id} className={`rounded-2xl border p-4 ${color}`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold">{a.creado_en ? fechaBogota(a.creado_en) : a.fecha} · {a.responsable}{a.creado_en && <span className="font-normal text-gray-500"> · {formatoHora(a.creado_en)}</span>}</div>
                {a.sesion_odoo && <div className="text-xs text-gray-400">{a.sesion_odoo}</div>}
              </div>
              <div className={`text-sm font-bold tabular-nums ${colorTexto}`}>
                {a.diferencia >= 0 ? "+" : ""}{formatoCOP(a.diferencia)}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-500 mb-2">
              <div>Debía haber: <b className="text-gray-700">{formatoCOP(a.teorico)}</b></div>
              <div>Contado: <b className="text-gray-700">{formatoCOP(a.contado)}</b></div>
              <div>Gastos: <b className="text-gray-700">{formatoCOP(a.gastos_total)}</b></div>
              <div>Estado: <b className={colorTexto}>{a.resuelto ? "Resuelto" : "Pendiente"}</b></div>
            </div>
            {a.gastos?.length > 0 && (
              <ul className="text-xs text-gray-600 bg-white/60 rounded-lg px-2.5 py-1.5 mb-2 flex flex-col gap-0.5">
                {a.gastos.map((g) => (
                  <li key={g.id} className="flex justify-between gap-2">
                    <span>{g.descripcion}{g.creado_por && <span className="text-gray-400"> · {g.creado_por}</span>}</span>
                    <span className="tabular-nums font-semibold">{formatoCOP(g.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
            {a.nota_admin && <p className="text-xs text-gray-600 bg-white/60 rounded-lg px-2.5 py-1.5 mb-2">📝 {a.nota_admin}</p>}

            {a.estado !== "cuadra" && !a.resuelto && (
              ajustando === a.id ? (
                <div className="bg-white rounded-lg p-3 flex flex-col gap-2 mt-2">
                  <textarea
                    value={nota} onChange={(e) => setNota(e.target.value)}
                    placeholder="¿Qué pasó? (nota del administrador)"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                    rows={2}
                  />
                  <input
                    type="password" value={claveAdmin} onChange={(e) => setClaveAdmin(e.target.value)}
                    placeholder="Contraseña de administrador"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  {errorAjuste && <p className="text-xs text-red-600">{errorAjuste}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setAjustando(null); setErrorAjuste(""); }} className="flex-1 text-xs font-semibold text-gray-500 border border-gray-300 rounded-lg py-1.5">Cancelar</button>
                    <button onClick={() => guardarAjuste(a.id)} className="flex-1 text-xs font-semibold text-white bg-emerald-700 rounded-lg py-1.5">Guardar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAjustando(a.id)} className="text-xs font-semibold text-gray-600 hover:underline flex items-center gap-1"><ShieldAlert size={12} />Ajustar (solo administrador)</button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

const ADMIN_STORAGE = "arqueo_admin";
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const fechaLarga = (f) => {
  const t = new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function BotonEstado({ listo, textoListo, textoPendiente, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
        listo ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-amber-50 text-amber-700 border-amber-300"
      }`}
      title="Clic para cambiar"
    >
      {listo ? `✓ ${textoListo}` : textoPendiente}
    </button>
  );
}

function PanelAdmin({ onAjustesGuardados }) {
  const [clave, setClave] = useState(() => { try { return sessionStorage.getItem(ADMIN_STORAGE) || ""; } catch { return ""; } });
  const [claveInput, setClaveInput] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [verRecogidos, setVerRecogidos] = useState(false);
  const [verPagados, setVerPagados] = useState(false);
  const [filtroEmpleado, setFiltroEmpleado] = useState("");
  const [verAjustes, setVerAjustes] = useState(false);

  const llamar = async (cuerpo, contrasena = clave) => {
    const resp = await fetch("/api/arqueo-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrasena, ...cuerpo }),
    });
    const data = await resp.json();
    if (resp.status === 401) {
      try { sessionStorage.removeItem(ADMIN_STORAGE); } catch {}
      setClave("");
    }
    if (!resp.ok) throw new Error(data.error || "No se pudo completar.");
    return data;
  };

  const cargar = async (contrasena = clave) => {
    setCargando(true);
    setError("");
    try {
      setDatos(await llamar({ accion: "resumen" }, contrasena));
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    } finally {
      setCargando(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (clave) cargar(); }, []);

  const ingresar = async (e) => {
    e.preventDefault();
    if (await cargar(claveInput)) {
      try { sessionStorage.setItem(ADMIN_STORAGE, claveInput); } catch {}
      setClave(claveInput);
      setClaveInput("");
    }
  };

  const accion = async (cuerpo) => {
    setError("");
    try { await llamar(cuerpo); await cargar(); } catch (e) { setError(String(e.message || e)); }
  };

  if (!clave) {
    return (
      <form onSubmit={ingresar} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3 max-w-sm mx-auto w-full">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Lock size={15} className="text-emerald-700" />Solo administrador</h2>
        <input
          type="password" autoFocus value={claveInput} onChange={(e) => setClaveInput(e.target.value)}
          placeholder="Contraseña de administrador" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={cargando} className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
          {cargando ? "Verificando..." : "Entrar"}
        </button>
      </form>
    );
  }

  if (!datos) return <p className="text-sm text-gray-400 text-center py-8">{error || "Cargando..."}</p>;

  const { dias, ajustes } = datos;
  const ordenAsc = (a, b) => a.fecha.localeCompare(b.fecha);

  // --- Recolección ---
  const porRecoger = dias.filter((d) => !d.recogido).sort(ordenAsc);
  const totalPorRecoger = porRecoger.reduce((s, d) => s + d.aRecoger, 0);
  const recogidos = dias.filter((d) => d.recogido).slice(0, 15);

  // --- Turnos ---
  // El administrador no cobra turno: sus cierres cuentan para recoger, no aquí.
  const turnos = dias.filter((d) => (d.responsable || "").trim().toLowerCase() !== "administrador");
  const nombres = [...new Set(turnos.map((d) => d.responsable))].sort();
  const turnosFiltrados = turnos.filter((d) => !filtroEmpleado || d.responsable === filtroEmpleado);
  const turnosPendientes = turnosFiltrados.filter((d) => !d.turnoPagado).sort(ordenAsc);
  const turnosPagados = turnosFiltrados.filter((d) => d.turnoPagado).slice(0, 20);
  const totalTurnosPendiente = turnosPendientes.reduce((s, d) => s + d.totalTurno, 0);
  const pendientePorEmpleado = nombres
    .map((n) => {
      const t = turnos.filter((d) => d.responsable === n && !d.turnoPagado);
      return { nombre: n, turnos: t.length, total: t.reduce((s, d) => s + d.totalTurno, 0) };
    })
    .filter((p) => p.turnos > 0);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* ---------------- Dinero por recoger ---------------- */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={16} className="text-emerald-700" />Dinero por recoger</h2>
            <p className="text-xs text-gray-400 mt-0.5">Lo contado cada día menos la base que se deja en caja y los turnos pagados en efectivo.</p>
          </div>
          <button onClick={() => cargar()} disabled={cargando} className="text-xs font-semibold text-emerald-700 flex items-center gap-1 disabled:opacity-50">
            <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />Actualizar
          </button>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-gray-500">Debe haber guardado</div>
            <div className="text-3xl font-bold tabular-nums text-emerald-800">{formatoCOP(totalPorRecoger)}</div>
            <div className="text-xs text-gray-500">{porRecoger.length} {porRecoger.length === 1 ? "día" : "días"} sin recoger</div>
          </div>
          {porRecoger.length > 0 && (
            <button
              onClick={() => { if (confirm(`¿Marcar los ${porRecoger.length} días (${formatoCOP(totalPorRecoger)}) como recogidos?`)) accion({ accion: "recogido", ids: porRecoger.flatMap((d) => d.ids), recogido: true }); }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-2 rounded-lg"
            >
              Ya lo recogí todo
            </button>
          )}
        </div>
        {porRecoger.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Nada pendiente por recoger.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {porRecoger.map((d) => (
              <div key={d.ids[0]} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{fechaLarga(d.fecha)} <span className="font-normal text-gray-400">· {d.responsable}</span></div>
                  <div className="text-xs text-gray-400 tabular-nums">
                    Contado {formatoCOP(d.contado)} − base {formatoCOP(d.base)}
                    {d.turnoEfectivo > 0 && <span className="text-amber-700"> − turno en efectivo {formatoCOP(d.turnoEfectivo)}</span>}
                  </div>
                </div>
                <span className="tabular-nums font-semibold">{formatoCOP(d.aRecoger)}</span>
                <BotonEstado listo={false} textoPendiente="Pendiente" onClick={() => accion({ accion: "recogido", ids: d.ids, recogido: true })} />
              </div>
            ))}
          </div>
        )}
        {recogidos.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setVerRecogidos((v) => !v)} className="text-xs font-semibold text-gray-500 hover:underline">
              {verRecogidos ? "Ocultar" : "Ver"} días ya recogidos
            </button>
            {verRecogidos && (
              <div className="flex flex-col gap-1.5 mt-2">
                {recogidos.map((d) => (
                  <div key={d.ids[0]} className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 border border-gray-100">
                    <span className="flex-1 text-gray-500">{fechaLarga(d.fecha)} <span className="text-gray-400">· {d.responsable}{d.recogidoEn && ` · recogido ${fechaBogota(d.recogidoEn)}`}</span></span>
                    <span className="tabular-nums text-gray-500">{formatoCOP(d.aRecoger)}</span>
                    <BotonEstado listo textoListo="Recogido" onClick={() => accion({ accion: "recogido", ids: d.ids, recogido: false })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Pago de turnos ---------------- */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={16} className="text-emerald-700" />Pago de turnos</h2>
          <select value={filtroEmpleado} onChange={(e) => setFiltroEmpleado(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white">
            <option value="">Todos</option>
            {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {!filtroEmpleado && pendientePorEmpleado.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {pendientePorEmpleado.map((p) => (
              <button key={p.nombre} onClick={() => setFiltroEmpleado(p.nombre)} className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-left">
                <b>{p.nombre}</b> · {p.turnos} {p.turnos === 1 ? "turno" : "turnos"} · <b className="tabular-nums">{formatoCOP(p.total)}</b>
              </button>
            ))}
          </div>
        )}

        {turnosPendientes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">No hay turnos pendientes de pago.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {turnosPendientes.map((d) => <FilaTurno key={d.ids[0]} d={d} accion={accion} />)}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-gray-200">
          <div>
            <div className="text-xs text-gray-500">Total por pagar{filtroEmpleado && ` a ${filtroEmpleado}`}</div>
            <div className="text-xl font-bold tabular-nums text-amber-700">{formatoCOP(totalTurnosPendiente)}</div>
          </div>
          {filtroEmpleado && turnosPendientes.length > 0 && (
            <BotonesPago
              texto={`Pagar todo a ${filtroEmpleado}:`}
              onPagar={(medio) => {
                const aviso = medio === "efectivo" ? "\nCada turno se descuenta del dinero por recoger de su día." : "";
                if (confirm(`¿Marcar los ${turnosPendientes.length} turnos de ${filtroEmpleado} (${formatoCOP(totalTurnosPendiente)}) como pagados por ${NOMBRE_MEDIO[medio]}?${aviso}`)) {
                  accion({ accion: "turno", ids: turnosPendientes.flatMap((d) => d.ids), pagado: true, medio });
                }
              }}
            />
          )}
        </div>

        {turnosPagados.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setVerPagados((v) => !v)} className="text-xs font-semibold text-gray-500 hover:underline">
              {verPagados ? "Ocultar" : "Ver"} turnos ya pagados
            </button>
            {verPagados && (
              <div className="flex flex-col gap-1.5 mt-2">
                {turnosPagados.map((d) => <FilaTurno key={d.ids[0]} d={d} accion={accion} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Ajustes ---------------- */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <button onClick={() => setVerAjustes((v) => !v)} className="text-sm font-semibold flex items-center gap-2 w-full">
          <Settings size={16} className="text-emerald-700" />Ajustes: empleados y valor del turno
          <span className="ml-auto text-xs text-gray-400">{verAjustes ? "Ocultar" : "Mostrar"}</span>
        </button>
        {verAjustes && (
          <FormAjustes
            inicial={ajustes}
            sugeridos={nombres}
            onGuardar={async (nuevos) => { await accion({ accion: "guardarAjustes", ajustes: nuevos }); onAjustesGuardados?.(); }}
          />
        )}
      </div>
    </div>
  );
}

// Campo de valor que se guarda al salir de él (o con Enter).
function CampoValor({ etiqueta, valorActual, disabled, onGuardar }) {
  const [valor, setValor] = useState(String(valorActual));
  useEffect(() => { setValor(String(valorActual)); }, [valorActual]);
  return (
    <label className="flex flex-col text-xs text-gray-400">
      {etiqueta}
      <input
        type="number" min="0" value={valor} disabled={disabled}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => { if ((Number(valor) || 0) !== valorActual) onGuardar(Number(valor) || 0); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right tabular-nums text-gray-800 bg-white disabled:bg-transparent disabled:border-transparent"
      />
    </label>
  );
}

const NOMBRE_MEDIO = { nequi: "Nequi", efectivo: "Efectivo" };

// Pagar con Nequi o en efectivo. En efectivo se descuenta del dinero por
// recoger del día de ese turno (lo calcula api/arqueo-admin.js).
function BotonesPago({ texto = "Pagar:", onPagar }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <span className="text-xs text-gray-400">{texto}</span>
      {Object.entries(NOMBRE_MEDIO).map(([medio, nombre]) => (
        <button
          key={medio} onClick={() => onPagar(medio)}
          className="text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50 whitespace-nowrap"
        >{nombre}</button>
      ))}
    </div>
  );
}

function FilaTurno({ d, accion }) {
  const deshacer = () => {
    if (confirm(`¿Marcar el turno de ${d.responsable} (${fechaLarga(d.fecha)}) como NO pagado?${d.medioPago === "efectivo" ? "\nSe vuelve a sumar al dinero por recoger de ese día." : ""}`)) {
      accion({ accion: "turno", ids: d.ids, pagado: false });
    }
  };
  return (
    <div className={`text-sm rounded-lg px-3 py-2 ${d.turnoPagado ? "border border-gray-100" : "bg-gray-50"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <span className="font-medium">{d.responsable}</span>
          <span className="text-gray-500"> · {fechaLarga(d.fecha)}</span>
          {d.turnoPagado && d.turnoPagadoEn && <span className="text-xs text-gray-400"> · pagado {fechaBogota(d.turnoPagadoEn)}</span>}
        </div>
        {d.turnoPagado
          ? <BotonEstado listo textoListo={d.medioPago ? `Pagado · ${NOMBRE_MEDIO[d.medioPago]}` : "Pagado"} onClick={deshacer} />
          : <BotonesPago onPagar={(medio) => accion({ accion: "turno", ids: d.ids, pagado: true, medio })} />}
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <CampoValor etiqueta="Turno" valorActual={d.valorTurno} disabled={d.turnoPagado} onGuardar={(v) => accion({ accion: "turno", ids: d.ids, valor: v })} />
        <span className="text-gray-300 pb-1.5">+</span>
        <div className="flex flex-col text-xs text-gray-400">
          Comisión
          <span className="text-sm text-gray-800 tabular-nums py-1" title={`Venta total del día: ${formatoCOP(d.ventaDia)}`}>
            {formatoCOP(d.comision)} <span className="text-xs text-gray-400">de {formatoCOP(d.ventaDia)}</span>
          </span>
        </div>
        <span className="text-gray-300 pb-1.5">+</span>
        <CampoValor etiqueta="Adicional" valorActual={d.adicional} disabled={d.turnoPagado} onGuardar={(v) => accion({ accion: "turno", ids: d.ids, adicional: v })} />
        <span className="text-gray-300 pb-1.5">=</span>
        <div className="flex flex-col text-xs text-gray-400">
          Total
          <span className="text-sm font-bold text-gray-900 tabular-nums py-1">{formatoCOP(d.totalTurno)}</span>
        </div>
      </div>
    </div>
  );
}

function FormAjustes({ inicial, sugeridos, onGuardar }) {
  const [empleados, setEmpleados] = useState(() => (inicial.empleados.length ? inicial.empleados : sugeridos));
  const [nuevo, setNuevo] = useState("");
  const [tarifas, setTarifas] = useState(() => ({ ...inicial.tarifas }));
  const [pctComision, setPctComision] = useState(() => String(inicial.pctComision ?? 0));
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  const agregar = () => {
    const n = nuevo.trim();
    if (n && !empleados.some((e) => e.toLowerCase() === n.toLowerCase())) setEmpleados([...empleados, n]);
    setNuevo("");
    setListo(false);
  };

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ empleados, tarifas, pctComision: Number(pctComision) || 0 });
    setGuardando(false);
    setListo(true);
  };

  return (
    <div className="flex flex-col gap-4 mt-3">
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">Empleados (lista desplegable del conteo)</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {empleados.map((n) => (
            <span key={n} className="flex items-center gap-1 text-sm bg-gray-100 rounded-full pl-3 pr-1.5 py-0.5">
              {n}
              <button onClick={() => { setEmpleados(empleados.filter((e) => e !== n)); setListo(false); }} className="text-gray-400 hover:text-red-600"><X size={13} /></button>
            </span>
          ))}
          {empleados.length === 0 && <span className="text-xs text-gray-400">Sin empleados.</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            placeholder="Nombre" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <button onClick={agregar} className="flex items-center gap-1 border border-emerald-700 text-emerald-700 text-sm font-semibold px-3 py-1.5 rounded-lg"><Plus size={14} />Agregar</button>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">Valor del turno por día (en cada turno se puede cambiar, ej. festivos)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dia) => (
            <label key={dia} className="text-xs text-gray-500 flex flex-col gap-0.5">
              {DIAS_SEMANA[dia]}
              <input
                type="number" min="0" value={tarifas[dia] ?? ""}
                onChange={(e) => { setTarifas({ ...tarifas, [dia]: e.target.value }); setListo(false); }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-right tabular-nums text-gray-800"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Cambiar estos valores no toca los turnos a los que ya les cambiaste el valor a mano.</p>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">Comisión del turno</div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="number" min="0" step="0.1" value={pctComision}
            onChange={(e) => { setPctComision(e.target.value); setListo(false); }}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right tabular-nums text-gray-800"
          />
          % de la venta total del día (ventas brutas del balance)
        </label>
        <p className="text-xs text-gray-400 mt-1.5">Aplica a los turnos pendientes; los ya pagados conservan la comisión con la que se pagaron. Con 0 no hay comisión.</p>
      </div>

      <button onClick={guardar} disabled={guardando} className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
        {guardando ? "Guardando..." : listo ? "✓ Guardado" : "Guardar ajustes"}
      </button>
    </div>
  );
}
