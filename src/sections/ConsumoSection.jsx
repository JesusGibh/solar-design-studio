import { useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, CircleDashed, CircleX, Cpu, PlugZap, ReceiptText, ShieldCheck } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import { useEquipos } from '../hooks/useEquipos.js'
import { useProyecto } from '../hooks/useProyecto.js'
import { MESES, aNumero, resumenConsumo } from '../lib/consumo.js'
import { REDES, esCompatible, validarInterconexion } from '../lib/electrico.js'

const INTERRUPTORES = [100, 125, 150, 200, 225, 400, 600, 800]
const TRANSFORMADORES = [25, 37.5, 50, 75, 112.5, 150, 225, 300, 500]

const inputClass =
  'w-full rounded border border-line bg-base px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-dim'
const labelClass = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-dim'

const fmt = (n, decimales = 1) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: decimales, minimumFractionDigits: 0 })

function NumberField({ label, unit, value, onChange, options, hint, placeholder }) {
  const listId = options ? `opciones-${label.replace(/\W+/g, '-')}` : undefined
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          list={listId}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} ${unit ? 'pr-12' : ''}`}
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

function Stat({ label, value, unit }) {
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

const ESTADOS = {
  ok: { icon: CircleCheck, tono: 'border-ok/40 bg-ok/10', color: 'text-ok', texto: 'Cumple' },
  warn: { icon: CircleAlert, tono: 'border-warn/40 bg-warn/10', color: 'text-warn', texto: 'Revisar' },
  danger: { icon: CircleX, tono: 'border-danger/40 bg-danger/10', color: 'text-danger', texto: 'No cumple' },
  pendiente: { icon: CircleDashed, tono: 'border-line bg-base', color: 'text-ink-dim', texto: 'Faltan datos' },
}

function Check({ estado, titulo, children }) {
  const { icon: Icon, tono, color, texto } = ESTADOS[estado]
  return (
    <div className={`rounded border px-3 py-2.5 ${tono}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className={`size-4 shrink-0 ${color}`} aria-hidden="true" />
          {titulo}
        </p>
        <span className={`font-mono text-[11px] uppercase tracking-wider ${color}`}>{texto}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{children}</p>
    </div>
  )
}

export default function ConsumoSection() {
  const { proyecto, actualizar } = useProyecto()
  const { catalogo } = useEquipos()
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const { red: datosRed, consumo, inversor: seleccion } = proyecto

  const inversor = catalogo.inversores.find((equipo) => equipo.id === seleccion.id)
  const cantidad = aNumero(seleccion.cantidad) ?? 1
  const potenciaKw = inversor ? inversor.potencia_ac_nominal_kw * cantidad : null
  const validacion = validarInterconexion({ red: datosRed, potenciaKw })
  const { red } = validacion
  const resumen = resumenConsumo(consumo)

  const compatibles = useMemo(() => catalogo.inversores.filter((equipo) => esCompatible(equipo, red)), [catalogo, red])
  const opciones = useMemo(() => {
    const lista = mostrarTodos ? catalogo.inversores : compatibles
    const porMarca = new Map()
    for (const equipo of [...lista].sort((a, b) => a.potencia_ac_nominal_kw - b.potencia_ac_nominal_kw)) {
      porMarca.set(equipo.marca, [...(porMarca.get(equipo.marca) ?? []), equipo])
    }
    return [...porMarca.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [catalogo, compatibles, mostrarTodos])

  const cambiarTension = (tension) => {
    actualizar('red', { tension })
    // El inversor elegido deja de valer si no trabaja a la nueva tensión de servicio.
    const nuevaRed = REDES.find((item) => item.id === tension)
    if (inversor && !esCompatible(inversor, nuevaRed)) actualizar('inversor', { id: '' })
  }

  const cambiarMes = (indice, campo, valor) => {
    actualizar('consumo', { meses: consumo.meses.map((mes, i) => (i === indice ? { ...mes, [campo]: valor } : mes)) })
  }

  const { regla120, acometida, transformador } = validacion

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        <Panel title="Acometida y red" icon={PlugZap}>
          <fieldset>
            <legend className={labelClass}>Tensión de servicio</legend>
            <div className="grid gap-1 rounded border border-line bg-base p-1 sm:grid-cols-2 xl:grid-cols-4">
              {REDES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === red.id}
                  onClick={() => cambiarTension(item.id)}
                  className={`rounded px-2 py-2 text-sm transition-colors ${
                    item.id === red.id ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <NumberField
              label="Interruptor principal"
              unit="A"
              value={datosRed.interruptorA}
              options={INTERRUPTORES}
              placeholder="200"
              onChange={(interruptorA) => actualizar('red', { interruptorA })}
            />
            <NumberField
              label="Capacidad de la barra"
              unit="A"
              value={datosRed.barraA}
              options={INTERRUPTORES}
              placeholder={datosRed.interruptorA || '200'}
              hint="Si se deja vacío se asume igual al interruptor."
              onChange={(barraA) => actualizar('red', { barraA })}
            />
            <NumberField
              label="Transformador existente"
              unit="kVA"
              value={datosRed.transformadorKva}
              options={TRANSFORMADORES}
              placeholder="50"
              onChange={(transformadorKva) => actualizar('red', { transformadorKva })}
            />
          </div>
        </Panel>

        <Panel title="Historial de consumo" icon={ReceiptText}>
          <div className="mb-4 inline-flex gap-1 rounded border border-line bg-base p-1">
            {[
              ['rapido', 'Promedio mensual'],
              ['detallado', 'Detalle de 12 meses'],
            ].map(([modo, texto]) => (
              <button
                key={modo}
                type="button"
                aria-pressed={consumo.modo === modo}
                onClick={() => actualizar('consumo', { modo })}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${
                  consumo.modo === modo ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>

          {consumo.modo === 'rapido' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Consumo promedio mensual"
                unit="kWh"
                value={consumo.promedioKwh}
                placeholder="1200"
                onChange={(promedioKwh) => actualizar('consumo', { promedioKwh })}
              />
              <NumberField
                label="Factura promedio mensual"
                unit="USD"
                value={consumo.costoMensual}
                placeholder="240"
                hint="Opcional: permite calcular la tarifa promedio."
                onChange={(costoMensual) => actualizar('consumo', { costoMensual })}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                    <th scope="col" className="py-2 pr-3 font-medium">Mes</th>
                    <th scope="col" className="px-2 py-2 font-medium">Consumo (kWh)</th>
                    <th scope="col" className="px-2 py-2 font-medium">Factura (USD)</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">USD/kWh</th>
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((mes, indice) => {
                    const { kwh, costo } = consumo.meses[indice]
                    const tarifaMes = aNumero(kwh) && aNumero(costo) ? aNumero(costo) / aNumero(kwh) : null
                    return (
                      <tr key={mes} className="border-b border-line/60 last:border-0">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-muted">{mes}</th>
                        {['kwh', 'costo'].map((campo) => (
                          <td key={campo} className="px-2 py-1.5">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              aria-label={`${campo === 'kwh' ? 'Consumo en kWh' : 'Factura en USD'} de ${mes}`}
                              value={consumo.meses[indice][campo]}
                              onChange={(event) => cambiarMes(indice, campo, event.target.value)}
                              className={`${inputClass} py-1.5`}
                            />
                          </td>
                        ))}
                        <td className="py-1.5 pl-3 text-right font-mono text-xs tabular-nums text-ink-muted">
                          {tarifaMes == null ? '—' : fmt(tarifaMes, 3)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {resumen.mesesConDatos > 0 && resumen.mesesConDatos < 12 && (
                <p className="mt-2 text-xs text-ink-dim">
                  Con {resumen.mesesConDatos} de 12 meses, el consumo anual se proyecta a partir del promedio.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Promedio mensual" value={fmt(resumen.promedioKwh, 0)} unit="kWh" />
            <Stat label="Consumo anual" value={fmt(resumen.anualKwh, 0)} unit="kWh" />
            <Stat label="Tarifa promedio" value={resumen.tarifa == null ? '—' : fmt(resumen.tarifa, 3)} unit="USD/kWh" />
            <Stat label="Gasto anual" value={fmt(resumen.costoAnual, 0)} unit="USD" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel title="Inversor del sistema" icon={Cpu}>
          <label className="block">
            <span className={labelClass}>
              Modelo · {compatibles.length} compatibles con {red.label}
            </span>
            <select
              value={seleccion.id}
              onChange={(event) => actualizar('inversor', { id: event.target.value })}
              className={`${inputClass} font-sans`}
            >
              <option value="">Selecciona un inversor…</option>
              {opciones.map(([marca, equipos]) => (
                <optgroup key={marca} label={marca}>
                  {equipos.map((equipo) => (
                    <option key={equipo.id} value={equipo.id}>
                      {equipo.modelo} · {equipo.potencia_ac_nominal_kw} kW
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={mostrarTodos}
              onChange={(event) => setMostrarTodos(event.target.checked)}
              className="accent-accent"
            />
            Mostrar también los de otra tensión o sin tensión declarada
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField
              label="Cantidad"
              value={seleccion.cantidad}
              placeholder="1"
              onChange={(cantidadNueva) => actualizar('inversor', { cantidad: cantidadNueva })}
            />
            <Stat label="Potencia AC total" value={fmt(potenciaKw, 2)} unit="kW" />
          </div>

          {inversor && !esCompatible(inversor, red) && (
            <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              La ficha de este inversor no declara compatibilidad con {red.label}. Confírmalo antes de continuar.
            </p>
          )}
          {inversor && (
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Corriente a {red.voltaje} V: <span className="font-mono text-ink">{fmt(validacion.corrienteSolar)} A</span>
              {inversor.corriente_max_salida_ac != null && (
                <>
                  {' '}
                  · según ficha: <span className="font-mono text-ink">{fmt(inversor.corriente_max_salida_ac * cantidad)} A</span>
                </>
              )}
            </p>
          )}
        </Panel>

        <Panel title="Validaciones eléctricas" icon={ShieldCheck}>
          <div className="grid gap-3">
            <Check estado={regla120.estado} titulo="Regla del 120 % de la barra">
              {regla120.estado === 'pendiente' ? (
                'Ingresa el interruptor principal y elige un inversor.'
              ) : (
                <>
                  Interruptor {fmt(aNumero(datosRed.interruptorA), 0)} A + solar {fmt(regla120.retroalimentacion)} A (125 %) ={' '}
                  {fmt(aNumero(datosRed.interruptorA) + regla120.retroalimentacion)} A frente a{' '}
                  {fmt(regla120.barra * 1.2)} A permitidos (120 % de {fmt(regla120.barra, 0)} A).{' '}
                  {regla120.estado === 'danger'
                    ? `Por el lado de carga caben hasta ${fmt(regla120.potenciaMaxKw)} kW AC; evalúa conexión del lado de línea, reducir el interruptor principal o un sistema de control de potencia.`
                    : `Margen para hasta ${fmt(regla120.potenciaMaxKw)} kW AC.`}
                </>
              )}
            </Check>

            <Check estado={acometida.estado} titulo="Capacidad de la acometida">
              {acometida.estado === 'pendiente' ? (
                'Ingresa el interruptor principal y elige un inversor.'
              ) : (
                <>
                  Corriente solar continua {fmt(acometida.retroalimentacion)} A frente a un interruptor de{' '}
                  {fmt(acometida.interruptor, 0)} A ({fmt(validacion.capacidadAcometidaKva)} kVA de servicio).
                  {acometida.estado === 'danger' && ' El sistema supera la acometida: requiere ampliarla.'}
                </>
              )}
            </Check>

            <Check estado={transformador.estado} titulo="Capacidad del transformador">
              {transformador.estado === 'pendiente' ? (
                'Ingresa los kVA del transformador y elige un inversor.'
              ) : (
                <>
                  {fmt(potenciaKw, 2)} kW AC sobre {fmt(transformador.transformador)} kVA ={' '}
                  {fmt(transformador.uso * 100, 0)} % de su capacidad.
                  {transformador.estado === 'danger' && ' La potencia del inversor sobrepasa al transformador.'}
                  {transformador.estado === 'warn' && ' Supera el 80 %: confirma el límite con la distribuidora.'}
                </>
              )}
            </Check>
          </div>
          <p className="mt-3 text-xs text-ink-dim">
            Corriente calculada con la potencia nominal a la tensión de servicio ({red.fases === 3 ? 'P / (√3 · V)' : 'P / V'},
            factor de potencia 1). Verificación preliminar; no sustituye el estudio de interconexión.
          </p>
        </Panel>
      </div>
    </div>
  )
}
