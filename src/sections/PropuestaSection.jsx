import { useEffect, useState } from 'react'
import { BarChart3, Download, FilePlus2, FileText, LoaderCircle, Presentation, TrendingUp, Wallet } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import VistaPreviaPropuesta from '../components/VistaPreviaPropuesta.jsx'
import { NumberField, Stat, fmt, inputClass, labelClass } from '../components/campos.jsx'
import { GraficoFlujo, GraficoMensual } from '../components/graficos.jsx'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { leerProyecto } from '../hooks/useProyecto.js'
import { aNumero } from '../lib/consumo.js'
import { DEFECTOS_FINANZAS, proyectar } from '../lib/finanzas.js'
import { siguienteIdPropuesta } from '../lib/numeracion.js'

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

const campoTexto = `${inputClass} font-sans`

function TextField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={campoTexto} />
    </label>
  )
}

export default function PropuestaSection() {
  const { sistema, resumen, red, techo, baterias, parametros, proyecto, actualizar } = useDimensionamiento()
  const { finanzas, propuesta } = proyecto
  const [descarga, setDescarga] = useState({ estado: 'lista' }) // 'lista' | 'generando' | 'error'
  const [vistaPrevia, setVistaPrevia] = useState(false)
  const evaluacion = sistema?.evaluacion
  const cambiar = (cambios) => actualizar('finanzas', cambios)
  const cambiarPropuesta = (cambios) => actualizar('propuesta', cambios)

  // La primera vez que se abre la propuesta se le asigna su número correlativo.
  useEffect(() => {
    if (!leerProyecto().propuesta.id) actualizar('propuesta', { id: siguienteIdPropuesta() })
  }, [actualizar])

  // Nueva propuesta: siguiente número y datos del cliente en blanco; el diseño técnico se conserva.
  const nuevaPropuesta = () => cambiarPropuesta({ id: siguienteIdPropuesta(), cliente: '', direccion: '' })

  const bateria = baterias.find((equipo) => equipo.id === finanzas.bateriaId)
  const cantidadBaterias = Math.max(1, Math.floor(aNumero(finanzas.bateriaCantidad) ?? 1))
  const capacidadKwh = bateria?.capacidad_kwh ? bateria.capacidad_kwh * cantidadBaterias : null
  // Autonomía al consumo promedio: kWh almacenados ÷ potencia media (kWh/mes ÷ 730 h).
  const autonomiaHoras = capacidadKwh && resumen.promedioKwh ? capacidadKwh / (resumen.promedioKwh / 730) : null

  const precioWp = aNumero(finanzas.precioWp)
  const inflacion = porcentaje(finanzas.inflacion, DEFECTOS_FINANZAS.inflacion)
  const degradacion = porcentaje(finanzas.degradacion, DEFECTOS_FINANZAS.degradacion)
  const factorCo2 = porcentaje(finanzas.factorCo2, DEFECTOS_FINANZAS.factorCo2)
  const proyeccion = proyectar({
    kwp: evaluacion?.kwp,
    generacionAnualKwh: evaluacion?.generacionAnualKwh,
    tarifa: resumen.tarifa,
    precioWp,
    costoAdicional: aNumero(finanzas.costoBaterias) ?? 0,
    inflacion,
    degradacion,
    factorCo2,
  })

  const faltantes = [
    !evaluacion?.kwp && 'define el sistema en Consumo o Diseño',
    !resumen.tarifa && 'ingresa el costo de la energía ($/kWh) en Consumo',
    !precioWp && 'ingresa el precio por Watt instalado',
  ].filter(Boolean)

  // Compone la imagen satelital y arma el PDF de 3 hojas. Lo usan la vista previa y la descarga, así
  // que ambas muestran exactamente el mismo documento. Las librerías se cargan aquí, bajo demanda.
  const generarDocumento = async () => {
    const [{ jsPDF }, { construirPropuestaPdf }, { capturarTecho }] = await Promise.all([
      import('jspdf'),
      import('../lib/propuestaPdf.js'),
      import('../lib/mapaEstatico.js'),
    ])
    const imagenTecho = techo
      ? await capturarTecho({
          vertices: proyecto.techo.vertices,
          rectangulos: techo.rectangulos,
          usados: sistema.numPaneles,
          capa: proyecto.techo.capa,
        })
      : null
    return {
      sinImagen: Boolean(techo) && !imagenTecho,
      doc: construirPropuestaPdf(jsPDF, {
        propuesta: { ...propuesta, fecha: new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) },
        imagenTecho,
        sistema,
        evaluacion,
        proyeccion,
        red: { label: red.label, voltaje: red.voltaje, interruptorA: proyecto.red.interruptorA, transformadorKva: proyecto.red.transformadorKva },
        techo: techo && { ...techo, inclinacion: Number(proyecto.techo.inclinacion) || 0, orientacion: proyecto.techo.orientacion },
        bateria: bateria ? { equipo: bateria, cantidad: cantidadBaterias, capacidadKwh, autonomiaHoras } : null,
        consumo: resumen,
        precioWp,
        supuestos: `Supuestos: HSP ${parametros.hsp} h/día, PR ${parametros.pr}, degradación ${degradacion} %/año, inflación energética ${inflacion} %/año, factor de emisión ${factorCo2} kg CO2/kWh. El ahorro supone que toda la energía generada se aprovecha o se acredita a la misma tarifa.`,
      }),
    }
  }

  const archivo = `${propuesta.id}.pdf`
  const descargarPdf = async () => {
    setDescarga({ estado: 'generando' })
    try {
      const { doc, sinImagen } = await generarDocumento()
      doc.save(archivo)
      setDescarga({ estado: 'lista', sinImagen })
    } catch (error) {
      setDescarga({ estado: 'error', mensaje: error.message })
    }
  }

  const puedeDescargar = Boolean(sistema?.panel && sistema.numPaneles > 0 && propuesta.id)

  return (
    <div className="grid gap-4">
      {vistaPrevia && <VistaPreviaPropuesta generar={generarDocumento} nombre={archivo} onClose={() => setVistaPrevia(false)} />}
      <Panel title="Datos de la propuesta" icon={FileText}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={labelClass}>Identificador</p>
            <p className="font-mono text-xl text-accent">{propuesta.id || '—'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={nuevaPropuesta}
              className="flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <FilePlus2 className="size-4" aria-hidden="true" />
              Nueva propuesta
            </button>
            <button
              type="button"
              onClick={() => setVistaPrevia(true)}
              disabled={!puedeDescargar}
              className="flex items-center gap-2 rounded border border-accent/60 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              <Presentation className="size-4" aria-hidden="true" />
              Vista Previa / Modo Presentación
            </button>
            <button
              type="button"
              onClick={descargarPdf}
              disabled={!puedeDescargar || descarga.estado === 'generando'}
              className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {descarga.estado === 'generando' ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {descarga.estado === 'generando' ? 'Generando PDF…' : 'Descargar PDF Oficial'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TextField label="Empresa (membrete)" value={propuesta.empresa} placeholder="Solar Design Studio" onChange={(empresa) => cambiarPropuesta({ empresa })} />
          <TextField label="Nombre del cliente" value={propuesta.cliente} placeholder="Cliente" onChange={(cliente) => cambiarPropuesta({ cliente })} />
          <TextField label="Dirección / proyecto" value={propuesta.direccion} placeholder="Dirección del sitio" onChange={(direccion) => cambiarPropuesta({ direccion })} />
          <TextField label="Diseñador / asesor" value={propuesta.asesor} placeholder="Nombre" onChange={(asesor) => cambiarPropuesta({ asesor })} />
        </div>
        {descarga.estado === 'error' && (
          <p role="alert" className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            No se pudo generar el PDF: {descarga.mensaje}
          </p>
        )}
        {descarga.sinImagen && (
          <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            El PDF se generó sin la vista satelital: no se pudieron descargar las imágenes del mapa.
          </p>
        )}
        {!puedeDescargar && <p className="mt-3 text-xs text-ink-dim">Define el sistema en Consumo o Diseño para poder descargar la propuesta.</p>}
      </Panel>

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
              <label className="block">
                <span className={labelClass}>Batería (opcional)</span>
                <select value={bateria ? finanzas.bateriaId : ''} onChange={(event) => cambiar({ bateriaId: event.target.value })} className={campoTexto}>
                  <option value="">Sin baterías</option>
                  {baterias.map((equipo) => (
                    <option key={equipo.id} value={equipo.id}>
                      {equipo.marca} {equipo.modelo} · {equipo.capacidad_kwh} kWh
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="N° de baterías"
                value={finanzas.bateriaCantidad}
                placeholder="1"
                hint={
                  capacidadKwh
                    ? `${fmt(capacidadKwh, 2)} kWh${autonomiaHoras ? ` · ~${fmt(autonomiaHoras, 1)} h de autonomía al consumo promedio` : ''}`
                    : undefined
                }
                onChange={(bateriaCantidad) => cambiar({ bateriaCantidad })}
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

    </div>
  )
}
