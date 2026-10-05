export default function Panel({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={`rounded-md border border-line bg-panel ${className}`}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        {Icon && <Icon className="size-4 text-accent" aria-hidden="true" />}
        <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
          {title}
        </h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
