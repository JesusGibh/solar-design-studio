import { Cable, Compass, Ruler } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import PendingList from '../components/PendingList.jsx'

export default function DisenoSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Lienzo de techo" icon={Ruler} className="lg:col-span-2">
        <div className="bg-blueprint flex h-72 items-center justify-center rounded border border-dashed border-line-strong">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-dim">
            Área de dibujo · pendiente
          </p>
        </div>
      </Panel>
      <div className="grid gap-4">
        <Panel title="Orientación" icon={Compass}>
          <PendingList items={['Azimut e inclinación', 'Retiros y obstrucciones', 'Separación entre filas']} />
        </Panel>
        <Panel title="Strings" icon={Cable}>
          <PendingList items={['Módulos por string', 'Verificación Voc / Vmp por temperatura', 'Asignación a MPPT']} />
        </Panel>
      </div>
    </div>
  )
}
