import { Suspense, lazy, useState } from 'react'
import { Box, Map, Ruler } from 'lucide-react'
import Dimensionador from '../components/Dimensionador.jsx'
import Panel from '../components/Panel.jsx'
import { NumberField, Stat, Toggle, fmt, labelClass } from '../components/campos.jsx'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { guardarCaptura3d, useCaptura3d } from '../lib/captura3d.js'
import { FRACCION_TECHO_UTIL, areaPanelM2, maxPanelesEnTecho } from '../lib/dimensionamiento.js'
import { puntoCardinal } from '../lib/geometria.js'

// Leaflet solo se descarga al entrar a este módulo, y Three.js al abrir la vista 3D.
const MapaTecho = lazy(() => import('../components/MapaTecho.jsx'))
const Vista3D = lazy(() => import('../components/Vista3D.jsx'))

const ORIENTACIONES = [
  ['vertical', 'Vertical (portrait)'],
  ['horizontal', 'Horizontal (landscape)'],
]

export default function DisenoSection() {
  const {
    proyecto,
    actualizar,
    parametros,
    sistema,
    techo,
    ocupados,
    acomodoManual,
    alternarPanel,
    rellenoAutomatico,
    usarColocados,
    maximoTecho,
    excesoTecho,
    ajustarAlTecho,
  } = useDimensionamiento()
  const datos = proyecto.techo
  const panel = sistema?.panel
  const cambiar = (cambios) => actualizar('techo', cambios)
  const trazado = datos.vertices.length >= 3
  const usados = ocupados.length
  const [vista3d, setVista3d] = useState(false)
  const captura = useCaptura3d()

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      {vista3d && techo && (
        <Suspense fallback={null}>
          <Vista3D
            plano={techo.plano}
            ocupados={ocupados}
            requeridos={sistema?.numPaneles ?? 0}
            potenciaWp={panel?.potencia_wp ?? 0}
            acomodoManual={acomodoManual}
            ajustes={datos}
            onAjustes={cambiar}
            onAlternar={alternarPanel}
            onRellenoAutomatico={rellenoAutomatico}
            onUsarColocados={usarColocados}
            inclinacion={Math.min(60, Math.max(0, Number(datos.inclinacion) || 0))}
            azimut={techo.azimut}
            altura={Math.min(40, Math.max(2, Number(datos.altura) || 5))}
            capa={datos.fuenteMapa}
            onClose={() => setVista3d(false)}
          />
        </Suspense>
      )}
      <div className="grid grid-cols-1 gap-4 lg:col-span-3">
        <Panel title="Mapa satelital y trazado del techo" icon={Map}>
          <Suspense fallback={<div className="flex h-[26rem] items-center justify-center text-sm text-ink-dim">Cargando mapa…</div>}>
            <MapaTecho
              vertices={datos.vertices}
              onVertices={(vertices) => cambiar({ vertices })}
              rectangulos={techo?.rectangulos ?? []}
              ocupados={ocupados}
              vista={datos.vista}
              onVista={(vista) => cambiar({ vista })}
              capa={datos.fuenteMapa}
              onCapa={(fuenteMapa) => cambiar({ fuenteMapa })}
            />
          </Suspense>
          {trazado && techo?.cantidad != null && (
            <>
              <p className="mt-3 rounded border border-line bg-base px-3 py-2 font-mono text-sm text-ink">
                Caben <span className="text-accent">{techo.cantidad} paneles</span> en este techo | Capacidad:{' '}
                <span className="text-accent">{fmt((techo.cantidad * panel.potencia_wp) / 1000, 2)} kWp</span>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border border-[#d5dbe3] bg-[#0b1a36]" aria-hidden="true" />
                  Paneles del sistema ({usados})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border border-dashed border-ink-muted bg-ink/10" aria-hidden="true" />
                  Espacio libre para más paneles ({techo.cantidad - usados})
                </span>
              </p>
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setVista3d(true)}
              disabled={!techo?.cantidad}
              className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              <Box className="size-4" aria-hidden="true" />
              Vista 3D del Sistema
            </button>
            {!techo?.cantidad ? (
              <p className="text-xs text-ink-dim">Traza el techo y define el panel para ver y acomodar los paneles en 3D.</p>
            ) : captura ? (
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <img src={captura.imagen} alt="Captura 3D guardada" className="h-12 rounded border border-line" />
                <span>
                  Captura 3D guardada para la propuesta
                  {captura.paneles !== usados && <span className="text-warn"> · es de un diseño de {captura.paneles} paneles: vuelve a capturar</span>}
                </span>
                <button type="button" onClick={() => guardarCaptura3d(null)} className="underline hover:text-ink">
                  Quitar
                </button>
              </div>
            ) : (
              <p className="text-xs text-ink-dim">Ábrela y pulsa «Capturar Render 3D» para llevarla a la portada de la propuesta.</p>
            )}
          </div>
          {excesoTecho > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <p>
                El sistema requiere {maximoTecho + excesoTecho} paneles y solo caben {maximoTecho}.
              </p>
              <button
                type="button"
                onClick={ajustarAlTecho}
                className="rounded border border-danger/50 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-danger/20"
              >
                Ajustar diseño a capacidad física del techo
              </button>
            </div>
          )}
        </Panel>

        <Panel title="Techo y restricciones" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Área en planta" value={fmt(techo?.areaM2 ?? parametros.areaTecho)} unit="m²" />
            <Stat label="Superficie inclinada" value={fmt(techo?.areaInclinadaM2)} unit="m²" />
            <Stat label="Azimut" value={techo ? fmt(techo.azimut, 0) : '—'} unit={techo ? `° ${puntoCardinal(techo.azimut)}` : '°'} />
            <Stat
              label="Caben hasta"
              value={fmt(maximoTecho, 0)}
              unit={maximoTecho != null && panel ? `paneles · ${fmt((maximoTecho * panel.potencia_wp) / 1000, 2)} kWp` : 'paneles'}
            />
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="azimut-arreglo" className={`${labelClass} mb-0`}>
                Azimut del arreglo · {techo ? `${fmt(techo.azimut, 0)}° ${puntoCardinal(techo.azimut)}` : '—'}
                {datos.azimut === '' && techo ? ' (automático)' : ''}
              </label>
              <button
                type="button"
                onClick={() => cambiar({ azimut: '' })}
                disabled={datos.azimut === ''}
                className="rounded border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                Alinear con el borde más largo
              </button>
            </div>
            <input
              id="azimut-arreglo"
              type="range"
              min="0"
              max="359"
              step="1"
              value={techo ? Math.round(techo.azimut) % 360 : 180}
              disabled={!techo}
              onChange={(event) => cambiar({ azimut: event.target.value })}
              className="mt-2 w-full accent-accent"
            />
            <div className="flex justify-between font-mono text-[10px] text-ink-dim">
              <span>N 0°</span>
              <span>E 90°</span>
              <span>S 180°</span>
              <span>O 270°</span>
              <span>359°</span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className={labelClass}>Orientación de los módulos</legend>
              <Toggle value={datos.orientacion} options={ORIENTACIONES} onChange={(orientacion) => cambiar({ orientacion })} />
            </fieldset>
            <NumberField
              label="Retranqueo de bordes"
              unit="m"
              value={datos.retranqueo}
              placeholder="0.5"
              hint="Franja libre para seguridad y mantenimiento."
              onChange={(retranqueo) => cambiar({ retranqueo })}
            />
            <NumberField
              label="Inclinación estimada"
              unit="°"
              value={datos.inclinacion}
              placeholder="10"
              hint="Acorta en planta el lado del panel que sube por la pendiente."
              onChange={(inclinacion) => cambiar({ inclinacion })}
            />
          </div>

          {!trazado && (
            <div className="mt-4 border-t border-line pt-4">
              <NumberField
                label="Área de techo sin trazar"
                unit="m²"
                value={proyecto.dimensionamiento.areaTecho}
                placeholder="120"
                hint={`Alternativa rápida al trazo: se usa el ${FRACCION_TECHO_UTIL * 100} % como área útil${
                  panel && maxPanelesEnTecho(parametros.areaTecho, panel) != null ? ` (${maxPanelesEnTecho(parametros.areaTecho, panel)} paneles)` : ''
                }.`}
                onChange={(areaTecho) => actualizar('dimensionamiento', { areaTecho })}
              />
            </div>
          )}

          <p className="mt-3 text-xs text-ink-dim">
            {panel
              ? areaPanelM2(panel)
                ? `Panel del sistema: ${panel.marca} ${panel.modelo}, ${panel.largo_mm} × ${panel.ancho_mm} mm. Las filas se alinean con el azimut, con 2 cm entre paneles.`
                : `La ficha de ${panel.marca} ${panel.modelo} no trae dimensiones: no se puede calcular cuántos caben.`
              : 'Define el sistema en Consumo (o elige un panel en modo personalizado) para llenar el techo con sus dimensiones reales.'}
          </p>
        </Panel>
      </div>

      <div className="lg:col-span-2">
        <Dimensionador />
      </div>
    </div>
  )
}
