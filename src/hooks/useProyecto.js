import { useSyncExternalStore } from 'react'
import { createStore } from '../lib/store.js'

// Estado del proyecto compartido entre módulos (Consumo, Diseño, Propuesta) y guardado en localStorage.
// Los valores numéricos se guardan tal como se escriben en el formulario ('' = sin dato);
// para calcular usa los helpers de lib/ (consumo, electrico, dimensionamiento, finanzas), que ya los convierten.
export const PROYECTO_INICIAL = {
  red: { tension: 'mono_120_240', interruptorA: '', transformadorKva: '' },
  consumo: {
    modo: 'mensual', // 'mensual' | 'anual' | 'detallado'
    promedioKwh: '', // kWh/mes (modo mensual)
    anualKwh: '', // kWh/año (modo anual)
    tarifa: '', // $/kWh que paga el cliente
    meses: Array.from({ length: 12 }, () => ({ kwh: '', costo: '' })),
  },
  // Inversor y panel elegidos en el modo personalizado.
  inversor: { id: '', cantidad: '1' },
  dimensionamiento: {
    modo: 'auto', // 'auto' | 'manual'
    hsp: '4.2',
    cobertura: '100', // % del consumo anual que debe cubrir el sistema
    pr: '0.8',
    tempMin: '10',
    areaTecho: '',
    marcaPanel: '', // '' = cualquiera / óptimo
    marcaInversor: '',
    panelId: '',
    numPaneles: '',
  },
  finanzas: {
    precioWp: '', // $/Wp instalado
    costoBaterias: '', // costo adicional por almacenamiento
    inflacion: '3', // % anual del costo de la energía
    degradacion: '0.5', // % anual del módulo
    factorCo2: '0.5', // kg CO₂ por kWh
  },
}

const store = createStore('sds.proyecto.v1', PROYECTO_INICIAL)

const actualizar = (seccion, cambios) => store.set((prev) => ({ ...prev, [seccion]: { ...prev[seccion], ...cambios } }))
const reiniciar = () => store.set(PROYECTO_INICIAL)

export function useProyecto() {
  const proyecto = useSyncExternalStore(store.subscribe, store.get)
  return { proyecto, actualizar, reiniciar }
}
