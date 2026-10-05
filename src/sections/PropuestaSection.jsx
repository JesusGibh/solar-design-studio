import { BarChart3, FileText, TrendingUp, Wallet } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import PendingList from '../components/PendingList.jsx'
import { NumberField, Stat, fmt } from '../components/campos.jsx'
import { GraficoFlujo, GraficoMensual } from '../components/graficos.jsx'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { aNumero } from '../lib/consumo.js'
import { DEFECTOS_FINANZAS, proyectar } from '../lib/finanzas.js'

const PRECIOS_WP = [0.85, 0.95, 1.1, 1.25]

// Porcentaje escrito por el usuario; a diferencia de aNumero, aquí 0 es un valor válido.
function porcentaje(valor, defecto) {
  const n = Number(String(valor).replace(',', '.'))
  return valor !== '' && Number.isFinite(n) && n >= 0 ? n : defecto
}

const dinero = (n, decimales = 0) => (n == null ? '—' : `$${fmt(n, decimales)}`)

// Tarjeta ejecutiva: la cifra manda, con su unidad y una línea de contexto.
function Metrica({ label, value, unit, detalle }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums text-ink">
        {value}
        {unit && <span className="ml-1.5 text-sm text-ink-muted">{unit}</span>}
      </p>
      <p className="mt-0.5 min-h-4 text-xs text-ink-muted">{detalle}</p>
    </div>
  )
}

export default function PropuestaSection() {
  const { sistema, resumen, proyecto, actualizar } = useDimensionamiento()
  const { finanzas } = proyecto
  const evaluacion = sistema?.evaluacion
  const cambiar = (cambios) => actualizar('finanzas', cambios)

  const precioWp = aNumero(finanzas.precioWp)
  const proyeccion = proyectar({
    kwp: evaluacion?.kwp,
    generacionAnualKwh: evaluacion?.generacionAnualKwh,
    tarifa: resumen.tarifa,
    precioWp,
    costoAdicional: aNumero(finanzas.costoBaterias) ?? 0,
    inflacion: porcentaje(finanzas.inflacion, DEFECTOS_FINANZAS.inflacion),
    degradacion: porcentaje(finanzas.degradacion, DEFECTOS_FINANZAS.degradacion),
    factorCo2: porcentaje(finanzas.factorCo2, DEFECTOS_FINANZAS.factorCo2),
  })

  const faltantes = [
    !evaluacion?.kwp && 'define el sistema en Consumo o Diseño',
    !resumen.tarifa && 'ingresa el costo de la energía ($/kWh) en Consumo',
    !precioWp && 'ingresa el precio por Watt instalado',
  ].filter(Boolean)

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metrica
          label="Potencia instalada"
          value={fmt(evaluacion?.kwp, 2)}
          unit="kWp"
          detalle={sistema?.numPaneles ? `${sistema.numPaneles} paneles de ${sistema.panel.potencia_wp} Wp` : ''}
        />
        <Metrica
          label="Inversión total"
          value={dinero(proyeccion?.costoTotal)}
          detalle={proyeccion ? `${dinero(precioWp, 2)}/Wp${proyeccion.costoTotal > proyeccion.costoSistema ? ' + baterías' : ''}` : ''}
        />
        <Metrica
          label="Payback"
          value={proyeccion ? (proyeccion.payback == null ? `> ${DEFECTOS_FINANZAS.anios}` : fmt(proyeccion.payback, 1)) : '—'}
          unit="años"
          detalle={proyeccion ? `Simple: ${fmt(proyeccion.paybackSimple, 1)} años` : ''}
        />
        <Metrica
          label="Ahorro a 25 años"
          value={dinero(proyeccion?.ahorroTotal)}
          detalle={proyeccion ? `ROI ${fmt(proyeccion.roi, 0)} %` : ''}
        />
        <Metrica
          label="CO₂ evitado"
          value={fmt(proyeccion?.co2Toneladas, 1)}
          unit="t"
          detalle={proyeccion ? 'En 25 años' : ''}
        />
        <Metrica
          label="Ratio DC/AC"
          value={fmt(evaluacion?.ratio.valor, 2)}
          detalle={evaluacion?.potenciaAcKw ? `${fmt(evaluacion.potenciaAcKw, 2)} kW AC` : ''}
        />
      </div>

      {faltantes.length > 0 && (
        <p className="rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Para completar la propuesta: {faltantes.join('; ')}.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="grid gap-4 lg:col-span-2">
          <Panel title="Inversión y supuestos" icon={Wallet}>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Precio por Watt instalado"
                unit="$/Wp"
                value={finanzas.precioWp}
                options={PRECIOS_WP}
                placeholder="0.95"
                onChange={(valor) => cambiar({ precioWp: valor })}
              />
              <NumberField
                label="Costo adicional (baterías)"
                unit="$"
                value={finanzas.costoBaterias}
                placeholder="0"
                hint="Se suma al costo del sistema FV."
                onChange={(costoBaterias) => cambiar({ costoBaterias })}
              />
              <NumberField
                label="Inflación energética"
                unit="%/año"
                value={finanzas.inflacion}
                placeholder="3"
                onChange={(inflacion) => cambiar({ inflacion })}
              />
              <NumberField
                label="Degradación del módulo"
                unit="%/año"
                value={finanzas.degradacion}
                placeholder="0.5"
                onChange={(degradacion) => cambiar({ degradacion })}
              />
              <NumberField
                label="Factor de emisión de la red"
                unit="kg/kWh"
                value={finanzas.factorCo2}
                placeholder="0.5"
                hint="kg de CO₂ por kWh; depende del país."
                onChange={(factorCo2) => cambiar({ factorCo2 })}
              />
            </div>
          </Panel>

          <Panel title="Resultado financiero" icon={TrendingUp}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Costo del sistema FV" value={dinero(proyeccion?.costoSistema)} />
              <Stat label="Ahorro del año 1" value={dinero(proyeccion?.ahorroAnual)} />
              <Stat label="Payback simple" value={fmt(proyeccion?.paybackSimple, 1)} unit="años" />
              <Stat label="ROI a 25 años" value={fmt(proyeccion?.roi, 0)} unit="%" />
              <Stat label="Ganancia neta" value={dinero(proyeccion?.gananciaNeta)} />
              <Stat label="Tarifa usada" value={resumen.tarifa == null ? '—' : fmt(resumen.tarifa, 3)} unit="$/kWh" />
            </div>
            <p className="mt-3 text-xs text-ink-dim">
              Ahorro anual = generación × tarifa, con la generación bajando por degradación y la tarifa subiendo por
              inflación cada año. Supone que toda la energía generada se aprovecha o se acredita a la misma tarifa. Payback
              simple = costo total ÷ ahorro del año 1; ROI = ganancia neta ÷ costo total.
            </p>
          </Panel>
        </div>

        <div className="grid gap-4 lg:col-span-3">
          <Panel title="Generación solar estimada vs. consumo" icon={BarChart3}>
            {evaluacion?.generacionPorMes && resumen.mensual ? (
              <>
                <p className="mb-3 text-sm text-ink-muted">
                  El sistema cubre el <span className="font-mono text-ink">{fmt(evaluacion.cobertura * 100, 0)} %</span> del consumo
                  anual: {fmt(evaluacion.generacionAnualKwh, 0)} de {fmt(resumen.anualKwh, 0)} kWh.
                </p>
                <GraficoMensual consumo={resumen.mensual} generacion={evaluacion.generacionPorMes} />
                <p className="mt-2 text-xs text-ink-dim">
                  Con una sola HSP anual, la generación de cada mes solo varía por sus días; no refleja la estacionalidad del sitio.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Ingresa el consumo y define el sistema para ver la comparación mensual.</p>
            )}
          </Panel>

          <Panel title="Flujo de caja acumulado a 25 años" icon={TrendingUp}>
            {proyeccion ? (
              <GraficoFlujo flujo={proyeccion.flujo} payback={proyeccion.payback} />
            ) : (
              <p className="text-sm text-ink-muted">Faltan datos para proyectar el flujo de caja.</p>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Próximamente en este módulo" icon={FileText}>
        <PendingList items={['Exportación a PDF con diseño ejecutivo', 'Numeración correlativa de propuestas (PROP-2026-0001)', 'Lista de materiales']} />
      </Panel>
    </div>
  )
}
