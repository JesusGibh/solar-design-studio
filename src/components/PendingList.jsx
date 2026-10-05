// Lista de funcionalidades aún no implementadas dentro de una sección.
export default function PendingList({ items }) {
  return (
    <ul className="space-y-2 text-sm text-ink-muted">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}
