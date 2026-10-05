import { aMundo, fuenteDe } from './teselas.js'

// Imagen satelital del techo con el arreglo de paneles, para la portada de la propuesta.
// Se compone a mano sobre un <canvas> (teselas + contorno + paneles) en lugar de capturar el mapa
// en pantalla: así no depende de que el módulo de Diseño esté abierto.

const TESELA = 256
const ZOOM_ENCUADRE_MAX = 21

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
//   capa: fuente de imágenes ('esri' | 'google'), la misma que se ve en el mapa
export async function capturarTecho({ vertices, rectangulos, usados = rectangulos.length, capa = 'esri', ancho = 1200, alto = 620 }) {
  if (!vertices || vertices.length < 3) return null

  // Zoom de encuadre: el más cercano en el que el techo ocupa como mucho el 70 % de la imagen.
  let zoom = ZOOM_ENCUADRE_MAX
  let caja
  for (; zoom > 1; zoom--) {
    const puntos = vertices.map((vertice) => aMundo(vertice, zoom))
    const xs = puntos.map((p) => p.x)
    const ys = puntos.map((p) => p.y)
    caja = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    if (caja.maxX - caja.minX <= ancho * 0.7 && caja.maxY - caja.minY <= alto * 0.7) break
  }
  const origen = { x: (caja.minX + caja.maxX) / 2 - ancho / 2, y: (caja.minY + caja.maxY) / 2 - alto / 2 }

  // Las teselas se piden al mayor zoom con imagen real y se amplían hasta el zoom de encuadre.
  const fuente = fuenteDe(capa)
  const zoomTeselas = Math.min(zoom, await fuente.zoomNativo(vertices[0][0], vertices[0][1]))
  const ampliacion = 2 ** (zoom - zoomTeselas)
  const lado = TESELA * ampliacion

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#11141a'
  ctx.fillRect(0, 0, ancho, alto)

  const teselas = []
  for (let tx = Math.floor(origen.x / lado); tx * lado < origen.x + ancho; tx++) {
    for (let ty = Math.floor(origen.y / lado); ty * lado < origen.y + alto; ty++) {
      teselas.push(
        cargar(fuente.url(zoomTeselas, tx, ty)).then((imagen) => imagen && ctx.drawImage(imagen, tx * lado - origen.x, ty * lado - origen.y, lado, lado)),
      )
    }
  }
  await Promise.all(teselas)

  const aLienzo = (punto) => {
    const { x, y } = aMundo(punto, zoom)
    return [x - origen.x, y - origen.y]
  }
  const trazar = (puntos) => {
    ctx.beginPath()
    puntos.map(aLienzo).forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y))
    ctx.closePath()
  }

  // Paneles con el mismo aspecto que en el mapa: celda azul marino, marco claro y retícula de celdas.
  for (const rectangulo of rectangulos.slice(0, usados)) {
    trazar(rectangulo)
    ctx.fillStyle = '#0b1a36'
    ctx.fill()
    const [a, b, c, d] = rectangulo.map(aLienzo)
    const largoAB = Math.hypot(b[0] - a[0], b[1] - a[1])
    const largoBC = Math.hypot(c[0] - b[0], c[1] - b[1])
    if (Math.min(largoAB, largoBC) >= 18) {
      const [enAB, enBC] = largoAB > largoBC ? [12, 6] : [6, 12]
      const entre = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      ctx.beginPath()
      for (let i = 1; i < enAB; i++) {
        ctx.moveTo(...entre(a, b, i / enAB))
        ctx.lineTo(...entre(d, c, i / enAB))
      }
      for (let i = 1; i < enBC; i++) {
        ctx.moveTo(...entre(a, d, i / enBC))
        ctx.lineTo(...entre(b, c, i / enBC))
      }
      ctx.strokeStyle = '#3f5f97'
      ctx.lineWidth = 0.6
      ctx.stroke()
    }
    trazar(rectangulo)
    ctx.strokeStyle = '#d5dbe3'
    ctx.lineWidth = 1.5
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
