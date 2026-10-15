/**
 * api/rifa.js
 * ---------------------------------------------------------------------------
 * Rifa para clientes (/rifa) y su administración (/rifa/admin).
 *
 * El cliente escribe el número de su factura (Ref. venta del POS) y el total
 * que pagó. Se busca la venta EN VIVO en Odoo: el total tiene que coincidir
 * (así nadie registra la factura de otro adivinando el número, que es
 * consecutivo). Por cada `valorBoleta` de la compra se le asigna un número al
 * azar entre los libres (000–999). Cada factura se registra una sola vez; si
 * la vuelven a escribir (con el total correcto) se le muestran sus números.
 *
 *   GET  -> datos públicos de la rifa (valor por número, fechas, premio)
 *   POST { accion: "verificar", factura, total }
 *   POST { accion: "registrar", factura, total, nombre, celular, cumple,
 *          autorizaMarketing, aceptaReglamento }
 *   POST { accion: "admin" | "guardarAjustes" | "borrar", contrasena, ... }
 * ---------------------------------------------------------------------------
 */
import {
  obtenerAjustesRifa, guardarAjustesRifa, registroRifaPorFactura, crearRegistroRifa,
  borrarRegistroRifa, asignarNumerosRifa, numerosRifaOcupados, listarRegistrosRifa,
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
  const cantidad = Math.floor(orden.monto / ajustes.valorBoleta);
  return { ...orden, fecha, cantidad };
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
    if (orden.cantidad < 1) throw new ErrorCliente(`Por cada compra de ${formato(ajustes.valorBoleta)} recibes un número; esta factura no alcanza.`);

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
  const { accion, contrasena, ajustes, id } = req.body || {};
  if (contrasena !== env.VITE_APP_PASSWORD) return res.status(401).json({ error: "Contraseña de administrador incorrecta." });

  if (accion === "admin") {
    const [config, registros] = await Promise.all([obtenerAjustesRifa(env), listarRegistrosRifa(env)]);
    return res.status(200).json({ ajustes: config, registros });
  }
  if (accion === "guardarAjustes") {
    const fechaValida = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || "") ? f : "");
    await guardarAjustesRifa(env, {
      valorBoleta: Math.max(1000, Number(ajustes?.valorBoleta) || 130000),
      totalNumeros: Math.min(10000, Math.max(10, Number(ajustes?.totalNumeros) || 1000)),
      inicio: fechaValida(ajustes?.inicio),
      fin: fechaValida(ajustes?.fin),
      fechaSorteo: fechaValida(ajustes?.fechaSorteo),
      premio: String(ajustes?.premio || "").slice(0, 200),
    });
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
    if (req.method === "GET") {
      const [ajustes, ocupados] = await Promise.all([obtenerAjustesRifa(env), numerosRifaOcupados(env)]);
      const { valorBoleta, inicio, fin, fechaSorteo, premio, totalNumeros } = ajustes;
      return res.status(200).json({ valorBoleta, inicio, fin, fechaSorteo, premio, disponibles: totalNumeros - ocupados.size });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
    const accion = req.body?.accion;
    if (["admin", "guardarAjustes", "borrar"].includes(accion)) return await admin(env, req, res);
    return await publico(env, req, res);
  } catch (err) {
    if (err instanceof ErrorCliente) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Tuvimos un problema, intenta de nuevo en un momento.", detalle: String(err.message || err) });
  }
}
