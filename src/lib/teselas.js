// Fuentes de imágenes satelitales del mapa y de la captura para el PDF.
//
// Esri no tiene el mismo detalle en todas partes: donde sus imágenes terminan en el zoom 18, pedir
// el 19 devuelve una tesela gris con el texto "Map data not yet available". Por eso el zoom máximo
// "nativo" se consulta por sitio (zoomNativo) y, de ahí en adelante, la última tesela real se amplía.

const TESELA = 256

// Coordenadas de tesela (x, y) que contienen un punto al zoom z (Web Mercator).
export function teselaDe(lat, lng, z) {
  const n = 2 ** z
  const seno = Math.sin((lat * Math.PI) / 180)
  return [Math.floor(((lng + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * n)]
}

// [lat, lng] -> píxeles del mundo al zoom z.
export function aMundo([lat, lng], z) {
  const escala = TESELA * 2 ** z
  const seno = Math.sin((lat * Math.PI) / 180)
  return { x: ((lng + 180) / 360) * escala, y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * escala }
}

const cacheEsri = new Map()

// Mayor zoom con imagen real de Esri en ese punto (entre 13 y 20). Usa su servicio "tilemap", que
// responde si existe cada tesela; el resultado se recuerda por zona para no repetir consultas.
async function zoomNativoEsri(lat, lng) {
  const clave = teselaDe(lat, lng, 15).join('/')
  if (cacheEsri.has(clave)) return cacheEsri.get(clave)
  let nativo = 17 // si el servicio no responde, un valor disponible en casi cualquier zona poblada
  try {
    for (let z = 20; z >= 13; z--) {
      const [x, y] = teselaDe(lat, lng, z)
      const respuesta = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/${z}/${y}/${x}/1/1?f=json`)
      if ((await respuesta.json()).data?.[0] === 1) {
        nativo = z
        break
      }
    }
    cacheEsri.set(clave, nativo)
  } catch {
    // Sin conexión con el servicio: se usa el valor conservador y se reintenta en la próxima consulta.
  }
  return nativo
}

export const FUENTES = {
  google: {
    nombre: 'Híbrido (Google)',
    plantilla: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    // Para la imagen de la propuesta se pide solo satélite (lyrs=s): los rótulos de calles y negocios
    // del híbrido estorban sobre el arreglo de paneles.
    url: (z, x, y) => `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`,
    atribucion: 'Imágenes © Google',
    zoomInicial: 20,
    zoomNativo: async () => 20,
  },
  esri: {
    nombre: 'Satélite (Esri)',
    plantilla: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    atribucion: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    zoomInicial: 17,
    zoomNativo: zoomNativoEsri,
  },
}

export const FUENTE_POR_DEFECTO = 'google'
export const fuenteDe = (id) => FUENTES[id] ?? FUENTES[FUENTE_POR_DEFECTO]
