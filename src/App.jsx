import { useState } from 'react'
import { Eraser, Sun } from 'lucide-react'
import { SECTIONS } from './config/sections.js'
import { limpiarProyecto } from './hooks/useProyecto.js'
import { guardarCaptura3d } from './lib/captura3d.js'

export default function App() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id)
  const activeIndex = SECTIONS.findIndex((section) => section.id === activeId)
  const active = SECTIONS[activeIndex]
  const ActiveSection = active.component

  // Deja todos los campos en blanco para una propuesta nueva. El catálogo de equipos y el historial
  // no se tocan; el número siguiente se asigna al abrir la sección Propuesta.
  const limpiar = () => {
    if (!window.confirm('¿Limpiar todos los datos para empezar una propuesta nueva?\n\nSe borran cliente, consumo, techo trazado y finanzas del proyecto en pantalla. Si quieres conservarlo, guárdalo antes en la sección Propuesta.')) return
    limpiarProyecto()
    guardarCaptura3d(null)
    setActiveId('consumo')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded border border-accent/40 bg-accent/10">
              <Sun className="size-5 text-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight tracking-tight">
                Solar Design Studio
              </h1>
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                Dimensionamiento y diseño fotovoltaico
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={limpiar}
              title="Vaciar todos los campos para empezar una propuesta nueva"
              className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1 text-sm text-ink-muted transition-colors hover:border-danger/60 hover:text-danger"
            >
              <Eraser className="size-4" aria-hidden="true" />
              Limpiar
            </button>
            <span className="hidden rounded border border-line px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-muted sm:inline">
              Creado por Ing. Jesús Ariza
            </span>
          </div>
        </div>

        <nav
          aria-label="Secciones principales"
          className="mx-auto flex max-w-screen-2xl gap-1 overflow-x-auto px-4 sm:px-6"
        >
          {SECTIONS.map((section, index) => {
            const Icon = section.icon
            const isActive = section.id === activeId
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveId(section.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <span className={`font-mono text-[11px] ${isActive ? 'text-accent' : 'text-ink-dim'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Icon className="size-4" aria-hidden="true" />
                {section.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-accent">
            Paso {activeIndex + 1} de {SECTIONS.length}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{active.label}</h2>
          <p className="mt-1 text-sm text-ink-muted">{active.description}</p>
        </div>
        <ActiveSection irA={setActiveId} />
      </main>

      <footer className="border-t border-line px-4 py-2 sm:px-6">
        <p className="mx-auto max-w-screen-2xl font-mono text-[11px] uppercase tracking-wider text-ink-dim">
          v0.1.0 · base del proyecto
        </p>
      </footer>
    </div>
  )
}
