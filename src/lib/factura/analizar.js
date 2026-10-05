// Interpreta el texto de una factura eléctrica (extraído del PDF o por OCR) y busca consumo, total,
// tarifa, historial mensual y tipo de red. Es heurístico: cada compañía maqueta distinto, así que el
// resultado se muestra al usuario para que lo confirme antes de usarlo.

// "1,234.56" · "1.234,56" · "1,234" (miles) · "0,25" (decimal)
export function leerNumero(crudo) {
  let texto = crudo.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '')
  if (!texto) return null
  const coma = texto.lastIndexOf(',')
  const punto = texto.lastIndexOf('.')
  if (coma !== -1 && punto !== -1) {
    texto = coma > punto ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/,/g, '')
  } else if (coma !== -1) {
    texto = /^\d{1,3}(,\d{3})+$/.test(texto) ? texto.replace(/,/g, '') : texto.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, '')
  }
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

const NUM = '(\\d[\\d.,]*)'
const MONEDA = '(?:rd\\$|us\\$|usd|u\\$s|\\$|b\\/\\.?|bs\\.?|mxn|cop|q|l\\.?|s\\/\\.?)?'

const sinAcentos = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function primero(texto, patrones, valido) {
  for (const patron of patrones) {
    const valor = leerNumero(texto.match(patron)?.[1] ?? '')
    if (valor != null && valido(valor)) return valor
  }
  return null
}

// Nombres de mes aceptados (sin acentos, en minúsculas). Solo palabras completas: "mar" suelto es
// marzo, pero "marca" o "mayor" no deben contar como un mes.
const NOMBRES_MES = [
  ['enero', 'ene', 'january', 'jan'],
  ['febrero', 'feb', 'february'],
  ['marzo', 'mar', 'march'],
  ['abril', 'abr', 'april', 'apr'],
  ['mayo', 'may'],
  ['junio', 'jun', 'june'],
  ['julio', 'jul', 'july'],
  ['agosto', 'ago', 'august', 'aug'],
  ['septiembre', 'setiembre', 'sept', 'sep', 'set', 'september'],
  ['octubre', 'oct', 'october'],
  ['noviembre', 'nov', 'november'],
  ['diciembre', 'dic', 'december', 'dec'],
]
const PALABRA_MES = new RegExp(`\\b(${NOMBRES_MES.flat().sort((a, b) => b.length - a.length).join('|')})\\b\\.?`, 'g')
const indiceDeMes = (palabra) => NOMBRES_MES.findIndex((formas) => formas.includes(palabra))

// Historial de consumo de la factura: kWh por mes del calendario (o null en los que no aparecen).
// Reconoce tres maquetaciones y se acepta con al menos 3 meses distintos:
//   1. Tabla horizontal:  "Abril 2026  Mayo 2026  Junio 2026" y debajo "Consumo (kWh)  1.040  1.480  1.920"
//   2. Un renglón por mes: "Mayo 2026   1.480 kWh"
//   3. Mes en número:      "05/2026   1.480"
function historial(texto) {
  const lineas = texto.split('\n')
  const meses = Array(12).fill(null)
  const esConsumo = (valor) => valor != null && valor >= 10 && valor <= 2_000_000
  const poner = (indice, valor) => {
    if (indice >= 0 && esConsumo(valor) && meses[indice] == null) meses[indice] = valor
  }
  const hallados = () => meses.filter((valor) => valor != null).length
  const mesesDe = (linea) => [...linea.matchAll(PALABRA_MES)].map((hallado) => indiceDeMes(hallado[1]))
  const numerosDe = (linea) => (linea.match(/\d[\d.,]*/g) ?? []).map(leerNumero)

  // 1. Tabla horizontal: un renglón con varios meses y, poco después, uno con la misma cantidad de valores.
  lineas.forEach((linea, n) => {
    const encabezado = mesesDe(linea)
    if (encabezado.length < 3) return
    for (const candidata of lineas.slice(n + 1, n + 5)) {
      if (mesesDe(candidata).length) break
      const valores = numerosDe(candidata)
      if (valores.length === encabezado.length && valores.every(esConsumo)) {
        encabezado.forEach((indice, k) => poner(indice, valores[k]))
        break
      }
    }
  })

  // 2. Un renglón por mes: se prefiere el número que va con "kWh"; si no, el primero tras el mes y su año.
  if (hallados() < 3) {
    for (const linea of lineas) {
      const enLinea = mesesDe(linea)
      if (enLinea.length !== 1) continue
      const conUnidad = linea.match(/(\d[\d.,]*)\s*kwh/)
      const trasMes = linea.slice(linea.search(PALABRA_MES)).replace(PALABRA_MES, '').replace(/^[\s\-/.,de]*(?:20\d{2}|\d{2})\b(?![.,]\d)/, '')
      PALABRA_MES.lastIndex = 0
      poner(enLinea[0], leerNumero(conUnidad?.[1] ?? trasMes.match(/\d[\d.,]*/)?.[0] ?? ''))
    }
  }

  // 3. Mes en número: "05/2026 1.480" o "2026-05 1.480".
  if (hallados() < 3) {
    for (const linea of lineas) {
      const fecha = linea.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b(?![/-]\d)/) ?? linea.match(/\b(20\d{2})[/-](0?[1-9]|1[0-2])\b(?![/-]\d)/)
      if (!fecha) continue
      const mes = Number(fecha[1].length === 4 ? fecha[2] : fecha[1])
      const resto = linea.slice(fecha.index + fecha[0].length)
      poner(mes - 1, leerNumero(resto.match(/(\d[\d.,]*)\s*kwh/)?.[1] ?? resto.match(/\d[\d.,]*/)?.[0] ?? ''))
    }
  }
  return hallados() >= 3 ? meses : null
}

function tension(texto) {
  if (/120\s*\/\s*240|240\s*\/\s*120/.test(texto)) return 'mono_120_240'
  if (/120\s*\/\s*208|208\s*\/\s*120|\b208\s*v/.test(texto)) return 'tri_120_208'
  if (/277\s*\/\s*480|480\s*\/\s*277|\b480\s*v/.test(texto)) return 'tri_277_480'
  if (/220\s*\/\s*380|230\s*\/\s*400|\b(380|400)\s*v/.test(texto)) return 'tri_380_400'
  if (/monofasic|bifasic|single.?phase|split.?phase/.test(texto)) return 'mono_120_240'
  return null
}

// Dato de texto que sigue a una etiqueta en el mismo renglón ("Cliente: Fulano") o, si el renglón
// solo trae la etiqueta, en el siguiente. Se descarta lo que no parece un nombre o una dirección.
function campo(textoOriginal, etiquetas, { minimo = 4, maximo = 110 } = {}) {
  const lineas = textoOriginal.split(/\r?\n/).map((linea) => linea.trim())
  // Con dos puntos el dato sigue en el renglón; si el renglón es solo la etiqueta, está en el siguiente.
  // Sin esa exigencia, una frase como "Estimado cliente, le informamos…" pasaría por un nombre.
  const conValor = new RegExp(`(?:^|\\s)(?:${etiquetas})\\s*:\\s*(\\S.*)$`)
  const soloEtiqueta = new RegExp(`^(?:${etiquetas})\\s*:?$`)
  for (let i = 0; i < lineas.length; i++) {
    const normalizada = sinAcentos(lineas[i])
    const hallado = normalizada.match(conValor)
    if (!hallado && !soloEtiqueta.test(normalizada)) continue
    // El valor se toma del renglón original (con sus acentos y mayúsculas), no del normalizado.
    let valor = hallado ? lineas[i].slice(lineas[i].length - hallado[1].length) : (lineas[i + 1] ?? '')
    valor = valor.replace(/\s{2,}.*$/, '').replace(/[|;]+.*$/, '').trim()
    if (valor.length >= minimo && valor.length <= maximo && /\p{L}{3}/u.test(valor)) return valor
  }
  return null
}

// Devuelve lo encontrado; cada campo queda en null si no aparece.
//   consumoKwh (del periodo) · meses (12 kWh o null) · total · tarifa · tarifaCalculada · tension ·
//   trifasicoSinVoltaje · cliente · direccion
export function analizarFactura(textoOriginal) {
  const texto = sinAcentos(textoOriginal)
  const esConsumo = (valor) => valor >= 10 && valor <= 2_000_000

  const consumoKwh = primero(
    texto,
    [
      new RegExp(`(?:consumo|energia(?: activa)?|kwh (?:consumidos|facturados)|total kwh|usage|consumption)[^\\n\\d]{0,40}${NUM}\\s*kwh`),
      new RegExp(`(?:consumo(?: del (?:mes|periodo))?|energia activa|kwh (?:consumidos|facturados)|total kwh)\\s*(?:\\(kwh\\))?\\s*:?\\s*${NUM}`),
      new RegExp(`${NUM}\\s*kwh`),
    ],
    esConsumo,
  )

  const total = primero(
    texto,
    [
      new RegExp(`total a pagar\\s*:?\\s*${MONEDA}\\s*${NUM}`),
      new RegExp(`(?:total facturado|total factura|monto total|importe total|total a cancelar|amount due|total due)\\s*:?\\s*${MONEDA}\\s*${NUM}`),
      new RegExp(`total (?:del (?:mes|periodo)|mes actual)\\s*:?\\s*${MONEDA}\\s*${NUM}`),
      new RegExp(`\\btotal\\s*:?\\s*${MONEDA}\\s*${NUM}`),
    ],
    (valor) => valor > 0,
  )

  const tarifaLeida = primero(
    texto,
    [
      new RegExp(`${NUM}\\s*${MONEDA}\\s*\\/\\s*kwh`),
      new RegExp(`(?:precio|tarifa|cargo por energia|costo)(?: de(?: la)? energia| unitario| por kwh)?\\s*:?\\s*${MONEDA}\\s*${NUM}`),
    ],
    (valor) => valor >= 0.01 && valor <= 100,
  )
  const tarifaCalculada = tarifaLeida == null && total && consumoKwh ? total / consumoKwh : null

  const red = tension(texto)
  return {
    consumoKwh,
    meses: historial(texto),
    total,
    tarifa: tarifaLeida ?? tarifaCalculada,
    tarifaCalculada: tarifaLeida == null && tarifaCalculada != null,
    tension: red,
    trifasicoSinVoltaje: !red && /trifasic|three.?phase/.test(texto),
    cliente: campo(
      textoOriginal,
      'nombre del cliente|nombre del titular|nombre o razon social|titular del (?:contrato|servicio|suministro)|razon social|a nombre de|cliente|titular|nombre|senor(?:es)?|sr(?:es)?',
    ),
    direccion: campo(textoOriginal, 'direccion del? (?:suministro|servicio|inmueble|predio)|direccion de (?:suministro|servicio)|direccion|ubicacion del suministro|domicilio', { minimo: 8, maximo: 140 }),
  }
}
