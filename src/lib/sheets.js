import { fieldHeader, getCategory } from '../config/equipos.js'
import { slug } from './fichas/registros.js'

// Convierte cualquier enlace de Google Sheets (compartir, publicar en la web o exportar) en su URL de CSV.
// Los enlaces que no son de Google se devuelven tal cual: se asume que ya apuntan a un CSV.
export function toCsvUrl(input) {
  let url
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('El enlace no es una URL válida.')
  }
  if (url.hostname !== 'docs.google.com') return url.href

  // Publicada en la web: /spreadsheets/d/e/<id>/pub o /pubhtml
  if (url.pathname.includes('/spreadsheets/d/e/')) {
    url.pathname = url.pathname.replace(/\/pubhtml$/, '/pub')
    url.searchParams.set('output', 'csv')
    return url.href
  }

  const id = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1]
  if (!id) throw new Error('El enlace no parece ser de una hoja de cálculo de Google.')
  const gid = url.searchParams.get('gid') ?? url.hash.match(/gid=(\d+)/)?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (src[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

// "Temp Coeff Voc (%/°C)" -> "tempcoeffvoc": sin unidades entre paréntesis, acentos ni símbolos.
function normalizeHeader(header) {
  return header
    .replace(/\(.*?\)/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Acepta "13,62", "51.2 V", "-0,25 %/°C" o "1.134,5".
function parseNumber(raw) {
  let value = raw.replace(/[^\d.,-]/g, '')
  if (!value) return null
  if (value.includes(',') && value.includes('.')) {
    value =
      value.lastIndexOf(',') > value.lastIndexOf('.')
        ? value.replace(/\./g, '').replace(',', '.')
        : value.replace(/,/g, '')
  } else {
    value = value.replace(',', '.')
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parseValue(field, raw) {
  const value = raw.trim()
  if (value === '') return field.type === 'list' ? [] : null
  if (field.type === 'number') return parseNumber(value)
  if (field.type === 'enum') return value.toUpperCase()
  if (field.type === 'list') {
    return value
      .split(/[;,|\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value
}

// Interpreta el CSV de una categoría. Las filas sin marca o modelo se omiten.
export function csvToEquipos(categoryId, text) {
  const { fields, categoria } = getCategory(categoryId)
  const [headers, ...allRows] = parseCsv(text)
  if (!headers) throw new Error('La hoja está vacía.')

  const normalized = headers.map(normalizeHeader)
  // catalogo_equipos.csv trae todas las categorías juntas: se toman solo las filas de la pedida.
  const categoriaIndex = normalized.indexOf('categoria')
  const rows =
    categoriaIndex === -1 ? allRows : allRows.filter((cells) => (cells[categoriaIndex] ?? '').trim().toUpperCase() === categoria)
  const columnOf = (field) => {
    const names = [field.key, field.label, ...(field.aliases ?? [])].map(normalizeHeader)
    return normalized.findIndex((header) => names.includes(header))
  }
  const mapping = fields.map((field) => ({ field, index: columnOf(field) }))
  const missing = mapping.filter(({ index }) => index === -1).map(({ field }) => fieldHeader(field))

  if (mapping.some(({ field, index }) => index === -1 && (field.key === 'marca' || field.key === 'modelo'))) {
    throw new Error('No se encontraron las columnas "Marca" y "Modelo" en la primera fila de la hoja.')
  }

  const equipos = rows
    .map((cells) =>
      Object.fromEntries(
        mapping.map(({ field, index }) => [field.key, parseValue(field, index === -1 ? '' : (cells[index] ?? ''))]),
      ),
    )
    .filter((equipo) => equipo.marca && equipo.modelo)
    .map((equipo) => ({ id: slug(`${equipo.marca} ${equipo.modelo}`), categoria, ...equipo }))

  if (equipos.length === 0) throw new Error('La hoja no tiene filas con marca y modelo para esta categoría.')
  return { equipos, omitidas: rows.length - equipos.length, faltantes: missing }
}

export async function fetchEquipos(categoryId, sheetUrl) {
  const csvUrl = toCsvUrl(sheetUrl)
  let response
  try {
    response = await fetch(csvUrl, { cache: 'no-store' })
  } catch {
    throw new Error(
      'No se pudo descargar la hoja. Revisa tu conexión y que esté compartida como "Cualquier persona con el enlace" o publicada en la web.',
    )
  }
  if (!response.ok) throw new Error(`Google respondió con un error (${response.status}). Revisa que la hoja sea pública.`)

  const text = await response.text()
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('El enlace devolvió una página web en lugar de un CSV. Revisa que la hoja sea pública.')
  }
  return csvToEquipos(categoryId, text)
}

// CSV de ejemplo con los encabezados esperados, para copiar a una hoja nueva.
export function equiposToCsv(categoryId, equipos) {
  const { fields } = getCategory(categoryId)
  const escape = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = [
    fields.map(fieldHeader),
    ...equipos.map((equipo) =>
      fields.map((field) => {
        const value = equipo[field.key]
        return Array.isArray(value) ? value.join('; ') : String(value ?? '')
      }),
    ),
  ]
  return lines.map((line) => line.map(escape).join(',')).join('\n')
}
