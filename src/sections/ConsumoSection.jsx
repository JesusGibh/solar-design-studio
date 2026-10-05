import { PlugZap, ReceiptText } from 'lucide-react'
import Dimensionador from '../components/Dimensionador.jsx'
import Panel from '../components/Panel.jsx'
import { NumberField, Stat, fmt, inputClass, labelClass } from '../components/campos.jsx'
import { useProyecto } from '../hooks/useProyecto.js'
import { MESES, aNumero, resumenConsumo } from '../lib/consumo.js'
import { REDES, getRed } from '../lib/electrico.js'

const INTERRUPTORES = [100, 125, 150, 200, 225, 400, 600, 800]
const TRANSFORMADORES = [25, 37.5, 50, 75, 112.5, 150, 225, 300, 500]

export default function ConsumoSection() {
  const { proyecto, actualizar } = useProyecto()
  const { red: datosRed, consumo } = proyecto
  const red = getRed(datosRed.tension)
  const resumen = resumenConsumo(consumo)

  // El dimensionador solo ofrece inversores de la tensión elegida, así que no hay que limpiar la selección aquí.
  const cambiarTension = (tension) => actualizar('red', { tension })

  const cambiarMes = (indice, campo, valor) => {
    actualizar('consumo', { meses: consumo.meses.map((mes, i) => (i === indice ? { ...mes, [campo]: valor } : mes)) })
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="grid gap-4 lg:col-span-3">
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

      <div className="lg:col-span-2">
        <Dimensionador />
      </div>
    </div>
  )
}
