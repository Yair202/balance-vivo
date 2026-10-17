import React, { useState, useEffect, useMemo } from "react";
import { Gift, Lock, Search, Download, Trash2, Settings, CheckCircle2, Ticket, ArrowLeft, QrCode, Upload, Image as ImageIcon } from "lucide-react";
import logoCorona from "./assets/logo-corona.jpg";

/**
 * /rifa        -> el cliente registra su factura y recibe sus números al azar.
 * /rifa/admin  -> el administrador ve los registros, busca el número ganador,
 *                 exporta la base y configura la rifa.
 * La lógica real (validar contra Odoo, sortear números) está en api/rifa.js.
 */

const formatoCOP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
const formatoNumero = (n) => String(n).padStart(3, "0");
const palabraNumeros = (n) => `${n} ${n === 1 ? "número" : "números"}`;
// Modo "tramos": cada factura recibe los números del tramo más alto que alcanza
// (ver numerosPorMonto en api/rifa.js). Si no, 1 número por cada valorBoleta.
const usaTramos = (c) => c?.modo === "tramos" && c.tramos?.length > 0;
const compraMinima = (c) => (usaTramos(c) ? c.tramos[0].desde : c?.valorBoleta);
const TRAMOS_EJEMPLO = [{ desde: 100000, numeros: 1 }, { desde: 170000, numeros: 2 }, { desde: 200000, numeros: 3 }, { desde: 300000, numeros: 6 }];
const fechaCorta = (f) => f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "";
// El año del cumpleaños es opcional: sin año se guarda como 1900 y se muestra
// solo día y mes.
const ANIO_SIN_DATO = "1900";
const fechaCumple = (f) => {
  if (!f) return "";
  const sinAnio = f.startsWith(ANIO_SIN_DATO);
  return new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "long", ...(sinAnio ? {} : { year: "numeric" }) });
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const diasDelMes = (mes, anio) => (mes ? new Date(Number(anio) || 2000, Number(mes), 0).getDate() : 31); // 2000 es bisiesto: deja el 29 de feb

// Día, mes y año en listas separadas (el calendario del celular es incómodo
// para buscar un año de nacimiento).
function SelectorCumple({ valor, onChange }) {
  const selectCls = "border border-gray-300 rounded-xl px-2 py-3 text-base outline-none focus:border-pink-500 bg-white";
  const anioActual = new Date().getFullYear();
  const anios = Array.from({ length: 90 }, (_, i) => anioActual - 10 - i);
  const cambiar = (campo, v) => {
    const nuevo = { ...valor, [campo]: v };
    if (nuevo.dia && Number(nuevo.dia) > diasDelMes(nuevo.mes, nuevo.anio)) nuevo.dia = "";
    onChange(nuevo);
  };
  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
      <select value={valor.dia} onChange={(e) => cambiar("dia", e.target.value)} className={selectCls} aria-label="Día">
        <option value="">Día</option>
        {Array.from({ length: diasDelMes(valor.mes, valor.anio) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={valor.mes} onChange={(e) => cambiar("mes", e.target.value)} className={selectCls} aria-label="Mes">
        <option value="">Mes</option>
        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select value={valor.anio} onChange={(e) => cambiar("anio", e.target.value)} className={selectCls} aria-label="Año">
        <option value="">Año</option>
        {anios.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}

const cumpleISO = ({ dia, mes, anio }) =>
  dia && mes ? `${anio || ANIO_SIN_DATO}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` : "";
const NOMBRE_TIENDA = "P&P Princesas y Princesitas";

async function llamarApi(cuerpo) {
  const resp = await fetch("/api/rifa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  let data = {};
  try { data = await resp.json(); } catch {}
  if (!resp.ok) {
    const error = new Error(data.error || "Tuvimos un problema, intenta de nuevo en un momento.");
    error.status = resp.status;
    throw error;
  }
  return data;
}

export default function Rifa() {
  useEffect(() => { document.title = "Rifa P&P"; }, []);
  return window.location.pathname.startsWith("/rifa/admin") ? <RifaAdmin /> : <RifaCliente />;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

function Encabezado({ subtitulo }) {
  return (
    <header className="flex flex-col items-center text-center gap-2 pt-2">
      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white ring-1 ring-pink-200 shadow-sm">
        <img src={logoCorona} alt="P&P" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-xl font-bold text-gray-800 leading-tight">Gran rifa {NOMBRE_TIENDA}</h1>
      {subtitulo && <p className="text-sm text-gray-500">{subtitulo}</p>}
    </header>
  );
}

const inputCls = "w-full border border-gray-300 rounded-xl px-3.5 py-3 text-base outline-none focus:border-pink-500 bg-white";
const botonCls = "w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50";

function Reglamento({ config }) {
  return (
    <div className="text-xs text-gray-600 flex flex-col gap-1.5">
      <p>1. Participan las compras hechas en {NOMBRE_TIENDA}{config.inicio ? ` desde el ${fechaCorta(config.inicio)}` : ""}{config.fin ? ` hasta el ${fechaCorta(config.fin)}` : ""}.</p>
      <p>2. {usaTramos(config)
        ? `Según el total de una misma factura recibes: ${config.tramos.map((t) => `desde ${formatoCOP(t.desde)}, ${palabraNumeros(t.numeros)}`).join("; ")}.`
        : `Por cada ${formatoCOP(config.valorBoleta)} en una misma factura recibes un número.`} Los números se asignan al azar y no se repiten.</p>
      <p>3. Cada factura se puede registrar una sola vez.</p>
      <p>4. {config.fechaSorteo ? `El sorteo se hará el ${fechaCorta(config.fechaSorteo)}` : "La fecha del sorteo se anunciará en la tienda"} y el ganador se contactará al celular registrado.{config.premio ? ` Premio: ${config.premio}.` : ""}</p>
      <p>5. Para reclamar el premio se debe presentar el tiquete de compra de la factura con la que se obtuvo el número ganador.</p>
    </div>
  );
}

function PoliticaDatos() {
  return (
    <div className="text-xs text-gray-600 flex flex-col gap-1.5">
      <p>{NOMBRE_TIENDA} es responsable de los datos que registras aquí (Ley 1581 de 2012).</p>
      <p><b>Para qué los usamos:</b> tu nombre, celular y número de factura se usan para la rifa (asignarte números y contactarte si ganas). Solo si marcas la casilla de promociones, también usaremos tu celular y tu fecha de cumpleaños para enviarte por WhatsApp novedades, descuentos y saludos de cumpleaños.</p>
      <p><b>Tus derechos:</b> puedes conocer, actualizar o pedir que borremos tus datos, y dejar de recibir promociones cuando quieras, pidiéndolo en la tienda o respondiendo cualquiera de nuestros mensajes con la palabra SALIR.</p>
      <p>No vendemos ni compartimos tus datos con nadie.</p>
    </div>
  );
}

function RifaCliente() {
  const [config, setConfig] = useState(null);
  const [paso, setPaso] = useState("factura"); // 'factura' | 'datos' | 'listo'
  const [factura, setFactura] = useState("");
  const [total, setTotal] = useState("");
  const [compra, setCompra] = useState(null);
  const [datos, setDatos] = useState({ nombre: "", celular: "" });
  const [cumple, setCumple] = useState({ dia: "", mes: "", anio: "" });
  const [aceptaReglamento, setAceptaReglamento] = useState(false);
  const [autorizaMarketing, setAutorizaMarketing] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/rifa", { cache: "no-store" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ valorBoleta: 130000 }));
  }, []);

  const verificar = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const r = await llamarApi({ accion: "verificar", factura, total });
      if (r.yaRegistrado) {
        setResultado({ ...r, yaRegistrado: true });
        setPaso("listo");
      } else if (r.cantidad < 1) {
        setError(`Tu compra de ${formatoCOP(r.monto)} no alcanza: se necesita una compra mínima de ${formatoCOP(compraMinima(config))} en una misma factura para recibir un número.`);
      } else {
        setCompra(r);
        setPaso("datos");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const registrar = async (e) => {
    e.preventDefault();
    setError("");
    if ((cumple.dia || cumple.mes || cumple.anio) && !(cumple.dia && cumple.mes)) {
      setError("Para tu cumpleaños elige al menos el día y el mes (o déjalo vacío).");
      return;
    }
    setEnviando(true);
    try {
      const r = await llamarApi({ accion: "registrar", factura: compra.factura, total, ...datos, cumple: cumpleISO(cumple), aceptaReglamento, autorizaMarketing });
      setResultado(r);
      setPaso("listo");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    setPaso("factura");
    setFactura("");
    setTotal("");
    setCompra(null);
    setResultado(null);
    setError("");
  };

  if (!config) return <div className="min-h-screen bg-pink-50 flex items-center justify-center text-sm text-gray-400">Cargando...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-5">
        <Encabezado subtitulo={paso !== "factura" ? null : usaTramos(config)
          ? `Desde ${formatoCOP(compraMinima(config))} en compras te llevas números para participar. ¡Entre más compras, más números!`
          : `Por cada ${formatoCOP(config.valorBoleta)} en compras te llevas un número para participar.`} />

        {paso === "factura" && (
          <>
            {(config.premio || config.fechaSorteo || config.fotoVersion || config.mensaje) && (
              <div className="rounded-2xl bg-white border border-pink-200 p-4 text-center shadow-sm">
                {config.fotoVersion && (
                  <img
                    src={`/api/rifa?foto=1&v=${config.fotoVersion}`} alt={config.premio || "Premio de la rifa"}
                    className="w-full max-h-80 object-contain rounded-xl mb-3"
                  />
                )}
                {config.premio && <p className="text-base font-semibold text-pink-700 flex items-center justify-center gap-2"><Gift size={18} />{config.premio}</p>}
                {config.fechaSorteo && <p className="text-sm text-gray-500 mt-1">Sorteo: {fechaCorta(config.fechaSorteo)}</p>}
                {config.mensaje && <p className="text-sm text-gray-700 mt-3 pt-3 border-t border-pink-100 whitespace-pre-line text-left">{config.mensaje}</p>}
              </div>
            )}
            {usaTramos(config) && (
              <div className="rounded-2xl bg-white border border-pink-200 p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 mb-2 text-center">Así se entregan los números</p>
                <div className="flex flex-col divide-y divide-pink-100">
                  {config.tramos.map((t) => (
                    <div key={t.desde} className="flex justify-between py-1.5 text-sm">
                      <span className="text-gray-600">Compras desde {formatoCOP(t.desde)}</span>
                      <span className="font-semibold text-pink-700">{palabraNumeros(t.numeros)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={verificar} className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Número de factura</label>
                <input
                  value={factura} onChange={(e) => setFactura(e.target.value)} required
                  placeholder="Ej. POS0000010959" autoCapitalize="characters" className={inputCls}
                />
                <p className="text-xs text-gray-400 mt-1">Aparece en tu tiquete de compra como "Ref. venta".</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Total pagado</label>
                <input
                  value={total} onChange={(e) => setTotal(e.target.value)} required
                  inputMode="numeric" placeholder="Ej. 171.000" className={inputCls}
                />
                <p className="text-xs text-gray-400 mt-1">El total que aparece en el mismo tiquete.</p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={enviando} className={botonCls}>{enviando ? "Buscando tu compra..." : "Continuar"}</button>
            </form>
          </>
        )}

        {paso === "datos" && compra && (
          <form onSubmit={registrar} className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
            <div className="rounded-xl bg-pink-50 text-center py-3 px-2">
              <p className="text-sm text-gray-600">Tu compra de <b>{formatoCOP(compra.monto)}</b> te da</p>
              <p className="text-2xl font-bold text-pink-700">{compra.cantidad} {compra.cantidad === 1 ? "número" : "números"}</p>
              <p className="text-xs text-gray-500">Completa tus datos para recibirlos.</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Tu nombre completo</label>
              <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} required autoComplete="name" className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Celular (WhatsApp)</label>
              <input
                value={datos.celular} onChange={(e) => setDatos({ ...datos, celular: e.target.value })} required
                inputMode="tel" autoComplete="tel" placeholder="Ej. 3001234567" className={inputCls}
              />
              <p className="text-xs text-gray-400 mt-1">A este número te contactamos si ganas.</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Tu cumpleaños <span className="font-normal text-gray-400">(opcional)</span></label>
              <SelectorCumple valor={cumple} onChange={setCumple} />
            </div>

            <label className="flex items-start gap-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={aceptaReglamento} onChange={(e) => setAceptaReglamento(e.target.checked)} required className="mt-0.5 w-5 h-5 accent-pink-600 shrink-0" />
              <span>Acepto el reglamento de la rifa y el uso de mis datos para participar en ella.</span>
            </label>
            <details className="-mt-2 ml-7">
              <summary className="text-xs text-pink-700 font-semibold cursor-pointer">Ver reglamento</summary>
              <div className="mt-2"><Reglamento config={config} /></div>
            </details>

            <label className="flex items-start gap-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={autorizaMarketing} onChange={(e) => setAutorizaMarketing(e.target.checked)} className="mt-0.5 w-5 h-5 accent-pink-600 shrink-0" />
              <span>Quiero recibir por WhatsApp promociones, novedades y una sorpresa en mi cumpleaños. Puedo cancelar estos mensajes cuando quiera. <span className="text-gray-400">(Opcional)</span></span>
            </label>
            <details className="-mt-2 ml-7">
              <summary className="text-xs text-pink-700 font-semibold cursor-pointer">Política de tratamiento de datos</summary>
              <div className="mt-2"><PoliticaDatos /></div>
            </details>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <button type="submit" disabled={enviando} className={botonCls}>{enviando ? "Sorteando tus números..." : "Obtener mis números"}</button>
            <button type="button" onClick={reiniciar} className="text-sm text-gray-500 flex items-center justify-center gap-1"><ArrowLeft size={14} />Cambiar factura</button>
          </form>
        )}

        {paso === "listo" && resultado && (
          <div className="rounded-2xl bg-white border border-pink-200 p-5 shadow-sm flex flex-col items-center gap-4 text-center">
            <CheckCircle2 size={40} className="text-pink-600" />
            <div>
              <p className="text-lg font-bold text-gray-800">
                {resultado.yaRegistrado ? "Esta factura ya está registrada" : `¡Listo${resultado.nombre ? `, ${resultado.nombre.split(" ")[0]}` : ""}!`}
              </p>
              <p className="text-sm text-gray-500">{resultado.numeros.length === 1 ? "Tu número es:" : "Tus números son:"}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {resultado.numeros.map((n) => (
                <div key={n} className="w-24 h-24 rounded-2xl bg-pink-600 text-white flex flex-col items-center justify-center shadow-md">
                  <Ticket size={16} className="opacity-70" />
                  <span className="text-3xl font-bold tabular-nums tracking-wider">{formatoNumero(n)}</span>
                </div>
              ))}
            </div>
            {resultado.faltaron > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Solo quedaban {resultado.numeros.length} números disponibles en la rifa.</p>
            )}
            <p className="text-sm text-gray-600 bg-pink-50 rounded-xl px-3 py-2">
              📸 Toma una captura de pantalla y guarda tu tiquete de compra: lo necesitas para reclamar el premio.
            </p>
            <p className="text-xs text-gray-400">Factura {resultado.factura}{config.fechaSorteo ? ` · Sorteo: ${fechaCorta(config.fechaSorteo)}` : ""}</p>
            <button onClick={reiniciar} className="text-sm font-semibold text-pink-700">Registrar otra factura</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Administrador
// ---------------------------------------------------------------------------

const ADMIN_STORAGE = "rifa_admin";

// Las fotos del celular pesan varios MB: se reducen aquí (máx. 1200 px, JPEG)
// antes de subirlas, para que la página de la rifa cargue rápido.
function reducirFoto(archivo, maxLado = 1200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // fondo blanco por si es PNG con transparencia
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer esa imagen. Prueba con una foto JPG o PNG.")); };
    img.src = url;
  });
}

function descargarCSV(registros, sufijo = "") {
  const columnas = ["Fecha registro", "Nombre", "Celular", "Cumpleaños", "Acepta WhatsApp", "Factura", "Fecha compra", "Valor compra", "Números"];
  const filas = registros.map((r) => [
    new Date(r.creado_en).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    r.nombre, r.celular, fechaCumple(r.cumple),
    r.autoriza_marketing ? "Sí" : "No",
    r.factura, r.fecha_compra || "", Number(r.monto),
    (r.rifa_boletas || []).map((b) => formatoNumero(b.numero)).sort().join(" "),
  ]);
  const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
  // ";" y BOM: así Excel en español lo abre en columnas y con tildes bien.
  const csv = "﻿" + [columnas, ...filas].map((f) => f.map(escapar).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `rifa-registros${sufijo}-${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function RifaAdmin() {
  const [clave, setClave] = useState(() => { try { return sessionStorage.getItem(ADMIN_STORAGE) || ""; } catch { return ""; } });
  const [claveInput, setClaveInput] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroWhatsApp, setFiltroWhatsApp] = useState("todos"); // 'todos' | 'si' | 'no'
  const [verAjustes, setVerAjustes] = useState(false);
  const [verQR, setVerQR] = useState(false);
  const [borrador, setBorrador] = useState(null);

  const cargar = async (contrasena = clave) => {
    setCargando(true);
    setError("");
    try {
      const d = await llamarApi({ accion: "admin", contrasena });
      setDatos(d);
      setBorrador(d.ajustes);
      return true;
    } catch (e) {
      if (e.status === 401) {
        try { sessionStorage.removeItem(ADMIN_STORAGE); } catch {}
        setClave("");
      }
      setError(e.message);
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

  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const cambiarFoto = async (archivo) => {
    setError("");
    setSubiendoFoto(true);
    try {
      const foto = archivo ? await reducirFoto(archivo) : null;
      await llamarApi({ accion: "guardarFoto", contrasena: clave, foto });
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardarAjustes = async () => {
    setError("");
    try {
      await llamarApi({ accion: "guardarAjustes", contrasena: clave, ajustes: borrador });
      setVerAjustes(false);
      await cargar();
    } catch (e) { setError(e.message); }
  };

  const borrar = async (r) => {
    const numeros = (r.rifa_boletas || []).map((b) => formatoNumero(b.numero)).join(", ");
    const claveBorrar = window.prompt(`¿Borrar el registro de ${r.nombre} (factura ${r.factura})?\nSus números (${numeros}) quedan libres otra vez.\n\nEscribe la clave para borrar:`);
    if (claveBorrar === null) return;
    setError("");
    try {
      await llamarApi({ accion: "borrar", contrasena: clave, id: r.id, claveBorrar: claveBorrar.trim() });
      await cargar();
    } catch (e) { setError(e.message); }
  };

  const registros = datos?.registros || [];
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const comoNumero = /^\d{1,3}$/.test(q) ? Number(q) : null;
    return registros.filter((r) =>
      (filtroWhatsApp === "todos" || r.autoriza_marketing === (filtroWhatsApp === "si")) &&
      (!q ||
        (comoNumero !== null && (r.rifa_boletas || []).some((b) => b.numero === comoNumero)) ||
        r.nombre.toLowerCase().includes(q) || r.celular.includes(q) || r.factura.toLowerCase().includes(q))
    );
  }, [registros, busqueda, filtroWhatsApp]);

  if (!clave) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
        <form onSubmit={ingresar} className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2">
            <img src={logoCorona} alt="P&P" className="w-14 h-14 rounded-xl object-cover ring-1 ring-gray-200" />
            <h1 className="text-lg font-bold">Rifa — administrador</h1>
          </div>
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><Lock size={13} />Contraseña</label>
          <input type="password" autoFocus value={claveInput} onChange={(e) => setClaveInput(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={cargando} className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">
            {cargando ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  if (!datos) return <p className="text-sm text-gray-400 text-center py-10">{error || "Cargando..."}</p>;

  const { ajustes } = datos;
  const numerosEntregados = registros.reduce((s, r) => s + (r.rifa_boletas || []).length, 0);
  const autorizan = registros.filter((r) => r.autoriza_marketing).length;
  const clientesUnicos = new Set(registros.map((r) => r.celular)).size;
  const urlRifa = `${window.location.origin}/rifa`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-4 bg-gray-50 min-h-screen">
      <header className="flex items-center gap-3">
        <img src={logoCorona} alt="P&P" className="w-10 h-10 rounded-xl object-cover ring-1 ring-gray-200" />
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Rifa — administrador</h1>
          <a href="/rifa" target="_blank" rel="noreferrer" className="text-xs text-emerald-700 hover:underline">{urlRifa}</a>
        </div>
        <button onClick={() => setVerQR(!verQR)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"><QrCode size={14} />QR</button>
        <button onClick={() => setVerAjustes(!verAjustes)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"><Settings size={14} />Ajustes</button>
      </header>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {verQR && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col items-center gap-2">
          <img src="/rifa-qr.png" alt={`QR a ${urlRifa}`} className="w-56 h-56" />
          <p className="text-xs text-gray-500">Lleva a {urlRifa}</p>
          <a href="/rifa-qr.png" download="rifa-qr.png" className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"><Download size={12} />Descargar para imprimir</a>
        </div>
      )}

      {verAjustes && borrador && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Ajustes de la rifa</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-3 border-b border-gray-100">
            <div className="w-32 h-32 rounded-xl bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0">
              {ajustes.fotoVersion
                ? <img src={`/api/rifa?foto=1&v=${ajustes.fotoVersion}`} alt="Foto del premio" className="w-full h-full object-contain" />
                : <ImageIcon size={28} className="text-gray-300" />}
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-xs text-gray-500">Foto del premio (la ven los clientes al registrarse)</span>
              <div className="flex flex-wrap gap-2">
                <label className={`text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg px-3 py-1.5 cursor-pointer flex items-center gap-1.5 ${subiendoFoto ? "opacity-50 pointer-events-none" : ""}`}>
                  <Upload size={13} />{subiendoFoto ? "Subiendo..." : ajustes.fotoVersion ? "Cambiar foto" : "Subir foto"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) cambiarFoto(f); }} />
                </label>
                {ajustes.fotoVersion && !subiendoFoto && (
                  <button onClick={() => window.confirm("¿Quitar la foto del premio?") && cambiarFoto(null)} className="text-xs font-semibold text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5">Quitar foto</button>
                )}
              </div>
              <span className="text-xs text-gray-400">Se guarda apenas la eliges, sin necesidad de darle Guardar.</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm pb-3 border-b border-gray-100">
            <span className="text-xs text-gray-500">¿Cómo se entregan los números?</span>
            <div className="flex flex-wrap gap-2">
              {[["proporcional", "1 número por cada valor de compra"], ["tramos", "Por tramos de compra"]].map(([modo, etiqueta]) => {
                const activo = (borrador.modo === "tramos" ? "tramos" : "proporcional") === modo;
                return (
                  <button
                    key={modo}
                    onClick={() => setBorrador({ ...borrador, modo, ...(modo === "tramos" && !borrador.tramos?.length ? { tramos: TRAMOS_EJEMPLO } : {}) })}
                    className={`text-xs font-semibold rounded-lg px-3 py-1.5 border ${activo ? "bg-emerald-700 border-emerald-700 text-white" : "border-gray-300 text-gray-600"}`}
                  >{etiqueta}</button>
                );
              })}
            </div>
            {borrador.modo === "tramos" && (
              <div className="flex flex-col gap-2 max-w-md">
                <div className="grid grid-cols-[1fr_7rem_2rem] gap-2 text-xs text-gray-500">
                  <span>Compra desde ($)</span><span>Números</span><span />
                </div>
                {(borrador.tramos || []).map((t, i) => {
                  const cambiar = (campo, valor) => setBorrador({ ...borrador, tramos: borrador.tramos.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)) });
                  return (
                    <div key={i} className="grid grid-cols-[1fr_7rem_2rem] gap-2 items-center">
                      <input type="number" min="1000" step="1000" value={t.desde ?? ""} onChange={(e) => cambiar("desde", e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5" />
                      <input type="number" min="1" max="50" value={t.numeros ?? ""} onChange={(e) => cambiar("numeros", e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-1.5" />
                      <button onClick={() => setBorrador({ ...borrador, tramos: borrador.tramos.filter((_, j) => j !== i) })} title="Quitar tramo" className="text-gray-400 hover:text-red-600 flex justify-center"><Trash2 size={15} /></button>
                    </div>
                  );
                })}
                <button
                  onClick={() => setBorrador({ ...borrador, tramos: [...(borrador.tramos || []), { desde: "", numeros: "" }] })}
                  className="self-start text-xs font-semibold text-emerald-700 hover:underline"
                >+ Agregar tramo</button>
                <span className="text-xs text-gray-400">Cada factura recibe los números del tramo más alto que alcanza (no se suman). Ej.: con estos tramos, una compra de $250.000 da los números del tramo de $200.000.</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {[
              ...(borrador.modo === "tramos" ? [] : [["valorBoleta", "Valor de compra por número", "number"]]),
              ["totalNumeros", "Cantidad de números (desde 000)", "number"],
              ["premio", "Premio", "text"],
              ["inicio", "Cuentan compras desde", "date"],
              ["fin", "Cuentan compras hasta (vacío = sin cierre)", "date"],
              ["fechaSorteo", "Fecha del sorteo", "date"],
            ].map(([campo, etiqueta, tipo]) => (
              <label key={campo} className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{etiqueta}</span>
                <input
                  type={tipo} value={borrador[campo] ?? ""}
                  onChange={(e) => setBorrador({ ...borrador, [campo]: e.target.value })}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5"
                />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-gray-500">Mensaje para los clientes (lo ven al registrarse, debajo del premio)</span>
            <textarea
              rows={3} maxLength={1000} value={borrador.mensaje ?? ""}
              onChange={(e) => setBorrador({ ...borrador, mensaje: e.target.value })}
              placeholder="Ej. ¡Gracias por comprar en P&P! El sorteo se hará en vivo por Instagram."
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 resize-y"
            />
            <span className="text-xs text-gray-400 text-right">{(borrador.mensaje ?? "").length} / 1000</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setBorrador(ajustes); setVerAjustes(false); }} className="text-xs font-semibold text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5">Cancelar</button>
            <button onClick={guardarAjustes} className="text-xs font-semibold text-white bg-emerald-700 rounded-lg px-3 py-1.5">Guardar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Facturas registradas", registros.length],
          ["Clientes distintos", clientesUnicos],
          ["Números entregados", `${numerosEntregados} / ${ajustes.totalNumeros}`],
          ["Aceptan WhatsApp", registros.length ? `${autorizan} (${Math.round((autorizan / registros.length) * 100)}%)` : "0"],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="text-xs text-gray-500">{etiqueta}</div>
            <div className="text-xl font-bold tabular-nums">{valor}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar número ganador, nombre, celular o factura"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <button onClick={() => descargarCSV(filtrados, { si: "-aceptan-whatsapp", no: "-no-aceptan" }[filtroWhatsApp] || "")} disabled={!filtrados.length} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg px-3 py-2 disabled:opacity-50">
            <Download size={15} />Descargar {filtroWhatsApp === "todos" ? "base" : "esta lista"} (Excel)
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-500 mr-1">Mensajes por WhatsApp:</span>
          {[
            ["todos", `Todos (${registros.length})`],
            ["si", `Aceptaron (${autorizan})`],
            ["no", `No aceptaron (${registros.length - autorizan})`],
          ].map(([valor, texto]) => (
            <button
              key={valor} onClick={() => setFiltroWhatsApp(valor)}
              className={`font-semibold px-2.5 py-1 rounded-full border ${filtroWhatsApp === valor ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-300"}`}
            >
              {texto}
            </button>
          ))}
        </div>

        {filtrados.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{registros.length ? "Nada coincide con la búsqueda." : "Todavía no hay registros."}</p>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200 text-left">
                  <th className="font-medium py-2 pl-4">Números</th>
                  <th className="font-medium py-2">Cliente</th>
                  <th className="font-medium py-2">Cumpleaños</th>
                  <th className="font-medium py-2">Factura</th>
                  <th className="font-medium py-2 text-right">Compra</th>
                  <th className="font-medium py-2 text-center">Acepta WhatsApp</th>
                  <th className="font-medium py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 align-top">
                    <td className="py-2 pl-4">
                      <div className="flex flex-wrap gap-1">
                        {(r.rifa_boletas || []).map((b) => b.numero).sort((a, b) => a - b).map((n) => (
                          <span key={n} className="text-xs font-bold tabular-nums bg-pink-100 text-pink-800 rounded-md px-1.5 py-0.5">{formatoNumero(n)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="font-medium">{r.nombre}</div>
                      <a href={`https://wa.me/57${r.celular}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 hover:underline">{r.celular}</a>
                    </td>
                    <td className="py-2 text-xs text-gray-600">
                      {r.cumple ? `🎂 ${fechaCumple(r.cumple)}` : "—"}
                    </td>
                    <td className="py-2 text-xs text-gray-600">
                      {r.factura}
                      <div className="text-gray-400">{r.fecha_compra}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatoCOP(r.monto)}</td>
                    <td className="py-2 text-center">
                      {r.autoriza_marketing
                        ? <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">Sí</span>
                        : <span className="text-xs font-semibold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">No</span>}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <button onClick={() => borrar(r)} title="Borrar registro" className="p-1 text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
