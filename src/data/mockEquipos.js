import { slug } from '../lib/fichas/registros.js'

// Equipos populares de referencia. Complementan a catalogo_equipos.json (extraído de las fichas técnicas)
// y sirven de respaldo si ese catálogo está vacío. Mismo esquema que el JSON.
// Valores en STC tomados de fichas públicas; verificar contra la ficha técnica vigente antes de diseñar.
const PANELES = [
  { marca: 'Jinko Solar', modelo: 'Tiger Neo JKM580N-72HL4-V', potencia_wp: 580, voc: 51.47, isc: 14.37, vmp: 42.59, imp: 13.62, coef_temp_voc: -0.25, largo_mm: 2278, ancho_mm: 1134 },
  { marca: 'Jinko Solar', modelo: 'Tiger Neo JKM430N-54HL4-B', potencia_wp: 430, voc: 38.95, isc: 13.94, vmp: 32.37, imp: 13.28, coef_temp_voc: -0.25, largo_mm: 1722, ancho_mm: 1134 },
  { marca: 'Canadian Solar', modelo: 'HiKu6 CS6W-550MS', potencia_wp: 550, voc: 49.6, isc: 14.0, vmp: 41.7, imp: 13.2, coef_temp_voc: -0.27, largo_mm: 2278, ancho_mm: 1134 },
  { marca: 'Canadian Solar', modelo: 'TOPHiKu6 CS6W-580T', potencia_wp: 580, voc: 51.3, isc: 14.37, vmp: 42.8, imp: 13.56, coef_temp_voc: -0.25, largo_mm: 2278, ancho_mm: 1134 },
  { marca: 'LONGi', modelo: 'Hi-MO 5 LR5-72HPH-550M', potencia_wp: 550, voc: 49.8, isc: 13.98, vmp: 41.95, imp: 13.12, coef_temp_voc: -0.265, largo_mm: 2278, ancho_mm: 1134 },
  { marca: 'JA Solar', modelo: 'DeepBlue 3.0 JAM72S30-550/MR', potencia_wp: 550, voc: 49.9, isc: 14.0, vmp: 41.96, imp: 13.11, coef_temp_voc: -0.275, largo_mm: 2278, ancho_mm: 1134 },
  { marca: 'Trina Solar', modelo: 'Vertex TSM-DE19 550', potencia_wp: 550, voc: 38.1, isc: 18.52, vmp: 31.6, imp: 17.4, coef_temp_voc: -0.25, largo_mm: 2384, ancho_mm: 1096 },
]

const INVERSORES = [
  { marca: 'Growatt', modelo: 'MIN 11400TL-XH-US', potencia_ac_nominal_kw: 11.4, tipo_red: 'Monofasico 120/240V', mppt_num: 4, v_mppt_min: 60, v_mppt_max: 480, voc_max: 600 },
  { marca: 'Solis', modelo: 'S6-EH1P11.4K-H-US', potencia_ac_nominal_kw: 11.4, tipo_red: 'Monofasico 120/240V', mppt_num: 4, v_mppt_min: 80, v_mppt_max: 520, voc_max: 600 },
  { marca: 'GoodWe', modelo: 'GW11K4-MS-US30', potencia_ac_nominal_kw: 11.4, tipo_red: 'Monofasico 120/240V', mppt_num: 4, v_mppt_min: 80, v_mppt_max: 550, voc_max: 600 },
  { marca: 'Fronius', modelo: 'Primo 8.2-1', potencia_ac_nominal_kw: 8.2, tipo_red: 'Monofasico 120/240V', mppt_num: 2, v_mppt_min: 270, v_mppt_max: 480, voc_max: 600 },
  { marca: 'SMA', modelo: 'Sunny Tripower CORE1 50-US', potencia_ac_nominal_kw: 50, tipo_red: 'Trifasico 480V', mppt_num: 6, v_mppt_min: 150, v_mppt_max: 1000, voc_max: 1000 },
  { marca: 'Huawei', modelo: 'SUN2000-100KTL-M1', potencia_ac_nominal_kw: 100, tipo_red: 'Trifasico 480V', mppt_num: 10, v_mppt_min: 200, v_mppt_max: 1000, voc_max: 1100 },
]

const BATERIAS = [
  { marca: 'Huawei', modelo: 'LUNA2000-5-S0', capacidad_kwh: 5, voltaje_nominal_v: 360, tipo_quimica: 'LiFePO4', acoplamiento: 'DC' },
  { marca: 'GoodWe', modelo: 'Lynx Home U LX U5.4-L', capacidad_kwh: 5.4, voltaje_nominal_v: 51.2, tipo_quimica: 'LiFePO4', acoplamiento: 'DC' },
  { marca: 'Pylontech', modelo: 'US5000', capacidad_kwh: 4.8, voltaje_nominal_v: 48, tipo_quimica: 'LiFePO4', acoplamiento: 'DC' },
  { marca: 'BYD', modelo: 'Battery-Box Premium HVS 10.2', capacidad_kwh: 10.24, voltaje_nominal_v: 409, tipo_quimica: 'LiFePO4', acoplamiento: 'DC' },
  { marca: 'Tesla', modelo: 'Powerwall 2', capacidad_kwh: 13.5, voltaje_nominal_v: 50, tipo_quimica: 'NMC', acoplamiento: 'AC', potencia_max_descarga_kw: 5 },
  { marca: 'Enphase', modelo: 'IQ Battery 5P', capacidad_kwh: 5, voltaje_nominal_v: 76.8, tipo_quimica: 'LiFePO4', acoplamiento: 'AC', potencia_max_descarga_kw: 3.84 },
]

const conId = (categoria, equipos) =>
  equipos.map((equipo) => ({ id: slug(`${equipo.marca} ${equipo.modelo}`), categoria, ...equipo }))

export const MOCK_EQUIPOS = {
  paneles: conId('PANEL_SOLAR', PANELES),
  inversores: conId('INVERSOR', INVERSORES),
  baterias: conId('BATERIA', BATERIAS),
  rsd: [],
}
