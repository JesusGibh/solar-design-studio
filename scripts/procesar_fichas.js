// Extrae las especificaciones de los PDF de fichas_tecnicas/ y genera el catálogo de la app:
//   src/data/catalogo_equipos.json  (minificado, lo importa la app)
//   src/data/catalogo_equipos.csv   (para editar a mano o subir a Google Sheets)
//
// Uso:  npm run fichas                      procesa fichas_tecnicas/
//       npm run fichas -- otra/carpeta      procesa otra carpeta
//       npm run fichas -- --detalle         lista también los archivos sin registros
//       npm run fichas -- --sin-ocr         no intenta leer los PDF escaneados (más rápido)
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { ESQUEMA, extraerFicha, unirRegistros } from '../src/lib/fichas/extract.js'
import { leerPaginas } from '../src/lib/fichas/pdfText.js'
import { crearOcr } from './ocr.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argumentos = process.argv.slice(2)
const detalle = argumentos.includes('--detalle')
const sinOcr = argumentos.includes('--sin-ocr')
const carpeta = path.resolve(raiz, argumentos.find((argumento) => !argumento.startsWith('--')) ?? 'fichas_tecnicas')
const carpetaOcr = path.join(carpeta, '.ocr')
const MAX_PAGINAS_OCR = 14
const salidaJson = path.join(raiz, 'src/data/catalogo_equipos.json')
const salidaCsv = path.join(raiz, 'src/data/catalogo_equipos.csv')

const ORDEN_CATEGORIAS = Object.keys(ESQUEMA)
const COLUMNAS = ['id', 'categoria', 'marca', 'modelo', ...new Set(Object.values(ESQUEMA).flat()), 'fuente']

function aCsv(registros) {
  const escapar = (valor) => {
    const texto = String(valor ?? '')
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  return [COLUMNAS, ...registros.map((registro) => COLUMNAS.map((columna) => registro[columna]))]
    .map((fila) => fila.map(escapar).join(','))
    .join('\n')
}

await mkdir(carpeta, { recursive: true })
const archivos = (await readdir(carpeta, { recursive: true })).filter((nombre) => /\.pdf$/i.test(nombre)).sort()
if (archivos.length === 0) {
  console.log(`No hay PDFs en ${carpeta}. Copia ahí las fichas técnicas y vuelve a ejecutar.`)
  process.exit(0)
}

const registros = []
const sinRegistros = []
const porCategoria = {}
let ocr = null
let leidosConOcr = 0
console.log(`Procesando ${archivos.length} PDF de ${carpeta}\n`)

// Texto por OCR de un PDF escaneado. El resultado se guarda junto a las fichas (carpeta .ocr) para
// que las siguientes ejecuciones no repitan el reconocimiento, que tarda varios segundos por página.
async function leerConOcr(nombre, datos) {
  const cache = path.join(carpetaOcr, `${nombre}.json`)
  try {
    const guardado = JSON.parse(await readFile(cache, 'utf8'))
    if (guardado.tamano === datos.length) return guardado.paginas
  } catch {
    // Sin caché o caché ilegible: se reconoce de nuevo.
  }
  ocr ??= await crearOcr(path.join(raiz, 'node_modules/.cache/tesseract'))
  console.log(`  OCR…        ${nombre}`)
  const { paginas } = await ocr.leerPaginas(pdfjs, datos.slice(), MAX_PAGINAS_OCR)
  await mkdir(carpetaOcr, { recursive: true })
  await writeFile(cache, JSON.stringify({ tamano: datos.length, paginas }))
  return paginas
}

for (const archivo of archivos) {
  const nombre = path.basename(archivo)
  let resultado
  let conOcr = false
  try {
    const datos = new Uint8Array(await readFile(path.join(carpeta, archivo)))
    // pdf.js se queda con el búfer que recibe, por eso se le pasa una copia.
    let paginas = await leerPaginas(pdfjs, datos.slice())
    const caracteres = paginas.reduce((total, pagina) => total + pagina.lineas.reduce((n, linea) => n + linea.texto.length, 0), 0)
    if (caracteres < 300 && !sinOcr) {
      if (paginas.length > MAX_PAGINAS_OCR) {
        sinRegistros.push({ nombre, motivo: `Manual escaneado de ${paginas.length} páginas: OCR omitido por su tamaño.` })
        continue
      }
      paginas = await leerConOcr(nombre, datos)
      conOcr = true
    }
    resultado = extraerFicha(nombre, paginas, { ocr: conOcr })
  } catch (error) {
    sinRegistros.push({ nombre, motivo: `No se pudo leer: ${error.message}` })
    continue
  }
  if (conOcr) leidosConOcr++
  porCategoria[resultado.categoria] = (porCategoria[resultado.categoria] ?? 0) + 1
  if (resultado.registros.length === 0) {
    sinRegistros.push({ nombre, motivo: resultado.avisos.join(' ') || 'Clasificado como OTRO / MEDIDOR.' })
    continue
  }
  // Lo leído por OCR se marca en la columna `fuente` del CSV: conviene revisarlo contra el PDF.
  for (const registro of resultado.registros) registros.push({ ...registro, fuente: conOcr ? `${nombre} (OCR)` : nombre })
  const modelos = resultado.registros.map((registro) => registro.modelo).join(', ')
  console.log(`  ${resultado.categoria.padEnd(11)} ${String(resultado.registros.length).padStart(2)} modelo(s)  ${nombre}`)
  console.log(`              ${modelos}`)
  if (resultado.paginasUsadas.length < resultado.paginasTotales) console.log(`              ${resultado.avisos[0]}`)
}

const catalogo = unirRegistros(registros).sort(
  (p, q) =>
    ORDEN_CATEGORIAS.indexOf(p.categoria) - ORDEN_CATEGORIAS.indexOf(q.categoria) ||
    p.marca.localeCompare(q.marca) ||
    p.modelo.localeCompare(q.modelo, 'es', { numeric: true }),
)

await mkdir(path.dirname(salidaJson), { recursive: true })
// El JSON no lleva `fuente`: solo los campos del esquema, para que pese lo mínimo.
await writeFile(salidaJson, JSON.stringify(catalogo.map(({ fuente, ...registro }) => registro)))
await writeFile(salidaCsv, aCsv(catalogo))

console.log(`\nArchivos por categoría: ${Object.entries(porCategoria).map(([categoria, n]) => `${categoria} ${n}`).join(' · ')}`)
console.log(
  `Catálogo: ${catalogo.length} equipos (${ORDEN_CATEGORIAS.map((categoria) => `${categoria} ${catalogo.filter((registro) => registro.categoria === categoria).length}`).join(' · ')})`,
)
console.log(`  ${path.relative(raiz, salidaJson)}\n  ${path.relative(raiz, salidaCsv)}`)

await ocr?.cerrar()
console.log(`\n${leidosConOcr} PDF escaneados leídos con OCR · ${sinRegistros.length} archivos sin registros.`)
if (detalle) for (const { nombre, motivo } of sinRegistros) console.log(`  - ${nombre}: ${motivo}`)
else console.log('Ejecuta con --detalle para ver el motivo de cada uno.')
