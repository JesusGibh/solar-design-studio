import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, Crosshair, LoaderCircle, PenLine, Search, Trash2, Undo2 } from 'lucide-react'
import { distancia, medirTrazo } from '../lib/geometria.js'
import { FUENTES, fuenteDe } from '../lib/teselas.js'
import { Toggle, inputClass } from './campos.jsx'

const VISTA_INICIAL = { centro: [15, -75], zoom: 4 }
const ZOOM_SITIO = 19
const ZOOM_MAXIMO = 22
const ZOOM_CELDAS = 20 // desde aquí se dibujan las celdas de cada panel

const boton =
  'flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50'

const iconoVertice = (primero) => L.divIcon({ className: `vertice-techo${primero ? ' vertice-inicial' : ''}`, iconSize: [14, 14] })
const iconoCota = (texto, insertable) =>
  L.divIcon({ className: '', html: `<span class="cota-techo${insertable ? ' cota-insertable' : ''}">${texto}</span>`, iconSize: [0, 0] })
const metros = (m) => `${m < 10 ? m.toFixed(2) : m.toFixed(1)} m`

// "18.4861, -69.9312" o "18.4861 -69.9312"
function comoCoordenadas(texto) {
  const partes = texto.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!partes) return null
  const [lat, lng] = [Number(partes[1]), Number(partes[2])]
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null
}

// Líneas de celdas de un panel (6 a lo ancho, 12 a lo largo), interpolando entre sus esquinas.
function celdas([a, b, c, d]) {
  const entre = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  const ladoABMasLargo = distancia(a, b) > distancia(b, c)
  const [enAB, enBC] = ladoABMasLargo ? [12, 6] : [6, 12]
  const lineas = []
  for (let i = 1; i < enAB; i++) lineas.push([entre(a, b, i / enAB), entre(d, c, i / enAB)])
  for (let i = 1; i < enBC; i++) lineas.push([entre(a, d, i / enBC), entre(b, c, i / enBC)])
  return lineas
}

// Mapa satelital con trazado del techo al estilo de la regla poligonal de Google Earth: cada clic
// añade un vértice, cada lado muestra su cota y el área se actualiza mientras se dibuja.
// No guarda el trazo: recibe `vertices` y avisa cada cambio con `onVertices`.
//   rectangulos: posiciones donde cabe un panel (cada una, 4 [lat, lng]) · ocupados: índices con panel
//   vista / onVista: centro y zoom recordados · capa / onCapa: fuente de imágenes ('esri' | 'google')
export default function MapaTecho({ vertices, onVertices, rectangulos, ocupados, vista, onVista, capa = 'google', onCapa }) {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const capas = useRef(null)
  const estado = useRef({})
  const [dibujando, setDibujando] = useState(false)
  const [cursor, setCursor] = useState(null) // posición del puntero mientras se dibuja
  const [zoom, setZoom] = useState(vista?.zoom ?? VISTA_INICIAL.zoom)
  const [busqueda, setBusqueda] = useState('')
  const [ocupado, setOcupado] = useState(null) // 'gps' | 'busqueda'
  const [aviso, setAviso] = useState('')

  // Los manejadores de Leaflet se registran una vez; leen siempre lo último desde esta referencia.
  estado.current = { vertices, dibujando, onVertices, onVista, capa }

  const cerrado = !dibujando && vertices.length >= 3
  const medidas = medirTrazo(vertices, cerrado)
  // Mientras se dibuja, el área y el tramo en curso incluyen la posición del puntero.
  const enCurso = dibujando && cursor && vertices.length ? medirTrazo([...vertices, cursor], true) : null

  useEffect(() => {
    const inicio = vista ?? VISTA_INICIAL
    const instancia = L.map(contenedor.current, { center: inicio.centro, zoom: inicio.zoom, maxZoom: ZOOM_MAXIMO, doubleClickZoom: false })
    const lienzo = L.canvas({ padding: 0.5 })
    capas.current = {
      lienzo,
      imagen: null,
      paneles: L.layerGroup().addTo(instancia),
      techo: L.layerGroup().addTo(instancia),
      guia: L.layerGroup().addTo(instancia),
    }

    let ultimoClic = { momento: 0, x: 0, y: 0 }
    instancia.on('click', (evento) => {
      const actual = estado.current
      if (!actual.dibujando) return
      // El segundo clic de un doble clic cae en el mismo punto: no debe crear un vértice repetido.
      const { x, y } = evento.containerPoint
      const repetido = evento.originalEvent.timeStamp - ultimoClic.momento < 400 && Math.hypot(x - ultimoClic.x, y - ultimoClic.y) < 6
      ultimoClic = { momento: evento.originalEvent.timeStamp, x, y }
      if (!repetido) actual.onVertices([...actual.vertices, [evento.latlng.lat, evento.latlng.lng]])
    })
    // Doble clic: termina el trazo en el último punto, como la regla de Google Earth.
    instancia.on('dblclick', () => {
      if (estado.current.dibujando && estado.current.vertices.length >= 3) {
        setDibujando(false)
        setCursor(null)
      }
    })
    instancia.on('mousemove', (evento) => {
      if (estado.current.dibujando) setCursor([evento.latlng.lat, evento.latlng.lng])
    })
    instancia.on('zoomend', () => setZoom(instancia.getZoom()))

    // Ajusta el zoom nativo de la capa a lo que realmente existe en la zona visible (ver lib/teselas.js).
    let consulta = 0
    const ajustarNativo = async () => {
      const turno = ++consulta
      const { imagen } = capas.current
      const centro = instancia.getCenter()
      const nativo = await fuenteDe(estado.current.capa).zoomNativo(centro.lat, centro.lng)
      if (turno !== consulta || !imagen || imagen !== capas.current.imagen || imagen.options.maxNativeZoom === nativo) return
      imagen.options.maxNativeZoom = nativo
      imagen.redraw()
    }
    instancia.on('moveend', () => {
      const centro = instancia.getCenter()
      estado.current.onVista({ centro: [centro.lat, centro.lng], zoom: instancia.getZoom() })
      if (instancia.getZoom() >= 16) ajustarNativo()
    })
    capas.current.ajustarNativo = ajustarNativo

    if (!vista && estado.current.vertices.length >= 2) instancia.fitBounds(estado.current.vertices, { maxZoom: 20 })
    mapa.current = instancia
    return () => instancia.remove()
    // Solo al montar: la vista inicial no debe recrear el mapa cuando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Capa de imágenes según la fuente elegida.
  useEffect(() => {
    const fuente = fuenteDe(capa)
    capas.current.imagen?.remove()
    const imagen = L.tileLayer(fuente.plantilla, {
      maxNativeZoom: fuente.zoomInicial,
      maxZoom: ZOOM_MAXIMO,
      attribution: fuente.atribucion,
    }).addTo(mapa.current)
    // Red de seguridad: si falla una tesela del zoom nativo (zona sin ese detalle), se baja un nivel
    // y se amplía la imagen anterior en lugar de dejar huecos.
    imagen.on('tileerror', (evento) => {
      if (evento.coords.z === imagen.options.maxNativeZoom && imagen.options.maxNativeZoom > 15) {
        imagen.options.maxNativeZoom -= 1
        imagen.redraw()
      }
    })
    capas.current.imagen = imagen
    capas.current.imagen.bringToBack()
    capas.current.ajustarNativo()
  }, [capa])

  // Contorno, cotas de cada lado y vértices arrastrables.
  useEffect(() => {
    const grupo = capas.current.techo
    grupo.clearLayers()
    if (vertices.length >= 2) {
      const forma = cerrado ? L.polygon : L.polyline
      forma(vertices, { color: '#f59e0b', weight: 2.5, fillOpacity: 0.06, interactive: false }).addTo(grupo)
    }
    for (const lado of medidas.lados) {
      const cota = L.marker(lado.medio, {
        icon: iconoCota(metros(lado.longitud), cerrado),
        interactive: cerrado,
        keyboard: false,
        title: cerrado ? 'Clic para añadir un vértice en este lado' : '',
      }).addTo(grupo)
      // Con el polígono cerrado, tocar la cota de un lado inserta un vértice en su punto medio.
      if (cerrado) {
        cota.on('click', () => {
          const actuales = estado.current.vertices
          estado.current.onVertices([...actuales.slice(0, lado.indice + 1), lado.medio, ...actuales.slice(lado.indice + 1)])
        })
      }
    }
    vertices.forEach((posicion, indice) => {
      const cierra = dibujando && indice === 0 && vertices.length >= 3
      const marcador = L.marker(posicion, {
        icon: iconoVertice(cierra),
        draggable: !dibujando,
        title: cierra ? 'Clic para cerrar el polígono' : 'Arrastra para mover · doble clic para quitar',
      }).addTo(grupo)
      marcador.on('click', (evento) => {
        L.DomEvent.stopPropagation(evento)
        if (cierra) setDibujando(false)
      })
      marcador.on('dragend', () => {
        const { lat, lng } = marcador.getLatLng()
        estado.current.onVertices(estado.current.vertices.map((actual, i) => (i === indice ? [lat, lng] : actual)))
      })
      marcador.on('dblclick', (evento) => {
        L.DomEvent.stopPropagation(evento)
        const actuales = estado.current.vertices
        if (estado.current.dibujando) {
          // El doble clic que termina el trazo cae sobre el vértice recién creado bajo el puntero.
          if (actuales.length >= 3) {
            setDibujando(false)
            setCursor(null)
          }
        } else if (actuales.length > 3) {
          estado.current.onVertices(actuales.filter((_, i) => i !== indice))
        }
      })
    })
    // `medidas` se deriva de vertices y cerrado; no hace falta como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertices, dibujando])

  // Guía elástica: del último vértice al puntero (con su cota) y de vuelta al primero.
  useEffect(() => {
    const grupo = capas.current.guia
    grupo.clearLayers()
    if (!dibujando || !cursor || vertices.length === 0) return
    const ultimo = vertices.at(-1)
    L.polyline([ultimo, cursor], { color: '#fbbf24', weight: 2, dashArray: '6 6', interactive: false }).addTo(grupo)
    if (vertices.length >= 2) L.polyline([cursor, vertices[0]], { color: '#fbbf24', weight: 1, opacity: 0.5, dashArray: '2 6', interactive: false }).addTo(grupo)
    L.marker([(ultimo[0] + cursor[0]) / 2, (ultimo[1] + cursor[1]) / 2], { icon: iconoCota(metros(distancia(ultimo, cursor))), interactive: false }).addTo(grupo)
  }, [dibujando, cursor, vertices])

  // Paneles con aspecto real: celda azul marino, marco claro y, de cerca, la retícula de celdas.
  useEffect(() => {
    const grupo = capas.current.paneles
    const renderer = capas.current.lienzo
    grupo.clearLayers()
    const conPanel = new Set(ocupados)
    const delSistema = rectangulos.filter((_, indice) => conPanel.has(indice))
    const libres = rectangulos.filter((_, indice) => !conPanel.has(indice))
    // Un solo multipolígono por grupo (cada rectángulo es un anillo propio), más liviano que cientos de capas.
    if (libres.length) {
      L.polygon(libres.map((r) => [r]), { renderer, interactive: false, color: '#e6e9ef', weight: 1, opacity: 0.55, dashArray: '3 3', fillColor: '#e6e9ef', fillOpacity: 0.08 }).addTo(grupo)
    }
    if (delSistema.length) {
      L.polygon(delSistema.map((r) => [r]), { renderer, interactive: false, color: '#d5dbe3', weight: zoom >= ZOOM_CELDAS ? 1.5 : 1, fillColor: '#0b1a36', fillOpacity: 0.96 }).addTo(grupo)
      if (zoom >= ZOOM_CELDAS) {
        L.polyline(delSistema.flatMap(celdas), { renderer, interactive: false, color: '#3f5f97', weight: 0.6, opacity: 0.9 }).addTo(grupo)
      }
    }
  }, [rectangulos, ocupados, zoom])

  const irA = (posicion) => mapa.current.setView(posicion, Math.max(mapa.current.getZoom(), ZOOM_SITIO))

  const ubicar = () => {
    if (!navigator.geolocation) return setAviso('Este dispositivo no ofrece geolocalización.')
    setAviso('')
    setOcupado('gps')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        irA([coords.latitude, coords.longitude])
        setOcupado(null)
      },
      (error) => {
        setAviso(
          error.code === error.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado. Actívalo en el navegador (requiere HTTPS o localhost).'
            : 'No se pudo obtener la ubicación.',
        )
        setOcupado(null)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const buscar = async (evento) => {
    evento.preventDefault()
    if (!busqueda.trim()) return
    setAviso('')
    const coordenadas = comoCoordenadas(busqueda)
    if (coordenadas) return irA(coordenadas)
    setOcupado('busqueda')
    try {
      const respuesta = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(busqueda)}`)
      const [lugar] = await respuesta.json()
      if (lugar) irA([Number(lugar.lat), Number(lugar.lon)])
      else setAviso('No se encontró esa dirección. Prueba con coordenadas: 18.4861, -69.9312')
    } catch {
      setAviso('No se pudo consultar el buscador. Revisa la conexión o usa coordenadas.')
    } finally {
      setOcupado(null)
    }
  }

  const terminar = () => {
    setDibujando(false)
    setCursor(null)
  }

  const area = enCurso?.areaM2 || medidas.areaM2

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form onSubmit={buscar} className="flex min-w-56 flex-1 gap-2">
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Dirección, sitio o coordenadas (lat, lng)"
            aria-label="Buscar dirección o coordenadas"
            className={`${inputClass} font-sans`}
          />
          <button type="submit" disabled={ocupado === 'busqueda'} className={boton}>
            {ocupado === 'busqueda' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
            Buscar
          </button>
        </form>
        <button type="button" onClick={ubicar} disabled={ocupado === 'gps'} className={`${boton} border-accent/50 text-accent hover:border-accent hover:text-accent`}>
          {ocupado === 'gps' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Crosshair className="size-4" aria-hidden="true" />}
          Usar mi ubicación GPS
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {dibujando ? (
          <button type="button" onClick={terminar} disabled={vertices.length < 3} className={`${boton} border-accent bg-accent/15 text-accent hover:border-accent hover:text-accent`}>
            <Check className="size-4" aria-hidden="true" />
            Finalizar Techo
          </button>
        ) : (
          <button type="button" onClick={() => setDibujando(true)} className={boton}>
            <PenLine className="size-4" aria-hidden="true" />
            {vertices.length ? 'Seguir trazando' : 'Trazar techo'}
          </button>
        )}
        <button type="button" onClick={() => onVertices(vertices.slice(0, -1))} disabled={vertices.length === 0} className={boton}>
          <Undo2 className="size-4" aria-hidden="true" />
          Deshacer último punto
        </button>
        <button
          type="button"
          onClick={() => {
            onVertices([])
            terminar()
          }}
          disabled={vertices.length === 0}
          className={boton}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Limpiar
        </button>
        {onCapa && <Toggle value={capa} options={Object.entries(FUENTES).map(([id, fuente]) => [id, fuente.nombre])} onChange={onCapa} className="ml-auto" />}
      </div>

      {aviso && (
        <p role="alert" className="mb-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {aviso}
        </p>
      )}

      {/* La clase de "dibujando" va en el envoltorio: Leaflet gestiona las clases de su contenedor
          y React las borraría al reescribir className (el mapa quedaba roto al pulsar «Trazar techo»). */}
      <div className={`relative ${dibujando ? 'mapa-dibujando' : ''}`}>
        <div ref={contenedor} className="h-[30rem] w-full overflow-hidden rounded border border-line" />
        {vertices.length >= 2 && (
          <p className="pointer-events-none absolute right-3 top-3 z-[500] rounded border border-line-strong bg-base/90 px-3 py-1.5 font-mono text-xs text-ink">
            {area > 0 && (
              <>
                Área <span className="text-accent">{area.toFixed(1)} m²</span> ·{' '}
              </>
            )}
            Perímetro {metros((enCurso ?? medidas).perimetro)}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        {dibujando
          ? 'Clic en cada esquina del techo. Para terminar: doble clic, clic en el primer punto o «Finalizar Techo».'
          : cerrado
            ? 'Arrastra un vértice para moverlo, doble clic para quitarlo, o toca la cota de un lado para añadir uno.'
            : 'Ubica el sitio con el buscador o el GPS y pulsa «Trazar techo».'}
      </p>
    </div>
  )
}
