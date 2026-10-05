import { BatteryCharging, Cpu, PanelTop, Power } from 'lucide-react'

// Fuente única de las categorías de equipos: de aquí salen las pestañas, las columnas de la tabla
// y el mapeo de encabezados al importar un CSV. Las claves son las del esquema de
// src/data/catalogo_equipos.json (lo genera scripts/procesar_fichas.js).
// type: 'text' | 'number' | 'list' (varios valores separados por ";") | 'enum' (se guarda en mayúsculas)
// tableHidden: el campo se importa pero se muestra combinado en otra columna (ver tableLabel / format).
const MARCA = { key: 'marca', label: 'Marca', type: 'text', aliases: ['brand', 'fabricante'] }
const MODELO = { key: 'modelo', label: 'Modelo', type: 'text', aliases: ['model'] }

export const CATEGORIES = [
  {
    id: 'paneles',
    categoria: 'PANEL_SOLAR',
    label: 'Paneles',
    icon: PanelTop,
    fields: [
      MARCA,
      MODELO,
      { key: 'potencia_wp', label: 'Wp', type: 'number', aliases: ['pmax', 'potencia'] },
      { key: 'voc', label: 'Voc', unit: 'V', type: 'number' },
      { key: 'isc', label: 'Isc', unit: 'A', type: 'number' },
      { key: 'vmp', label: 'Vmp', unit: 'V', type: 'number', aliases: ['vmpp'] },
      { key: 'imp', label: 'Imp', unit: 'A', type: 'number', aliases: ['impp'] },
      {
        key: 'coef_temp_voc',
        label: 'Temp Coeff Voc',
        unit: '%/°C',
        type: 'number',
        aliases: ['coefvoc', 'tempcoeffvoc', 'betavoc', 'tcvoc'],
      },
      {
        key: 'largo_mm',
        label: 'Largo',
        unit: 'mm',
        type: 'number',
        aliases: ['l', 'length', 'alto'],
        tableLabel: 'Dimensiones L × W',
        format: (equipo) => joinPair(equipo.largo_mm, equipo.ancho_mm, ' × '),
      },
      { key: 'ancho_mm', label: 'Ancho', unit: 'mm', type: 'number', aliases: ['w', 'width'], tableHidden: true },
      { key: 'eficiencia', label: 'Eficiencia', unit: '%', type: 'number', aliases: ['efficiency'] },
      { key: 'peso_kg', label: 'Peso', unit: 'kg', type: 'number', aliases: ['weight'] },
    ],
  },
  {
    id: 'inversores',
    categoria: 'INVERSOR',
    label: 'Inversores',
    icon: Cpu,
    fields: [
      MARCA,
      MODELO,
      { key: 'potencia_ac_nominal_kw', label: 'Potencia AC', unit: 'kW', type: 'number', aliases: ['pac', 'kw', 'potencia'] },
      { key: 'tipo_red', label: 'Tensión de red', type: 'list', aliases: ['tension', 'tensionderedcompatible', 'red'] },
      {
        key: 'v_mppt_min',
        label: 'Vmppt min',
        unit: 'V',
        type: 'number',
        aliases: ['mpptmin'],
        tableLabel: 'Vmppt min – max',
        format: (equipo) => joinPair(equipo.v_mppt_min, equipo.v_mppt_max, ' – '),
      },
      { key: 'v_mppt_max', label: 'Vmppt max', unit: 'V', type: 'number', aliases: ['mpptmax'], tableHidden: true },
      { key: 'voc_max', label: 'Voc max', unit: 'V', type: 'number', aliases: ['vdcmax', 'vmaxdc'] },
      { key: 'mppt_num', label: 'N° MPPTs', type: 'number', aliases: ['mppt', 'mppts', 'nmppt', 'numeromppts'] },
      { key: 'isc_max_mppt', label: 'Isc max por MPPT', unit: 'A', type: 'number', aliases: ['iscmax'] },
      { key: 'corriente_max_salida_ac', label: 'I salida AC max', unit: 'A', type: 'number', aliases: ['iacmax'] },
    ],
  },
  {
    id: 'baterias',
    categoria: 'BATERIA',
    label: 'Baterías',
    icon: BatteryCharging,
    fields: [
      MARCA,
      MODELO,
      { key: 'capacidad_kwh', label: 'Capacidad', unit: 'kWh', type: 'number', aliases: ['kwh', 'energia'] },
      { key: 'voltaje_nominal_v', label: 'Voltaje', unit: 'V', type: 'number', aliases: ['tension', 'v', 'vnom'] },
      { key: 'tipo_quimica', label: 'Química', type: 'text', aliases: ['quimica', 'chemistry'] },
      { key: 'acoplamiento', label: 'Acoplamiento', type: 'enum', aliases: ['tipodeacoplamiento', 'acople'] },
      { key: 'potencia_max_descarga_kw', label: 'Descarga max', unit: 'kW', type: 'number', aliases: ['potenciadescarga'] },
    ],
  },
  {
    id: 'rsd',
    categoria: 'RSD',
    label: 'Rapid Shutdown',
    icon: Power,
    fields: [
      MARCA,
      MODELO,
      { key: 'max_input_current_a', label: 'Corriente de entrada max', unit: 'A', type: 'number', aliases: ['imax'] },
      { key: 'max_input_voltage_v', label: 'Voltaje de entrada max', unit: 'V', type: 'number', aliases: ['vmax'] },
      { key: 'canales', label: 'Canales', type: 'text', aliases: ['channels'] },
    ],
  },
]

export const getCategory = (id) => CATEGORIES.find((category) => category.id === id)

// Encabezado tal como aparece en la plantilla CSV, p. ej. "Voc (V)".
export const fieldHeader = (field) => (field.unit ? `${field.label} (${field.unit})` : field.label)

function joinPair(a, b, separator) {
  return a == null && b == null ? null : `${a ?? '—'}${separator}${b ?? '—'}`
}
