import { Calculator, Gauge } from 'lucide-react'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { FRACCION_TECHO_UTIL, RATIO_DC_AC } from '../lib/dimensionamiento.js'
import Panel from './Panel.jsx'
import { Check, NumberField, Stat, Toggle, fmt, inputClass, labelClass } from './campos.jsx'

const MODOS = [
  ['auto', 'Cálculo Automático Óptimo'],
  ['manual', 'Configuración Personalizada'],
]

// Agrupa equipos por marca para un <select>, ordenados por la clave numérica indicada.
function porMarca(equipos, clave) {
  const grupos = new Map()
  for (const equipo of [...equipos].sort((a, b) => a[clave] - b[clave])) {
    grupos.set(equipo.marca, [...(grupos.get(equipo.marca) ?? []), equipo])
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function SelectEquipo({ label, value, onChange, equipos, clave, unidad, vacio }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} font-sans`}>
        <option value="">{vacio}</option>
        {porMarca(equipos, clave).map(([marca, lista]) => (
          <optgroup key={marca} label={marca}>
            {lista.map((equipo) => (
              <option key={equipo.id} value={equipo.id}>
                {equipo.modelo} · {equipo[clave]} {unidad}
                {equipo.ocr ? ' (OCR)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function SelectMarca({ label, value, onChange, marcas }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {/* Si la marca guardada ya no existe para esta red, el selector vuelve a "Cualquiera". */}
      <select value={marcas.includes(value) ? value : ''} onChange={(event) => onChange(event.target.value)} className={`${inputClass} font-sans`}>
        <option value="">Cualquiera / Óptimo</option>
        {marcas.map((marca) => (
          <option key={marca} value={marca}>
            {marca}
          </option>
        ))}
      </select>
    </label>
  )
}

function Linea({ titulo, children }) {
  return (
    <div className="rounded border border-line bg-base px-3 py-2">
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">{titulo}</p>
      <p className="mt-0.5 text-sm text-ink">{children}</p>
    </div>
  )
}

function Alerta({ children }) {
  return <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{children}</p>
}

// Dimensionador del sistema FV: conmutador de modo, parámetros, selección de equipos y resumen técnico
// con semáforos. Lee y escribe el estado compartido del proyecto, así que se puede montar en varios módulos.
export default function Dimensionador() {
  const {
    esAuto,
    cambiarModo,
    parametros,
    red,
    auto,
    sistema,
    maximoTecho,
    excesoTecho,
    ajustarAlTecho,
    paneles,
    inversoresCompatibles,
    marcasPanel,
    marcasInversor,
    proyecto,
    actualizar,
  } = useDimensionamiento()
  const { dimensionamiento, inversor: seleccion } = proyecto
  const cambiar = (cambios) => actualizar('dimensionamiento', cambios)
  // Una marca de inversor que no existe para la red actual equivale a "cualquiera".
  const marcaInversor = marcasInversor.includes(dimensionamiento.marcaInversor) ? dimensionamiento.marcaInversor : ''

  const evaluacion = sistema?.evaluacion
  const { ratio, strings, techo, interconexion } = evaluacion ?? {}

  return (
    <div className="grid gap-4">
      <Panel title="Dimensionamiento del sistema" icon={Calculator}>
        <Toggle value={esAuto ? 'auto' : 'manual'} options={MODOS} onChange={cambiarModo} />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumberField label="Performance Ratio" value={dimensionamiento.pr} placeholder="0.8" onChange={(pr) => cambiar({ pr })} />
          <NumberField
            label="Temp. mínima"
            unit="°C"
            min="-40"
            value={dimensionamiento.tempMin}
            placeholder="10"
            onChange={(tempMin) => cambiar({ tempMin })}
          />
        </div>

        {esAuto ? (
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <SelectMarca label="Marca de panel" value={dimensionamiento.marcaPanel} marcas={marcasPanel} onChange={(marcaPanel) => cambiar({ marcaPanel })} />
              <SelectMarca
                label="Marca de inversor"
                value={marcaInversor}
                marcas={marcasInversor}
                onChange={(valor) => cambiar({ marcaInversor: valor })}
              />
            </div>

            {!auto ? (
              <p className="rounded border border-line bg-base px-3 py-2 text-sm text-ink-muted">
                Ingresa el consumo en el módulo de Consumo para calcular el sistema óptimo.
              </p>
            ) : auto.sinPanel ? (
              <Alerta>
                {paneles.length === 0
                  ? 'El catálogo no tiene paneles: sube una ficha técnica en el módulo de Equipos.'
                  : `No hay paneles de ${dimensionamiento.marcaPanel} en el catálogo.`}
              </Alerta>
            ) : (
              <>
                <Linea titulo={`Panel · ${auto.numPaneles} unidades`}>
                  {auto.panel.marca} {auto.panel.modelo} · {auto.panel.potencia_wp} Wp{auto.panel.ocr ? ' · leído por OCR, verificar' : ''}
                </Linea>
                <Linea titulo={auto.inversor ? `Inversor · ${auto.cantidad} unidad(es)` : 'Inversor'}>
                  {auto.inversor
                    ? `${auto.inversor.marca} ${auto.inversor.modelo} · ${auto.inversor.potencia_ac_nominal_kw} kW`
                    : 'Sin inversor que cumpla'}
                </Linea>
                <p className="text-xs text-ink-dim">
                  Requerido: {fmt(auto.kwpRequerido, 2)} kWp = {fmt(parametros.anualKwh, 0)} kWh/año × {parametros.cobertura} % ÷ (365 ×{' '}
                  {parametros.hsp} × {parametros.pr}) → {auto.numRequeridos} paneles.
                </p>
                {auto.limitadoPorTecho && (
                  <p className="rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                    Ajustado al máximo del techo: {auto.numPaneles} de los {auto.numRequeridos} paneles requeridos, que cubren el{' '}
                    {fmt(evaluacion.cobertura * 100, 0)} % del consumo.{' '}
                    <button type="button" onClick={() => cambiar({ ajustarATecho: false })} className="underline hover:text-ink">
                      Quitar ajuste
                    </button>
                  </p>
                )}
                {auto.avisoInversor && <Alerta>{auto.avisoInversor}</Alerta>}
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <SelectEquipo
              label={`Panel · ${paneles.length} en catálogo`}
              value={dimensionamiento.panelId}
              onChange={(panelId) => cambiar({ panelId })}
              equipos={paneles}
              clave="potencia_wp"
              unidad="Wp"
              vacio="Selecciona un panel…"
            />
            <SelectEquipo
              label={`Inversor · ${inversoresCompatibles.length} para ${red.label}`}
              value={sistema.inversor ? seleccion.id : ''}
              onChange={(id) => actualizar('inversor', { id })}
              equipos={inversoresCompatibles}
              clave="potencia_ac_nominal_kw"
              unidad="kW"
              vacio="Selecciona un inversor…"
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="N° de paneles" value={dimensionamiento.numPaneles} placeholder="0" onChange={(numPaneles) => cambiar({ numPaneles })} />
              <NumberField
                label="N° de inversores"
                value={seleccion.cantidad}
                placeholder="1"
                onChange={(cantidad) => actualizar('inversor', { cantidad })}
              />
            </div>
          </div>
        )}

        {excesoTecho > 0 && !(esAuto && auto?.limitadoPorTecho) && (
          <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            <p>
              El techo admite {maximoTecho} paneles y el sistema necesita {maximoTecho + excesoTecho}: sobran {excesoTecho}.
            </p>
            <button
              type="button"
              onClick={ajustarAlTecho}
              className="mt-2 rounded border border-danger/50 px-2.5 py-1 font-medium text-ink transition-colors hover:bg-danger/20"
            >
              Ajustar al máximo del techo ({maximoTecho} paneles)
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Resumen técnico" icon={Gauge}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={`Potencia DC${sistema?.numPaneles ? ` · ${sistema.numPaneles} paneles` : ''}`} value={fmt(evaluacion?.kwp, 2)} unit="kWp" />
          <Stat label="Potencia AC" value={fmt(evaluacion?.potenciaAcKw, 2)} unit="kW" />
          <Stat label="Generación" value={fmt(evaluacion?.generacionMensualKwh, 0)} unit="kWh/mes" />
          <Stat label="Cobertura" value={evaluacion?.cobertura == null ? '—' : fmt(evaluacion.cobertura * 100, 0)} unit="%" />
        </div>

        {evaluacion && (
          <div className="mt-3 grid gap-3">
            <Check estado={ratio.estado} titulo="Ratio DC/AC">
              {ratio.estado === 'pendiente'
                ? 'Define paneles e inversor.'
                : `${fmt(ratio.valor, 2)} · rango recomendado ${RATIO_DC_AC.min.toFixed(2)} – ${RATIO_DC_AC.max.toFixed(2)}.`}
            </Check>

            <Check estado={strings.estado} titulo="Voc en frío y strings">
              {strings.vocFrio == null ? (
                'Elige un panel.'
              ) : (
                <>
                  Voc a {parametros.tempMin} °C: {fmt(strings.vocFrio, 2)} V por panel
                  {strings.coefAsumido && ' (coeficiente asumido −0.28 %/°C)'}.{' '}
                  {strings.sinDatoInversor && 'La ficha del inversor no trae el voltaje DC máximo.'}
                  {strings.maxPorString != null &&
                    `Entrada de ${strings.vocMax} V: entre ${strings.minPorString} y ${strings.maxPorString} paneles por string. `}
                  {strings.strings != null &&
                    `Arreglo: ${strings.strings} string(s) de ~${strings.porString} (${fmt(strings.vocString, 0)} V en frío). `}
                  {strings.problema}
                </>
              )}
            </Check>

            <Check estado={techo.estado} titulo="Área de techo">
              {techo.estado === 'pendiente'
                ? techo.sinDimensiones
                  ? 'La ficha del panel no trae dimensiones: no se puede verificar.'
                  : 'Ingresa el área de techo en el módulo de Diseño.'
                : techo.porTrazado
                  ? `${sistema.numPaneles} paneles frente a los ${techo.maxPaneles} que caben en el techo trazado.`
                  : `${fmt(techo.areaNecesaria)} m² de paneles frente a ${fmt(techo.areaUtil)} m² útiles (${FRACCION_TECHO_UTIL * 100} % del techo). Caben hasta ${techo.maxPaneles} paneles.`}
            </Check>

            <Check estado={interconexion.acometida.estado} titulo="Interruptor principal (IP)">
              {interconexion.acometida.estado === 'pendiente'
                ? 'Ingresa el interruptor principal y define el inversor.'
                : `Corriente solar ${fmt(interconexion.corrienteSolar)} A × 125 % = ${fmt(interconexion.acometida.corrienteContinua)} A frente a un IP de ${fmt(interconexion.acometida.interruptor, 0)} A. ${
                    interconexion.acometida.estado === 'danger'
                      ? `Supera la acometida: admite hasta ${fmt(interconexion.acometida.potenciaMaxKw)} kW AC.`
                      : `Admite hasta ${fmt(interconexion.acometida.potenciaMaxKw)} kW AC.`
                  }`}
            </Check>

            <Check estado={interconexion.transformador.estado} titulo="Transformador">
              {interconexion.transformador.estado === 'pendiente'
                ? 'Ingresa los kVA del transformador y define el inversor.'
                : `${fmt(evaluacion.potenciaAcKw, 2)} kW AC sobre ${fmt(interconexion.transformador.transformador)} kVA = ${fmt(interconexion.transformador.uso * 100, 0)} %.${
                    interconexion.transformador.estado === 'danger'
                      ? ' La potencia AC sobrepasa al transformador.'
                      : interconexion.transformador.estado === 'warn'
                        ? ' Supera el 80 %: confirma el límite con la distribuidora.'
                        : ''
                  }`}
            </Check>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-dim">
          Generación anual = kWp × HSP × PR × 365. Corriente AC a {red.voltaje} V con factor de potencia 1. Verificación
          preliminar; no sustituye el estudio de interconexión.
        </p>
      </Panel>
    </div>
  )
}
