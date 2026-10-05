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
    areaTecho: '', // m² escritos a mano; se usa solo si no hay techo trazado
    ajustarATecho: false, // recortar el cálculo automático a lo que cabe en el techo
    perfilSolar: 'panama', // reparto mensual de la irradiación (ver PERFILES_SOLARES)
    marcaPanel: '', // '' = cualquiera / óptimo
    marcaInversor: '',
    panelAutoId: '', // modelo fijado en el cálculo automático ('' = el óptimo de la marca)
    inversorAutoId: '',
    panelId: '',
    numPaneles: '',
  },
  // Techo trazado sobre el mapa satelital.
  techo: {
    vertices: [], // [[lat, lng], …]
    vista: null, // { centro: [lat, lng], zoom } del mapa, para reabrirlo en el mismo sitio
    fuenteMapa: 'google', // fuente de imágenes del mapa (ver lib/teselas.js)
    retranqueo: '0.5', // m libres desde los bordes
    orientacion: 'vertical', // 'vertical' (portrait) | 'horizontal' (landscape)
    inclinacion: '10', // °
    altura: '5', // m del suelo al borde bajo del techo (solo para la vista 3D)
    azimut: '', // ° ; vacío = estimado a partir del trazo
    // Pasillos de inspección: cada N paneles a lo largo de la fila, y cada N filas, una separación en cm.
    pasilloCadaPaneles: '',
    pasilloPanelesCm: '',
    pasilloCadaFilas: '',
    pasilloFilasCm: '',
    // Paneles colocados a mano en la vista 3D: { firma, indices } sobre las posiciones del empaquetado.
    // La firma identifica la cuadrícula; si esta cambia (otro panel, retranqueo…), el acomodo se descarta.
    acomodo: null,
  },
  // marca: clave de config/brands.js · autor: clave de config/authors.js
  // moneda: símbolo con el que salen los montos en el PDF (el balboa va a la par del dólar)
  propuesta: { id: '', marca: 'solar-5-estrellas', autor: 'jesus-ariza', cliente: '', direccion: '', moneda: 'B/.' },
  finanzas: {
    precioWp: '', // $/Wp instalado
    bateriaId: '', // batería del catálogo incluida en la propuesta
    bateriaCantidad: '1',
    costoBaterias: '', // costo adicional por almacenamiento
    inflacion: '3', // % anual del costo de la energía
    descuento: '8', // % anual para el valor actual neto
    validezDias: '15', // vigencia de la propuesta
    degradacion: '0.5', // % anual del módulo
    factorCo2: '0.5', // kg CO₂ por kWh
  },
}

const store = createStore('sds.proyecto.v1', PROYECTO_INICIAL)

const actualizar = (seccion, cambios) => store.set((prev) => ({ ...prev, [seccion]: { ...prev[seccion], ...cambios } }))
const reiniciar = () => store.set(PROYECTO_INICIAL)

// Sustituye el proyecto entero por uno guardado (historial). Se mezcla sección por sección con el
// estado inicial para que una propuesta antigua, sin los campos más nuevos, cargue sin romperse.
export const reemplazarProyecto = (datos) =>
  store.set(Object.fromEntries(Object.entries(PROYECTO_INICIAL).map(([seccion, valor]) => [seccion, { ...valor, ...datos?.[seccion] }])))
export const limpiarProyecto = reiniciar

// Lectura directa del estado actual, para efectos que no deben fiarse del valor capturado en el render.
export const leerProyecto = store.get

export function useProyecto() {
  const proyecto = useSyncExternalStore(store.subscribe, store.get)
  return { proyecto, actualizar, reiniciar }
}
