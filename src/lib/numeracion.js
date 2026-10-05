import { archivo, archivoActivo } from './archivo.js'
import { ultimoNumeroConocido } from './historial.js'
import { nube, nubeActiva } from './nube.js'

// Numeración correlativa de propuestas: PROP-<año>-0001, 0002… La cuenta vuelve a empezar cada año.
// El número lo reparte, por orden de preferencia: la hoja de Google Sheets si está conectada; la base
// de datos (datos/propuestas.csv) trabajando en local; y si no, un contador de este navegador que
// continúa desde el último número conocido de la base.
const CLAVE = 'sds.propuestas.ultimo'

function leerContador(anio) {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE))
    return guardado?.anio === anio ? guardado.numero : 0
  } catch {
    return 0
  }
}

function guardarContador(anio, numero) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ anio, numero }))
  } catch {
    // Sin almacenamiento el número no persiste, pero la propuesta se puede generar igual.
  }
}

function siguienteLocal() {
  const anio = new Date().getFullYear()
  const numero = Math.max(leerContador(anio), ultimoNumeroConocido(anio)) + 1
  guardarContador(anio, numero)
  return `PROP-${anio}-${String(numero).padStart(4, '0')}`
}

let enCurso = null

// Reserva el siguiente número. Si ya hay una reserva pendiente devuelve la misma, para que dos
// llamadas seguidas (React monta dos veces en desarrollo) no consuman dos números.
export function reservarIdPropuesta() {
  if (enCurso) return enCurso
  const reserva = (async () => {
    try {
      if (!nubeActiva() && !archivoActivo) return siguienteLocal()
      const id = nubeActiva() ? await nube.siguienteId() : await archivo.siguienteId()
      // El contador local sigue al compartido, por si más tarde se trabaja sin él.
      const [, anio, numero] = id.match(/^PROP-(\d{4})-(\d+)$/) ?? []
      if (anio) guardarContador(Number(anio), Math.max(Number(numero), leerContador(Number(anio))))
      return id
    } catch {
      return siguienteLocal()
    }
  })()
  enCurso = reserva
  // La reserva se libera cuando termina (en un paso posterior, nunca antes de haberla guardado):
  // si se soltara dentro de la propia función, una reserva sin espera quedaría fija para siempre.
  reserva.finally(() => {
    if (enCurso === reserva) enCurso = null
  })
  return reserva
}
