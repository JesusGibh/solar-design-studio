// Imagen satelital del techo con el arreglo de paneles, para la portada de la propuesta.
// Se compone a mano sobre un <canvas> (teselas + contorno + paneles) en lugar de capturar el mapa
// en pantalla: así no depende de que el módulo de Diseño esté abierto.

const TESELA = 256
const ZOOM_MAX = 19 // máximo nativo de la capa de imágenes
const url = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`

// Web Mercator: [lat, lng] -> píxeles del mundo al zoom z.
function aMundo([lat, lng], z) {
  const escala = TESELA * 2 ** z
  const seno = Math.sin((lat * Math.PI) / 180)
  return { x: ((lng + 180) / 360) * escala, y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * escala }
}

function cargar(src) {
  return new Promise((resolver) => {
    const imagen = new Image()
    imagen.crossOrigin = 'anonymous' // sin esto el canvas queda "manchado" y no se puede exportar
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => resolver(null)
    imagen.src = src
  })
}

// Devuelve un data URL JPEG, o null si no hay techo trazado o el navegador no dejó exportar la imagen.
//   usados: cuántos de los rectángulos pertenecen al sistema (los demás no se dibujan)
export async function capturarTecho({ vertices, rectangulos, usados = rectangulos.length, ancho = 1200, alto = 620 }) {
  if (!vertices || vertices.length < 3) return null

  // El zoom más cercano en el que el techo ocupa como mucho el 70 % del encuadre.
  let zoom = ZOOM_MAX
  let caja
  for (; zoom > 1; zoom--) {
    const puntos = vertices.map((vertice) => aMundo(vertice, zoom))
    const xs = puntos.map((p) => p.x)
    const ys = puntos.map((p) => p.y)
    caja = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    if (caja.maxX - caja.minX <= ancho * 0.7 && caja.maxY - caja.minY <= alto * 0.7) break
  }
  const origen = { x: (caja.minX + caja.maxX) / 2 - ancho / 2, y: (caja.minY + caja.maxY) / 2 - alto / 2 }

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#11141a'
  ctx.fillRect(0, 0, ancho, alto)

  const teselas = []
  for (let tx = Math.floor(origen.x / TESELA); tx * TESELA < origen.x + ancho; tx++) {
    for (let ty = Math.floor(origen.y / TESELA); ty * TESELA < origen.y + alto; ty++) {
      teselas.push(cargar(url(zoom, tx, ty)).then((imagen) => imagen && ctx.drawImage(imagen, tx * TESELA - origen.x, ty * TESELA - origen.y)))
    }
  }
  await Promise.all(teselas)

  const trazar = (puntos) => {
    ctx.beginPath()
    puntos.forEach((punto, i) => {
      const { x, y } = aMundo(punto, zoom)
      ctx[i ? 'lineTo' : 'moveTo'](x - origen.x, y - origen.y)
    })
    ctx.closePath()
  }
  ctx.fillStyle = 'rgba(57, 135, 229, 0.85)'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  for (const rectangulo of rectangulos.slice(0, usados)) {
    trazar(rectangulo)
    ctx.fill()
    ctx.stroke()
  }
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 3
  trazar(vertices)
  ctx.stroke()

  try {
    return canvas.toDataURL('image/jpeg', 0.88)
  } catch {
    return null
  }
}
