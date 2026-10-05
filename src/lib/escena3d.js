import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Escena 3D del techo con sus paneles. Parte del plano local del techo (metros, x al este, y al norte)
// que entrega lib/geometria.js y lo levanta como un agua inclinada sobre muros.
// En Three.js: X = este, Y = altura, Z = sur (por eso el norte del plano va a -Z).

const ALTURA_ALERO = 3 // m del suelo al borde más bajo del techo
const SEPARACION_TECHO = 0.08 // m entre el techo y el panel (estructura)
const GROSOR_PANEL = 0.035
const RAD = Math.PI / 180

// Textura de celdas fotovoltaicas dibujada en un lienzo: retícula de celdas y barras colectoras.
function texturaFotovoltaica(columnas, filas) {
  const lienzo = document.createElement('canvas')
  const celda = 64
  lienzo.width = columnas * celda
  lienzo.height = filas * celda
  const ctx = lienzo.getContext('2d')
  ctx.fillStyle = '#081226'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  for (let c = 0; c < columnas; c++) {
    for (let f = 0; f < filas; f++) {
      const tono = ctx.createLinearGradient(c * celda, f * celda, (c + 1) * celda, (f + 1) * celda)
      tono.addColorStop(0, '#0f2147')
      tono.addColorStop(1, '#0a1836')
      ctx.fillStyle = tono
      ctx.fillRect(c * celda + 2, f * celda + 2, celda - 4, celda - 4)
      ctx.strokeStyle = 'rgba(190, 205, 230, 0.28)'
      ctx.lineWidth = 1
      for (let barra = 1; barra <= 4; barra++) {
        const x = c * celda + (celda * barra) / 5
        ctx.beginPath()
        ctx.moveTo(x, f * celda + 2)
        ctx.lineTo(x, (f + 1) * celda - 2)
        ctx.stroke()
      }
    }
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 8
  return textura
}

function etiquetaNorte() {
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = 128
  const ctx = lienzo.getContext('2d')
  ctx.fillStyle = '#c0392b'
  ctx.font = 'bold 96px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', 64, 68)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lienzo), depthTest: false }))
  sprite.scale.set(1.6, 1.6, 1)
  return sprite
}

// Monta la escena en `contenedor` y devuelve { capturar, destruir }.
//   plano: { poligono: [{x, y}], paneles: [[{x, y} × 4]] } · usados: cuántos paneles dibujar
//   inclinacion y azimut en grados (el azimut es hacia donde cae el agua)
export function crearEscena(contenedor, { plano, usados, inclinacion, azimut }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.8
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  contenedor.appendChild(renderer.domElement)

  const escena = new THREE.Scene()
  escena.background = new THREE.Color('#dfe8f1')
  // El entorno da los reflejos del vidrio de los paneles y del marco metálico.
  const pmrem = new THREE.PMREMGenerator(renderer)
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  // Altura de cada punto del techo: sube en sentido contrario al azimut.
  const cuesta = { x: -Math.sin(azimut * RAD), y: -Math.cos(azimut * RAD) }
  const avance = (p) => p.x * cuesta.x + p.y * cuesta.y
  const minimo = Math.min(...plano.poligono.map(avance))
  const pendiente = Math.tan(inclinacion * RAD)
  const altura = (p) => ALTURA_ALERO + (avance(p) - minimo) * pendiente
  const punto = (p, extra = 0) => new THREE.Vector3(p.x, altura(p) + extra, -p.y)

  // Agua del techo: el polígono triangulado, con cada vértice a su altura.
  const contorno = plano.poligono.map((p) => new THREE.Vector2(p.x, p.y))
  const triangulos = THREE.ShapeUtils.triangulateShape(contorno, [])
  const techo = new THREE.BufferGeometry().setFromPoints(plano.poligono.map((p) => punto(p)))
  techo.setIndex(triangulos.flat())
  techo.computeVertexNormals()
  const mallaTecho = new THREE.Mesh(techo, new THREE.MeshStandardMaterial({ color: '#6f7680', roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide }))
  mallaTecho.receiveShadow = true
  mallaTecho.castShadow = true
  escena.add(mallaTecho)

  // Muros: de cada lado del techo hasta el suelo.
  const muros = []
  plano.poligono.forEach((a, i) => {
    const b = plano.poligono[(i + 1) % plano.poligono.length]
    const [arribaA, arribaB] = [punto(a), punto(b)]
    const [abajoA, abajoB] = [new THREE.Vector3(a.x, 0, -a.y), new THREE.Vector3(b.x, 0, -b.y)]
    muros.push(arribaA, arribaB, abajoB, arribaA, abajoB, abajoA)
  })
  const geometriaMuros = new THREE.BufferGeometry().setFromPoints(muros)
  geometriaMuros.computeVertexNormals()
  const mallaMuros = new THREE.Mesh(geometriaMuros, new THREE.MeshStandardMaterial({ color: '#d8d3c8', roughness: 0.95, side: THREE.DoubleSide }))
  mallaMuros.castShadow = true
  mallaMuros.receiveShadow = true
  escena.add(mallaMuros)

  // Paneles: cada uno es su propia malla (marco + vidrio con celdas), apoyada sobre el plano del techo.
  const paneles = plano.paneles.slice(0, usados)
  if (paneles.length) {
    const [p0, p1, , p3] = paneles[0].map((p) => punto(p))
    const ancho = p0.distanceTo(p1)
    const largo = p0.distanceTo(p3) // medido sobre la pendiente: ya es el largo real del módulo
    const geometriaMarco = new THREE.BoxGeometry(ancho, largo, GROSOR_PANEL)
    const geometriaVidrio = new THREE.BoxGeometry(ancho - 0.03, largo - 0.03, 0.006)
    const materialMarco = new THREE.MeshStandardMaterial({ color: '#c9d0d9', metalness: 0.85, roughness: 0.35 })
    const materialVidrio = new THREE.MeshPhysicalMaterial({
      map: ancho < largo ? texturaFotovoltaica(6, 12) : texturaFotovoltaica(12, 6),
      // Reflejo ligero: lo justo para que el vidrio brille sin lavar el azul de las celdas.
      metalness: 0.1,
      roughness: 0.3,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.35,
    })
    for (const esquinas of paneles) {
      const [a, b, c, d] = esquinas.map((p) => punto(p))
      const ejeFila = b.clone().sub(a).normalize()
      const ejePendiente = d.clone().sub(a).normalize()
      const normal = ejeFila.clone().cross(ejePendiente).normalize()
      if (normal.y < 0) {
        ejeFila.negate()
        normal.negate()
      }
      const orientacion = new THREE.Matrix4().makeBasis(ejeFila, ejePendiente, normal)
      const centro = a.clone().add(b).add(c).add(d).multiplyScalar(0.25)

      const marco = new THREE.Mesh(geometriaMarco, materialMarco)
      marco.setRotationFromMatrix(orientacion)
      marco.position.copy(centro).addScaledVector(normal, SEPARACION_TECHO + GROSOR_PANEL / 2)
      marco.castShadow = true
      const vidrio = new THREE.Mesh(geometriaVidrio, materialVidrio)
      vidrio.setRotationFromMatrix(orientacion)
      vidrio.position.copy(centro).addScaledVector(normal, SEPARACION_TECHO + GROSOR_PANEL + 0.001)
      escena.add(marco, vidrio)
    }
  }

  // Suelo, brújula y luces.
  const caja = new THREE.Box3().setFromObject(mallaTecho)
  const centroTecho = caja.getCenter(new THREE.Vector3())
  const radio = Math.max(caja.getSize(new THREE.Vector3()).length() / 2, 4)
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(radio * 6, 64), new THREE.MeshStandardMaterial({ color: '#8f9a84', roughness: 1 }))
  suelo.rotation.x = -Math.PI / 2
  suelo.receiveShadow = true
  escena.add(suelo)

  const norte = new THREE.Group()
  const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 20), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.6 }))
  flecha.rotation.x = -Math.PI / 2 // apunta a -Z, que es el norte
  const letra = etiquetaNorte()
  letra.position.set(0, 0.9, -1.8)
  norte.add(flecha, letra)
  norte.position.set(centroTecho.x - radio * 1.15, 0.5, centroTecho.z - radio * 1.15)
  escena.add(norte)

  escena.add(new THREE.HemisphereLight('#ffffff', '#9aa38d', 0.6))
  const sol = new THREE.DirectionalLight('#fff4e0', 1.8)
  // El sol entra desde el lado hacia el que mira el techo, alto, para iluminar los paneles.
  sol.position.set(centroTecho.x - cuesta.x * radio * 1.5 + radio * 0.6, radio * 2.4, centroTecho.z + cuesta.y * radio * 1.5)
  sol.target.position.copy(centroTecho)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  Object.assign(sol.shadow.camera, { left: -radio * 2, right: radio * 2, top: radio * 2, bottom: -radio * 2, near: 0.5, far: radio * 8 })
  escena.add(sol, sol.target)

  // Cámara: de frente al agua del techo, elevada.
  const camara = new THREE.PerspectiveCamera(40, 1, 0.1, radio * 40)
  camara.position.set(centroTecho.x - cuesta.x * radio * 1.9, centroTecho.y + radio * 1.3, centroTecho.z + cuesta.y * radio * 1.9)
  const controles = new OrbitControls(camara, renderer.domElement)
  controles.target.copy(centroTecho)
  controles.enableDamping = true
  controles.maxPolarAngle = Math.PI / 2 - 0.03 // no se mete bajo el suelo
  controles.minDistance = radio * 0.4
  controles.maxDistance = radio * 8
  controles.update()

  const ajustar = () => {
    const { clientWidth, clientHeight } = contenedor
    renderer.setSize(clientWidth, clientHeight)
    camara.aspect = clientWidth / Math.max(clientHeight, 1)
    camara.updateProjectionMatrix()
  }
  ajustar()
  const observador = new ResizeObserver(ajustar)
  observador.observe(contenedor)
  renderer.setAnimationLoop(() => {
    controles.update()
    renderer.render(escena, camara)
  })

  return {
    // PNG de la vista actual a tamaño fijo (por defecto 1600 × 940), independiente de la ventana.
    capturar(ancho = 1600, alto = 940) {
      const proporcion = renderer.getPixelRatio()
      renderer.setPixelRatio(1)
      renderer.setSize(ancho, alto, false)
      camara.aspect = ancho / alto
      camara.updateProjectionMatrix()
      renderer.render(escena, camara)
      const imagen = renderer.domElement.toDataURL('image/png')
      renderer.setPixelRatio(proporcion)
      ajustar()
      return imagen
    },
    destruir() {
      renderer.setAnimationLoop(null)
      observador.disconnect()
      controles.dispose()
      escena.traverse((objeto) => {
        objeto.geometry?.dispose()
        for (const material of [].concat(objeto.material ?? [])) {
          material.map?.dispose()
          material.dispose()
        }
      })
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
