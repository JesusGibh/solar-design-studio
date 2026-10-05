import { Cable, Ruler } from 'lucide-react'
import Dimensionador from '../components/Dimensionador.jsx'
import Panel from '../components/Panel.jsx'
import PendingList from '../components/PendingList.jsx'
import { NumberField, Stat, fmt } from '../components/campos.jsx'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { FRACCION_TECHO_UTIL, areaPanelM2, maxPanelesEnTecho } from '../lib/dimensionamiento.js'

export default function DisenoSection() {
  const { proyecto, actualizar, parametros, sistema } = useDimensionamiento()
  const { areaTecho } = parametros
  const panel = sistema?.panel

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="grid gap-4 lg:col-span-3">
        <Panel title="Techo disponible" icon={Ruler}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Área de techo"
              unit="m²"
              value={proyecto.dimensionamiento.areaTecho}
              placeholder="120"
              hint="Área bruta de la cubierta. Se descuenta 15 % para pasillos y retiros."
              onChange={(valor) => actualizar('dimensionamiento', { areaTecho: valor })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Área útil" value={fmt(areaTecho && areaTecho * FRACCION_TECHO_UTIL)} unit="m²" />
              <Stat label="Paneles que caben" value={fmt(maxPanelesEnTecho(areaTecho, panel), 0)} />
            </div>
          </div>
          {panel && (
            <p className="mt-3 text-xs text-ink-dim">
              Con el panel {panel.marca} {panel.modelo}
              {areaPanelM2(panel)
                ? ` (${panel.largo_mm} × ${panel.ancho_mm} mm, ${fmt(areaPanelM2(panel), 2)} m²).`
                : ': su ficha no trae dimensiones, así que no se puede calcular cuántos caben.'}
            </p>
          )}
          <div className="bg-blueprint mt-4 flex h-56 items-center justify-center rounded border border-dashed border-line-strong">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-dim">
              Mapa satelital y trazado de polígono · pendiente
            </p>
          </div>
        </Panel>
        <Panel title="Próximamente en este módulo" icon={Cable}>
          <PendingList items={['Ubicación por GPS y trazado del techo sobre el mapa', 'Azimut, inclinación y obstrucciones', 'Asignación de strings a cada MPPT']} />
        </Panel>
      </div>

      <div className="lg:col-span-2">
        <Dimensionador />
      </div>
    </div>
  )
}
