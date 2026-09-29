import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Arqueo from "./Arqueo.jsx";
import "./index.css";

// Enrutamiento minimo a proposito (sin libreria de router): solo hay 2
// paginas, no vale la pena la dependencia extra. /arqueo es la herramienta
// aparte para los empleados, con su propia contraseña.
const Raiz = window.location.pathname.startsWith("/arqueo") ? Arqueo : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Raiz />
  </React.StrictMode>
);
