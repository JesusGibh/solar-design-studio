import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { inputClass, labelClass } from './campos.jsx'

const aTexto = (valor) => (Array.isArray(valor) ? valor.join(' | ') : String(valor ?? ''))

// Diálogo para corregir los valores de una ficha. Se monta solo mientras está abierto.
export default function EquipoModal({ category, equipo, onGuardar, onClose }) {
  const dialogRef = useRef(null)
  const [valores, setValores] = useState(() => Object.fromEntries(category.fields.map((field) => [field.key, aTexto(equipo[field.key])])))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const guardar = async (event) => {
    event.preventDefault()
    // Se parte de la ficha original para conservar su id y lo que no se edita aquí (OCR, activo).
    const nuevo = { ...equipo }
    for (const field of category.fields) {
      const texto = valores[field.key].trim()
      if (texto === '') {
        delete nuevo[field.key]
      } else if (field.type === 'number') {
        const numero = Number(texto.replace(',', '.'))
        if (!Number.isFinite(numero)) return setError(`«${texto}» no es un número válido en ${field.label}.`)
        nuevo[field.key] = numero
      } else if (field.type === 'list' && texto.includes('|')) {
        nuevo[field.key] = texto.split('|').map((parte) => parte.trim()).filter(Boolean)
      } else {
        nuevo[field.key] = field.type === 'enum' ? texto.toUpperCase() : texto
      }
    }
    if (!nuevo.marca || !nuevo.modelo) return setError('La marca y el modelo son obligatorios.')
    setGuardando(true)
    setError('')
    try {
      await onGuardar(nuevo)
    } catch (fallo) {
      setError(fallo.message)
      setGuardando(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="equipo-modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-md border border-line-strong bg-panel text-ink backdrop:bg-black/70"
    >
      <form onSubmit={guardar}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 id="equipo-modal-title" className="text-sm font-semibold">
            Editar ficha · {equipo.marca} {equipo.modelo}
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-ink-muted hover:text-ink">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {category.fields.map((field) => (
            <label key={field.key} className="block">
              <span className={labelClass}>
                {field.label}
                {field.unit && ` (${field.unit})`}
              </span>
              <input
                type="text"
                inputMode={field.type === 'number' ? 'decimal' : undefined}
                value={valores[field.key]}
                onChange={(event) => setValores((prev) => ({ ...prev, [field.key]: event.target.value }))}
                className={field.type === 'number' ? inputClass : `${inputClass} font-sans`}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mx-4 mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted hover:border-line-strong hover:text-ink">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent-strong disabled:opacity-60">
            {guardando && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            Guardar cambios
          </button>
        </footer>
      </form>
    </dialog>
  )
}
