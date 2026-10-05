import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, LoaderCircle, PenLine, Search, Trash2, Undo2 } from 'lucide-react'
import { inputClass } from './campos.jsx'

const TESELAS = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const VISTA_INICIAL = { centro: [15, -75], zoom: 4 }
const ZOOM_SITIO = 19

const boton =
  'flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50'

const vertice = L.divIcon({ className: 'vertice-techo', iconSize: [14, 14] })

// "18.4861, -69.9312" o "18.4861 -69.9312"
function comoCoordenadas(texto) {
  const partes = texto.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!partes) return null
  const [lat, lng] = [Number(partes[1]), Number(partes[2])]
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null
}

// Mapa satelital con trazado del techo. No guarda estado propio del trazo: recibe `vertices` y avisa
// cada cambio con `onVertices`, para que el polígono viva en el estado compartido del proyecto.
//   rectangulos: paneles que caben (cada uno, 4 [lat, lng]) · usados: cuántos ocupa el sistema
//   vista / onVista: centro y zoom recordados
export default function MapaTecho({ vertices, onVertices, rectangulos, usados = rectangulos.length, vista, onVista }) {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const capas = useRef(null)
  const estado = useRef({ vertices, dibujando: false, onVertices, onVista })
  const [dibujando, setDibujando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [ocupado, setOcupado] = useState(null) // 'gps' | 'busqueda'
  const [aviso, setAviso] = useState('')

  // Los manejadores de Leaflet se registran una vez; leen siempre lo último desde esta referencia.
  estado.current = { vertices, dibujando, onVertices, onVista }

  useEffect(() => {
    const inicio = vista ?? VISTA_INICIAL
    const instancia = L.map(contenedor.current, { center: inicio.centro, zoom: inicio.zoom, maxZoom: 22, doubleClickZoom: false })
    L.tileLayer(TESELAS, { maxNativeZoom: 19, maxZoom: 22, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' }).addTo(instancia)
    capas.current = { paneles: L.layerGroup().addTo(instancia), techo: L.layerGroup().addTo(instancia) }
    instancia.on('click', (evento) => {
      const actual = estado.current
      if (actual.dibujando) actual.onVertices([...actual.vertices, [evento.latlng.lat, evento.latlng.lng]])
    })
    instancia.on('moveend', () => {
      const centro = instancia.getCenter()
      estado.current.onVista({ centro: [centro.lat, centro.lng], zoom: instancia.getZoom() })
    })
    if (!vista && estado.current.vertices.length >= 2) instancia.fitBounds(estado.current.vertices, { maxZoom: 20 })
    mapa.current = instancia
    return () => instancia.remove()
    // Solo al montar: la vista inicial no debe recrear el mapa cuando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redibuja el contorno y los vértices arrastrables cada vez que cambia el trazo.
  useEffect(() => {
    const grupo = capas.current.techo
    grupo.clearLayers()
    if (vertices.length >= 2) {
      const forma = vertices.length >= 3 && !dibujando ? L.polygon : L.polyline
      forma(vertices, { color: '#f59e0b', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(grupo)
    }
    vertices.forEach((posicion, indice) => {
      const marcador = L.marker(posicion, { icon: vertice, draggable: true, title: `Vértice ${indice + 1}` }).addTo(grupo)
      marcador.on('dragend', () => {
        const { lat, lng } = marcador.getLatLng()
        estado.current.onVertices(estado.current.vertices.map((actual, i) => (i === indice ? [lat, lng] : actual)))
      })
    })
  }, [vertices, dibujando])

  useEffect(() => {
    const grupo = capas.current.paneles
    grupo.clearLayers()
    // Un solo multipolígono por grupo (cada rectángulo es un anillo propio), más liviano que cientos de capas.
    const dibujar = (lista, estilo) => {
      if (lista.length) L.polygon(lista.map((rectangulo) => [rectangulo]), { weight: 1, interactive: false, ...estilo }).addTo(grupo)
    }
    // Los primeros `usados` son los del sistema; el resto es espacio libre que aún admite paneles.
    dibujar(rectangulos.slice(0, usados), { color: '#e6e9ef', fillColor: '#3987e5', fillOpacity: 0.8 })
    dibujar(rectangulos.slice(usados), { color: '#e6e9ef', opacity: 0.6, fillColor: '#e6e9ef', fillOpacity: 0.12 })
  }, [rectangulos, usados])

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
        setAviso(error.code === error.PERMISSION_DENIED ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.')
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
        <button type="button" onClick={ubicar} disabled={ocupado === 'gps'} className={boton}>
          {ocupado === 'gps' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Crosshair className="size-4" aria-hidden="true" />}
          Ubicación actual (GPS)
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDibujando(!dibujando)}
          aria-pressed={dibujando}
          className={dibujando ? `${boton} border-accent bg-accent/15 text-accent hover:border-accent hover:text-accent` : boton}
        >
          <PenLine className="size-4" aria-hidden="true" />
          {dibujando ? 'Terminar trazo' : vertices.length ? 'Agregar vértices' : 'Trazar techo'}
        </button>
        <button type="button" onClick={() => onVertices(vertices.slice(0, -1))} disabled={vertices.length === 0} className={boton}>
          <Undo2 className="size-4" aria-hidden="true" />
          Deshacer
        </button>
        <button
          type="button"
          onClick={() => {
            onVertices([])
            setDibujando(false)
          }}
          disabled={vertices.length === 0}
          className={boton}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Borrar
        </button>
        <p className="text-xs text-ink-dim">
          {dibujando
            ? 'Toca cada esquina del techo en orden y pulsa «Terminar trazo».'
            : vertices.length >= 3
              ? 'Arrastra un vértice para ajustar el contorno.'
              : 'Ubica el sitio y pulsa «Trazar techo».'}
        </p>
      </div>

      {aviso && (
        <p role="alert" className="mb-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {aviso}
        </p>
      )}

      <div ref={contenedor} className={`h-[26rem] w-full overflow-hidden rounded border border-line ${dibujando ? 'cursor-crosshair' : ''}`} />
    </div>
  )
}
