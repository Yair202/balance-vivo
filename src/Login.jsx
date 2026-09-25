import React, { useState } from "react";
import { Lock } from "lucide-react";
import logoCorona from "./assets/logo-corona.jpg";

const CLAVE_STORAGE = "bv_auth";
const CLAVE_CORRECTA = import.meta.env.VITE_APP_PASSWORD || "";

// sessionStorage (no localStorage) a propósito: así la contraseña se pide
// de nuevo cada vez que se cierra y se vuelve a abrir la app (una sesión de
// navegador nueva), pero no en cada F5 mientras se sigue usando.
export function sesionActiva() {
  return sessionStorage.getItem(CLAVE_STORAGE) === "1";
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_STORAGE);
  window.location.reload();
}

export default function Login({ onIngresar }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState(false);

  const intentarIngresar = (e) => {
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
      <form onSubmit={intentarIngresar} className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white ring-1 ring-gray-200 flex items-center justify-center">
          <img src={logoCorona} alt="P&P Princesas y Princesitas" className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-800">Balance Vivo</h1>
          <p className="text-xs text-gray-400">P&P Princesas y Princesitas</p>
        </div>
        <div className="w-full">
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-1.5">
            <Lock size={13} /> Contraseña
          </label>
          <input
            type="password"
            autoFocus
            value={clave}
            onChange={(e) => { setClave(e.target.value); setError(false); }}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${
              error ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-emerald-600"
            }`}
            placeholder="Escribe la contraseña"
          />
          {error && <p className="text-xs text-red-600 mt-1.5">Contraseña incorrecta.</p>}
        </div>
        <button
          type="submit"
          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          Ingresar
        </button>
      </form>
    </div>
  );
}
