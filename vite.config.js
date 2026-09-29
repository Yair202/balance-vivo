import "dotenv/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { exec } from "node:child_process";
import { obtenerValorTeorico } from "./scripts/lib/valor-teorico.mjs";

// Middleware del propio servidor de Vite: expone POST /api/sync-odoo para
// que el botón "Sincronizar ahora" del tablero pueda disparar
// scripts/sync-odoo.mjs bajo demanda, sin necesidad de un backend aparte.
function pluginSyncOdoo() {
  return {
    name: "sync-odoo-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/sync-odoo", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        exec("npm run sync-odoo", { cwd: process.cwd(), env: { ...process.env, Path: `C:\\Program Files\\nodejs;${process.env.Path || ""}` } }, (error, stdout, stderr) => {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          if (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: stderr || error.message }));
          } else {
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, salida: stdout }));
          }
        });
      });
    },
  };
}

// Mismo endpoint que la función serverless de Vercel (api/valor-teorico-caja.js),
// para poder probar la herramienta de Arqueo de caja en "npm run dev" sin
// tener que desplegar primero.
function pluginValorTeorico() {
  return {
    name: "valor-teorico-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/valor-teorico-caja", async (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          const datos = await obtenerValorTeorico(process.env);
          res.statusCode = 200;
          res.end(JSON.stringify(datos));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err.message || err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pluginSyncOdoo(), pluginValorTeorico()],
  server: {
    host: true,
  },
});
