import { useEffect, useRef, useState } from 'react'
import { Camera, CircleCheck, X } from 'lucide-react'
import { guardarCaptura3d } from '../lib/captura3d.js'
import { crearEscena } from '../lib/escena3d.js'

const boton =
  'flex items-center gap-2 rounded border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent'

// Vista 3D del sistema a pantalla completa: techo inclinado con sus paneles, que se puede girar,
// acercar y ladear con el ratón o los dedos. «Capturar vista 3D» guarda la imagen para la propuesta.
//   plano, inclinacion, azimut: geometría del techo (ver lib/geometria.js) · usados: paneles del sistema
export default function Vista3D({ plano, usados, inclinacion, azimut, onClose }) {
  const contenedor = useRef(null)
  const escena = useRef(null)
  const [error, setError] = useState('')
  const [capturada, setCapturada] = useState(false)

  useEffect(() => {
    try {
      escena.current = crearEscena(contenedor.current, { plano, usados, inclinacion, azimut })
    } catch (fallo) {
      setError(fallo.message)
    }
    return () => {
      escena.current?.destruir()
      escena.current = null
    }
  }, [plano, usados, inclinacion, azimut])

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
            {usados} paneles · inclinación {inclinacion}° · azimut {Math.round(azimut)}°
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capturada && (
            <span role="status" className="flex items-center gap-1.5 text-xs text-ok">
              <CircleCheck className="size-4" aria-hidden="true" />
              Captura guardada: se incluirá en la propuesta
            </span>
          )}
          <button
            type="button"
            onClick={capturar}
            disabled={Boolean(error)}
            className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            <Camera className="size-4" aria-hidden="true" />
            Capturar vista 3D
          </button>
          <button type="button" onClick={onClose} className={boton}>
            <X className="size-4" aria-hidden="true" />
            Cerrar
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="m-4 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudo iniciar la vista 3D en este dispositivo ({error}).
        </p>
      ) : (
        <div ref={contenedor} className="relative min-h-0 flex-1 touch-none overflow-hidden" />
      )}

      <p className="border-t border-line bg-panel px-4 py-2 text-xs text-ink-muted">
        Arrastra para girar · rueda o pellizco para acercar · clic derecho o dos dedos para desplazar. El techo se
        representa como un agua inclinada sobre muros de 3 m; el entorno no se modela.
      </p>
    </div>
  )
}
