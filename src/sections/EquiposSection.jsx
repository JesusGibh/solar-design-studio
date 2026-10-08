import { useState } from 'react'
import { ArrowDown, ArrowUp, CloudDownload, Columns3, Eye, EyeOff, Globe, LoaderCircle, Pencil, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react'
import EquipoModal from '../components/EquipoModal.jsx'
import PdfDropzone from '../components/PdfDropzone.jsx'
import SheetModal from '../components/SheetModal.jsx'
import { CATEGORIES, getCategory } from '../config/equipos.js'
import { getRol } from '../config/roles.js'
import { useEquipos } from '../hooks/useEquipos.js'
import { useSesion } from '../lib/sesion.js'

// Campo por el que se filtra la capacidad en cada categoría.
const CAPACIDAD = { paneles: 'potencia_wp', inversores: 'potencia_ac_nominal_kw', baterias: 'capacidad_kwh' }
// Columnas ocultas por categoría; se recuerdan en este navegador. Marca y modelo siempre se muestran.
const CLAVE_COLUMNAS = 'sds.equipos.columnas'
const FIJAS = ['marca', 'modelo']
function leerOcultas() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLUMNAS)) ?? {}
  } catch {
    return {}
  }
}
const filtro = 'rounded border border-line bg-base px-2 py-1.5 text-sm placeholder:text-ink-dim'
const accion = 'rounded border border-line p-1.5 text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50'

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
  if (field.options) {
    return <span className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[11px]">{field.options.find(([opcion]) => opcion === value)?.[1] ?? value}</span>
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
  const { completo: catalogo, fuentes, modificadas, cargarDesdeSheet, agregar, guardarEquipo, eliminarEquipo, restaurar } = useEquipos()
  const puedeEditar = getRol(useSesion().perfil.rol).equipos
  const [marca, setMarca] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [editando, setEditando] = useState(null)
  const [ocultas, setOcultas] = useState(leerOcultas)
  const [orden, setOrden] = useState(null) // { key, desc } | null = orden del catálogo
  const [activeId, setActiveId] = useState(CATEGORIES[0].id)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState(null)

  const category = getCategory(activeId)
  const equipos = catalogo[activeId]
  const fuente = fuentes[activeId]
  const disponibles = category.fields.filter((field) => !field.tableHidden)
  const ocultasAqui = ocultas[activeId] ?? []
  const columns = disponibles.filter((field) => !ocultasAqui.includes(field.key))
  const alternarColumna = (key) => {
    const nuevas = { ...ocultas, [activeId]: ocultasAqui.includes(key) ? ocultasAqui.filter((otra) => otra !== key) : [...ocultasAqui, key] }
    setOcultas(nuevas)
    try {
      localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(nuevas))
    } catch {
      // Sin almacenamiento la elección dura solo esta sesión.
    }
  }
  const term = query.trim().toLowerCase()
  const marcas = [...new Set(equipos.map((equipo) => equipo.marca))].sort((a, b) => a.localeCompare(b))
  const campoCapacidad = category.fields.find((field) => field.key === CAPACIDAD[activeId])
  const limite = (texto) => (texto.trim() === '' || !Number.isFinite(Number(texto.replace(',', '.'))) ? null : Number(texto.replace(',', '.')))
  const minimo = limite(desde)
  const maximo = limite(hasta)
  const visibles = equipos.filter((equipo) => {
    if (term && !`${equipo.marca} ${equipo.modelo}`.toLowerCase().includes(term)) return false
    if (marca && equipo.marca !== marca) return false
    if (campoCapacidad && (minimo != null || maximo != null)) {
      const capacidad = equipo[campoCapacidad.key]
      if (capacidad == null || (minimo != null && capacidad < minimo) || (maximo != null && capacidad > maximo)) return false
    }
    return true
  })
  // Orden por la característica elegida: números de menor a mayor, textos alfabéticos; lo vacío al final.
  if (orden) {
    const signo = orden.desc ? -1 : 1
    visibles.sort((a, b) => {
      const [p, q] = [a[orden.key], b[orden.key]].map((valor) => (Array.isArray(valor) ? valor.join(' ') : valor))
      if (p == null || p === '') return q == null || q === '' ? 0 : 1
      if (q == null || q === '') return -1
      return signo * (typeof p === 'number' && typeof q === 'number' ? p - q : String(p).localeCompare(String(q), 'es', { numeric: true }))
    })
  }
  const ordenarPor = (key) => setOrden((actual) => (actual?.key !== key ? { key, desc: false } : actual.desc ? null : { key, desc: true }))
  // Campos de la columna (una columna combinada, como las dimensiones, cubre varios).
  const clavesDe = (field) => (field.key === 'largo_mm' ? ['largo_mm', 'ancho_mm'] : field.key === 'v_mppt_min' ? ['v_mppt_min', 'v_mppt_max'] : [field.key])
  const filtrando = Boolean(term || marca || minimo != null || maximo != null)

  const limpiarFiltros = () => {
    setQuery('')
    setMarca('')
    setDesde('')
    setHasta('')
  }

  const selectCategory = (id) => {
    setActiveId(id)
    limpiarFiltros()
    setOrden(null)
  }

  // Dónde quedó el cambio: en la base de datos (trabajando en local) o solo en este navegador.
  const destino = ({ base, hoja }) =>
    [base && `en la base de datos (datos/${activeId}.csv)`, hoja && 'en la hoja compartida de Google Sheets'].filter(Boolean).join(' y ') ||
    'solo en este navegador: no hay hoja compartida conectada'
  const conEquipo = async (texto, operacion) => {
    try {
      setNotice({ ok: true, text: `${texto} ${destino(await operacion())}.` })
    } catch (err) {
      setNotice({ ok: false, text: err.message })
    }
  }
  const alternarActivo = (equipo) => {
    const { activo: _activo, ...resto } = equipo
    const activar = equipo.activo === false
    conEquipo(`${equipo.marca} ${equipo.modelo} ${activar ? 'activada' : 'desactivada: ya no se ofrece al dimensionar'}, guardado`, () => guardarEquipo(activeId, activar ? resto : { ...resto, activo: false }))
  }
  const eliminar = (equipo) => {
    if (!window.confirm(`¿Eliminar la ficha ${equipo.marca} ${equipo.modelo}? Si solo quieres que no se use, desactívala.`)) return
    conEquipo(`${equipo.marca} ${equipo.modelo} eliminada`, () => eliminarEquipo(activeId, equipo.id))
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
      const { base, hoja } = await agregar(nuevos)
      lines.push(base || hoja ? `Guardado ${[base && 'en la base de datos', hoja && 'en la hoja compartida'].filter(Boolean).join(' y ')}.` : 'Guardado solo en este navegador.')
      selectCategory(CATEGORIES.find((item) => item.categoria === nuevos[0].categoria).id)
    }
    setNotice({ ok: nuevos.length > 0, text: lines.join('\n') })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tipo de equipo" className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-line bg-panel p-1">
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
                className={`flex shrink-0 items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
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
            <span className="sm:hidden">Cargar Google Sheet</span>
            <span className="hidden sm:inline">Cargar desde Google Sheet (CSV URL)</span>
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
                : 'Base de datos del proyecto'}
            </span>
          </p>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <label>
              <span className="sr-only">Filtrar por marca</span>
              <select value={marca} onChange={(event) => setMarca(event.target.value)} className={filtro}>
                <option value="">Todas las marcas</option>
                {marcas.map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
            {campoCapacidad && (
              <div className="flex items-center gap-1.5 text-xs text-ink-dim">
                <span>
                  Capacidad ({campoCapacidad.unit ?? campoCapacidad.label})
                </span>
                <input type="text" inputMode="decimal" value={desde} onChange={(event) => setDesde(event.target.value)} placeholder="desde" aria-label="Capacidad mínima" className={`${filtro} w-20 font-mono`} />
                <span>–</span>
                <input type="text" inputMode="decimal" value={hasta} onChange={(event) => setHasta(event.target.value)} placeholder="hasta" aria-label="Capacidad máxima" className={`${filtro} w-20 font-mono`} />
              </div>
            )}
            <label className="relative min-w-40 flex-1 lg:flex-none">
              <span className="sr-only">Buscar por marca o modelo</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-dim" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar marca o modelo"
                className="w-full rounded border border-line bg-base py-1.5 pl-8 pr-3 text-sm placeholder:text-ink-dim lg:w-56"
              />
            </label>
            <details className="relative">
              <summary className={`${filtro} flex cursor-pointer list-none items-center gap-1.5 text-ink-muted hover:text-ink`}>
                <Columns3 className="size-4" aria-hidden="true" />
                Columnas
                {ocultasAqui.length > 0 && <span className="font-mono text-[11px] text-accent">−{ocultasAqui.length}</span>}
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-line-strong bg-panel p-2 shadow-lg">
                {disponibles
                  .filter((field) => !FIJAS.includes(field.key))
                  .map((field) => (
                    <label key={field.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink">
                      <input type="checkbox" checked={!ocultasAqui.includes(field.key)} onChange={() => alternarColumna(field.key)} className="accent-(--color-accent)" />
                      {field.tableLabel ?? field.label}
                    </label>
                  ))}
              </div>
            </details>
            {filtrando && (
              <button type="button" onClick={limpiarFiltros} className="text-xs text-ink-muted underline hover:text-ink">
                Quitar filtros
              </button>
            )}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                {columns.map((field) => (
                  <th key={field.key} scope="col" aria-sort={orden?.key === field.key ? (orden.desc ? 'descending' : 'ascending') : undefined} className="whitespace-nowrap px-4 py-2 font-medium">
                    <button type="button" onClick={() => ordenarPor(field.key)} title="Ordenar por esta columna" className="flex items-center gap-1 uppercase tracking-wider hover:text-ink">
                      {field.tableLabel ?? field.label}
                      {field.unit && <span className="normal-case text-ink-dim/70">({field.unit})</span>}
                      {orden?.key === field.key && (orden.desc ? <ArrowDown className="size-3 text-accent" aria-hidden="true" /> : <ArrowUp className="size-3 text-accent" aria-hidden="true" />)}
                    </button>
                  </th>
                ))}
                {puedeEditar && <th scope="col" className="px-4 py-2 text-right font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((equipo, index) => (
                <tr
                  key={`${equipo.marca}-${equipo.modelo}-${index}`}
                  className={`border-b border-line/60 transition-colors last:border-0 hover:bg-raised ${equipo.activo === false ? 'opacity-50' : ''}`}
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
                      {clavesDe(field).some((clave) => equipo.datos_web?.includes(clave)) && (
                        <span title={`Dato obtenido de la web, no de la ficha técnica${equipo.fuente_web ? `: ${equipo.fuente_web}` : ''}`} className="ml-1.5 inline-flex align-middle text-serie-1">
                          <Globe className="size-3.5" aria-label="Dato obtenido de la web" />
                        </span>
                      )}
                      {field.key === 'modelo' && equipo.ocr && (
                        <span
                          title="Leído por OCR de un PDF escaneado: verificar"
                          className="ml-2 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] text-warn"
                        >
                          OCR
                        </span>
                      )}
                      {field.key === 'modelo' && equipo.activo === false && (
                        <span className="ml-2 rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">INACTIVA</span>
                      )}
                    </td>
                  ))}
                  {puedeEditar && (
                    <td className="px-4 py-1.5">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setEditando(equipo)} className={accion} aria-label={`Editar ${equipo.modelo}`} title="Editar ficha">
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => alternarActivo(equipo)}
                          className={accion}
                          aria-label={`${equipo.activo === false ? 'Activar' : 'Desactivar'} ${equipo.modelo}`}
                          title={equipo.activo === false ? 'Activar ficha' : 'Desactivar ficha (no se ofrece al dimensionar)'}
                        >
                          {equipo.activo === false ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                        </button>
                        <button type="button" onClick={() => eliminar(equipo)} className={accion} aria-label={`Eliminar ${equipo.modelo}`} title="Eliminar ficha">
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-ink-dim">
                    {equipos.length === 0
                      ? 'Aún no hay equipos en esta categoría. Sube una ficha técnica en PDF o carga una hoja de Google.'
                      : 'Ningún equipo coincide con los filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-ink-dim">
        <Globe className="mr-1 inline size-3.5 align-text-bottom text-serie-1" aria-hidden="true" />
        marca los datos tomados de la web y no de la ficha técnica (pasa el cursor para ver la fuente). Pulsa el título de una columna para ordenar. Los valores sin
        marca se extraen automáticamente de las fichas técnicas. Los marcados OCR vienen de PDF escaneados y
        pueden traer dígitos mal leídos: verifícalos contra la ficha antes de usarlos en un diseño.
      </p>

      {editando && (
        <EquipoModal
          category={category}
          equipo={editando}
          onClose={() => setEditando(null)}
          onGuardar={async (nuevo) => {
            const enBase = await guardarEquipo(activeId, nuevo)
            setEditando(null)
            setNotice({ ok: true, text: `${nuevo.marca} ${nuevo.modelo}: cambios guardados ${destino(enBase)}.` })
          }}
        />
      )}

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
