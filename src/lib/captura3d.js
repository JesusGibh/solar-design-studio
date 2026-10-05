import { useSyncExternalStore } from 'react'

// Captura de la vista 3D que se incluye en la propuesta: { imagen (data URL PNG), paneles, fecha } o null.
// Vive aparte del estado del proyecto porque pesa cientos de kB: si no cabe en localStorage se conserva
// en memoria durante la sesión, sin poner en riesgo el guardado del resto del proyecto.
const CLAVE = 'sds.captura3d.v1'
const oyentes = new Set()

let actual = null
try {
  actual = JSON.parse(localStorage.getItem(CLAVE))
} catch {
  // Sin almacenamiento o dato corrupto: no hay captura guardada.
}

export function guardarCaptura3d(captura) {
  actual = captura
  try {
    if (captura) localStorage.setItem(CLAVE, JSON.stringify(captura))
    else localStorage.removeItem(CLAVE)
  } catch {
    // Cuota llena: la captura queda solo en memoria.
  }
  oyentes.forEach((oyente) => oyente())
}

const suscribir = (oyente) => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export const useCaptura3d = () => useSyncExternalStore(suscribir, () => actual)
