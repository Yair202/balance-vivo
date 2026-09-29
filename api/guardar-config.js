/**
 * api/guardar-config.js
 * ---------------------------------------------------------------------------
 * Función serverless de Vercel (NO corre en el navegador). Recibe los valores
 * del modal "Configurar gastos" y los guarda directo en el archivo
 * public/config-gastos.json del repositorio de GitHub, vía la API de GitHub.
 *
 * Por qué así (en vez de localStorage): localStorage vive en el navegador de
 * CADA dispositivo por separado — el mismo valor "gastos fijos" se veía
 * distinto en el celular, en el PC del almacén y aquí. Al guardarlo en el
 * repositorio, es UN SOLO valor para todos, y como cualquier commit dispara
 * un redeploy en Vercel, el cambio queda visible para todos en ~30-60 seg.
 *
 * Variables de entorno necesarias en Vercel (Settings -> Environment Variables):
 *   - GITHUB_TOKEN: un Personal Access Token de GitHub con permiso de
 *     escritura sobre el repo (scope "repo" en un token clásico, o
 *     "Contents: Read and write" en uno fine-grained).
 *   - VITE_APP_PASSWORD: la misma contraseña de login del tablero — se
 *     reutiliza aquí como verificación mínima de que quien guarda ya entró
 *     a la app (no es una capa de seguridad extra, es la misma confianza
 *     compartida que ya existe con el login).
 * ---------------------------------------------------------------------------
 */

const OWNER = "Yair202";
const REPO = "balance-vivo";
const BRANCH = "main";
const RUTA_ARCHIVO = "public/config-gastos.json";

const CAMPOS_NUMERICOS = [
  "gastosFijosMensuales",
  "pctGastosVariables",
  "pctComisiones",
  "pctAddiIntermediacion",
  "pctAddiIva",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { contrasena, ...valores } = req.body || {};
  if (contrasena !== process.env.VITE_APP_PASSWORD) {
    res.status(401).json({ error: "Contraseña incorrecta" });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Falta configurar GITHUB_TOKEN en Vercel" });
    return;
  }

  // Validar y limpiar: solo los 5 campos esperados, todos numéricos, 0-100
  // para los porcentajes (mismo tope que ya existía para evitar valores
  // absurdos si alguien mete un número en pesos donde va un %).
  const config = {};
  for (const campo of CAMPOS_NUMERICOS) {
    const v = Number(valores[campo]);
    if (!Number.isFinite(v) || v < 0) {
      res.status(400).json({ error: `Valor inválido para ${campo}` });
      return;
    }
    config[campo] = campo === "gastosFijosMensuales" ? v : Math.min(100, v);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "balance-vivo-config",
  };

  try {
    // 1) Traer el sha actual del archivo (la API de GitHub lo exige para actualizar)
    const urlArchivo = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${RUTA_ARCHIVO}?ref=${BRANCH}`;
    const actual = await fetch(urlArchivo, { headers });
    if (!actual.ok) {
      const detalle = await actual.text();
      res.status(502).json({ error: `No se pudo leer el archivo actual en GitHub: ${detalle}` });
      return;
    }
    const actualJson = await actual.json();

    // 2) Escribir el nuevo contenido
    const contenidoNuevo = Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf-8").toString("base64");
    const resp = await fetch(urlArchivo.split("?")[0], {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Actualizar configuracion de gastos (desde el tablero)",
        content: contenidoNuevo,
        sha: actualJson.sha,
        branch: BRANCH,
      }),
    });

    if (!resp.ok) {
      const detalle = await resp.text();
      res.status(502).json({ error: `No se pudo guardar en GitHub: ${detalle}` });
      return;
    }

    res.status(200).json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
