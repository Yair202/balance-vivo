# Balance Vivo — Panel Financiero

Tablero financiero del almacén (`src/PanelFinanciero.jsx`) — React + recharts +
lucide-react + Tailwind v4 + Vite.

## Ya está montado y corriendo

- Node.js y todas las dependencias ya están instalados en este PC.
- Arranca solo al iniciar sesión (tarea programada de Windows `BalanceVivo-Dev`,
  reinicia sola si se cae).
- Acceso directo **"Balance Vivo"** en el escritorio abre la app como ventana
  (apunta a `http://localhost:5173`).
- Para arrancarlo/verlo a mano: `npm run dev` desde esta carpeta.

## Conectar datos reales desde Odoo (Punto de Venta)

En vez de digitar las ventas a mano, `scripts/sync-odoo.mjs` trae las órdenes
reales de tu Odoo por API (día a día, no solo por mes como el reporte de la
interfaz) y arma el archivo que el tablero lee automáticamente.

1. Copia `.env.example` a `.env` y completa `ODOO_DB`, `ODOO_USERNAME` y
   `ODOO_PASSWORD` (`.env` nunca se sube a git — es solo de este PC).
2. Corre:
   ```
   npm run sync-odoo
   ```
3. Eso escribe `public/datos-ventas.json`. Refresca el tablero (o vuelve a
   abrir el acceso directo) y va a mostrar el badge **"Datos reales (Odoo)"**
   en vez de "Datos simulados".

Qué trae automático: ventas brutas por día, desglose por método de pago
(efectivo/tarjetas/transferencias), y una aproximación del costo de ventas
(con el costo ACTUAL de cada producto, no el histórico del día de la venta).
Qué sigue siendo manual: gastos fijos y variables (normalmente viven en
Contabilidad, no en el POS) — ajústalos en el formulario "Cargar ventas del
día" del tablero.

Por ahora hay que correr `npm run sync-odoo` a mano cuando quieras refrescar
los datos. Si quieres que se sincronice solo todos los días, dile a Claude que
lo deje como tarea programada (igual que la de arranque automático).
