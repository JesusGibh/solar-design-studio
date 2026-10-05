import { Suspense, lazy } from 'react'
import { Map, Ruler } from 'lucide-react'
import Dimensionador from '../components/Dimensionador.jsx'
import Panel from '../components/Panel.jsx'
import { NumberField, Stat, Toggle, fmt, labelClass } from '../components/campos.jsx'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { FRACCION_TECHO_UTIL, areaPanelM2, maxPanelesEnTecho } from '../lib/dimensionamiento.js'
import { puntoCardinal } from '../lib/geometria.js'

// Leaflet solo se descarga al entrar a este módulo.
const MapaTecho = lazy(() => import('../components/MapaTecho.jsx'))

const ORIENTACIONES = [
  ['vertical', 'Vertical (portrait)'],
  ['horizontal', 'Horizontal (landscape)'],
]

export default function DisenoSection() {
  const { proyecto, actualizar, parametros, sistema, techo, maximoTecho, excesoTecho, ajustarAlTecho } = useDimensionamiento()
  const datos = proyecto.techo
  const panel = sistema?.panel
  const cambiar = (cambios) => actualizar('techo', cambios)
  const trazado = datos.vertices.length >= 3
  const usados = Math.min(sistema?.numPaneles ?? 0, techo?.cantidad ?? 0)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="grid gap-4 lg:col-span-3">
        <Panel title="Mapa satelital y trazado del techo" icon={Map}>
          <Suspense fallback={<div className="flex h-[26rem] items-center justify-center text-sm text-ink-dim">Cargando mapa…</div>}>
            <MapaTecho
              vertices={datos.vertices}
              onVertices={(vertices) => cambiar({ vertices })}
              rectangulos={techo?.rectangulos ?? []}
              usados={usados}
              vista={datos.vista}
              onVista={(vista) => cambiar({ vista })}
            />
          </Suspense>
          {trazado && techo?.cantidad != null && (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: 'var(--color-serie-1)' }} aria-hidden="true" />
                Paneles del sistema ({usados})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm border border-ink-muted bg-ink/10" aria-hidden="true" />
                Espacio libre para más paneles ({techo.cantidad - usados})
              </span>
            </p>
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

          {excesoTecho > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <p>
                El sistema necesita {maximoTecho + excesoTecho} paneles y en el techo caben {maximoTecho}.
              </p>
              <button
                type="button"
                onClick={ajustarAlTecho}
                className="rounded border border-danger/50 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-danger/20"
              >
                Ajustar al máximo del techo
              </button>
            </div>
          )}

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
            <NumberField
              label="Azimut"
              unit="°"
              value={datos.azimut}
              placeholder={techo ? fmt(techo.azimut, 0) : 'Auto'}
              hint="Vacío: estimado como la perpendicular al lado más largo que mira al ecuador."
              onChange={(azimut) => cambiar({ azimut })}
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
