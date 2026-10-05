import { BatteryCharging, Cpu, PanelTop } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import PendingList from '../components/PendingList.jsx'

export default function EquiposSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Módulos FV" icon={PanelTop}>
        <PendingList items={['Pmax, Voc, Isc, Vmp, Imp', 'Coeficientes de temperatura', 'Dimensiones y peso']} />
      </Panel>
      <Panel title="Inversores" icon={Cpu}>
        <PendingList items={['Potencia AC y relación DC/AC', 'Ventana MPPT y nº de entradas', 'Tensión y corriente máximas']} />
      </Panel>
      <Panel title="Almacenamiento" icon={BatteryCharging}>
        <PendingList items={['Capacidad útil (kWh)', 'Potencia de carga / descarga', 'Profundidad de descarga y ciclos']} />
      </Panel>
    </div>
  )
}
