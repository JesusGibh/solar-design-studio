// Geometría del techo trazado sobre el mapa. Los vértices llegan como [lat, lng]; para medir y
// empaquetar se proyectan a un plano local en metros (suficiente para el tamaño de un techo).

const RADIO_TIERRA = 6378137
const RAD = Math.PI / 180

// Proyección local alrededor del centro del polígono: x hacia el este, y hacia el norte, en metros.
export function proyeccionLocal(vertices) {
  const lat0 = vertices.reduce((suma, [lat]) => suma + lat, 0) / vertices.length
  const lng0 = vertices.reduce((suma, [, lng]) => suma + lng, 0) / vertices.length
  const escalaX = RADIO_TIERRA * RAD * Math.cos(lat0 * RAD)
  const escalaY = RADIO_TIERRA * RAD
  return {
    lat0,
    aPlano: ([lat, lng]) => ({ x: (lng - lng0) * escalaX, y: (lat - lat0) * escalaY }),
    aMapa: ({ x, y }) => [lat0 + y / escalaY, lng0 + x / escalaX],
  }
}

export function areaPoligono(puntos) {
  let suma = 0
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i]
    const b = puntos[(i + 1) % puntos.length]
    suma += a.x * b.y - b.x * a.y
  }
  return Math.abs(suma) / 2
}

// Ángulo (rad, antihorario desde el este) del lado más largo: marca la dirección de las filas de paneles.
function anguloLadoMayor(puntos) {
  let mejor = { longitud: 0, angulo: 0 }
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i]
    const b = puntos[(i + 1) % puntos.length]
    const longitud = Math.hypot(b.x - a.x, b.y - a.y)
    if (longitud > mejor.longitud) mejor = { longitud, angulo: Math.atan2(b.y - a.y, b.x - a.x) }
  }
  return mejor.angulo
}

const aAzimut = (anguloRad) => (((90 - anguloRad / RAD) % 360) + 360) % 360
const desdeAzimut = (azimut) => (90 - azimut) * RAD

// Azimut estimado: la perpendicular al lado más largo que mira hacia el ecuador (sur en el hemisferio
// norte). Un trazo en planta no dice hacia dónde cae el agua, así que es una estimación a confirmar.
function azimutEstimado(puntos, lat0) {
  const lado = anguloLadoMayor(puntos)
  const opciones = [aAzimut(lado + Math.PI / 2), aAzimut(lado - Math.PI / 2)]
  const objetivo = lat0 >= 0 ? 180 : 0
  const distancia = (azimut) => Math.min(Math.abs(azimut - objetivo), 360 - Math.abs(azimut - objetivo))
  return distancia(opciones[0]) <= distancia(opciones[1]) ? opciones[0] : opciones[1]
}

function dentro(punto, poligono) {
  let adentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]
    const b = poligono[j]
    if (a.y > punto.y !== b.y > punto.y && punto.x < ((b.x - a.x) * (punto.y - a.y)) / (b.y - a.y) + a.x) adentro = !adentro
  }
  return adentro
}

function seCruzan(p1, p2, p3, p4) {
  const giro = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return giro(p1, p2, p3) * giro(p1, p2, p4) < 0 && giro(p3, p4, p1) * giro(p3, p4, p2) < 0
}

// El rectángulo cabe si sus esquinas están dentro, ningún lado del techo lo atraviesa y no encierra un vértice.
function rectanguloDentro(poligono, x0, y0, x1, y1) {
  const esquinas = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  if (!esquinas.every((esquina) => dentro(esquina, poligono))) return false
  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i]
    const b = poligono[(i + 1) % poligono.length]
    if (a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1) return false
    for (let k = 0; k < 4; k++) if (seCruzan(a, b, esquinas[k], esquinas[(k + 1) % 4])) return false
  }
  return true
}

const SEPARACION = 0.02 // m entre paneles (grapas)
const DESFASES = 5 // posiciones de arranque de la cuadrícula que se prueban en cada eje

// Mide el techo y lo llena con una cuadrícula de paneles alineada al lado más largo (o al azimut indicado).
//   vertices: [[lat, lng], …] · panel: { largo_mm, ancho_mm } o null · orientacion: 'vertical' | 'horizontal'
//   inclinacion en grados · retranqueo en metros · azimutManual en grados o null
// Devuelve { areaM2, areaInclinadaM2, azimut, cantidad, rectangulos } con cada rectángulo como 4 [lat, lng].
export function analizarTecho({ vertices, panel, orientacion = 'vertical', inclinacion = 0, retranqueo = 0.5, azimutManual = null }) {
  if (!vertices || vertices.length < 3) return null
  const { lat0, aPlano, aMapa } = proyeccionLocal(vertices)
  const puntos = vertices.map(aPlano)
  const areaM2 = areaPoligono(puntos)
  const coseno = Math.cos(inclinacion * RAD)
  const azimut = azimutManual ?? azimutEstimado(puntos, lat0)
  const base = { areaM2, areaInclinadaM2: areaM2 / coseno, azimut, cantidad: null, rectangulos: [], plano: { poligono: puntos, paneles: [] } }
  if (!panel?.largo_mm || !panel?.ancho_mm) return base

  // Se gira el plano para que las filas queden horizontales: son perpendiculares a la dirección de caída.
  const giro = -(desdeAzimut(azimut) + Math.PI / 2)
  const [cos, sen] = [Math.cos(giro), Math.sin(giro)]
  const girar = ({ x, y }) => ({ x: x * cos - y * sen, y: x * sen + y * cos })
  const deshacer = ({ x, y }) => ({ x: x * cos + y * sen, y: -x * sen + y * cos })
  const poligono = puntos.map(girar)

  const [largo, ancho] = [panel.largo_mm / 1000, panel.ancho_mm / 1000]
  const anchoFila = orientacion === 'vertical' ? ancho : largo
  // En planta, el lado que sube por la pendiente se acorta con el coseno de la inclinación.
  const altoFila = (orientacion === 'vertical' ? largo : ancho) * coseno
  const [pasoX, pasoY] = [anchoFila + SEPARACION, altoFila + SEPARACION]

  const xs = poligono.map((p) => p.x)
  const ys = poligono.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]

  let mejor = []
  for (let i = 0; i < DESFASES; i++) {
    for (let j = 0; j < DESFASES; j++) {
      const colocados = []
      for (let y = minY + retranqueo + (j * pasoY) / DESFASES; y + altoFila <= maxY; y += pasoY) {
        for (let x = minX + retranqueo + (i * pasoX) / DESFASES; x + anchoFila <= maxX; x += pasoX) {
          // El retranqueo se verifica agrandando el rectángulo: todo el margen debe quedar dentro del techo.
          if (rectanguloDentro(poligono, x - retranqueo, y - retranqueo, x + anchoFila + retranqueo, y + altoFila + retranqueo)) {
            colocados.push([x, y])
          }
        }
      }
      if (colocados.length > mejor.length) mejor = colocados
    }
  }

  // Cada panel en el plano local (metros, x al este, y al norte): lo usa la vista 3D.
  const enPlano = mejor.map(([x, y]) =>
    [
      { x, y },
      { x: x + anchoFila, y },
      { x: x + anchoFila, y: y + altoFila },
      { x, y: y + altoFila },
    ].map(deshacer),
  )
  return {
    ...base,
    cantidad: enPlano.length,
    rectangulos: enPlano.map((esquinas) => esquinas.map(aMapa)),
    plano: { poligono: puntos, paneles: enPlano },
  }
}

// Distancia geodésica (haversine) en metros entre dos puntos [lat, lng].
export function distancia([lat1, lng1], [lat2, lng2]) {
  const dLat = (lat2 - lat1) * RAD
  const dLng = (lng2 - lng1) * RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA * Math.asin(Math.sqrt(a))
}

// Cotas del trazo: longitud y punto medio de cada lado, perímetro y área.
// Con `cerrado` en false (trazo en curso) no se cuenta el lado que une el último vértice con el primero.
export function medirTrazo(vertices, cerrado = true) {
  if (vertices.length < 2) return { lados: [], perimetro: 0, areaM2: 0 }
  const { aPlano } = proyeccionLocal(vertices)
  const puntos = vertices.map(aPlano)
  const lados = []
  const total = cerrado && vertices.length >= 3 ? vertices.length : vertices.length - 1
  for (let i = 0; i < total; i++) {
    const j = (i + 1) % vertices.length
    lados.push({
      indice: i,
      longitud: distancia(vertices[i], vertices[j]),
      medio: [(vertices[i][0] + vertices[j][0]) / 2, (vertices[i][1] + vertices[j][1]) / 2],
    })
  }
  return {
    lados,
    perimetro: lados.reduce((suma, lado) => suma + lado.longitud, 0),
    areaM2: vertices.length >= 3 ? areaPoligono(puntos) : 0,
  }
}

const CARDINALES =['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
export const puntoCardinal = (azimut) => CARDINALES[Math.round(azimut / 45) % 8]
