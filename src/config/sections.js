import { Database, Gauge, History, LayoutGrid, LineChart } from 'lucide-react'
import EquiposSection from '../sections/EquiposSection.jsx'
import HistorialSection from '../sections/HistorialSection.jsx'
import ConsumoSection from '../sections/ConsumoSection.jsx'
import DisenoSection from '../sections/DisenoSection.jsx'
import PropuestaSection from '../sections/PropuestaSection.jsx'

// Fuente única de las secciones principales: la navegación y el área de trabajo se generan desde aquí.
export const SECTIONS = [
  {
    id: 'equipos',
    label: 'Equipos & Base de Datos',
    description: 'Catálogo de módulos, inversores, baterías y estructuras.',
    icon: Database,
    component: EquiposSection,
  },
  {
    id: 'consumo',
    label: 'Consumo & Parámetros Eléctricos',
    description: 'Perfil de carga, tarifa y condiciones de la acometida.',
    icon: Gauge,
    component: ConsumoSection,
  },
  {
    id: 'diseno',
    label: 'Diseño de Techo & Arreglo',
    description: 'Geometría del techo, distribución de módulos y strings.',
    icon: LayoutGrid,
    component: DisenoSection,
  },
  {
    id: 'propuesta',
    label: 'Propuesta, Gráficas & ROI',
    description: 'Generación estimada, análisis financiero y entregable.',
    icon: LineChart,
    component: PropuestaSection,
  },
  {
    id: 'historial',
    label: 'Historial de Propuestas',
    description: 'Propuestas guardadas para reabrir, editar o copiar, y conexión con Google Sheets.',
    icon: History,
    component: HistorialSection,
  },
]
