import { useState } from 'react'
import { MESES } from '../lib/consumo.js'

// Gráficas en SVG propio (sin librería, para no engordar la app). Convenciones:
// barras ≤ 24 px con punta redondeada, líneas de 2 px, rejilla de un pixel y recesiva,
// texto siempre en tonos de tinta (nunca en el color de la serie) y tooltip al pasar el cursor.

const ANCHO = 720
const entero = (n) => Math.round(n).toLocaleString('en-US')
const compacto = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const dinero = (n) => `${n < 0 ? '−' : ''}$${entero(Math.abs(n))}`

// Marcas "redondas" del eje que cubren [min, max] en unos 4–5 pasos.
function marcas(min, max) {
  const bruto = (max - min || 1) / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)
  const desde = Math.floor(min / paso) * paso
  const hasta = Math.ceil(max / paso) * paso
  const lista = []
  for (let valor = desde; valor <= hasta + paso / 2; valor += paso) lista.push(Math.abs(valor) < paso / 1e6 ? 0 : valor)
  return lista
}

// Columna con la punta superior redondeada y la base recta sobre la línea cero.
function columna(x, y, ancho, alto, radio = 4) {
  if (alto <= radio) return `M${x},${y + alto}V${y}H${x + ancho}V${y + alto}Z`
  return `M${x},${y + alto}V${y + radio}Q${x},${y} ${x + radio},${y}H${x + ancho - radio}Q${x + ancho},${y} ${x + ancho},${y + radio}V${y + alto}Z`
}

function Leyenda({ items }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {items.map(([color, texto]) => (
        <li key={texto} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
          {texto}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, y, ancho = 168, lineas }) {
  const alto = 14 + lineas.length * 16
  const izquierda = Math.min(Math.max(x - ancho / 2, 4), ANCHO - ancho - 4)
  return (
    <g pointerEvents="none">
      <rect x={izquierda} y={y} width={ancho} height={alto} rx="4" className="fill-raised stroke-line-strong" />
      {lineas.map(([etiqueta, valor, color], i) => (
        <g key={etiqueta} transform={`translate(${izquierda + 10}, ${y + 18 + i * 16})`}>
          {color && <rect y="-8" width="8" height="8" rx="2" fill={color} />}
          <text x={color ? 13 : 0} className={i === 0 && !valor ? 'fill-ink text-[11px] font-medium' : 'fill-ink-muted text-[11px]'}>
            {etiqueta}
          </text>
          {valor && (
            <text x={ancho - 20} textAnchor="end" className="fill-ink font-mono text-[11px]">
              {valor}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

function Tabla({ titulo, columnas, filas }) {
  return (
    <details className="mt-2 text-xs text-ink-muted">
      <summary className="cursor-pointer select-none hover:text-ink">{titulo}</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
              {columnas.map((columna, i) => (
                <th key={columna} scope="col" className={`py-1.5 font-medium ${i ? 'text-right' : ''}`}>
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila[0]} className="border-b border-line/60 last:border-0">
                {fila.map((celda, i) => (
                  <td key={i} className={`py-1 ${i ? 'text-right font-mono tabular-nums' : ''}`}>
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// Generación solar estimada frente al consumo, mes a mes. `consumo` y `generacion`: 12 valores en kWh.
export function GraficoMensual({ consumo, generacion }) {
  const [activo, setActivo] = useState(null)
  const alto = 280
  const margen = { izq: 52, der: 8, sup: 10, inf: 26 }
  const anchoPlot = ANCHO - margen.izq - margen.der
  const altoPlot = alto - margen.sup - margen.inf
  const ticks = marcas(0, Math.max(...consumo, ...generacion))
  const tope = ticks.at(-1)
  const y = (valor) => margen.sup + altoPlot * (1 - valor / tope)
  const banda = anchoPlot / 12
  const barra = Math.min(24, (banda - 14) / 2)
  const base = y(0)

  return (
    <figure>
      <Leyenda
        items={[
          ['var(--color-serie-1)', 'Consumo'],
          ['var(--color-serie-2)', 'Generación solar estimada'],
        ]}
      />
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${ANCHO} ${alto}`} className="w-full min-w-[540px]" role="img" aria-label="Generación solar estimada y consumo por mes, en kWh">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margen.izq} x2={ANCHO - margen.der} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'stroke-line-strong' : 'stroke-line'} />
              <text x={margen.izq - 8} y={y(tick) + 4} textAnchor="end" className="fill-ink-dim font-mono text-[11px]">
                {entero(tick)}
              </text>
            </g>
          ))}
          <text x={margen.izq - 8} y={margen.sup - 1} textAnchor="end" className="fill-ink-dim text-[10px]">
            kWh
          </text>

          {MESES.map((mes, i) => {
            const x0 = margen.izq + i * banda
            const xBarra = x0 + (banda - barra * 2 - 2) / 2
            return (
              <g key={mes}>
                {activo === i && <rect x={x0} y={margen.sup} width={banda} height={altoPlot} className="fill-ink/5" />}
                <path d={columna(xBarra, y(consumo[i]), barra, base - y(consumo[i]))} fill="var(--color-serie-1)" />
                <path d={columna(xBarra + barra + 2, y(generacion[i]), barra, base - y(generacion[i]))} fill="var(--color-serie-2)" />
                <text x={x0 + banda / 2} y={alto - 8} textAnchor="middle" className={`text-[11px] ${activo === i ? 'fill-ink' : 'fill-ink-muted'}`}>
                  {mes.slice(0, 3)}
                </text>
                {/* Zona de contacto: toda la banda del mes, no solo las barras. */}
                <rect
                  x={x0}
                  y={margen.sup}
                  width={banda}
                  height={altoPlot + margen.inf}
                  fill="transparent"
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                />
              </g>
            )
          })}

          {activo != null && (
            <Tooltip
              x={margen.izq + activo * banda + banda / 2}
              y={margen.sup + 2}
              lineas={[
                [MESES[activo]],
                ['Consumo', `${entero(consumo[activo])} kWh`, 'var(--color-serie-1)'],
                ['Generación', `${entero(generacion[activo])} kWh`, 'var(--color-serie-2)'],
                ['Cobertura', `${entero((generacion[activo] / consumo[activo]) * 100)} %`],
              ]}
            />
          )}
        </svg>
      </div>
      <Tabla
        titulo="Ver datos en tabla"
        columnas={['Mes', 'Consumo (kWh)', 'Generación (kWh)', 'Cobertura']}
        filas={MESES.map((mes, i) => [mes, entero(consumo[i]), entero(generacion[i]), `${entero((generacion[i] / consumo[i]) * 100)} %`])}
      />
    </figure>
  )
}

// Flujo de caja acumulado. `flujo`: [{ anio, ahorro, acumulado }] desde el año 0; `payback` en años o null.
export function GraficoFlujo({ flujo, payback }) {
  const [activo, setActivo] = useState(null)
  const alto = 300
  const margen = { izq: 60, der: 16, sup: 26, inf: 26 }
  const anchoPlot = ANCHO - margen.izq - margen.der
  const altoPlot = alto - margen.sup - margen.inf
  const anios = flujo.length - 1
  const valores = flujo.map((punto) => punto.acumulado)
  const ticks = marcas(Math.min(0, ...valores), Math.max(0, ...valores))
  const [piso, techo] = [ticks[0], ticks.at(-1)]
  const x = (anio) => margen.izq + (anchoPlot * anio) / anios
  const y = (valor) => margen.sup + altoPlot * (1 - (valor - piso) / (techo - piso))

  const linea = flujo.map((punto, i) => `${i ? 'L' : 'M'}${x(punto.anio)},${y(punto.acumulado)}`).join('')
  const area = `${linea}L${x(anios)},${y(0)}L${x(0)},${y(0)}Z`
  const ultimo = flujo.at(-1)

  const mover = (event) => {
    const caja = event.currentTarget.getBoundingClientRect()
    const anio = Math.round((((event.clientX - caja.left) / caja.width) * ANCHO - margen.izq) / (anchoPlot / anios))
    setActivo(Math.min(anios, Math.max(0, anio)))
  }

  return (
    <figure>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ANCHO} ${alto}`}
          className="w-full min-w-[540px]"
          role="img"
          aria-label={`Flujo de caja acumulado a ${anios} años${payback ? `, con punto de equilibrio a los ${payback.toFixed(1)} años` : ''}`}
          onMouseMove={mover}
          onMouseLeave={() => setActivo(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margen.izq} x2={ANCHO - margen.der} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'stroke-line-strong' : 'stroke-line'} />
              <text x={margen.izq - 8} y={y(tick) + 4} textAnchor="end" className="fill-ink-dim font-mono text-[11px]">
                {tick < 0 ? '−' : ''}${compacto.format(Math.abs(tick))}
              </text>
            </g>
          ))}
          {flujo
            .filter((punto) => punto.anio % 5 === 0)
            .map((punto) => (
              <text key={punto.anio} x={x(punto.anio)} y={alto - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
                {punto.anio === 0 ? 'Año 0' : punto.anio}
              </text>
            ))}

          <path d={area} fill="var(--color-serie-1)" opacity="0.1" />
          <path d={linea} fill="none" stroke="var(--color-serie-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* Punto de equilibrio: donde el acumulado cruza cero. */}
          {payback != null && (
            <g>
              <line x1={x(payback)} x2={x(payback)} y1={margen.sup - 4} y2={y(0)} className="stroke-line-strong" />
              <circle cx={x(payback)} cy={y(0)} r="5" fill="var(--color-serie-1)" strokeWidth="2" className="stroke-panel" />
              <text x={x(payback) + 8} y={margen.sup + 2} className="fill-ink text-[12px] font-medium">
                Payback: {payback.toFixed(1)} años
              </text>
            </g>
          )}
          <circle cx={x(anios)} cy={y(ultimo.acumulado)} r="5" fill="var(--color-serie-1)" strokeWidth="2" className="stroke-panel" />
          <text x={x(anios) - 10} y={y(ultimo.acumulado) - 10} textAnchor="end" className="fill-ink font-mono text-[12px]">
            {dinero(ultimo.acumulado)}
          </text>

          {activo != null && (
            <g pointerEvents="none">
              <line x1={x(activo)} x2={x(activo)} y1={margen.sup} y2={alto - margen.inf} className="stroke-ink-dim" />
              <circle cx={x(activo)} cy={y(flujo[activo].acumulado)} r="5" fill="var(--color-serie-1)" strokeWidth="2" className="stroke-panel" />
              <Tooltip
                x={x(activo) + (activo > anios / 2 ? -100 : 100)}
                y={margen.sup + 20}
                ancho={176}
                lineas={[
                  [activo === 0 ? 'Año 0 · inversión' : `Año ${activo}`],
                  ['Ahorro del año', dinero(flujo[activo].ahorro)],
                  ['Acumulado', dinero(flujo[activo].acumulado)],
                ]}
              />
            </g>
          )}
        </svg>
      </div>
      <Tabla
        titulo="Ver datos en tabla"
        columnas={['Año', 'Generación (kWh)', 'Ahorro', 'Acumulado']}
        filas={flujo.map((punto) => [punto.anio, entero(punto.generacionKwh), dinero(punto.ahorro), dinero(punto.acumulado)])}
      />
    </figure>
  )
}
