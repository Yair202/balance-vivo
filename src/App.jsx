import { useState } from "react";
import { LogOut } from "lucide-react";
import PanelFinanciero from "./PanelFinanciero";
import Login, { sesionActiva, cerrarSesion } from "./Login";

export default function App() {
  const [autenticado, setAutenticado] = useState(sesionActiva());

  if (!autenticado) {
    return <Login onIngresar={() => setAutenticado(true)} />;
  }

  return (
    <div className="relative">
      <button
        onClick={cerrarSesion}
        title="Cerrar sesión"
        className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-500 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm"
      >
        <LogOut size={13} /> Cerrar sesión
      </button>
      <PanelFinanciero />
    </div>
  );
}
