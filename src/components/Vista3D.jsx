import { useEffect, useRef, useState } from 'react'
import { Camera, CircleCheck, LayoutGrid, LoaderCircle, RotateCcw, ScanEye, SlidersHorizontal, X } from 'lucide-react'
import { guardarCaptura3d } from '../lib/captura3d.js'
import { crearEscena } from '../lib/escena3d.js'
import { componerTerreno } from '../lib/mapaEstatico.js'
import { NumberField } from './campos.jsx'

const boton =
  'flex items-center gap-2 rounded border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50'

// Visor 3D del sistema a pantalla completa: terreno con la imagen satelital, edificio extruido con
// cotas en las aristas y los paneles sobre el techo. Se gira, acerca y ladea con ratón o dedos.
// El panel «Agrupación» ajusta aquí mismo los pasillos de inspección y la altura del edificio, y en
// «Acomodar paneles» cada toque sobre una posición del techo pone o quita un panel.
// «Capturar Render 3D» guarda la imagen para la portada de la propuesta.
//   plano, inclinacion, azimut, altura: geometría (ver lib/geometria.js) · capa: imágenes del terreno
//   ocupados: índices de las posiciones con panel · requeridos: paneles que pide el sistema
//   potenciaWp: del panel, para el rótulo · acomodoManual: si el usuario ya movió paneles
//   ajustes: { pasilloCadaPaneles, pasilloPanelesCm, pasilloCadaFilas, pasilloFilasCm, altura } tal como
//     están escritos en el proyecto · onAjustes(cambios): los modifica
//   onAlternar(indice), onRellenoAutomatico(), onUsarColocados(): acciones del modo de acomodo
export default function Vista3D({
  plano,
  ocupados,
  requeridos,
  potenciaWp,
  inclinacion,
  azimut,
  altura,
  capa,
  acomodoManual,
  ajustes,
  onAjustes,
  onAlternar,
  onRellenoAutomatico,
  onUsarColocados,
  onClose,
}) {
  const contenedor = useRef(null)
  const cubo = useRef(null)
  const escena = useRef(null)
  const acciones = useRef({})
  const terrenoGuardado = useRef(null) // { clave, terreno }: la imagen satelital no se vuelve a descargar
  const vistaGuardada = useRef(null)
  const [fase, setFase] = useState('cargando') // 'cargando' | 'lista' | 'error'
  const [error, setError] = useState('')
  const [sinTerreno, setSinTerreno] = useState(false)
  const [capturada, setCapturada] = useState(false)
  const [acomodando, setAcomodando] = useState(false)
  const [agrupando, setAgrupando] = useState(true)

  // La escena se crea una vez por geometría; estos valores cambiantes se leen desde la referencia.
  acciones.current = { ocupados, onAlternar, acomodando }

  useEffect(() => {
    let vigente = true
    ;(async () => {
      // El terreno cubre varias veces el edificio para que el entorno se vea al orbitar. Solo depende
      // del sitio, así que al cambiar la agrupación o la altura se reutiliza el ya descargado.
      const radio = Math.max(...plano.poligono.map((p) => Math.hypot(p.x, p.y)))
      const clave = `${plano.origen.map((n) => n.toFixed(5))}|${capa}`
      if (terrenoGuardado.current?.clave !== clave) {
        terrenoGuardado.current = {
          clave,
          terreno: await componerTerreno({ centro: plano.origen, metrosMinimos: Math.max(120, radio * 7), capa }).catch(() => null),
        }
      }
      if (!vigente) return
      try {
        escena.current = crearEscena(contenedor.current, {
          plano,
          ocupados: acciones.current.ocupados,
          alAlternar: (indice) => acciones.current.onAlternar(indice),
          inclinacion,
          azimut,
          altura,
          terreno: terrenoGuardado.current.terreno,
          cuboContenedor: cubo.current,
          vista: vistaGuardada.current,
        })
        escena.current.setEdicion(acciones.current.acomodando)
        setSinTerreno(!terrenoGuardado.current.terreno)
        setFase('lista')
      } catch (fallo) {
        setError(fallo.message)
        setFase('error')
      }
    })()
    return () => {
      vigente = false
      // Se recuerda el punto de vista para que la siguiente escena no mueva la cámara.
      if (escena.current) vistaGuardada.current = escena.current.leerVista()
      escena.current?.destruir()
      escena.current = null
    }
  }, [plano, inclinacion, azimut, altura, capa])

  // Poner o quitar paneles y entrar o salir del modo de acomodo no reconstruyen la escena.
  useEffect(() => {
    escena.current?.actualizarOcupados(ocupados)
  }, [ocupados])
  useEffect(() => {
    escena.current?.setEdicion(acomodando)
  }, [acomodando])

  useEffect(() => {
    const alTeclear = (evento) => evento.key === 'Escape' && onClose()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onClose])

  const capturar = () => {
    guardarCaptura3d({ imagen: escena.current.capturar(), paneles: ocupados.length, fecha: new Date().toISOString() })
    setCapturada(true)
  }

  const colocados = ocupados.length
  const lista = fase === 'lista'

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
          <button
            type="button"
            onClick={() => setAgrupando(!agrupando)}
            aria-pressed={agrupando}
            className={agrupando ? `${boton} border-accent bg-accent/15 text-accent` : boton}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Agrupación
          </button>
          <button
            type="button"
            onClick={() => setAcomodando(!acomodando)}
            aria-pressed={acomodando}
            disabled={!lista}
            className={acomodando ? `${boton} border-accent bg-accent/15 text-accent` : boton}
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
            {acomodando ? 'Terminar acomodo' : 'Acomodar paneles'}
          </button>
          <button type="button" onClick={() => escena.current.vistaSuperior()} disabled={!lista} className={boton}>
            <ScanEye className="size-4" aria-hidden="true" />
            Vista superior
          </button>
          <button
            type="button"
            onClick={capturar}
            disabled={!lista}
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
        <div ref={contenedor} className={`absolute inset-0 touch-none overflow-hidden ${acomodando ? 'cursor-pointer' : ''}`} />
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

        {/* Columna de controles sobre la escena: conteo, agrupación y acomodo. */}
        <div className="pointer-events-none absolute left-3 top-3 flex max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto">
          {lista && (
            <p className="pointer-events-auto rounded border border-line-strong bg-base/90 px-3 py-2 font-mono text-sm text-ink">
              <span className="text-accent">{colocados} módulos</span> · {((colocados * potenciaWp) / 1000).toFixed(2)} kWp
              <span className="mt-0.5 block font-sans text-xs text-ink-muted">Caben {plano.paneles.length} con esta agrupación.</span>
            </p>
          )}

          {agrupando && (
            <div className="pointer-events-auto rounded border border-line-strong bg-base/90 px-3 py-3">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">Agrupación de paneles</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Cada N paneles"
                  value={ajustes.pasilloCadaPaneles}
                  options={[2, 3, 4, 6]}
                  placeholder="—"
                  onChange={(pasilloCadaPaneles) => onAjustes({ pasilloCadaPaneles })}
                />
                <NumberField
                  label="Separación"
                  unit="cm"
                  value={ajustes.pasilloPanelesCm}
                  options={[30, 40, 50]}
                  placeholder="40"
                  onChange={(pasilloPanelesCm) => onAjustes({ pasilloPanelesCm })}
                />
                <NumberField
                  label="Cada N filas"
                  value={ajustes.pasilloCadaFilas}
                  options={[1, 2, 3, 4]}
                  placeholder="—"
                  onChange={(pasilloCadaFilas) => onAjustes({ pasilloCadaFilas })}
                />
                <NumberField
                  label="Separación"
                  unit="cm"
                  value={ajustes.pasilloFilasCm}
                  options={[30, 40, 50]}
                  placeholder="50"
                  onChange={(pasilloFilasCm) => onAjustes({ pasilloFilasCm })}
                />
                <NumberField
                  label="Altura edificio"
                  unit="m"
                  value={ajustes.altura}
                  options={[3, 4, 5, 6, 8]}
                  placeholder="5"
                  onChange={(valor) => onAjustes({ altura: valor })}
                />
              </div>
              <p className="mt-2 text-xs text-ink-dim">
                Deja un pasillo cada cierto número de paneles a lo largo de la fila y cada cierto número de filas. Vacío: solo los 2 cm normales.
              </p>
            </div>
          )}

          {lista && acomodando && (
            <div className="pointer-events-auto rounded border border-line-strong bg-base/90 px-3 py-2 text-xs text-ink-muted">
              <p>Toca una posición naranja para poner un panel, o un panel para quitarlo.</p>
              {colocados !== requeridos && (
                <p className="mt-1 text-warn">
                  El sistema está dimensionado con {requeridos} paneles y hay {colocados} colocados.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {colocados !== requeridos && colocados > 0 && (
                  <button type="button" onClick={onUsarColocados} className="rounded bg-accent px-2 py-1 font-medium text-black hover:bg-accent-strong">
                    Usar {colocados} paneles en el sistema
                  </button>
                )}
                {acomodoManual && (
                  <button type="button" onClick={onRellenoAutomatico} className="flex items-center gap-1 rounded border border-line-strong px-2 py-1 text-ink hover:border-accent">
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Relleno automático
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

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
