// Clasifica los equipos del catálogo leyendo el texto de su ficha técnica (fichas_tecnicas/*.pdf):
//   Inversores → tipo_bateria_soporte (NINGUNA | LOW_VOLTAGE | HIGH_VOLTAGE) y tipo_sistema
//                (ON_GRID si no admite batería; OFF_GRID o HIBRIDO si la admite, según diga la ficha)
//   Paneles    → tipo_tecnologia = BIFACIAL solo cuando la ficha lo dice; el resto queda sin marcar
//                para revisarlo a mano en Equipos.
// Nada se inventa: lo que la ficha no deja claro queda vacío y se lista como pendiente.
// Solo rellena campos vacíos de datos/*.csv; lo marcado a mano nunca se pisa.
//
// Uso:  node scripts/clasificar_fichas.js            muestra lo que encontraría
//       node scripts/clasificar_fichas.js --aplicar  lo escribe en los CSV de datos/
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { CATEGORIES, COLUMNAS_META } from '../src/config/equipos.js'
import { escribirCsv, leerCsv } from '../src/lib/csv.js'
import { leerPaginas } from '../src/lib/fichas/pdfText.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = path.join(raiz, 'fichas_tecnicas')
const aplicar = process.argv.includes('--aplicar')

// id del equipo → PDF del que salió (columna `fuente` del CSV que genera `npm run fichas`).
const fuentes = new Map(leerCsv(readFileSync(path.join(raiz, 'src/data/catalogo_equipos.csv'), 'utf8')).map((fila) => [fila.id, fila.fuente.replace(/ \(OCR\)$/, '')]))
const rutas = new Map(readdirSync(carpeta, { recursive: true }).filter((nombre) => /\.pdf$/i.test(nombre)).map((nombre) => [path.basename(nombre), path.join(carpeta, nombre)]))

const textos = new Map()
async function textoDe(nombre) {
  if (textos.has(nombre)) return textos.get(nombre)
  let texto = ''
  const ruta = rutas.get(nombre)
  if (ruta) {
    const paginas = await leerPaginas(pdfjs, new Uint8Array(readFileSync(ruta)))
    texto = paginas.flatMap((pagina) => pagina.lineas.map((linea) => linea.texto)).join('\n')
    // PDF escaneado: se usa el texto que el OCR dejó guardado al extraer la ficha.
    const cache = path.join(carpeta, '.ocr', `${nombre}.json`)
    if (texto.length < 300 && existsSync(cache)) texto = JSON.parse(readFileSync(cache, 'utf8')).paginas.flatMap((pagina) => pagina.lineas.map((linea) => linea.texto)).join('\n')
  }
  textos.set(nombre, texto)
  return texto
}

// Tensión de batería que declara la ficha: se buscan los voltios que acompañan a la palabra batería.
function soporteBateria(texto) {
  const lineas = texto.split('\n').filter((linea) => /batter|bater[ií]a/i.test(linea))
  if (!lineas.length) return { soporte: 'NINGUNA' }
  if (/high[- ]voltage batter|bater[ií]a de alto voltaje|\bHV batter/i.test(texto)) return { soporte: 'HIGH_VOLTAGE' }
  if (/low[- ]voltage batter|bater[ií]a de bajo voltaje|\bLV batter/i.test(texto)) return { soporte: 'LOW_VOLTAGE' }
  const voltios = lineas
    .filter((linea) => /volt|tensi[oó]n|\bV\b/i.test(linea))
    .flatMap((linea) => [...linea.matchAll(/(\d{2,4}(?:[.,]\d+)?)\s*(?:V\b|Vdc|VDC)/g)].map((hallazgo) => Number(hallazgo[1].replace(',', '.'))))
    .filter((valor) => valor >= 12 && valor <= 1000)
  if (!voltios.length) return { soporte: null, nota: 'menciona batería sin indicar su tensión' }
  return { soporte: Math.max(...voltios) <= 64 ? 'LOW_VOLTAGE' : Math.min(...voltios) >= 80 ? 'HIGH_VOLTAGE' : null, nota: `tensiones de batería ${Math.min(...voltios)}–${Math.max(...voltios)} V` }
}

// Microinversor si la ficha lo dice; los demás conectados a red (on-grid o híbridos) son de string.
function clasificarInversor(texto, contexto) {
  const resultado = clasificarSistema(texto, contexto)
  const { modelo } = contexto.fila
  // Regla fijada por el usuario: las series Growatt SPE y SPF son equipos aislados.
  if (/^SP[EF]\b/.test(modelo)) resultado.forzar = { tipo_sistema: 'OFF_GRID' }
  const sistema = resultado.forzar?.tipo_sistema ?? contexto.fila.tipo_sistema ?? resultado.tipo_sistema
  if (/micro[s-]?inver/i.test(`${modelo} ${contexto.nombre}`) || (texto && /micro[s-]?inver/i.test(texto) && !contexto.variasFamilias)) resultado.topologia = 'MICRO'
  else if (sistema === 'ON_GRID' || sistema === 'HIBRIDO') resultado.topologia = 'STRING'
  return resultado
}

function clasificarSistema(texto, { nombre, variasFamilias }) {
  if (!texto) return { nota: 'sin ficha legible' }
  const { soporte, nota } = soporteBateria(texto)
  if (soporte === 'NINGUNA') return { tipo_bateria_soporte: 'NINGUNA', tipo_sistema: 'ON_GRID' }
  // Un catálogo con varias familias mezcla equipos con y sin batería: no se puede saber cuál es cuál.
  if (variasFamilias) return { nota: 'viene de un catálogo con varias familias de equipos' }
  texto = `${nombre}\n${texto}` // el nombre del archivo suele decir "híbrido" u "off-grid"
  const hibrido = /hybrid|h[ií]brido/i.test(texto)
  const aislado = /off[- ]?grid|aislado|stand[- ]?alone/i.test(texto)
  return { tipo_bateria_soporte: soporte ?? '', tipo_sistema: hibrido ? 'HIBRIDO' : aislado ? 'OFF_GRID' : '', nota: [nota, !hibrido && !aislado && 'admite batería, pero la ficha no dice si es híbrido o aislado'].filter(Boolean).join('; ') }
}

const clasificarPanel = (texto) => (/bifacial/i.test(texto) ? { tipo_tecnologia: 'BIFACIAL' } : {})

// El rango de una batería sale de su voltaje nominal, que ya está en la ficha.
const clasificarBateria = (_texto, { fila }) => {
  const voltios = Number(fila.voltaje_nominal_v)
  return voltios > 0 && voltios <= 64 ? { rango_voltaje: 'LOW_VOLTAGE' } : voltios >= 80 ? { rango_voltaje: 'HIGH_VOLTAGE' } : {}
}

const trabajos = [
  { id: 'inversores', campos: ['tipo_sistema', 'tipo_bateria_soporte', 'topologia'], clasificar: clasificarInversor },
  { id: 'paneles', campos: ['tipo_tecnologia'], clasificar: clasificarPanel },
  { id: 'baterias', campos: ['rango_voltaje'], clasificar: clasificarBateria },
]

for (const { id, campos, clasificar } of trabajos) {
  const categoria = CATEGORIES.find((item) => item.id === id)
  const archivo = path.join(raiz, 'datos', `${id}.csv`)
  const filas = leerCsv(readFileSync(archivo, 'utf8'))
  const resumen = {}
  const pendientes = []
  const familiaDe = (fila) => fila.modelo.split(/[\s-]/)[0].replace(/\d.*$/, '')
  const familiasPorFuente = new Map()
  for (const fila of filas) {
    const fuente = fuentes.get(fila.id) ?? ''
    familiasPorFuente.set(fuente, (familiasPorFuente.get(fuente) ?? new Set()).add(familiaDe(fila)))
  }
  for (const fila of filas) {
    const nombre = fuentes.get(fila.id) ?? ''
    const resultado = clasificar(await textoDe(nombre), { nombre, fila, variasFamilias: familiasPorFuente.get(nombre).size > 1 })
    for (const campo of campos) if (!fila[campo] && resultado[campo]) fila[campo] = resultado[campo]
    Object.assign(fila, resultado.forzar)
    const clave = campos.map((campo) => fila[campo] || '—').join(' / ')
    resumen[clave] ??= {}
    const familia = `${fila.marca} ${fila.modelo.split(/[\s-]/)[0]}`
    resumen[clave][familia] = (resumen[clave][familia] ?? 0) + 1
    if (campos.some((campo) => !fila[campo]) && id !== 'paneles') pendientes.push(`${fila.marca} ${fila.modelo}: ${resultado.nota ?? 'sin dato'}`)
  }
  console.log(`\n=== ${categoria.label} (${campos.join(' / ')}) ===`)
  for (const [clave, familias] of Object.entries(resumen)) console.log(`${clave}: ${Object.values(familias).reduce((a, b) => a + b, 0)}\n    ${Object.entries(familias).map(([familia, n]) => `${familia} ×${n}`).join(', ')}`)
  if (pendientes.length) console.log(`Pendientes de revisar a mano (${pendientes.length}):\n    ${pendientes.join('\n    ')}`)
  if (aplicar) {
    const columnas = ['id', ...categoria.fields.map((campo) => campo.key), ...COLUMNAS_META]
    writeFileSync(archivo, escribirCsv(columnas, filas))
    console.log(`Escrito en datos/${id}.csv`)
  }
}
if (!aplicar) console.log('\nVista previa: no se escribió nada. Añade --aplicar para guardarlo en datos/.')
