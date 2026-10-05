// Extrae las especificaciones de los PDF de fichas_tecnicas/ y genera el catálogo de la app:
//   src/data/catalogo_equipos.json  (minificado, lo importa la app)
//   src/data/catalogo_equipos.csv   (para editar a mano o subir a Google Sheets)
//
// Uso:  npm run fichas                      procesa fichas_tecnicas/
//       npm run fichas -- otra/carpeta      procesa otra carpeta
//       npm run fichas -- --detalle         lista también los archivos sin registros
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { ESQUEMA, extraerFicha, unirRegistros } from '../src/lib/fichas/extract.js'
import { leerPaginas } from '../src/lib/fichas/pdfText.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argumentos = process.argv.slice(2)
const detalle = argumentos.includes('--detalle')
const carpeta = path.resolve(raiz, argumentos.find((argumento) => !argumento.startsWith('--')) ?? 'fichas_tecnicas')
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
console.log(`Procesando ${archivos.length} PDF de ${carpeta}\n`)

for (const archivo of archivos) {
  const nombre = path.basename(archivo)
  let resultado
  try {
    const datos = new Uint8Array(await readFile(path.join(carpeta, archivo)))
    resultado = extraerFicha(nombre, await leerPaginas(pdfjs, datos))
  } catch (error) {
    sinRegistros.push({ nombre, motivo: `No se pudo leer: ${error.message}` })
    continue
  }
  porCategoria[resultado.categoria] = (porCategoria[resultado.categoria] ?? 0) + 1
  if (resultado.registros.length === 0) {
    sinRegistros.push({ nombre, motivo: resultado.avisos.join(' ') || 'Clasificado como OTRO / MEDIDOR.' })
    continue
  }
  for (const registro of resultado.registros) registros.push({ ...registro, fuente: nombre })
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

const sinTexto = sinRegistros.filter(({ motivo }) => motivo.includes('OCR'))
console.log(`\n${sinRegistros.length} archivos sin registros (${sinTexto.length} sin capa de texto, requieren OCR).`)
if (detalle) for (const { nombre, motivo } of sinRegistros) console.log(`  - ${nombre}: ${motivo}`)
else console.log('Ejecuta con --detalle para ver el motivo de cada uno.')
