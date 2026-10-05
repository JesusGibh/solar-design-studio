import { useSyncExternalStore } from 'react'
import { createStore } from '../lib/store.js'

// Estado del proyecto compartido entre módulos (Consumo, Diseño, Propuesta) y guardado en localStorage.
// Los valores numéricos se guardan tal como se escriben en el formulario ('' = sin dato);
// para calcular usa los helpers de lib/consumo.js y lib/electrico.js, que ya los convierten.
export const PROYECTO_INICIAL = {
  red: { tension: 'mono_120_240', interruptorA: '', barraA: '', transformadorKva: '' },
  consumo: {
    modo: 'rapido', // 'rapido' | 'detallado'
    promedioKwh: '',
    costoMensual: '',
    meses: Array.from({ length: 12 }, () => ({ kwh: '', costo: '' })),
  },
  // Inversor y panel elegidos en el modo personalizado.
  inversor: { id: '', cantidad: '1' },
  dimensionamiento: {
    modo: 'auto', // 'auto' | 'manual'
    hsp: '4.2',
    pr: '0.8',
    tempMin: '10',
    areaTecho: '',
    panelId: '',
    numPaneles: '',
  },
}

const store = createStore('sds.proyecto.v1', PROYECTO_INICIAL)

const actualizar = (seccion, cambios) => store.set((prev) => ({ ...prev, [seccion]: { ...prev[seccion], ...cambios } }))
const reiniciar = () => store.set(PROYECTO_INICIAL)

export function useProyecto() {
  const proyecto = useSyncExternalStore(store.subscribe, store.get)
  return { proyecto, actualizar, reiniciar }
}
