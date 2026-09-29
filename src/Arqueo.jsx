import React, { useState, useEffect, useMemo } from "react";
import { Lock, RefreshCw, Plus, Trash2, Calculator } from "lucide-react";
import logoCorona from "./assets/logo-corona.jpg";

const CLAVE_STORAGE = "arqueo_auth";
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

  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cantidades, setCantidades] = useState(() => Array(DENOMINACIONES.length).fill(""));
  const [gastos, setGastos] = useState([]);

  const traerValorTeorico = async () => {
    setCargando(true);
    setError("");
    try {
      const resp = await fetch("/api/valor-teorico-caja", { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo traer el valor de Odoo.");
      setSesion(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (autenticado) traerValorTeorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado]);

  const totalContado = useMemo(
    () => DENOMINACIONES.reduce((s, d, i) => s + d.valor * (Number(cantidades[i]) || 0), 0),
    [cantidades]
  );
  const totalGastos = useMemo(() => gastos.reduce((s, g) => s + (Number(g.valor) || 0), 0), [gastos]);
  const totalAjustado = totalContado + totalGastos;
  const teorico = sesion?.teorico || 0;
  const diferencia = totalAjustado - teorico;
  const cuadra = sesion?.hayAbierta && Math.abs(diferencia) < 50; // tolerancia por redondeo

  const cambiarCantidad = (i, v) => {
    const copia = [...cantidades];
    copia[i] = v;
    setCantidades(copia);
  };

  const agregarGasto = () => setGastos([...gastos, { descripcion: "", valor: "" }]);
  const cambiarGasto = (i, campo, v) => {
    const copia = [...gastos];
    copia[i] = { ...copia[i], [campo]: v };
    setGastos(copia);
  };
  const quitarGasto = (i) => setGastos(gastos.filter((_, idx) => idx !== i));

  if (!autenticado) return <LoginArqueo onIngresar={() => setAutenticado(true)} />;

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-4 bg-gray-50 min-h-screen">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white ring-1 ring-gray-200 flex items-center justify-center">
          <img src={logoCorona} alt="P&P" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Arqueo de caja</h1>
          <p className="text-xs text-gray-400">Calculadora de apoyo — no cierra la caja en Odoo, solo te dice cuánto debería haber y cuánto contaste.</p>
        </div>
      </header>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={16} className="text-emerald-700" />Valor que debe haber en caja (según Odoo)</h2>
          <button onClick={traerValorTeorico} disabled={cargando} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50">
            <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />Actualizar
          </button>
        </div>
        {cargando ? (
          <p className="text-sm text-gray-400 py-2">Consultando Odoo...</p>
        ) : error ? (
          <p className="text-sm text-red-600 py-2">{error}</p>
        ) : !sesion?.hayAbierta ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">No hay ninguna caja abierta en Odoo ahora mismo.</p>
        ) : (
          <>
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
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Gastos de caja menor del día</h2>
          <button onClick={agregarGasto} className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"><Plus size={13} />Agregar</button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Plata que salió del cajón para algo (ej. domicilio, aseo) y por eso no está físicamente, pero es válida.
        </p>
        {gastos.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-2">Sin gastos registrados.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {gastos.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text" value={g.descripcion} onChange={(e) => cambiarGasto(i, "descripcion", e.target.value)}
                  placeholder="Descripción" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <input
                  type="number" min="0" value={g.valor} onChange={(e) => cambiarGasto(i, "valor", e.target.value)}
                  placeholder="Valor" className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right tabular-nums"
                />
                <button onClick={() => quitarGasto(i)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
        {gastos.length > 0 && (
          <div className="flex justify-between pt-3 mt-2 border-t border-gray-100 text-sm font-semibold">
            <span>Total gastos</span>
            <span className="tabular-nums">{formatoCOP(totalGastos)}</span>
          </div>
        )}
      </div>

      <div className={`rounded-2xl border p-5 shadow-sm ${sesion?.hayAbierta ? (cuadra ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50") : "border-gray-200 bg-white"}`}>
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
            <div className={`text-lg font-bold tabular-nums ${sesion?.hayAbierta ? (cuadra ? "text-emerald-700" : "text-red-600") : "text-gray-400"}`}>
              {sesion?.hayAbierta ? `${diferencia >= 0 ? "+" : ""}${formatoCOP(diferencia)}` : "—"}
            </div>
          </div>
        </div>
        {sesion?.hayAbierta && (
          <p className={`text-center text-sm font-semibold mt-3 ${cuadra ? "text-emerald-700" : "text-red-600"}`}>
            {cuadra ? "Cuadra ✓ — puedes escribir este total en el cierre de Odoo." : "No cuadra — revisa el conteo antes de cerrar en Odoo."}
          </p>
        )}
      </div>
    </div>
  );
}
