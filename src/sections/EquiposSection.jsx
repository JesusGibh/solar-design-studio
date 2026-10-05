import { useState } from 'react'
import { CloudDownload, LoaderCircle, RefreshCw, RotateCcw, Search } from 'lucide-react'
import PdfDropzone from '../components/PdfDropzone.jsx'
import SheetModal from '../components/SheetModal.jsx'
import { CATEGORIES, getCategory } from '../config/equipos.js'
import { useEquipos } from '../hooks/useEquipos.js'

const secondaryButton =
  'flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60'

function describeResult(category, { equipos, omitidas, faltantes }) {
  const parts = [`${equipos.length} ${category.label.toLowerCase()} cargados desde Google Sheets.`]
  if (omitidas > 0) parts.push(`${omitidas} filas omitidas por no tener marca o modelo.`)
  if (faltantes.length > 0) parts.push(`Columnas no encontradas: ${faltantes.join(', ')}.`)
  return parts.join(' ')
}

function Cell({ field, equipo }) {
  const value = field.format ? field.format(equipo) : equipo[field.key]
  if (value == null || value.length === 0) return <span className="text-ink-dim">—</span>

  if (field.type === 'list') {
    // El catálogo JSON guarda la lista como texto separado por ";"; el CSV importado, como arreglo.
    const items = Array.isArray(value) ? value : String(value).split(/\s*;\s*/)
    return (
      <span className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[11px]">
            {item}
          </span>
        ))}
      </span>
    )
  }
  if (field.type === 'enum') {
    return (
      <span
        className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
          value === 'DC' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-ok/40 bg-ok/10 text-ok'
        }`}
      >
        {value}
      </span>
    )
  }
  return value
}

export default function EquiposSection() {
  const { catalogo, fuentes, modificadas, cargarDesdeSheet, agregar, restaurar } = useEquipos()
  const [activeId, setActiveId] = useState(CATEGORIES[0].id)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState(null)

  const category = getCategory(activeId)
  const equipos = catalogo[activeId]
  const fuente = fuentes[activeId]
  const columns = category.fields.filter((field) => !field.tableHidden)
  const term = query.trim().toLowerCase()
  const visibles = term
    ? equipos.filter((equipo) => `${equipo.marca} ${equipo.modelo}`.toLowerCase().includes(term))
    : equipos

  const selectCategory = (id) => {
    setActiveId(id)
    setQuery('')
  }

  const handleCargar = async (categoryId, url) => {
    const resultado = await cargarDesdeSheet(categoryId, url)
    setModalOpen(false)
    selectCategory(categoryId)
    setNotice({ ok: true, text: describeResult(getCategory(categoryId), resultado) })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const resultado = await cargarDesdeSheet(activeId, fuente.url)
      setNotice({ ok: true, text: describeResult(category, resultado) })
    } catch (err) {
      setNotice({ ok: false, text: `${err.message} Se mantiene el último catálogo guardado.` })
    } finally {
      setRefreshing(false)
    }
  }

  const handleRestaurar = () => {
    restaurar(activeId)
    setNotice({ ok: true, text: `Se restauró el catálogo por defecto de ${category.label.toLowerCase()}.` })
  }

  const handlePdfs = async (files) => {
    const { extraerDePdf } = await import('../lib/fichas/navegador.js')
    const lines = []
    const nuevos = []
    for (const file of files) {
      try {
        const { registros, avisos } = await extraerDePdf(file)
        nuevos.push(...registros)
        lines.push(
          registros.length
            ? `${file.name}: ${registros.length} modelo(s) añadidos — ${registros.map((registro) => registro.modelo).join(', ')}`
            : `${file.name}: sin equipos reconocidos. ${avisos.join(' ') || 'No parece una ficha de panel, inversor, batería o RSD.'}`,
        )
      } catch (err) {
        lines.push(`${file.name}: no se pudo leer el PDF (${err.message}).`)
      }
    }
    if (nuevos.length > 0) {
      agregar(nuevos)
      selectCategory(CATEGORIES.find((item) => item.categoria === nuevos[0].categoria).id)
    }
    setNotice({ ok: nuevos.length > 0, text: lines.join('\n') })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tipo de equipo" className="flex gap-1 rounded-md border border-line bg-panel p-1">
          {CATEGORIES.map((item) => {
            const Icon = item.icon
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectCategory(item.id)}
                className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon className={`size-4 ${isActive ? 'text-accent' : ''}`} aria-hidden="true" />
                {item.label}
                <span className="font-mono text-[11px] text-ink-dim">{catalogo[item.id].length}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {fuente && (
            <button type="button" onClick={handleRefresh} disabled={refreshing} className={secondaryButton}>
              {refreshing ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              Actualizar
            </button>
          )}
          {modificadas.has(activeId) && (
            <button type="button" onClick={handleRestaurar} className={secondaryButton}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Restaurar por defecto
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-strong"
          >
            <CloudDownload className="size-4" aria-hidden="true" />
            Cargar desde Google Sheet (CSV URL)
          </button>
        </div>
      </div>

      <PdfDropzone onFiles={handlePdfs} />

      {notice && (
        <p
          role="status"
          className={`whitespace-pre-line rounded border px-3 py-2 text-sm ${
            notice.ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {notice.text}
        </p>
      )}

      <section className="rounded-md border border-line bg-panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {category.label} · {visibles.length} de {equipos.length}
            <span className="ml-3 normal-case tracking-normal text-ink-dim">
              {fuente
                ? `Google Sheets · cargado el ${new Date(fuente.fecha).toLocaleString('es')}`
                : 'Catálogo extraído de las fichas técnicas'}
            </span>
          </p>
          <label className="relative">
            <span className="sr-only">Buscar por marca o modelo</span>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-dim"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar marca o modelo"
              className="w-56 rounded border border-line bg-base py-1.5 pl-8 pr-3 text-sm placeholder:text-ink-dim"
            />
          </label>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                {columns.map((field) => (
                  <th key={field.key} scope="col" className="whitespace-nowrap px-4 py-2 font-medium">
                    {field.tableLabel ?? field.label}
                    {field.unit && <span className="ml-1 normal-case text-ink-dim/70">({field.unit})</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((equipo, index) => (
                <tr
                  key={`${equipo.marca}-${equipo.modelo}-${index}`}
                  className="border-b border-line/60 transition-colors last:border-0 hover:bg-raised"
                >
                  {columns.map((field) => (
                    <td
                      key={field.key}
                      className={`whitespace-nowrap px-4 py-2.5 ${
                        field.key === 'marca'
                          ? 'font-medium text-ink'
                          : field.key === 'modelo'
                            ? 'text-ink'
                            : 'font-mono text-xs tabular-nums text-ink-muted'
                      }`}
                    >
                      <Cell field={field} equipo={equipo} />
                      {field.key === 'modelo' && equipo.ocr && (
                        <span
                          title="Leído por OCR de un PDF escaneado: verificar"
                          className="ml-2 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] text-warn"
                        >
                          OCR
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-ink-dim">
                    {equipos.length === 0
                      ? 'Aún no hay equipos en esta categoría. Sube una ficha técnica en PDF o carga una hoja de Google.'
                      : `Ningún equipo coincide con «${query}».`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-ink-dim">
        Los valores se extraen automáticamente de las fichas técnicas. Los marcados OCR vienen de PDF escaneados y
        pueden traer dígitos mal leídos: verifícalos contra la ficha antes de usarlos en un diseño.
      </p>

      {modalOpen && (
        <SheetModal
          categoryId={activeId}
          fuentes={fuentes}
          onCargar={handleCargar}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
