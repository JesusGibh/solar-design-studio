import { BarChart3, FileText, TrendingUp } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import PendingList from '../components/PendingList.jsx'

export default function PropuestaSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Generación" icon={BarChart3}>
        <PendingList items={['Producción mensual estimada (kWh)', 'Generación vs. consumo', 'Rendimiento específico (kWh/kWp)']} />
      </Panel>
      <Panel title="Análisis financiero" icon={TrendingUp}>
        <PendingList items={['Inversión y costo por Wp', 'Payback, TIR y VAN', 'Flujo de caja a 25 años']} />
      </Panel>
      <Panel title="Entregable" icon={FileText}>
        <PendingList items={['Resumen ejecutivo', 'Lista de materiales', 'Exportación a PDF']} />
      </Panel>
    </div>
  )
}
