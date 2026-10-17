/**
 * api/rifa.js
 * ---------------------------------------------------------------------------
 * Rifa para clientes (/rifa) y su administración (/rifa/admin).
 *
 * El cliente escribe el número de su factura (Ref. venta del POS) y el total
 * que pagó. Se busca la venta EN VIVO en Odoo: el total tiene que coincidir
 * (así nadie registra la factura de otro adivinando el número, que es
 * consecutivo). Por cada `valorBoleta` de la compra (o, en modo "tramos", según
 * el tramo más alto que alcance) se le asigna un número al azar entre los
 * libres (000–999). Cada factura se registra una sola vez; si
 * la vuelven a escribir (con el total correcto) se le muestran sus números.
 *
 *   GET  -> datos públicos de la rifa (valor por número, fechas, premio, mensaje)
 *   GET ?foto=1 -> la foto del premio (imagen)
 *   POST { accion: "verificar", factura, total }
 *   POST { accion: "registrar", factura, total, nombre, celular, cumple,
 *          autorizaMarketing, aceptaReglamento }
 *   POST { accion: "admin" | "guardarAjustes" | "guardarFoto" | "borrar", contrasena, ... }
 * ---------------------------------------------------------------------------
 */
import {
  obtenerAjustesRifa, guardarAjustesRifa, registroRifaPorFactura, crearRegistroRifa,
  borrarRegistroRifa, asignarNumerosRifa, numerosRifaOcupados, listarRegistrosRifa,
  obtenerFotoRifa, guardarFotoRifa,
} from "../scripts/lib/supabase.mjs";
import { obtenerOrdenPOS } from "../scripts/lib/valor-teorico.mjs";

const fechaBogota = (fechaOdooUTC) =>
  new Date(fechaOdooUTC.replace(" ", "T") + "Z").toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// "10959", "pos10959", "POS0000010959" -> "POS0000010959"
function normalizarFactura(texto) {
  const digitos = String(texto || "").replace(/\D/g, "");
  if (!digitos || digitos.length > 10) return null;
  return `POS${digitos.padStart(10, "0")}`;
}

const soloNumero = (texto) => Number(String(texto ?? "").replace(/[^\d]/g, "")) || 0;
const publicoRegistro = (r) => ({
  nombre: r.nombre,
  numeros: (r.rifa_boletas || []).map((b) => b.numero).sort((a, b) => a - b),
});

class ErrorCliente extends Error {}

// Busca y valida la factura. Devuelve la orden + cuántos números le tocan, o
// lanza ErrorCliente con un mensaje para mostrarle al cliente tal cual.
async function validarFactura(env, ajustes, factura, total) {
  const numero = normalizarFactura(factura);
  if (!numero) throw new ErrorCliente("Escribe el número de factura tal como aparece en tu tiquete (ej. POS0000010959).");
  const orden = await obtenerOrdenPOS(env, numero);
  if (!orden) throw new ErrorCliente(`No encontramos la factura ${numero}. Revisa el número en tu tiquete.`);
  if (Math.abs(orden.monto - soloNumero(total)) >= 1) {
    throw new ErrorCliente("El total no coincide con el de esa factura. Escríbelo tal como aparece en tu tiquete.");
  }
  const fecha = fechaBogota(orden.fechaUTC);
  if (ajustes.inicio && fecha < ajustes.inicio) throw new ErrorCliente("Esa compra es de antes de que empezara la rifa.");
  if (ajustes.fin && fecha > ajustes.fin) throw new ErrorCliente("Esa compra es de después del cierre de la rifa.");
  return { ...orden, fecha, cantidad: numerosPorMonto(orden.monto, ajustes) };
}

const usaTramos = (ajustes) => ajustes.modo === "tramos" && ajustes.tramos?.length > 0;

// Cuántos números da una factura: proporcional (1 por cada valorBoleta) o, en
// modo tramos, los del tramo más alto que alcanza (no se acumulan).
export function numerosPorMonto(monto, ajustes) {
  if (!usaTramos(ajustes)) return Math.floor(monto / ajustes.valorBoleta);
  const alcanzados = ajustes.tramos.filter((t) => monto >= t.desde);
  return alcanzados.length ? alcanzados[alcanzados.length - 1].numeros : 0;
}

const compraMinima = (ajustes) => (usaTramos(ajustes) ? ajustes.tramos[0].desde : ajustes.valorBoleta);

// Deja los tramos limpios y ordenados por monto; descarta filas incompletas o repetidas.
export function normalizarTramos(tramos) {
  const porMonto = new Map();
  for (const t of Array.isArray(tramos) ? tramos.slice(0, 20) : []) {
    const desde = Math.round(Number(t?.desde));
    const numeros = Math.round(Number(t?.numeros));
    if (desde >= 1000 && numeros >= 1 && numeros <= 50) porMonto.set(desde, numeros);
  }
  return [...porMonto].sort((a, b) => a[0] - b[0]).map(([desde, numeros]) => ({ desde, numeros }));
}

async function publico(env, req, res) {
  const ajustes = await obtenerAjustesRifa(env);
  const { accion, factura, total } = req.body || {};

  if (accion === "verificar") {
    const orden = await validarFactura(env, ajustes, factura, total);
    const existente = await registroRifaPorFactura(env, orden.numero);
    if (existente) return res.status(200).json({ factura: orden.numero, monto: orden.monto, yaRegistrado: true, ...publicoRegistro(existente) });
    return res.status(200).json({ factura: orden.numero, monto: orden.monto, cantidad: orden.cantidad, yaRegistrado: false });
  }

  if (accion === "registrar") {
    const { nombre, celular, cumple, autorizaMarketing, aceptaReglamento } = req.body;
    const nombreLimpio = String(nombre || "").trim().slice(0, 120);
    const celularLimpio = String(celular || "").replace(/\D/g, "");
    if (nombreLimpio.length < 3) throw new ErrorCliente("Escribe tu nombre completo.");
    if (!/^3\d{9}$/.test(celularLimpio)) throw new ErrorCliente("Escribe un celular válido de 10 dígitos (ej. 3001234567).");
    if (!aceptaReglamento) throw new ErrorCliente("Debes aceptar el reglamento de la rifa para participar.");
    const cumpleValido = /^\d{4}-\d{2}-\d{2}$/.test(cumple || "") ? cumple : null;

    const orden = await validarFactura(env, ajustes, factura, total);
    if (orden.cantidad < 1) throw new ErrorCliente(`Esta factura no alcanza: se necesita una compra mínima de ${formato(compraMinima(ajustes))} para recibir un número.`);

    const registro = await crearRegistroRifa(env, {
      factura: orden.numero,
      monto: orden.monto,
      fecha_compra: orden.fecha,
      nombre: nombreLimpio,
      celular: celularLimpio,
      cumple: cumpleValido,
      autoriza_marketing: !!autorizaMarketing,
      autoriza_marketing_en: autorizaMarketing ? new Date().toISOString() : null,
      acepta_reglamento: true,
    });
    if (!registro) {
      const existente = await registroRifaPorFactura(env, orden.numero);
      return res.status(200).json({ factura: orden.numero, yaRegistrado: true, ...publicoRegistro(existente) });
    }

    const numeros = await asignarNumerosRifa(env, registro.id, orden.cantidad, ajustes.totalNumeros);
    if (!numeros.length) {
      await borrarRegistroRifa(env, registro.id);
      throw new ErrorCliente("¡Ya se entregaron todos los números de la rifa! Gracias por tu compra.");
    }
    return res.status(200).json({ factura: orden.numero, nombre: nombreLimpio, numeros, faltaron: orden.cantidad - numeros.length });
  }

  return res.status(400).json({ error: "Acción desconocida." });
}

const formato = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);

async function admin(env, req, res) {
  const { accion, contrasena, ajustes, id, foto } = req.body || {};
  if (contrasena !== env.VITE_APP_PASSWORD) return res.status(401).json({ error: "Contraseña de administrador incorrecta." });

  if (accion === "admin") {
    const [config, registros] = await Promise.all([obtenerAjustesRifa(env), listarRegistrosRifa(env)]);
    return res.status(200).json({ ajustes: config, registros });
  }
  if (accion === "guardarAjustes") {
    const fechaValida = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || "") ? f : "");
    const actual = await obtenerAjustesRifa(env);
    const modo = ajustes?.modo === "tramos" ? "tramos" : "proporcional";
    const tramos = normalizarTramos(ajustes?.tramos);
    if (modo === "tramos" && !tramos.length) {
      return res.status(400).json({ error: "Agrega al menos un tramo válido (compra desde $1.000 y entre 1 y 50 números)." });
    }
    await guardarAjustesRifa(env, {
      modo,
      tramos,
      fotoVersion: actual.fotoVersion || null, // la foto se cambia aparte (guardarFoto)
      valorBoleta: Math.max(1000, Number(ajustes?.valorBoleta) || 130000),
      totalNumeros: Math.min(10000, Math.max(10, Number(ajustes?.totalNumeros) || 1000)),
      inicio: fechaValida(ajustes?.inicio),
      fin: fechaValida(ajustes?.fin),
      fechaSorteo: fechaValida(ajustes?.fechaSorteo),
      premio: String(ajustes?.premio || "").slice(0, 200),
      mensaje: String(ajustes?.mensaje || "").trim().slice(0, 1000),
    });
    return res.status(200).json({ ok: true });
  }
  if (accion === "guardarFoto") {
    // La foto llega ya reducida desde el navegador (JPEG de ~1200 px).
    if (foto && (!/^data:image\/(jpeg|png|webp);base64,/.test(foto) || foto.length > 3_000_000)) {
      return res.status(400).json({ error: "La foto no es válida o es muy pesada." });
    }
    await guardarFotoRifa(env, foto || null);
    const actual = await obtenerAjustesRifa(env);
    await guardarAjustesRifa(env, { ...actual, fotoVersion: foto ? Date.now() : null });
    return res.status(200).json({ ok: true });
  }
  if (accion === "borrar") {
    if (!id) return res.status(400).json({ error: "Falta el registro." });
    await borrarRegistroRifa(env, id); // sus números quedan libres otra vez
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: "Acción desconocida." });
}

export default async function handler(req, res) {
  const env = process.env;
  try {
    if (req.method === "GET" && req.query?.foto) {
      const dataUrl = await obtenerFotoRifa(env);
      if (!dataUrl) return res.status(404).end();
      const [, tipo, base64] = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      // La página pide la foto con ?v=<versión>: si la cambian, cambia la URL,
      // así que se puede guardar en caché sin riesgo de mostrar una vieja.
      res.setHeader("Content-Type", tipo);
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000");
      return res.status(200).send(Buffer.from(base64, "base64"));
    }
    if (req.method === "GET") {
      const [ajustes, ocupados] = await Promise.all([obtenerAjustesRifa(env), numerosRifaOcupados(env)]);
      const { valorBoleta, inicio, fin, fechaSorteo, premio, mensaje, totalNumeros, fotoVersion } = ajustes;
      const reglas = usaTramos(ajustes) ? { modo: "tramos", tramos: ajustes.tramos } : { modo: "proporcional", tramos: [] };
      return res.status(200).json({ valorBoleta, ...reglas, inicio, fin, fechaSorteo, premio, mensaje: mensaje || "", fotoVersion: fotoVersion || null, disponibles: totalNumeros - ocupados.size });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    const accion = req.body?.accion;
    if (["admin", "guardarAjustes", "guardarFoto", "borrar"].includes(accion)) return await admin(env, req, res);
    return await publico(env, req, res);
  } catch (err) {
    if (err instanceof ErrorCliente) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Tuvimos un problema, intenta de nuevo en un momento.", detalle: String(err.message || err) });
  }
}
