import { useEffect, useRef, useState } from 'react'
import { Camera, CircleCheck, LoaderCircle, ScanEye, X } from 'lucide-react'
import { guardarCaptura3d } from '../lib/captura3d.js'
import { crearEscena } from '../lib/escena3d.js'
import { componerTerreno } from '../lib/mapaEstatico.js'

const boton =
  'flex items-center gap-2 rounded border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent'

// Visor 3D del sistema a pantalla completa: terreno con la imagen satelital, edificio extruido con
// cotas en las aristas y los paneles sobre el techo. Se gira, acerca y ladea con ratón o dedos.
// «Capturar Render 3D» guarda la imagen para la portada de la propuesta.
//   plano, inclinacion, azimut, altura: geometría (ver lib/geometria.js) · usados: paneles del sistema
//   kwp: potencia del arreglo, para el rótulo · capa: fuente de imágenes del terreno
export default function Vista3D({ plano, usados, kwp, inclinacion, azimut, altura, capa, onClose }) {
  const contenedor = useRef(null)
  const cubo = useRef(null)
  const escena = useRef(null)
  const [fase, setFase] = useState('cargando') // 'cargando' | 'lista' | 'error'
  const [error, setError] = useState('')
  const [sinTerreno, setSinTerreno] = useState(false)
  const [capturada, setCapturada] = useState(false)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      // El terreno cubre varias veces el edificio para que el entorno se vea al orbitar.
      const radio = Math.max(...plano.poligono.map((p) => Math.hypot(p.x, p.y)))
      const terreno = await componerTerreno({ centro: plano.origen, metrosMinimos: Math.max(120, radio * 7), capa }).catch(() => null)
      if (!vigente) return
      try {
        escena.current = crearEscena(contenedor.current, { plano, usados, inclinacion, azimut, altura, terreno, cuboContenedor: cubo.current })
        setSinTerreno(!terreno)
        setFase('lista')
      } catch (fallo) {
        setError(fallo.message)
        setFase('error')
      }
    })()
    return () => {
      vigente = false
      escena.current?.destruir()
      escena.current = null
    }
  }, [plano, usados, inclinacion, azimut, altura, capa])

  useEffect(() => {
    const alTeclear = (evento) => evento.key === 'Escape' && onClose()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onClose])

  const capturar = () => {
    guardarCaptura3d({ imagen: escena.current.capturar(), paneles: usados, fecha: new Date().toISOString() })
    setCapturada(true)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Vista 3D del sistema" className="fixed inset-0 z-[2000] flex flex-col bg-base">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Vista 3D del Sistema</h2>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">
            Inclinación {inclinacion}° · azimut {Math.round(azimut)}° · altura {altura} m
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capturada && (
            <span role="status" className="flex items-center gap-1.5 text-xs text-ok">
              <CircleCheck className="size-4" aria-hidden="true" />
              Render guardado: irá en la portada de la propuesta
            </span>
          )}
          <button type="button" onClick={() => escena.current.vistaSuperior()} disabled={fase !== 'lista'} className={`${boton} disabled:opacity-50`}>
            <ScanEye className="size-4" aria-hidden="true" />
            Vista superior
          </button>
          <button
            type="button"
            onClick={capturar}
            disabled={fase !== 'lista'}
            className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            <Camera className="size-4" aria-hidden="true" />
            Capturar Render 3D
          </button>
          <button type="button" onClick={onClose} className={boton}>
            <X className="size-4" aria-hidden="true" />
            Cerrar
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={contenedor} className="absolute inset-0 touch-none overflow-hidden" />
        {fase === 'cargando' && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink-muted">
            <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />
            Preparando la escena y la imagen satelital…
          </p>
        )}
        {fase === 'error' && (
          <p role="alert" className="absolute inset-x-4 top-4 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            No se pudo iniciar la vista 3D en este dispositivo ({error}).
          </p>
        )}
        {fase === 'lista' && (
          <p className="pointer-events-none absolute left-3 top-3 rounded border border-line-strong bg-base/90 px-3 py-1.5 font-mono text-xs text-ink">
            <span className="text-accent">{usados} módulos</span> · {kwp.toFixed(2)} kWp
          </p>
        )}
        {/* Cubo de orientación: gira con la cámara, como en los CAD fotovoltaicos. */}
        <div ref={cubo} aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 size-24" />
      </div>

      <p className="border-t border-line bg-panel px-4 py-2 text-xs text-ink-muted">
        Arrastra para girar · rueda o pellizco para acercar · clic derecho o dos dedos para desplazar.
        {sinTerreno && ' No se pudo cargar la imagen satelital: el terreno se muestra liso.'}
      </p>
    </div>
  )
}
