import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Arqueo from "./Arqueo.jsx";
import Rifa from "./Rifa.jsx";
import "./index.css";

// Enrutamiento minimo a proposito (sin libreria de router): solo hay unas
// pocas paginas, no vale la pena la dependencia extra. /arqueo es la
// herramienta aparte para los empleados, con su propia contraseña. /rifa es
// publica (la abren los clientes con el QR); /rifa/admin pide contraseña.
const ruta = window.location.pathname;
const Raiz = ruta.startsWith("/arqueo") ? Arqueo : ruta.startsWith("/rifa") ? Rifa : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Raiz />
  </React.StrictMode>
);
