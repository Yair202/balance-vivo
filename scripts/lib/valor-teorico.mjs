/**
 * scripts/lib/valor-teorico.mjs
 * ---------------------------------------------------------------------------
 * Trae de Odoo, en vivo, el valor teórico de efectivo que debería haber en la
 * caja registradora ahora mismo (la sesión de Punto de Venta que esté
 * abierta). Lo usa la herramienta de Arqueo de caja.
 *
 * Odoo ya calcula este número solo (campo cash_register_balance_end de
 * pos.session, "Theoretical Closing Balance") — no hay que sumar nada a mano.
 *
 * Se usa desde dos lugares con la MISMA lógica (para no duplicarla):
 *   - api/valor-teorico-caja.js (función serverless de Vercel, producción)
 *   - vite.config.js (middleware local, para probar con "npm run dev")
 * ---------------------------------------------------------------------------
 */

let idCounter = 1;

async function odooCall(odooUrl, service, method, args) {
  const resp = await fetch(`${odooUrl}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: idCounter++, params: { service, method, args } }),
  });
  const json = await resp.json();
  if (json.error) {
    const detalle = json.error.data?.message || json.error.message || JSON.stringify(json.error);
    throw new Error(detalle);
  }
  return json.result;
}

export async function obtenerValorTeorico(env) {
  const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD } = env;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    throw new Error("Faltan las variables de entorno de Odoo (ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD).");
  }

  const uid = await odooCall(ODOO_URL, "common", "authenticate", [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]);
  if (!uid) throw new Error("No se pudo autenticar contra Odoo (revisa las credenciales).");

  const sesiones = await odooCall(ODOO_URL, "object", "execute_kw", [
    ODOO_DB, uid, ODOO_PASSWORD,
    "pos.session", "search_read",
    [[["state", "=", "opened"]]],
    {
      fields: [
        "name", "user_id", "config_id", "start_at",
        "cash_register_balance_start", "cash_register_balance_end", "cash_register_total_entry_encoding",
      ],
      order: "id desc",
      limit: 1,
    },
  ]);

  if (!sesiones.length) {
    return { hayAbierta: false };
  }

  const s = sesiones[0];
  return {
    hayAbierta: true,
    sesion: s.name,
    cajero: s.user_id ? s.user_id[1] : null,
    puntoDeVenta: s.config_id ? s.config_id[1] : null,
    inicioSesion: s.start_at,
    saldoApertura: s.cash_register_balance_start || 0,
    teorico: s.cash_register_balance_end || 0,
    totalTransacciones: s.cash_register_total_entry_encoding || 0,
  };
}
