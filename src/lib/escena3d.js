import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Escena 3D del proyecto, al estilo de un CAD fotovoltaico: terreno con la imagen satelital, el
// edificio extruido desde el polígono del techo, cotas en cada arista y los paneles sobre el techo.
// Parte del plano local que entrega lib/geometria.js (metros, x al este, y al norte).
// En Three.js: X = este, Y = altura, Z = sur (por eso el norte del plano va a -Z).

const SEPARACION_TECHO = 0.08 // m entre el techo y el panel (estructura)
const GROSOR_PANEL = 0.035
const RAD = Math.PI / 180
const COLOR_MURO = '#E2E8F0'
const COLOR_TECHO = '#CBD5E1'
const COLOR_ARISTA = '#64748B'

// Textura de celdas fotovoltaicas dibujada en un lienzo: retícula de celdas y barras colectoras.
function texturaFotovoltaica(columnas, filas) {
  const lienzo = document.createElement('canvas')
  const celda = 64
  lienzo.width = columnas * celda
  lienzo.height = filas * celda
  const ctx = lienzo.getContext('2d')
  ctx.fillStyle = '#060e1b'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  for (let c = 0; c < columnas; c++) {
    for (let f = 0; f < filas; f++) {
      const tono = ctx.createLinearGradient(c * celda, f * celda, (c + 1) * celda, (f + 1) * celda)
      tono.addColorStop(0, '#1E293B')
      tono.addColorStop(1, '#0B192C')
      ctx.fillStyle = tono
      ctx.fillRect(c * celda + 2, f * celda + 2, celda - 4, celda - 4)
      ctx.strokeStyle = 'rgba(190, 205, 230, 0.22)'
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

// Rótulo de texto como textura: para las cotas de las aristas y las caras del cubo de orientación.
function texturaRotulo(texto, { ancho = 256, alto = 64, fondo = '#ffffff', color = '#0f172a', borde = COLOR_ARISTA, fuente = 'bold 34px sans-serif' } = {}) {
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  ctx.fillStyle = fondo
  ctx.strokeStyle = borde
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(2, 2, ancho - 4, alto - 4, 10)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = fuente
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, ancho / 2, alto / 2 + 2)
  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

// Cubo de orientación (TOP / N-S-E-O) en su propio lienzo pequeño: gira con la cámara principal.
function crearCubo(contenedor) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(contenedor.clientWidth, contenedor.clientHeight)
  contenedor.appendChild(renderer.domElement)
  const escena = new THREE.Scene()
  const cara = (texto, fondo = '#f8fafc') =>
    new THREE.MeshBasicMaterial({ map: texturaRotulo(texto, { ancho: 128, alto: 128, fondo, fuente: 'bold 44px sans-serif' }) })
  // Orden de caras de BoxGeometry: +X, -X, +Y, -Y, +Z, -Z  ->  este, oeste, arriba, abajo, sur, norte
  const cubo = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), [cara('E'), cara('O'), cara('TOP', '#fde68a'), cara('BASE'), cara('S'), cara('N', '#fecaca')])
  escena.add(cubo)
  const camara = new THREE.PerspectiveCamera(35, contenedor.clientWidth / contenedor.clientHeight, 0.1, 20)
  return {
    actualizar(camaraPrincipal, objetivo) {
      camara.position.copy(camaraPrincipal.position).sub(objetivo).normalize().multiplyScalar(4.6)
      camara.lookAt(0, 0, 0)
      renderer.render(escena, camara)
    },
    destruir() {
      cubo.geometry.dispose()
      for (const material of cubo.material) {
        material.map.dispose()
        material.dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

// Monta la escena en `contenedor` y devuelve { capturar, destruir }.
//   plano: { poligono: [{x, y}], paneles: [[{x, y} × 4]] } · usados: cuántos paneles dibujar
//   inclinacion y azimut en grados (el azimut es hacia donde cae el agua) · altura: m del suelo al alero
//   terreno: { canvas, metros } con la imagen satelital centrada en el origen del plano, o null
//   cuboContenedor: elemento donde dibujar el cubo de orientación (opcional)
export function crearEscena(contenedor, { plano, usados, inclinacion, azimut, altura, terreno, cuboContenedor }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
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
  const alturaEn = (p) => altura + (avance(p) - minimo) * pendiente
  const punto = (p, extra = 0) => new THREE.Vector3(p.x, alturaEn(p) + extra, -p.y)

  // --- Volumen del edificio: el polígono extruido hasta la altura del alero.
  const silueta = new THREE.Shape(plano.poligono.map((p) => new THREE.Vector2(p.x, p.y)))
  const volumen = new THREE.ExtrudeGeometry(silueta, { depth: altura, bevelEnabled: false })
  volumen.rotateX(-Math.PI / 2) // la extrusión sale en +Z; se pone de pie y el norte queda en -Z
  const materialMuro = new THREE.MeshStandardMaterial({ color: COLOR_MURO, roughness: 0.9, side: THREE.DoubleSide })
  const edificio = new THREE.Mesh(volumen, materialMuro)
  edificio.castShadow = true
  edificio.receiveShadow = true
  escena.add(edificio)
  const materialArista = new THREE.LineBasicMaterial({ color: COLOR_ARISTA })
  escena.add(new THREE.LineSegments(new THREE.EdgesGeometry(volumen, 30), materialArista))

  // --- Techo: el polígono triangulado con cada vértice a su altura, y los hastiales que lo unen al alero.
  const triangulos = THREE.ShapeUtils.triangulateShape(
    plano.poligono.map((p) => new THREE.Vector2(p.x, p.y)),
    [],
  )
  const cubierta = new THREE.BufferGeometry().setFromPoints(plano.poligono.map((p) => punto(p, 0.01)))
  cubierta.setIndex(triangulos.flat())
  cubierta.computeVertexNormals()
  const mallaTecho = new THREE.Mesh(cubierta, new THREE.MeshStandardMaterial({ color: COLOR_TECHO, roughness: 0.92, side: THREE.DoubleSide }))
  mallaTecho.receiveShadow = true
  mallaTecho.castShadow = true
  escena.add(mallaTecho)

  const hastiales = []
  const contorno = []
  plano.poligono.forEach((a, i) => {
    const b = plano.poligono[(i + 1) % plano.poligono.length]
    const [arribaA, arribaB] = [punto(a), punto(b)]
    const [aleroA, aleroB] = [new THREE.Vector3(a.x, altura, -a.y), new THREE.Vector3(b.x, altura, -b.y)]
    hastiales.push(arribaA, arribaB, aleroB, arribaA, aleroB, aleroA)
    contorno.push(arribaA, arribaB, arribaA, aleroA)
  })
  const geometriaHastiales = new THREE.BufferGeometry().setFromPoints(hastiales)
  geometriaHastiales.computeVertexNormals()
  const mallaHastiales = new THREE.Mesh(geometriaHastiales, materialMuro)
  mallaHastiales.castShadow = true
  escena.add(mallaHastiales)
  escena.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(contorno), materialArista))

  // --- Cotas: la longitud de cada arista del techo, en un rótulo que siempre mira a la cámara.
  plano.poligono.forEach((a, i) => {
    const b = plano.poligono[(i + 1) % plano.poligono.length]
    const metros = Math.hypot(b.x - a.x, b.y - a.y)
    const rotulo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texturaRotulo(`${metros.toFixed(2)} m`), depthTest: false, sizeAttenuation: false }),
    )
    rotulo.scale.set(0.11, 0.0275, 1)
    rotulo.position.copy(punto(a).add(punto(b)).multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.5, 0))
    rotulo.renderOrder = 10
    escena.add(rotulo)
  })

  // --- Paneles: cada uno es su propia malla (marco + vidrio con celdas), apoyada sobre el plano del techo.
  const paneles = plano.paneles.slice(0, usados)
  if (paneles.length) {
    const [p0, p1, , p3] = paneles[0].map((p) => punto(p))
    const ancho = p0.distanceTo(p1)
    const largo = p0.distanceTo(p3) // medido sobre la pendiente: ya es el largo real del módulo
    const geometriaMarco = new THREE.BoxGeometry(ancho, largo, GROSOR_PANEL)
    const geometriaVidrio = new THREE.BoxGeometry(ancho - 0.03, largo - 0.03, 0.006)
    const materialMarco = new THREE.MeshStandardMaterial({ color: '#d3d9e0', metalness: 0.85, roughness: 0.35 })
    const materialVidrio = new THREE.MeshPhysicalMaterial({
      map: ancho < largo ? texturaFotovoltaica(6, 12) : texturaFotovoltaica(12, 6),
      // Reflejo sutil: lo justo para que el vidrio brille sin lavar el azul de las celdas.
      metalness: 0.25,
      roughness: 0.3,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.4,
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

  // --- Terreno: la imagen satelital a escala real, centrada en el origen del plano.
  const caja = new THREE.Box3().setFromObject(mallaTecho).union(new THREE.Box3().setFromObject(edificio))
  const centroTecho = caja.getCenter(new THREE.Vector3())
  centroTecho.y = altura
  const radio = Math.max(caja.getSize(new THREE.Vector3()).length() / 2, 4)
  let suelo
  if (terreno) {
    const textura = new THREE.CanvasTexture(terreno.canvas)
    textura.colorSpace = THREE.SRGBColorSpace
    textura.anisotropy = renderer.capabilities.getMaxAnisotropy()
    suelo = new THREE.Mesh(new THREE.PlaneGeometry(terreno.metros, terreno.metros), new THREE.MeshStandardMaterial({ map: textura, roughness: 1 }))
  } else {
    suelo = new THREE.Mesh(new THREE.CircleGeometry(radio * 6, 64), new THREE.MeshStandardMaterial({ color: '#8f9a84', roughness: 1 }))
  }
  suelo.rotation.x = -Math.PI / 2 // el borde superior de la imagen (norte) queda hacia -Z
  suelo.receiveShadow = true
  escena.add(suelo)

  // --- Luces: el sol entra desde el lado hacia el que mira el techo, alto, para iluminar los paneles.
  escena.add(new THREE.HemisphereLight('#ffffff', '#9aa38d', 0.75))
  const sol = new THREE.DirectionalLight('#fff4e0', 1.9)
  sol.position.set(centroTecho.x - cuesta.x * radio * 1.5 + radio * 0.6, altura + radio * 2.4, centroTecho.z + cuesta.y * radio * 1.5)
  sol.target.position.copy(centroTecho)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  Object.assign(sol.shadow.camera, { left: -radio * 2, right: radio * 2, top: radio * 2, bottom: -radio * 2, near: 0.5, far: radio * 10 })
  escena.add(sol, sol.target)

  // --- Cámara y control de órbita: de frente al agua del techo, elevada.
  const camara = new THREE.PerspectiveCamera(40, 1, 0.1, Math.max(radio * 60, (terreno?.metros ?? 0) * 3))
  camara.position.set(centroTecho.x - cuesta.x * radio * 1.7, centroTecho.y + radio * 1.5, centroTecho.z + cuesta.y * radio * 1.7)
  const controles = new OrbitControls(camara, renderer.domElement)
  controles.target.copy(centroTecho)
  controles.enableDamping = true
  controles.dampingFactor = 0.08
  controles.maxPolarAngle = Math.PI / 2 - 0.03 // no se mete bajo el suelo
  controles.minDistance = radio * 0.4
  controles.maxDistance = radio * 8
  controles.update()

  const cubo = cuboContenedor ? crearCubo(cuboContenedor) : null

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
    cubo?.actualizar(camara, controles.target)
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
    // Vista cenital, como al pulsar "TOP" en el cubo.
    vistaSuperior() {
      camara.position.set(centroTecho.x, centroTecho.y + radio * 2.6, centroTecho.z + 0.01)
      controles.update()
    },
    destruir() {
      renderer.setAnimationLoop(null)
      observador.disconnect()
      controles.dispose()
      cubo?.destruir()
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
