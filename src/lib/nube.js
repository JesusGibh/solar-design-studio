// Conexión con la hoja de Google Sheets a través de su Apps Script (ver google-apps-script/Codigo.gs).
// La URL del script se guarda en este navegador, no en el código: cada dispositivo la pega una vez.

const CLAVE = 'sds.nube.url'

export function leerUrlNube() {
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

const leer = async (accion) => interpretar(await fetch(`${leerUrlNube()}?accion=${accion}`))
// El cuerpo va como texto plano a propósito: así el navegador no hace la consulta previa (CORS)
// que Apps Script no sabe responder.
const escribir = async (cuerpo) => interpretar(await fetch(leerUrlNube(), { method: 'POST', body: JSON.stringify(cuerpo) }))

export const nube = {
  probar: () => leer('ping'),
  siguienteId: async () => (await leer('siguiente')).id,
  listar: async () => (await leer('propuestas')).propuestas,
  guardar: (propuesta) => escribir({ accion: 'guardar', propuesta }),
  eliminar: (id) => escribir({ accion: 'eliminar', id }),
  leerCatalogo: async () => (await leer('catalogo')).catalogo,
  escribirCatalogo: (catalogo, columnas) => escribir({ accion: 'catalogo', catalogo, columnas }),
}
