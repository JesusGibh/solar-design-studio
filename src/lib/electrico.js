import { aNumero } from './consumo.js'

// Tensiones de servicio. `voltaje` es línea-línea; `tipoRed` es el valor de `tipo_red` del catálogo
// de inversores con el que es compatible.
export const REDES = [
  { id: 'mono_120_240', label: 'Monofásico 120/240V', fases: 1, voltaje: 240, tipoRed: 'Monofasico 120/240V' },
  { id: 'tri_120_208', label: 'Trifásico 120/208V', fases: 3, voltaje: 208, tipoRed: 'Trifasico 208V' },
  { id: 'tri_277_480', label: 'Trifásico 277/480V', fases: 3, voltaje: 480, tipoRed: 'Trifasico 480V' },
  { id: 'tri_380_400', label: 'Trifásico 380/400V', fases: 3, voltaje: 400, tipoRed: 'Trifasico 380/400V' },
]

export const getRed = (id) => REDES.find((red) => red.id === id) ?? REDES[0]

const factor = (red) => (red.fases === 3 ? Math.sqrt(3) * red.voltaje : red.voltaje)

// Corriente de línea (A) de una potencia en kW a la tensión de servicio, con factor de potencia 1.
export const corrienteAC = (kw, red) => (kw * 1000) / factor(red)
export const potenciaKva = (amperios, red) => (amperios * factor(red)) / 1000

// `tipo_red` llega como texto "A; B" desde el catálogo JSON o como arreglo desde un CSV importado.
export function tiposDeRed(inversor) {
  const valor = inversor.tipo_red
  if (!valor) return []
  return Array.isArray(valor) ? valor : String(valor).split(/\s*;\s*/)
}

// Compatibilidad estricta: la ficha debe declarar exactamente esa red. Los equipos sin tensión declarada
// quedan fuera, y uno monofásico / de fase dividida que también liste 208 V no cuenta como trifásico.
export function esCompatible(inversor, red) {
  const tipos = tiposDeRed(inversor)
  if (!tipos.includes(red.tipoRed)) return false
  return red.fases === 1 || !tipos.some((tipo) => tipo.startsWith('Monofasico'))
}

const FACTOR_CONTINUO = 1.25 // la salida del inversor se trata como carga continua (125 %)

// Validaciones de interconexión. Cada resultado trae `estado`: 'ok' | 'warn' | 'danger' | 'pendiente'.
//   acometida: 125 % de la corriente solar no puede superar el interruptor principal (IP)
//   transformador: potencia AC del sistema frente a los kVA del transformador
export function validarInterconexion({ red: datosRed, potenciaKw }) {
  const red = getRed(datosRed.tension)
  const interruptor = aNumero(datosRed.interruptorA)
  const transformador = aNumero(datosRed.transformadorKva)
  const corrienteSolar = potenciaKw ? corrienteAC(potenciaKw, red) : null
  const corrienteContinua = corrienteSolar && corrienteSolar * FACTOR_CONTINUO

  const pendiente = { estado: 'pendiente' }
  const acometida =
    interruptor && corrienteContinua
      ? {
          estado: corrienteContinua <= interruptor ? 'ok' : 'danger',
          interruptor,
          corrienteContinua,
          // Potencia AC máxima que admite el interruptor principal.
          potenciaMaxKw: potenciaKva(interruptor / FACTOR_CONTINUO, red),
        }
      : pendiente

  const uso = transformador && potenciaKw ? potenciaKw / transformador : null
  const transformadorCheck = uso == null ? pendiente : { estado: uso > 1 ? 'danger' : uso > 0.8 ? 'warn' : 'ok', uso, transformador }

  return {
    red,
    corrienteSolar,
    capacidadAcometidaKva: interruptor ? potenciaKva(interruptor, red) : null,
    acometida,
    transformador: transformadorCheck,
  }
}
