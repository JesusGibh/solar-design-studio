import { useState } from 'react'
import { PlugZap, ReceiptText, SlidersHorizontal } from 'lucide-react'
import Dimensionador from '../components/Dimensionador.jsx'
import Panel from '../components/Panel.jsx'
import PdfDropzone from '../components/PdfDropzone.jsx'
import { NumberField, Stat, Toggle, fmt, inputClass, labelClass } from '../components/campos.jsx'
import { useProyecto } from '../hooks/useProyecto.js'
import { MESES, aNumero, resumenConsumo } from '../lib/consumo.js'
import { PERFILES_SOLARES, PERFIL_POR_DEFECTO } from '../lib/dimensionamiento.js'
import { REDES, getRed } from '../lib/electrico.js'

const INTERRUPTORES = [100, 125, 150, 200, 225, 400, 600, 800]
const TRANSFORMADORES = [25, 37.5, 50, 75, 112.5, 150, 225, 300, 500]
const COBERTURAS = [60, 80, 100, 120]
const MODOS_CONSUMO = [
  ['mensual', 'Mensual (kWh/mes)'],
  ['anual', 'Anual (kWh/año)'],
  ['detallado', 'Detalle de 12 meses'],
]

const redondear = (n, decimales) => String(Number(n.toFixed(decimales)))

export default function ConsumoSection() {
  const { proyecto, actualizar } = useProyecto()
  const { red: datosRed, consumo, dimensionamiento } = proyecto
  const [factura, setFactura] = useState(null)
  const red = getRed(datosRed.tension)
  const resumen = resumenConsumo(consumo)
  const modo = MODOS_CONSUMO.some(([valor]) => valor === consumo.modo) ? consumo.modo : 'mensual'

  // Al cambiar entre mensual y anual se convierte lo ya escrito, para no perder el dato.
  const cambiarModo = (nuevo) => {
    const cambios = { modo: nuevo }
    if (nuevo === 'anual' && resumen.anualKwh) cambios.anualKwh = redondear(resumen.anualKwh, 0)
    if (nuevo === 'mensual' && resumen.promedioKwh) cambios.promedioKwh = redondear(resumen.promedioKwh, 1)
    actualizar('consumo', cambios)
  }

  const cambiarMes = (indice, campo, valor) => {
    actualizar('consumo', { meses: consumo.meses.map((mes, i) => (i === indice ? { ...mes, [campo]: valor } : mes)) })
  }

  // Lee la factura (texto del PDF u OCR), rellena el formulario con lo encontrado y lo deja a la vista.
  const leerFactura = async ([archivo]) => {
    setFactura(null)
    try {
      const [{ leerTextoFactura }, { analizarFactura }] = await Promise.all([
        import('../lib/factura/leer.js'),
        import('../lib/factura/analizar.js'),
      ])
      const { texto, metodo } = await leerTextoFactura(archivo)
      const datos = analizarFactura(texto)
      const hallazgos = []
      const cambios = {}

      if (datos.meses) {
        cambios.modo = 'detallado'
        cambios.meses = consumo.meses.map((mes, i) => (datos.meses[i] ? { ...mes, kwh: redondear(datos.meses[i], 0) } : mes))
        hallazgos.push(`Historial de ${datos.meses.filter(Boolean).length} meses`)
      } else if (datos.consumoKwh) {
        cambios.modo = 'mensual'
        cambios.promedioKwh = redondear(datos.consumoKwh, 0)
        hallazgos.push(`Consumo del periodo: ${fmt(datos.consumoKwh, 0)} kWh`)
      }
      if (datos.tarifa) {
        cambios.tarifa = redondear(datos.tarifa, 4)
        hallazgos.push(
          datos.tarifaCalculada
            ? `Tarifa ${fmt(datos.tarifa, 4)} $/kWh (total ${fmt(datos.total, 2)} ÷ ${fmt(datos.consumoKwh, 0)} kWh)`
            : `Tarifa ${fmt(datos.tarifa, 4)} $/kWh`,
        )
      } else if (datos.total) {
        hallazgos.push(`Total facturado: ${fmt(datos.total, 2)}`)
      }
      if (Object.keys(cambios).length) actualizar('consumo', cambios)
      if (datos.tension) {
        actualizar('red', { tension: datos.tension })
        hallazgos.push(`Red: ${getRed(datos.tension).label}`)
      } else if (datos.trifasicoSinVoltaje) {
        hallazgos.push('Servicio trifásico (sin voltaje indicado: elige la tensión a mano)')
      }
      setFactura({ nombre: archivo.name, metodo, hallazgos })
    } catch (error) {
      setFactura({ nombre: archivo.name, error: error.message })
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="grid gap-4 lg:col-span-3">
        <Panel title="Acometida y red" icon={PlugZap}>
          <fieldset>
            <legend className={labelClass}>Tensión de servicio</legend>
            <Toggle value={red.id} options={REDES.map((item) => [item.id, item.label])} onChange={(tension) => actualizar('red', { tension })} />
          </fieldset>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Interruptor principal (IP)"
              unit="A"
              value={datosRed.interruptorA}
              options={INTERRUPTORES}
              placeholder="200"
              onChange={(interruptorA) => actualizar('red', { interruptorA })}
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

        <Panel title="Consumo y tarifa" icon={ReceiptText}>
          <PdfDropzone
            onFiles={leerFactura}
            imagenes
            multiple={false}
            titulo="Arrastrar o subir la factura eléctrica (PDF o imagen)"
            descripcion="Se leen el consumo, la tarifa o el total y el tipo de red para rellenar el formulario."
            ocupado="Leyendo la factura…"
          />
          {factura && (
            <div
              role="status"
              className={`mt-3 rounded border px-3 py-2 text-xs ${
                factura.error || factura.hallazgos.length === 0 ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ok/40 bg-ok/10 text-ok'
              }`}
            >
              {factura.error ? (
                `${factura.nombre}: no se pudo leer (${factura.error}).`
              ) : factura.hallazgos.length === 0 ? (
                `${factura.nombre}: no se reconoció consumo, tarifa ni tipo de red. Ingresa los datos a mano.`
              ) : (
                <>
                  <p className="font-medium">
                    {factura.nombre} · leída {factura.metodo === 'ocr' ? 'por OCR' : 'del texto del PDF'}. Revisa los valores:
                  </p>
                  <ul className="mt-1 list-inside list-disc">
                    {factura.hallazgos.map((hallazgo) => (
                      <li key={hallazgo}>{hallazgo}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <Toggle value={modo} options={MODOS_CONSUMO} onChange={cambiarModo} className="mt-4" />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {modo === 'mensual' && (
              <NumberField
                label="Consumo mensual"
                unit="kWh/mes"
                value={consumo.promedioKwh}
                placeholder="1200"
                hint={resumen.anualKwh ? `Equivale a ${fmt(resumen.anualKwh, 0)} kWh/año.` : undefined}
                onChange={(promedioKwh) => actualizar('consumo', { promedioKwh })}
              />
            )}
            {modo === 'anual' && (
              <NumberField
                label="Consumo anual"
                unit="kWh/año"
                value={consumo.anualKwh}
                placeholder="14400"
                hint={resumen.promedioKwh ? `Equivale a ${fmt(resumen.promedioKwh, 0)} kWh/mes.` : undefined}
                onChange={(anualKwh) => actualizar('consumo', { anualKwh })}
              />
            )}
            <NumberField
              label="Costo de la energía"
              unit="$/kWh"
              value={consumo.tarifa}
              placeholder="0.20"
              hint={
                modo === 'detallado' && resumen.tarifaCalculada
                  ? 'Con facturas en la tabla se usa la tarifa calculada de ellas.'
                  : 'Lo que paga el cliente por cada kWh.'
              }
              onChange={(tarifa) => actualizar('consumo', { tarifa })}
            />
          </div>

          {modo === 'detallado' && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                    <th scope="col" className="py-2 pr-3 font-medium">Mes</th>
                    <th scope="col" className="px-2 py-2 font-medium">Consumo (kWh)</th>
                    <th scope="col" className="px-2 py-2 font-medium">Factura ($)</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">$/kWh</th>
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
                              aria-label={`${campo === 'kwh' ? 'Consumo en kWh' : 'Factura'} de ${mes}`}
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
                  Con {resumen.mesesConDatos} de 12 meses, los meses vacíos se completan con el promedio.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Promedio mensual" value={fmt(resumen.promedioKwh, 0)} unit="kWh" />
            <Stat label="Consumo anual" value={fmt(resumen.anualKwh, 0)} unit="kWh" />
            <Stat label="Tarifa" value={resumen.tarifa == null ? '—' : fmt(resumen.tarifa, 3)} unit="$/kWh" />
            <Stat label="Gasto anual" value={fmt(resumen.costoAnual, 0)} unit="$" />
          </div>
        </Panel>

        <Panel title="Recurso solar y objetivo" icon={SlidersHorizontal}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Horas solar pico (HSP)"
              unit="h/día"
              value={dimensionamiento.hsp}
              placeholder="4.2"
              hint="Promedio anual del sitio. Por defecto 4.2 h/día."
              onChange={(hsp) => actualizar('dimensionamiento', { hsp })}
            />
            <NumberField
              label="Cobertura objetivo"
              unit="%"
              value={dimensionamiento.cobertura}
              options={COBERTURAS}
              placeholder="100"
              hint="Porcentaje del consumo anual que debe generar el sistema."
              onChange={(cobertura) => actualizar('dimensionamiento', { cobertura })}
            />
            <label className="block sm:col-span-2">
              <span className={labelClass}>Perfil mensual de irradiación</span>
              <select
                value={dimensionamiento.perfilSolar in PERFILES_SOLARES ? dimensionamiento.perfilSolar : PERFIL_POR_DEFECTO}
                onChange={(event) => actualizar('dimensionamiento', { perfilSolar: event.target.value })}
                className={`${inputClass} font-sans`}
              >
                {Object.entries(PERFILES_SOLARES).map(([id, perfil]) => (
                  <option key={id} value={id}>
                    {perfil.nombre}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink-dim">
                Reparte la generación anual entre los meses; el total del año no cambia.
              </span>
            </label>
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-2">
        <Dimensionador />
      </div>
    </div>
  )
}
