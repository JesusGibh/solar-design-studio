import { useEffect, useRef, useState } from 'react'
import { CloudDownload, Download, LoaderCircle, X } from 'lucide-react'
import { CATEGORIES, fieldHeader, getCategory } from '../config/equipos.js'
import { leerSesion } from '../lib/sesion.js'
import { equiposToCsv } from '../lib/sheets.js'

// Diálogo para pegar el enlace público de una hoja de Google y cargarla en una categoría.
// Se monta solo mientras está abierto, así su estado se reinicia en cada apertura.
export default function SheetModal({ categoryId, fuentes, onCargar, onClose }) {
  const dialogRef = useRef(null)
  const [selectedId, setSelectedId] = useState(categoryId)
  const [url, setUrl] = useState(fuentes[categoryId]?.url ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const category = getCategory(selectedId)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
  }, [])

  const selectCategory = (id) => {
    setSelectedId(id)
    setUrl(fuentes[id]?.url ?? '')
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCargar(selectedId, url)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // La plantilla lleva los encabezados esperados y unas filas reales del catálogo como ejemplo.
  const ejemplos = leerSesion().catalogo.filter((registro) => registro.categoria === category.categoria).slice(0, 5)
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(equiposToCsv(selectedId, ejemplos))}`

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="sheet-modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-md border border-line-strong bg-panel text-ink backdrop:bg-black/70"
    >
      <form onSubmit={handleSubmit}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 id="sheet-modal-title" className="flex items-center gap-2 text-sm font-semibold">
            <CloudDownload className="size-4 text-accent" aria-hidden="true" />
            Cargar desde Google Sheet
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-ink-muted hover:bg-raised hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 p-4">
          <fieldset>
            <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-dim">
              Categoría a reemplazar
            </legend>
            <div className="flex gap-1 rounded border border-line bg-base p-1">
              {CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectCategory(item.id)}
                  aria-pressed={item.id === selectedId}
                  className={`flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                    item.id === selectedId ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-dim">
              Enlace público de la hoja
            </span>
            <input
              type="url"
              required
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="w-full rounded border border-line bg-base px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-dim"
            />
          </label>

          <div className="rounded border border-line bg-base p-3 text-xs text-ink-muted">
            <p>
              Cada pestaña de la hoja es una categoría: abre la pestaña de {category.label.toLowerCase()}, copia su
              enlace y compártela como «Cualquier persona con el enlace». La primera fila debe tener estos
              encabezados:
            </p>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink">
              {category.fields.map(fieldHeader).join(' · ')}
            </p>
            <a
              href={templateHref}
              download={`plantilla-${selectedId}.csv`}
              className="mt-2 inline-flex items-center gap-1.5 text-accent hover:text-accent-strong"
            >
              <Download className="size-3.5" aria-hidden="true" />
              Descargar plantilla CSV
            </a>
          </div>

          {error && (
            <p role="alert" className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted hover:border-line-strong hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent-strong disabled:opacity-60"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Cargando…' : 'Cargar equipos'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
