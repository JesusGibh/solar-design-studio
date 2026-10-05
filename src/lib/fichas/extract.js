// Motor de extracción de fichas técnicas: recibe las páginas ya leídas (ver pdfText.js) y devuelve
// un registro por cada modelo encontrado. Es heurístico: reconoce tablas "etiqueta | valor por modelo"
// en español, inglés y portugués. Lo comparten el script de Node y la carga de PDF en la app.

import { slug } from './registros.js'

export const CATEGORIAS = ['PANEL_SOLAR', 'INVERSOR', 'BATERIA', 'RSD', 'OTRO']

// Esquema de salida por categoría (también define el orden de columnas del CSV).
export const ESQUEMA = {
  PANEL_SOLAR: ['potencia_wp', 'voc', 'isc', 'vmp', 'imp', 'coef_temp_voc', 'largo_mm', 'ancho_mm', 'eficiencia', 'peso_kg'],
  INVERSOR: ['potencia_ac_nominal_kw', 'tipo_red', 'mppt_num', 'v_mppt_min', 'v_mppt_max', 'voc_max', 'isc_max_mppt', 'corriente_max_salida_ac'],
  BATERIA: ['capacidad_kwh', 'voltaje_nominal_v', 'tipo_quimica', 'acoplamiento', 'potencia_max_descarga_kw'],
  RSD: ['max_input_current_a', 'max_input_voltage_v', 'canales'],
}

const PAGINAS_DOCUMENTO_CORTO = 6

// ---------------------------------------------------------------- utilidades de texto

const norm = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—−﹣－]/g, '-')
    .toLowerCase()

function numeros(texto) {
  const limpio = texto.replace(/[–—−﹣－]/g, '-')
  const encontrados = limpio.match(/(?<![\d.,])-?\d+(?:[.,]\d+)*/g) ?? []
  return encontrados
    .map((crudo) => {
      // "12,000" es separador de miles; "98,4" es decimal.
      const valor = /^-?\d{1,3}(,\d{3})+$/.test(crudo) ? crudo.replace(/,/g, '') : crudo.replace(',', '.')
      return Number(valor)
    })
    .filter(Number.isFinite)
}

const enRango = (n, [min, max]) => n != null && n >= min && n <= max
const redondear = (n, decimales = 3) => Number(n.toFixed(decimales))
const proporcionLetras = (texto) => {
  const visibles = texto.replace(/\s/g, '')
  return visibles ? (visibles.match(/\p{L}/gu) ?? []).length / visibles.length : 0
}


// ---------------------------------------------------------------- lectores de valores

const numero = (clave, rango, opciones = {}) => (texto) => {
  let n = numeros(texto)[0]
  if (n != null && opciones.negativo && n > 0) n = -n
  return enRango(n, rango) ? { [clave]: n } : null
}

// Potencia en kW aunque la ficha la dé en W o VA (en el valor o entre paréntesis en la etiqueta).
const potenciaKw = (clave, rango) => (texto, etiqueta) => {
  const n = numeros(texto)[0]
  if (n == null || /%/.test(texto)) return null
  const t = norm(texto)
  const enKilo = /k(w|va)/.test(t) || (!/\d\s*(w|va)\b/.test(t) && /\(k(w|va)\)/.test(etiqueta))
  const enUnidad = /\d\s*(w|va)\b/.test(t) || /\((w|va)\)/.test(etiqueta)
  const kw = enKilo ? n : enUnidad || n >= 300 ? n / 1000 : n
  return enRango(kw, rango) ? { [clave]: redondear(kw) } : null
}

// "4 × 40 A" -> 40, "24A/24A/24A" -> 24.
const amperios = (clave, rango) => (texto) => {
  const conUnidad = texto.match(/(\d+(?:[.,]\d+)?)\s*A(?![a-z])/)
  // "4 × 40" es cantidad × corriente; "2,32 × 3" es corriente × fases.
  const todos = numeros(texto)
  const sinUnidad = /\d\s*[×x*]\s*\d/.test(texto) && Number.isInteger(todos[0]) ? todos.at(-1) : todos[0]
  const n = conUnidad ? Number(conUnidad[1].replace(',', '.')) : sinUnidad
  return enRango(n, rango) ? { [clave]: n } : null
}

const rangoMppt = (texto) => {
  const [min, max] = numeros(texto).map(Math.abs)
  return enRango(min, [10, 1500]) && enRango(max, [10, 1500]) && min < max ? { v_mppt_min: min, v_mppt_max: max } : null
}

const dimensiones = (texto) => {
  const lados = numeros(texto).filter((n) => n >= 500 && n <= 3000)
  if (lados.length < 2) return null
  return { largo_mm: Math.max(lados[0], lados[1]), ancho_mm: Math.min(lados[0], lados[1]) }
}

const energiaKwh = (texto, etiqueta) => {
  const kwh = texto.match(/(\d+(?:[.,]\d+)?)\s*kwh/i)
  const wh = texto.match(/(\d+(?:[.,]\d+)?)\s*wh/i)
  let n = null
  if (kwh) n = Number(kwh[1].replace(',', '.'))
  else if (wh) n = Number(wh[1].replace(',', '.')) / 1000
  else if (/kwh/.test(etiqueta)) n = numeros(texto)[0]
  return enRango(n, [0.3, 2000]) ? { capacidad_kwh: redondear(n) } : null
}

const textoCrudo = (clave) => (texto) => ({ [clave]: texto })

// ---------------------------------------------------------------- campos por categoría
// etiqueta / excluir se prueban contra el texto de la celda sin acentos y en minúsculas.
// Las claves que empiezan con "_" son datos intermedios que se resuelven en `completar`.

const CAMPOS = {
  PANEL_SOLAR: [
    {
      etiqueta: /maximum power|max\.? power|pmax|pmpp|potencia maxima|potencia nominal|rated (power|output)|peak power|potencia pico/,
      excluir: /coef|temp|toleran|gain|voltage|current|voltaje|corriente|tension|efficien|eficien|vmp|imp\b|sort/,
      leer: numero('potencia_wp', [100, 900]),
    },
    { etiqueta: /open.?circuit voltage|\bvoc\b|circuito abierto/, excluir: /coef|temp/, leer: numero('voc', [10, 120]) },
    { etiqueta: /short.?circuit current|\bisc\b|corto ?circuito/, excluir: /coef|temp/, leer: numero('isc', [3, 30]) },
    {
      etiqueta: /voltage at (maximum|max\.?) power|(maximum|max\.?) power voltage|\bvmpp?\b|(voltaje|tension) (en|a|de) (el punto de )?(maxima|max\.?) potencia|operating voltage|voltaje de operacion/,
      excluir: /coef|temp/,
      leer: numero('vmp', [10, 110]),
    },
    {
      etiqueta: /current at (maximum|max\.?) power|(maximum|max\.?) power current|\bimpp?\b|corriente (en|a|de) (el punto de )?(maxima|max\.?) potencia|operating current|corriente de operacion/,
      excluir: /coef|temp/,
      leer: numero('imp', [3, 30]),
    },
    {
      etiqueta: /temp[a-z]*?\.?\s*coef[a-z]*?\.?\s*(of|de|del)?\s*\(?\s*voc|temp\w*\.? coeff?\w*\.? (of |de |del |\()?voc|coef\w*\.? (de )?temp\w*\.? (de |del |\()?voc|voc temp|\(voc\)|beta ?voc|β/,
      leer: numero('coef_temp_voc', [-1, -0.05], { negativo: true }),
    },
    { etiqueta: /^(module )?dimensions?|^dimensiones|^tamano|module size|^size/, leer: dimensiones },
    { etiqueta: /module efficiency|eficiencia del? modulo|^efficiency|^eficiencia/, leer: numero('eficiencia', [10, 30]) },
    { etiqueta: /^(module )?weight|^peso/, leer: numero('peso_kg', [5, 60]) },
  ],
  INVERSOR: [
    {
      etiqueta: /(rated|nominal)( ac| grid)?( output)?( active)? power|\bac (nominal|rated) power|potencia (activa )?nominal|potencia de salida nominal|(potencia|alimentacion) nominal de salida/,
      excluir: /\b(pv|fv|dc|cd|cc)\b|bater|batter|input|entrada|apparent|aparente|charg|carga|backup|respaldo|\beps\b|module|modulo|off.?grid|generador|generator|factor|distor|armonic|harmonic|thd/,
      leer: potenciaKw('potencia_ac_nominal_kw', [0.1, 500]),
    },
    {
      // Respaldo: fichas que solo declaran la potencia máxima continua de salida.
      etiqueta: /(maxima|max\.?) potencia de salida( continua)?|potencia (maxima|max\.?) de salida continua|max(imum|\.)? continuous output power/,
      excluir: /\b(pv|fv|dc|cd|cc)\b|bater|batter|aparente|apparent|backup|respaldo|\beps\b|off.?grid/,
      leer: potenciaKw('potencia_ac_nominal_kw', [0.1, 500]),
    },
    {
      etiqueta: /(nominal|rated)( ac| grid| output)+ voltage|(voltaje|tension) nominal( de la| de)? ?(ca|ac|red|salida)|(grid|ac) voltage|(voltaje|tension) de (la )?(red|salida)/,
      excluir: /\b(pv|fv|dc|cd|cc)\b|bater|batter|mppt|input|entrada|backup|respaldo|\beps\b|range|rango$/,
      leer: textoCrudo('_voltaje_red'),
      texto: true,
    },
    {
      etiqueta: /tipo de conexion|grid (connection|type|form)|connection type|^phases?$|^fases?$|fases de operacion|operating phases?|tipo de red|ac connection|conexion (de )?(ca|ac)$/,
      leer: textoCrudo('_conexion'),
      texto: true,
    },
    {
      etiqueta: /(number|no\.?|numero|cantidad|num\.?|n[°ºo]\.?) (of |de )?(independent |independientes )?(mpp|mppt)s?|mppts? (number|quantity|qty|trackers?)|(mpp|mppt) trackers?|seguidores (mpp|mppt)|numero de seguidores|rastreadores/,
      excluir: /strings? per|cadenas? (fotovoltaicas )?por|per mpp|por (mpp|seguidor|rastreador)|current|corriente|voltage|voltaje|efficien|eficien/,
      leer: numero('mppt_num', [1, 30]),
    },
    {
      etiqueta: /mppt? (operating |full.?load )?voltage range|(rango|intervalo) de (voltaje|tension)( de operacion)?( de| del)? ?mppt?|mppt? range|(rango|intervalo) (de |del )?mppt?/,
      excluir: /full power|plena carga/,
      leer: rangoMppt,
    },
    {
      etiqueta: /(max\.?|maximum|maximo|maxima)( dc| pv| fv)?( input)? (voltage|voltaje|tension)( de)?( entrada| cd| cc| dc| fv| pv)?|(voltaje|tension)( de)?( entrada| cd| cc| dc| fv)? (maxim[oa]|max\.?)/,
      excluir: /mppt|\b(ac|ca)\b|grid|\bred\b|bater|batter|output|salida|charg|carga|system|sistema/,
      leer: numero('voc_max', [30, 1600]),
    },
    {
      etiqueta: /short.?circuit current|corto ?circuito|\bisc\b/,
      excluir: /\b(ac|ca)\b|output|salida|protec|fault|falla/,
      leer: amperios('isc_max_mppt', [5, 120]),
    },
    {
      etiqueta: /(max\.?|maximum|maxima)( continuous)?( ac| grid)* output current|corriente (maxima|max\.?) de salida|corriente de salida (maxima|max\.?)|maxima corriente de salida|max\.? ac current/,
      excluir: /bater|batter|backup|respaldo|\beps\b|short|corto|fault|falla|\b(dc|cd)\b|off.?grid/,
      leer: amperios('corriente_max_salida_ac', [0.5, 1500]),
    },
    {
      // Respaldo: si la ficha solo da la corriente nominal de salida.
      etiqueta: /(rated|nominal)( ac| grid)* output current|corriente nominal de salida|corriente de salida nominal/,
      excluir: /bater|batter|backup|respaldo|\beps\b|\b(dc|cd)\b|off.?grid/,
      leer: amperios('corriente_max_salida_ac', [0.5, 1500]),
    },
  ],
  BATERIA: [
    {
      etiqueta: /energy|energia|capacity|capacidad/,
      excluir: /densi|efficien|eficien|retention|\bah\b|cell|celda/,
      leer: energiaKwh,
    },
    {
      etiqueta: /(nominal|rated) voltage|(voltaje|tension) nominal/,
      excluir: /\b(ac|ca)\b|grid|\bred\b|cell|celda/,
      leer: numero('voltaje_nominal_v', [10, 1500]),
    },
    {
      etiqueta: /(max\.?|maximum|maxima|peak|rated|nominal)( continuous)?( charg\w* ?(\/|and) ?discharg\w*| discharg\w*| output)? power|potencia (maxima|max\.?|nominal)( de)? (descarga|salida|carga ?\/ ?descarga)|potencia de descarga/,
      excluir: /\b(pv|fv)\b/,
      leer: potenciaKw('potencia_max_descarga_kw', [0.1, 2000]),
    },
    {
      etiqueta: /(discharg\w*|descarga).*(current|corriente)|(current|corriente).*(discharg|descarga)/,
      excluir: /peak|pico|pulse|pulso|short|corto/,
      leer: amperios('_corriente_descarga', [1, 2000]),
    },
  ],
  RSD: [
    {
      etiqueta: /input current|corriente (maxima )?de entrada|\bisc\b|max\.? current|corriente maxima/,
      leer: amperios('max_input_current_a', [1, 100]),
    },
    {
      etiqueta: /(input|system) voltage|(voltaje|tension) (maxim[oa] )?de(l)? (entrada|sistema)|max\.? voltage|tension maxima|voltaje maximo/,
      leer: numero('max_input_voltage_v', [20, 1600]),
    },
  ],
}

// ---------------------------------------------------------------- filtrado de páginas

const PALABRAS_ESPECIFICACION = [
  /electrical (data|characteristics|parameters)|technical (data|specifications?|parameters)|datasheet|data sheet|hoja de datos|ficha tecnica|datos tecnicos|especificaciones|caracteristicas electricas|parametros tecnicos/,
  /\bvoc\b|open.?circuit/,
  /\bisc\b|short.?circuit|corto ?circuito/,
  /mppt/,
  /pmax|maximum power|potencia maxima/,
  /kwh/,
  /(rated|nominal) (output |ac )?(power|voltage|current)|(potencia|voltaje|tension|corriente) nominal/,
  /efficiency|eficiencia/,
  /weight|peso/,
  /dimension/,
]

function esPaginaDeEspecificaciones(pagina) {
  const filasTabla = pagina.lineas.filter((linea) => linea.celdas.length >= 2).length
  if (filasTabla < 8) return false
  const texto = norm(pagina.lineas.map((linea) => linea.texto).join('\n'))
  return PALABRAS_ESPECIFICACION.filter((patron) => patron.test(texto)).length >= 3
}

// ---------------------------------------------------------------- filas y segmentos

const esSoloValores = (linea) =>
  linea.celdas.every((celda) => /\d/.test(celda.texto) && celda.texto.length <= 70 && proporcionLetras(celda.texto) <= 0.5) &&
  // Una fila de códigos de modelo ("HMS-1800-4T | HMS-2000-4T") es un encabezado, no valores.
  !(linea.celdas.length >= 2 && linea.celdas.every((celda) => pareceCodigo(celda.texto)))

const esEtiquetaSola = (linea) =>
  linea.celdas.length === 1 && linea.texto.length <= 60 && proporcionLetras(linea.texto) >= 0.6 && !/^[·•▪■*]/.test(linea.texto)

const aFila = (celdas, pagina) => ({ pagina, celdas: celdas.map((celda) => ({ ...celda, n: norm(celda.texto) })) })

// Convierte las líneas de una página en filas. Reconstruye las etiquetas partidas en dos renglones
// con los valores en medio (formato habitual de Growatt): "Máxima potencia FV" / valores / "recomendada".
function construirFilas(pagina) {
  const { lineas } = pagina
  const tipo = lineas.map((linea) => (esEtiquetaSola(linea) ? 'etiqueta' : esSoloValores(linea) ? 'valores' : 'normal'))
  const filas = []
  for (let i = 0; i < lineas.length; i++) {
    const siguiente = lineas[i + 1]
    if (tipo[i] === 'etiqueta' && tipo[i + 1] === 'valores') {
      const continua = tipo[i + 2] === 'etiqueta' && tipo[i + 3] !== 'valores'
      const etiqueta = continua ? `${lineas[i].texto} ${lineas[i + 2].texto}` : lineas[i].texto
      filas.push(aFila([{ ...lineas[i].celdas[0], texto: etiqueta }, ...lineas[i + 1].celdas], pagina.numero))
      i += continua ? 2 : 1
    } else if (tipo[i] === 'valores' && tipo[i + 1] === 'etiqueta' && tipo[i + 2] === 'valores') {
      // Etiqueta centrada entre dos renglones de valores (un valor por voltaje de red): manda el primero.
      filas.push(aFila([lineas[i + 1].celdas[0], ...lineas[i].celdas], pagina.numero))
      i += 2
    } else if (tipo[i] === 'etiqueta' && siguiente && siguiente.celdas.length >= 2 && /^\p{Ll}/u.test(siguiente.texto) && !/\d/.test(siguiente.celdas[0].texto)) {
      // La etiqueta continúa en minúscula en el renglón que trae los valores.
      const [primera, ...resto] = siguiente.celdas
      filas.push(aFila([{ ...primera, texto: `${lineas[i].texto} ${primera.texto}` }, ...resto], pagina.numero))
      i += 1
    } else {
      filas.push(aFila(lineas[i].celdas, pagina.numero))
    }
  }
  return filas
}

const ETIQUETA_MODELO =
  /^(module type|model type|modelos?|models?|model (no\.?|name|number)|modelo del? (producto|inversor|bateria|modulo)|(product|inverter|battery|module) (model|type|name)|type|tipo|item|hoja de datos|datasheet|data sheet|ficha tecnica|technical (data|specifications?)|datos tecnicos|especificaciones( tecnicas)?|specifications?|parametros( tecnicos)?|nombre del modelo)\s*:?$/

const SOLO_MAGNITUD = /^[<>≤≥~±]?\s*-?\d+(?:[.,]\d+)?\s*(v|vdc|vac|a|w|kw|kva|va|wp|kwh|ah|kg|mm|hz|%|°c|℃)?$/i
const NORMA = /^(iec|ul|en|iso|ieee|vde|nbr|abnt|csa|as|ce|nom|ntc|une|rd)\b/i

// Nombre abreviado de columna, sin la serie: "25K", "7.5kW", "125K-HV".
const MODELO_CORTO = /^(\d+(?:[.,]\d+)?)\s?k(?:w|tl)?((?:-[A-Z]{1,3})?)$/i

const NO_ES_MODELO =/^(lifepo4|lfp|li-ion|ip ?\d|nema|type ?[\divx]|tipo ?[\divx]|class|clase|mc4|rs-?485|pv ?\d|mppt|string|cat\.?\s?\d|awg|t\d\b|l\d\b)/i

const pareceModelo = (texto) =>
  /\d/.test(texto) &&
  texto.length >= 2 &&
  texto.length <= 45 &&
  !/%/.test(texto) &&
  !SOLO_MAGNITUD.test(texto) &&
  !NORMA.test(texto) &&
  !NO_ES_MODELO.test(texto)

// Código de producto sin etiqueta delante: "HMS-1800-4T", "WIT50K-HU".
const pareceCodigo = (texto) => /^[A-Z]/.test(texto) && !/\p{Ll}{5,}/u.test(texto) && pareceModelo(texto) && texto.length <= 40

function prefijoComun(textos) {
  let prefijo = textos[0]
  for (const texto of textos) while (!texto.startsWith(prefijo)) prefijo = prefijo.slice(0, -1)
  return prefijo
}

// Separa varios modelos que quedaron pegados en una celda: "MAC15KTL3-XL MAC20KTL3-XL".
function dividirCelda(celda) {
  const inicio = celda.texto.match(/^[A-Za-z]{2,}/)?.[0]
  const partes = inicio ? celda.texto.split(new RegExp(`[,;\\s]+(?=${inicio}[ \\-\\d])`)) : [celda.texto]
  const ancho = (celda.x1 - celda.x0) / partes.length
  return partes.map((texto, i) => ({
    ...celda,
    texto: texto.replace(/[,;]+$/, '').replace(/ (?=-\d)/g, '').trim(),
    x0: celda.x0 + i * ancho,
    x1: celda.x0 + (i + 1) * ancho,
  }))
}

// Devuelve las celdas con los nombres de modelo si la fila es el encabezado de una tabla.
function celdasDeModelos(fila) {
  if (!fila) return null
  const [primera, ...resto] = fila.celdas
  if (ETIQUETA_MODELO.test(primera.n) && resto.length >= 1) {
    const divididas = resto.flatMap(dividirCelda)
    if (divididas.every((celda) => pareceModelo(celda.texto))) return divididas
  }
  if (fila.celdas.length >= 2 && fila.celdas.every((celda) => pareceCodigo(celda.texto))) {
    const prefijo = prefijoComun(fila.celdas.map((celda) => celda.texto))
    if (prefijo.replace(/[^A-Za-z0-9]/g, '').length >= 3) return fila.celdas.flatMap(dividirCelda)
  }
  return null
}

const unirPartidos = (celdas, continuacion) => celdas.map((celda, j) => ({ ...celda, texto: celda.texto + continuacion.celdas[j].texto }))

function segmentar(filas) {
  const segmentos = []
  let actual = null
  const previas = []
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    let celdas = celdasDeModelos(fila)
    if (celdas) {
      // Nombres partidos en dos renglones por falta de ancho: "HYS-3.8LV-" / "USG1".
      if (celdas.every((celda) => celda.texto.endsWith('-'))) {
        const [uno, dos] = [filas[i + 1], filas[i + 2]]
        const intermedia = celdasDeModelos(uno)
        if (intermedia && dos?.celdas.length === celdas.length) {
          celdas = [...unirPartidos(celdas, dos), ...intermedia]
          i += 2
        } else if (!intermedia && uno?.celdas.length === celdas.length) {
          celdas = unirPartidos(celdas, uno)
          i += 1
        }
      }
      celdas.sort((p, q) => p.x0 - q.x0)
      const modelos = celdas.map((celda) => ({ nombre: celda.texto, centro: (celda.x0 + celda.x1) / 2 }))
      // "Hoja de datos | S6-EH1P8K-L-PLUS" seguido de "Modelo | 8K": se conserva el nombre completo.
      const soloCortos = modelos.every((modelo) => MODELO_CORTO.test(modelo.nombre))
      if (actual && actual.filas.length === 0 && soloCortos && modelos.length === actual.modelos.length) {
        actual.modelos = actual.modelos.map((modelo, j) => ({ ...modelo, centro: modelos[j].centro }))
        continue
      }
      const firma = modelos.map((modelo) => modelo.nombre).join('|')
      // La misma tabla puede continuar en la página siguiente repitiendo el encabezado.
      actual = segmentos.find((segmento) => segmento.firma === firma)
      if (actual) actual.modelos = modelos
      else segmentos.push((actual = { firma, modelos, filas: [] }))
      continue
    }
    // Cada fila guarda la posición de columnas vigente al momento de leerla.
    if (actual) actual.filas.push({ ...fila, modelos: actual.modelos })
    else previas.push(fila)
  }
  // Un "encabezado" seguido de casi nada no es una tabla (títulos de portada, listas de modelos).
  const tablas = segmentos.filter((segmento) => segmento.filas.length >= 4)
  for (const segmento of segmentos) if (segmento.filas.length < 4) previas.push(...segmento.filas)
  return { segmentos: tablas, previas }
}

// Fichas de paneles sin fila de modelos, con una columna por clase de potencia (565 | 570 | 575 W):
// cada potencia se trata como un modelo de la serie que indica el nombre del archivo.
function segmentoPorPotencia(filas, nombreArchivo) {
  const [campo] = CAMPOS.PANEL_SOLAR
  let serie = modeloDesdeArchivo(nombreArchivo)
    .replace(/\d{3}\s*[-~]\s*\d{3}\s*w?/i, '')
    .replace(/(?<=[-\s])\d{3}(?=\s?(lb|w|m)\b)/i, '') // potencia suelta del modelo: "JAM66D45-615LB" -> "JAM66D45-LB"
  while (/[-_ .](en|es|pt|v[.\d]+\w*)$/i.test(serie)) serie = serie.replace(/[-_ .](en|es|pt|v[.\d]+\w*)$/i, '')
  serie = serie.replace(/-{2,}/g, '-').replace(/^-|-$/g, '')

  for (const fila of filas) {
    const j = fila.celdas.findIndex((celda) => campo.etiqueta.test(celda.n) && !campo.excluir.test(celda.n))
    if (j === -1) continue
    const valores = celdasDeValor(fila, j)
    const potencias = valores.map((celda) => numeros(celda.texto)[0])
    if (valores.length < 2 || !potencias.every((potencia) => enRango(potencia, [100, 900]))) continue
    const modelos = valores.map((celda, i) => ({ nombre: `${serie} ${potencias[i]}W`, centro: (celda.x0 + celda.x1) / 2 }))
    return { modelos, filas, serie }
  }
  return null
}

// ---------------------------------------------------------------- valores por modelo

function celdasDeValor(fila, indiceEtiqueta, aceptaTexto) {
  const valores = []
  for (const celda of fila.celdas.slice(indiceEtiqueta + 1)) {
    if (!/\d/.test(celda.texto) && !(aceptaTexto && valores.length === 0)) break
    valores.push(celda)
  }
  return valores
}

// Reparte las celdas de valor entre los modelos de la tabla. Devuelve un texto (o null) por modelo.
// `estricto` (texto de OCR): si las columnas no cuadran se descarta la fila en vez de adivinar por posición.
function repartir(valores, modelos, estricto) {
  const n = modelos.length
  const k = valores.length
  if (k === 0) return null
  if (estricto && n > 1 && k !== 1 && k % n !== 0) {
    // Sobran celdas al final (trazos de una gráfica vecina leídos como texto): valen las primeras n.
    return k > n ? valores.slice(0, n).map((celda) => celda.texto) : null
  }
  if (n === 1) return [valores.map((celda) => celda.texto).join(' | ')]
  if (k === 1) return modelos.map(() => valores[0].texto)
  if (k === n) return valores.map((celda) => celda.texto)
  if (k % n === 0) {
    // Varias subcolumnas por modelo (STC/NOCT, 208V/240V): se conserva el grupo, el primero manda.
    const grupo = k / n
    return modelos.map((_, i) => valores.slice(i * grupo, (i + 1) * grupo).map((celda) => celda.texto).join(' | '))
  }
  // Celdas combinadas: se asigna por posición horizontal.
  const paso = Math.abs(modelos[1].centro - modelos[0].centro) || 50
  return modelos.map((modelo) => {
    const dentro = valores.find((celda) => celda.x0 - 4 <= modelo.centro && modelo.centro <= celda.x1 + 4)
    if (dentro) return dentro.texto
    const cercana = valores
      .map((celda) => ({ celda, distancia: Math.abs((celda.x0 + celda.x1) / 2 - modelo.centro) }))
      .sort((p, q) => p.distancia - q.distancia)[0]
    return cercana.distancia <= paso / 2 ? cercana.celda.texto : null
  })
}

// Devuelve los campos leídos por modelo y si alguna fila traía varias columnas de valores distintos.
function leerCampos(categoria, filas, modelos, estricto) {
  const registros = modelos.map(() => ({}))
  let multicolumna = false
  for (const campo of CAMPOS[categoria]) {
    for (const fila of filas) {
      for (let j = 0; j < fila.celdas.length; j++) {
        const celda = fila.celdas[j]
        if (celda.texto.length > 80 || !campo.etiqueta.test(celda.n) || campo.excluir?.test(celda.n)) continue
        let valores = celdasDeValor(fila, j, campo.texto)
        // Etiqueta y valor en la misma celda: "Peso: 20 kg".
        if (valores.length === 0 && /[:：]\s*\S/.test(celda.texto)) {
          valores = [{ ...celda, texto: celda.texto.slice(celda.texto.search(/[:：]/) + 1).trim() }]
        }
        // Primer valor pegado a la etiqueta: "Maximum Power Voltage(Vmp) [V] — 43.06 | 43.24 | …".
        const columnas = (fila.modelos ?? modelos).length
        const pegado = celda.texto.match(/[\s—-](-?\d+(?:[.,]\d+)?)\s*$/)
        if (pegado && columnas > 1 && valores.length === columnas - 1) valores = [{ ...celda, texto: pegado[1] }, ...valores]
        const textos = repartir(valores, fila.modelos ?? modelos, estricto)
        if (!textos) continue
        textos.forEach((texto, i) => {
          if (texto == null) return
          const leido = campo.leer(texto, celda.n)
          if (!leido) return
          if (new Set(valores.map((valor) => valor.texto)).size >= 3) multicolumna = true
          for (const [clave, valor] of Object.entries(leido)) registros[i][clave] ??= valor
        })
      }
    }
  }
  return { registros, multicolumna }
}

// ---------------------------------------------------------------- clasificación

const SENALES = {
  PANEL_SOLAR: [/\bvoc\b|open.?circuit|circuito abierto/, /\bisc\b|short.?circuit|corto ?circuito/, /\bvmpp?\b|voltage at max|power voltage/, /\bimpp?\b|current at max|power current/, /pmax|maximum power|potencia maxima/, /module|modulo|cell|celda|bifacial/],
  INVERSOR: [/mppt/, /thd|armonic|harmonic/, /anti.?isl|islanding/, /(output|salida).*\b(ac|ca)\b|\b(ac|ca)\b.*(output|salida)|grid|\bred\b/, /inver/],
  BATERIA: [/kwh/, /\bdod\b|profundidad de descarga|depth of discharge/, /cycle|ciclos/, /lifepo4|\blfp\b|litio|lithium/, /discharg|descarga/, /bater|batter/],
}

const ARCHIVO_OTRO =
  /meter|medidor|\bdtu|gateway|\becc\b|combinadora|combiner|manager|\bsem\b|\bepm\b|export|stick|\bdts\b|cargador|charger|\bthor\b|riel|rail|mibet|street ?light|\bfan\b|abanico|toroide|bobina|cables?\b|accesorio|mc4|extintor|certific|iso9001|un38|company profile|configuraci|monitoreo|factor de potencia|\berror\b|pv-?kit|safety data|\bsds\b|control automatico|technical note|wire.?cover|mechanics|installation guide|鉴定|配件|试验/

const ARCHIVO_RSD = /rapid ?shutdown|apagado rapido|\brsd\b/

function clasificarSegmento(textoFilas, textoDocumento) {
  if (ARCHIVO_RSD.test(textoDocumento) && !/mppt/.test(textoFilas)) return 'RSD'
  const puntos = Object.fromEntries(
    Object.entries(SENALES).map(([categoria, patrones]) => [categoria, patrones.filter((patron) => patron.test(textoFilas)).length]),
  )
  const tieneMppt = /mppt/.test(textoFilas)
  if (puntos.PANEL_SOLAR >= 4 && !tieneMppt) return 'PANEL_SOLAR'
  if (tieneMppt && puntos.INVERSOR >= 2) return 'INVERSOR'
  if (puntos.INVERSOR >= 3 && /inver/.test(textoFilas)) return 'INVERSOR'
  if (puntos.BATERIA >= 3) return 'BATERIA'
  return null
}

// ---------------------------------------------------------------- marca y modelo

const MARCAS = [
  [/growatt|ginverter/g, 'Growatt'],
  [/solis|ginlong/g, 'Solis'],
  [/hoymiles/g, 'Hoymiles'],
  [/longi/g, 'LONGi'],
  [/ja ?solar/g, 'JA Solar'],
  [/solax/g, 'SolaX'],
  [/deye/g, 'Deye'],
  [/onccy/g, 'ONCCY'],
  [/raggie/g, 'Raggie'],
  [/jinko/g, 'Jinko Solar'],
  [/canadian ?solar|csisolar/g, 'Canadian Solar'],
  [/trina ?solar/g, 'Trina Solar'],
  [/huawei/g, 'Huawei'],
  [/goodwe/g, 'GoodWe'],
  [/astronergy/g, 'Astronergy'],
  [/hoyuan/g, 'Hoyuan'],
  [/sungrow/g, 'Sungrow'],
  [/fronius/g, 'Fronius'],
  [/enphase/g, 'Enphase'],
  [/pylontech/g, 'Pylontech'],
  [/risen/g, 'Risen'],
  [/tesla/g, 'Tesla'],
]

const PREFIJOS_MARCA = [
  [/^(grw|min|mid|mac|max|spf|sph|spe|wit|neo|hope|axe|ark)[ _~-]/, 'Growatt'],
  [/^(s[2356]-|solis)/, 'Solis'],
  [/^(hm[st]|hys|has|dtu)\b|^(hm[st]|hys|has)-/, 'Hoymiles'],
  [/^lr\d|hi-?mo/, 'LONGi'],
  [/^jam\d/, 'JA Solar'],
]

function detectarMarca(nombreArchivo, textoDocumento) {
  const archivo = norm(nombreArchivo)
  for (const [patron, marca] of MARCAS) if (archivo.match(patron)) return marca
  const conteo = MARCAS.map(([patron, marca]) => ({ marca, veces: (textoDocumento.match(patron) ?? []).length })).sort(
    (p, q) => q.veces - p.veces,
  )
  if (conteo[0].veces > 0) return conteo[0].marca
  const limpio = archivo.replace(/^(data ?sheet|datasheet|ficha tecnica|hoja de datos|inversor|bateria)[ _-]*/, '')
  for (const [patron, marca] of PREFIJOS_MARCA) if (patron.test(limpio)) return marca
  return 'Sin marca'
}

function modeloDesdeArchivo(nombreArchivo) {
  return nombreArchivo
    .replace(/\.pdf$/i, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/[_]+/g, ' ')
    .replace(/^(data ?sheet|hoja de datos|ficha t[eé]cnica|fichatec)\s*[-:]?\s*/i, '')
    .replace(/\b(data ?sheet|hoja de datos|ficha t[eé]cnica|fichatec|ficha de dados|flyer|global|user manual|manual de usuario|manual)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Solis titula sus tablas "25K | 30K | 36K": se completa con la serie, p. ej. "S5-GC(25-36)K-LV".
function completarModelosCortos(nombres, textoOriginal, nombreArchivo, unicaTabla) {
  if (!nombres.every((nombre) => MODELO_CORTO.test(nombre))) return nombres
  const serie = /([A-Z][A-Z0-9]*-[A-Z0-9]+)\(\d[\d.,]*-\d[\d.,]*\)K((?:\d{2})?(?:-[A-Z0-9]{1,3}){0,4})(?![a-z])/
  const encontrada = unicaTabla ? (textoOriginal.match(serie) ?? nombreArchivo.match(serie)) : null
  if (!encontrada) return nombres.length === 1 && unicaTabla ? [modeloDesdeArchivo(nombreArchivo)] : nombres
  return nombres.map((nombre) => {
    const [, potencia, sufijo] = nombre.match(MODELO_CORTO)
    return `${encontrada[1]}${potencia.replace(',', '.')}K${sufijo ? sufijo.toUpperCase() : encontrada[2]}`
  })
}

// ---------------------------------------------------------------- campos derivados

const VOLTAJES_RED = [120, 127, 208, 220, 230, 240, 277, 380, 400, 415, 480, 600, 800]

function tipoRed(registro) {
  const texto = norm(`${registro._voltaje_red ?? ''} ${registro._conexion ?? ''}`)
  const modelo = norm(registro.modelo)
  if (!texto.trim()) return null

  let trifasico = null
  if (/trif|three|\b3\s*\/|3w|3l|3ph|3 ?p\b|3~|3 ?fases/.test(texto)) trifasico = true
  else if (/mono|single|split|bifas|\b1\s*\/|l\+n|l\/n|1ph|2w\b|1 ?p\b/.test(texto)) trifasico = false
  else if (/ktl3|3p|tl3|hmt/.test(modelo)) trifasico = true
  else if (/1p|2p|hms|tl-x|spf|sph|spe/.test(modelo)) trifasico = false

  let voltajes = numeros(texto).filter((v) => VOLTAJES_RED.includes(v))
  // "220 V / 380 V" en trifásico es fase-neutro / fase-fase de la misma red: cuenta la de línea.
  if (trifasico && voltajes.some((v) => v >= 380)) voltajes = voltajes.filter((v) => v >= 277)
  const tipos = new Set()
  for (const v of voltajes) {
    const esTri = trifasico ?? (v === 208 || v >= 277)
    if (!esTri) tipos.add('Monofasico 120/240V')
    else if (v === 480 || v === 277) tipos.add('Trifasico 480V')
    else if (v <= 240) tipos.add('Trifasico 208V')
    else if (v <= 415) tipos.add('Trifasico 380/400V')
    else tipos.add(`Trifasico ${v}V`)
  }
  if (tipos.size === 0 && trifasico != null) return trifasico ? 'Trifasico' : 'Monofasico 120/240V'
  return tipos.size ? [...tipos].join('; ') : null
}

function quimica(texto) {
  if (/lifepo4|\blfp\b|lithium iron|litio.?(hierro|ferro)|fosfato de hierro/.test(texto)) return 'LiFePO4'
  if (/\bnmc\b|\bncm\b/.test(texto)) return 'NMC'
  if (/lead.?acid|plomo|\bagm\b/.test(texto)) return 'Plomo-acido'
  if (/lithium|litio|li-ion/.test(texto)) return 'Litio'
  return null
}

function completar(categoria, registro, textoDocumento) {
  if (categoria === 'PANEL_SOLAR') {
    // La potencia suele ir en el nombre del modelo: LR8-66HGD-615M.
    registro.potencia_wp ??= numeros(registro.modelo.replace(/-/g, ' ')).find((n) => n >= 250 && n <= 800) ?? undefined
  }
  if (categoria === 'INVERSOR') registro.tipo_red = tipoRed(registro) ?? undefined
  if (categoria === 'BATERIA') {
    registro.tipo_quimica = quimica(textoDocumento) ?? undefined
    registro.acoplamiento = /ac.?coupl|acopl\w+ (en |de |a )?(ca|ac)\b/.test(textoDocumento) ? 'AC' : 'DC'
    // Más de 4C no es la potencia del módulo (suele ser la del sistema completo o un dato mal leído).
    if (registro.potencia_max_descarga_kw > registro.capacidad_kwh * 4) registro.potencia_max_descarga_kw = undefined
    // Sin potencia declarada se estima con P = V · I de la corriente máxima de descarga.
    if (registro.potencia_max_descarga_kw == null && registro.voltaje_nominal_v && registro._corriente_descarga) {
      registro.potencia_max_descarga_kw = redondear((registro.voltaje_nominal_v * registro._corriente_descarga) / 1000, 2)
    }
  }
  if (categoria === 'RSD') {
    registro.canales = /2\s*(a|to|en|in|:)\s*1|dual|two (modules|inputs)|dos (modulos|entradas)/.test(textoDocumento) ? '2 a 1' : '1 a 1'
  }
  return registro
}

// Un panel leído por OCR solo se acepta si sus valores son coherentes entre sí; un dígito mal
// reconocido o una fila tomada de otra tabla (NOCT, ganancia bifacial) rompe estas relaciones.
function panelCoherente(r) {
  if (![r.potencia_wp, r.voc, r.isc, r.vmp, r.imp].every((valor) => valor != null)) return false
  return (
    r.potencia_wp % 5 === 0 &&
    Math.abs(r.vmp * r.imp - r.potencia_wp) / r.potencia_wp <= 0.015 &&
    enRango(r.isc / r.imp, [1.02, 1.1]) &&
    enRango(r.voc / r.vmp, [1.12, 1.28])
  )
}

const MINIMOS = {
  PANEL_SOLAR: (r) => r.potencia_wp != null && (r.voc != null || r.isc != null),
  INVERSOR: (r) => r.potencia_ac_nominal_kw != null,
  BATERIA: (r) => r.capacidad_kwh != null,
  RSD: (r) => r.max_input_current_a != null || r.max_input_voltage_v != null,
}

// ---------------------------------------------------------------- entrada principal

// Devuelve { categoria, registros, avisos, paginasTotales, paginasUsadas }.
// opciones.ocr: el texto viene de OCR, así que se lee en modo estricto (ver `repartir`).
export function extraerFicha(nombreArchivo, paginas, opciones = {}) {
  const resultado = { categoria: 'OTRO', registros: [], avisos: [], paginasTotales: paginas.length, paginasUsadas: [] }
  const caracteres = paginas.reduce((total, pagina) => total + pagina.lineas.reduce((n, linea) => n + linea.texto.length, 0), 0)
  if (caracteres < 300) {
    resultado.avisos.push('PDF sin capa de texto (escaneado o exportado como imagen): requiere OCR.')
    return resultado
  }

  const archivo = norm(nombreArchivo)
  const esLargo = paginas.length > PAGINAS_DOCUMENTO_CORTO
  const utiles = esLargo ? paginas.filter(esPaginaDeEspecificaciones) : paginas
  resultado.paginasUsadas = utiles.map((pagina) => pagina.numero)
  if (esLargo) {
    resultado.avisos.push(
      utiles.length
        ? `Manual de ${paginas.length} páginas: solo se leyeron las ${utiles.length} con tablas de especificaciones.`
        : `Manual de ${paginas.length} páginas sin tablas de especificaciones reconocibles: omitido.`,
    )
  }
  if (utiles.length === 0) return resultado

  const textoOriginal = utiles.map((pagina) => pagina.lineas.map((linea) => linea.texto).join('\n')).join('\n')
  const textoDocumento = `${archivo}\n${norm(textoOriginal)}`
  if (ARCHIVO_OTRO.test(archivo) && !ARCHIVO_RSD.test(archivo)) return resultado

  const filas = utiles.flatMap(construirFilas)
  let { segmentos, previas } = segmentar(filas)
  // Con OCR los nombres de modelo salen mutilados; la fila de potencias es más fiable como encabezado.
  if ((segmentos.length === 0 || opciones.ocr) && clasificarSegmento(textoDocumento, textoDocumento) === 'PANEL_SOLAR') {
    const porPotencia = segmentoPorPotencia(filas, nombreArchivo)
    if (porPotencia) {
      segmentos = [porPotencia]
      previas = []
    }
  }
  const sinEncabezado = segmentos.length === 0
  if (sinEncabezado) {
    // Ficha de un solo modelo sin fila de encabezado: el nombre sale del archivo.
    const nombre = modeloDesdeArchivo(nombreArchivo)
    if (!/\d/.test(nombre)) {
      resultado.avisos.push('No se encontró el nombre del modelo ni en la tabla ni en el nombre del archivo.')
      return resultado
    }
    segmentos = [{ modelos: [{ nombre, centro: 0 }], filas }]
    previas = []
  }

  const marca = detectarMarca(nombreArchivo, textoDocumento)
  const conteo = {}
  let descartadosOcr = 0
  for (const segmento of segmentos) {
    // En una ficha de una sola tabla, datos como peso o dimensiones suelen quedar fuera de ella.
    const filasSegmento = segmentos.length === 1 ? [...segmento.filas, ...previas] : segmento.filas
    const textoFilas = filasSegmento.map((fila) => fila.celdas.map((celda) => celda.n).join(' ')).join('\n')
    const categoria = clasificarSegmento(segmentos.length === 1 ? textoDocumento : textoFilas, textoDocumento)
    if (!categoria) continue

    const nombres = completarModelosCortos(
      segmento.modelos.map((modelo) => modelo.nombre),
      textoOriginal,
      nombreArchivo,
      segmentos.length === 1,
    )
    const { registros: leidos, multicolumna } = leerCampos(categoria, filasSegmento, segmento.modelos, opciones.ocr)
    if (sinEncabezado && multicolumna) {
      resultado.avisos.push('La tabla trae varios modelos pero no se reconoció su fila de encabezado: revisar a mano.')
      continue
    }
    leidos.forEach((campos, i) => {
      let modelo = nombres[i].replace(/\s+/g, ' ').trim()
      if (norm(modelo).startsWith(`${norm(marca)} `)) modelo = modelo.slice(marca.length + 1)
      // Columna sin serie identificable o nombre cortado a media palabra: no se puede catalogar.
      if (MODELO_CORTO.test(modelo) || modelo.endsWith('-')) return
      const registro = completar(categoria, { marca, modelo, ...campos }, textoDocumento)
      if (!MINIMOS[categoria](registro)) return
      if (opciones.ocr && categoria === 'PANEL_SOLAR' && !panelCoherente(registro)) {
        descartadosOcr++
        return
      }
      // En tablas por clase de potencia el nombre sale de la potencia finalmente leída.
      if (segmento.serie && registro.potencia_wp) {
        const serie = norm(segmento.serie).startsWith(`${norm(marca)} `) ? segmento.serie.slice(marca.length + 1) : segmento.serie
        modelo = `${serie} ${registro.potencia_wp}W`
      }
      const limpio = { id: slug(`${marca} ${modelo}`), categoria, marca, modelo }
      for (const clave of ESQUEMA[categoria]) if (registro[clave] != null) limpio[clave] = registro[clave]
      if (opciones.ocr) limpio.ocr = 1 // leído por OCR: verificar contra el PDF
      resultado.registros.push(limpio)
      conteo[categoria] = (conteo[categoria] ?? 0) + 1
    })
  }

  if (descartadosOcr) resultado.avisos.push(`${descartadosOcr} modelo(s) descartados: el OCR dio valores incoherentes entre sí.`)
  const principal = Object.entries(conteo).sort((p, q) => q[1] - p[1])[0]
  if (principal) resultado.categoria = principal[0]
  else resultado.avisos.push('No se reconoció ninguna tabla de especificaciones con datos suficientes.')
  return resultado
}

export { unirRegistros } from './registros.js'
