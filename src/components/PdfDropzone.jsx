import { useState } from 'react'
import { FileUp, LoaderCircle } from 'lucide-react'

// Zona para arrastrar o elegir fichas técnicas en PDF. Entrega los archivos a `onFiles` (async).
export default function PdfDropzone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const process = async (fileList) => {
    const files = [...fileList].filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
    if (files.length === 0 || busy) return
    setBusy(true)
    try {
      await onFiles(files)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        process(event.dataTransfer.files)
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-4 py-3 transition-colors focus-within:border-accent ${
        dragging ? 'border-accent bg-accent/10' : 'border-line-strong bg-panel hover:border-accent/60'
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          process(event.target.files)
          event.target.value = ''
        }}
      />
      {busy ? (
        <LoaderCircle className="size-5 shrink-0 animate-spin text-accent" aria-hidden="true" />
      ) : (
        <FileUp className="size-5 shrink-0 text-accent" aria-hidden="true" />
      )}
      <span className="text-sm">
        <span className="font-medium text-ink">
          {busy ? 'Leyendo ficha técnica…' : 'Arrastrar o subir PDF de ficha técnica'}
        </span>
        <span className="block text-xs text-ink-muted">
          Se extraen los modelos de la tabla de especificaciones y se añaden al catálogo de este dispositivo.
        </span>
      </span>
    </label>
  )
}
