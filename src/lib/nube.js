import { leerSesion } from './sesion.js'

// Conexión con la hoja de Google Sheets a través de su Apps Script (ver google-apps-script/Codigo.gs).
// Es lo que da numeración única y propuestas compartidas al instante entre todos los usuarios.
// La URL del script sale de la base de datos (datos/configuracion.csv, fila url_hoja), donde viaja
// cifrada y vale para todos; mientras no esté ahí, el administrador puede pegarla en su navegador.

const CLAVE = 'sds.nube.url'

export const urlNubeDeLaBase = () => leerSesion().configuracion?.url_hoja ?? ''

export function leerUrlNube() {
  if (urlNubeDeLaBase()) return urlNubeDeLaBase()
  try {
    return localStorage.getItem(CLAVE) ?? ''
  } catch {
    return ''
  }
}

export function guardarUrlNube(url) {
  try {
    if (url) localStorage.setItem(CLAVE, url.trim())
    else localStorage.removeItem(CLAVE)
  } catch {
    // Sin almacenamiento la conexión dura solo esta sesión; no hay nada más que hacer aquí.
  }
}

export const nubeActiva = () => Boolean(leerUrlNube())

async function interpretar(respuesta) {
  if (!respuesta.ok) throw new Error(`La hoja respondió ${respuesta.status}.`)
  let datos
  try {
    datos = await respuesta.json()
  } catch {
    // Si la implementación no es pública, Google devuelve su página de inicio de sesión en HTML.
    throw new Error('La URL no devolvió datos. Revisa que la implementación sea «Aplicación web» con acceso «Cualquier usuario».')
  }
  if (datos.error) throw new Error(datos.error)
  return datos
}

// Google a veces responde con una página de error pasajera aunque el script esté bien: se reintenta.
// Repetir es seguro: guardar y eliminar van por número de propuesta, y pedir número dos veces solo
// podría saltarse uno, nunca repetirlo.
async function conReintentos(pedir, intentos = 3) {
  for (let intento = 1; ; intento++) {
    try {
      return await interpretar(await pedir())
    } catch (error) {
      if (intento >= intentos) throw error
      await new Promise((seguir) => setTimeout(seguir, 800 * intento))
    }
  }
}

const leer = (accion) => conReintentos(() => fetch(`${leerUrlNube()}?accion=${accion}`))
// El cuerpo va como texto plano a propósito: así el navegador no hace la consulta previa (CORS)
// que Apps Script no sabe responder.
const escribir = (cuerpo) => conReintentos(() => fetch(leerUrlNube(), { method: 'POST', body: JSON.stringify(cuerpo) }))

export const nube = {
  probar: () => leer('ping'),
  siguienteId: async () => (await leer('siguiente')).id,
  listar: async () => (await leer('propuestas')).propuestas,
  guardar: (propuesta) => escribir({ accion: 'guardar', propuesta }),
  eliminar: (id) => escribir({ accion: 'eliminar', id }),
  leerCatalogo: async () => (await leer('catalogo')).catalogo,
  escribirCatalogo: (catalogo, columnas) => escribir({ accion: 'catalogo', catalogo, columnas }),
}
