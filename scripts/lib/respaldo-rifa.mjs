/**
 * scripts/lib/respaldo-rifa.mjs
 * ---------------------------------------------------------------------------
 * Respaldo automático de los registros de la rifa en una hoja de Google
 * Sheets del administrador (copia fuera de Supabase, por si algo falla).
 *
 * La hoja tiene un pequeño Apps Script (ver CODIGO_APPS_SCRIPT, el panel de
 * administrador lo muestra para copiarlo) publicado como "aplicación web". Le
 * mandamos filas por POST; él actualiza la fila de cada factura o la agrega
 * si no existe. Nunca borra filas: un registro borrado queda como "Borrado".
 * ---------------------------------------------------------------------------
 */

export const COLUMNAS_RESPALDO = [
  "Factura", "Estado", "Fecha registro", "Nombre", "Celular", "Cumpleaños",
  "Acepta WhatsApp", "Fecha compra", "Valor compra", "Números",
];

const formatoNumero = (n) => String(n).padStart(3, "0");
const fechaHoraBogota = (iso) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota" });

// El "'" del inicio obliga a Sheets a tratarlo como texto (si no, "047"
// quedaría como 47 y el celular como un número en notación científica).
export function filaRespaldo(r, estado = "Activo") {
  // "2 de marzo" o "2 de marzo de 1995" (1900 = la clienta no dio el año).
  const cumple = r.cumple
    ? new Date(`${r.cumple}T12:00:00Z`).toLocaleDateString("es-CO", {
        timeZone: "UTC", day: "numeric", month: "long", ...(r.cumple.startsWith("1900") ? {} : { year: "numeric" }),
      })
    : "";
  return [
    r.factura,
    estado,
    fechaHoraBogota(r.creado_en),
    r.nombre,
    `'${r.celular}`,
    cumple ? `'${cumple}` : "",
    r.autoriza_marketing ? "Sí" : "No",
    r.fecha_compra || "",
    Number(r.monto),
    `'${(r.rifa_boletas || []).map((b) => b.numero).sort((a, b) => a - b).map(formatoNumero).join(" ")}`,
  ];
}

// Envía las filas. Devuelve { ok, error? } — nunca lanza, para que una falla
// de Google no tumbe el registro de la clienta.
export async function enviarRespaldo(ajustes, filas) {
  // Con cero filas igual se envía: sirve para probar la conexión (la hoja
  // escribe los títulos de las columnas).
  if (!ajustes.respaldoUrl) return { ok: false, error: "Sin enlace de respaldo configurado." };
  try {
    const resp = await fetch(ajustes.respaldoUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: ajustes.respaldoToken, columnas: COLUMNAS_RESPALDO, filas }),
      signal: AbortSignal.timeout(15000),
    });
    const texto = await resp.text();
    let data;
    try { data = JSON.parse(texto); } catch { return { ok: false, error: "Google no respondió como se esperaba (¿el acceso de la aplicación web está en \"Cualquier usuario\"?)." }; }
    if (!data.ok) return { ok: false, error: data.error === "token" ? "El código de la hoja tiene una clave distinta: vuelve a copiarlo desde el panel." : String(data.error || "Error en la hoja") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function codigoAppsScript(token) {
  return `// Respaldo automático de la rifa P&P — pegar en Extensiones > Apps Script
const CLAVE = "${token}";

function doPost(e) {
  const datos = JSON.parse(e.postData.contents);
  if (datos.token !== CLAVE) return respuesta({ ok: false, error: "token" });
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const candado = LockService.getScriptLock();
  candado.waitLock(30000);
  try {
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(datos.columnas);
      hoja.setFrozenRows(1);
      hoja.getRange(1, 1, 1, datos.columnas.length).setFontWeight("bold");
    }
    const n = hoja.getLastRow();
    const facturas = n > 1 ? hoja.getRange(2, 1, n - 1, 1).getValues().map((f) => String(f[0])) : [];
    datos.filas.forEach((fila) => {
      const i = facturas.indexOf(String(fila[0]));
      if (i >= 0) {
        hoja.getRange(i + 2, 1, 1, fila.length).setValues([fila]);
      } else {
        hoja.appendRow(fila);
        facturas.push(String(fila[0]));
      }
    });
  } finally {
    candado.releaseLock();
  }
  return respuesta({ ok: true });
}

function respuesta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
