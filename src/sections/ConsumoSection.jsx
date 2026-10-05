import { Activity, PlugZap, Receipt } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import PendingList from '../components/PendingList.jsx'

export default function ConsumoSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Historial de consumo" icon={Activity}>
        <PendingList items={['kWh mensuales (12 meses)', 'Demanda máxima (kW)', 'Perfil horario de carga']} />
      </Panel>
      <Panel title="Tarifa" icon={Receipt}>
        <PendingList items={['Esquema tarifario', 'Costo por kWh y cargos fijos', 'Escalación anual']} />
      </Panel>
      <Panel title="Parámetros eléctricos" icon={PlugZap}>
        <PendingList items={['Tensión de servicio y nº de fases', 'Capacidad de la acometida', 'Protecciones y conductores']} />
      </Panel>
    </div>
  )
}
