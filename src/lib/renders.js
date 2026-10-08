// Vista previa del render 3D de cada propuesta: { imagen (data URL JPEG), paneles }.
// Se guarda en IndexedDB y no en localStorage, porque una sola imagen pesa más de 100 kB y el
// historial completo no cabría. Si IndexedDB no está disponible, simplemente no hay vista previa.
const BASE = 'sds'
const ALMACEN = 'renders'

function abrir() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, 1)
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN)
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

async function operar(modo, accion) {
  try {
    const base = await abrir()
    return await new Promise((resolver, rechazar) => {
      const peticion = accion(base.transaction(ALMACEN, modo).objectStore(ALMACEN))
      peticion.onsuccess = () => resolver(peticion.result ?? null)
      peticion.onerror = () => rechazar(peticion.error)
    })
  } catch {
    return null
  }
}

export const leerRender = (id) => operar('readonly', (almacen) => almacen.get(id))
export const guardarRender = (id, render) => operar('readwrite', (almacen) => (render ? almacen.put(render, id) : almacen.delete(id)))

// Reduce la captura (PNG de varios MB) a un JPEG liviano, apto para guardar y enviar.
export function comprimir(dataUrl, anchoMaximo = 1280, calidad = 0.7) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.onload = () => {
      const escala = Math.min(1, anchoMaximo / imagen.width)
      const lienzo = document.createElement('canvas')
      lienzo.width = Math.round(imagen.width * escala)
      lienzo.height = Math.round(imagen.height * escala)
      lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
      resolver(lienzo.toDataURL('image/jpeg', calidad))
    }
    imagen.onerror = () => rechazar(new Error('No se pudo leer la captura 3D.'))
    imagen.src = dataUrl
  })
}
