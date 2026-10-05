import { CircleAlert, CircleCheck, CircleDashed, CircleX } from 'lucide-react'

// Piezas de formulario y de resumen compartidas por los módulos de Consumo y Diseño.

export const inputClass =
  'w-full rounded border border-line bg-base px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-dim'
export const labelClass = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-dim'

export const fmt = (n, decimales = 1) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: decimales, minimumFractionDigits: 0 })

export function NumberField({ label, unit, value, onChange, options, hint, placeholder, min = '0' }) {
  const listId = options ? `opciones-${label.replace(/\W+/g, '-')}` : undefined
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step="any"
          list={listId}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} ${unit ? (unit.length > 3 ? 'pr-20' : 'pr-12') : ''}`}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-dim">
            {unit}
          </span>
        )}
      </span>
      {options && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
      {hint && <span className="mt-1 block text-xs text-ink-dim">{hint}</span>}
    </label>
  )
}

export function Stat({ label, value, unit }) {
  return (
    <div className="rounded border border-line bg-base px-3 py-2">
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-0.5 font-mono text-lg tabular-nums text-ink">
        {value}
        {unit && <span className="ml-1 text-xs text-ink-muted">{unit}</span>}
      </p>
    </div>
  )
}

// Conmutador de dos o más opciones excluyentes. options: [[valor, texto], …]
export function Toggle({ value, options, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1 rounded border border-line bg-base p-1 ${className}`}>
      {options.map(([opcion, texto]) => (
        <button
          key={opcion}
          type="button"
          aria-pressed={value === opcion}
          onClick={() => onChange(opcion)}
          className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
            value === opcion ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink'
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}

const ESTADOS = {
  ok: { icon: CircleCheck, tono: 'border-ok/40 bg-ok/10', color: 'text-ok', texto: 'Cumple' },
  warn: { icon: CircleAlert, tono: 'border-warn/40 bg-warn/10', color: 'text-warn', texto: 'Revisar' },
  danger: { icon: CircleX, tono: 'border-danger/40 bg-danger/10', color: 'text-danger', texto: 'No cumple' },
  pendiente: { icon: CircleDashed, tono: 'border-line bg-base', color: 'text-ink-dim', texto: 'Faltan datos' },
}

// Tarjeta de verificación con semáforo. estado: 'ok' | 'warn' | 'danger' | 'pendiente'
export function Check({ estado, titulo, children }) {
  const { icon: Icon, tono, color, texto } = ESTADOS[estado]
  return (
    <div className={`rounded border px-3 py-2.5 ${tono}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className={`size-4 shrink-0 ${color}`} aria-hidden="true" />
          {titulo}
        </p>
        <span className={`shrink-0 font-mono text-[11px] uppercase tracking-wider ${color}`}>{texto}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{children}</p>
    </div>
  )
}
