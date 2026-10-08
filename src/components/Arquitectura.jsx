import { BatteryCharging, Network, Plus, Trash2 } from 'lucide-react'
import { useDimensionamiento } from '../hooks/useDimensionamiento.js'
import { ARQUITECTURAS, MARGEN_SOBRECARGA, PERFILES_CARGA, compatibilidadBateria, rangoBateria } from '../lib/almacenamiento.js'
import Panel from './Panel.jsx'
import { Check, NumberField, Stat, Toggle, fmt, inputClass, labelClass } from './campos.jsx'

const CARGAS_COMUNES = [
  ['Nevera', 150, 8],
  ['Aire acondicionado 12.000 BTU', 1100, 6],
  ['Luces LED', 10, 5],
  ['Bomba de agua 1/2 HP', 370, 1],
  ['Televisor', 100, 4],
  ['Lavadora', 500, 1],
]
const celda = 'w-full rounded border border-line bg-base px-2 py-1 text-sm'
const RANGO = { LOW_VOLTAGE: 'LV', HIGH_VOLTAGE: 'HV' }

// Arquitectura del sistema: on-grid, aislado o híbrido. De ella dependen los inversores que se
// ofrecen, si hay baterías y, en aislado, la tabla de cargas con la que se dimensiona.
export default function Arquitectura() {
  const { arquitectura, conBateria, cargas, usaCargas, almacenamiento, sistema, baterias, resumen, proyecto, actualizar } = useDimensionamiento()
  const { sistema: opciones, finanzas } = proyecto
  const cambiar = (cambios) => actualizar('sistema', cambios)
  const filas = opciones.cargas ?? []
  const cambiarCarga = (indice, campo, valor) => cambiar({ cargas: filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)) })
  const agregarCarga = (nombre = '', potenciaW = '', horas = '') => cambiar({ cargas: [...filas, { nombre, potenciaW: String(potenciaW), cantidad: '1', horas: String(horas), simultaneidad: '1' }] })

  // Con un inversor ya definido solo se ofrecen las baterías de su mismo rango de voltaje.
  const inversor = sistema?.inversor
  const ofrecidas = baterias.filter((bateria) => !inversor || compatibilidadBateria(inversor, bateria).estado !== 'danger')

  return (
    <>
      <Panel title="Arquitectura del sistema" icon={Network}>
        <Toggle value={arquitectura} options={ARQUITECTURAS} onChange={(tipo) => cambiar({ tipo })} />
        <p className="mt-2 text-xs text-ink-dim">
          {arquitectura === 'on_grid' && 'Conectado a la red, sin baterías. Solo se ofrecen inversores on-grid compatibles con la tensión de la red.'}
          {arquitectura === 'off_grid' && 'Sin red eléctrica: la batería es obligatoria y el inversor debe cubrir la potencia pico de las cargas.'}
          {arquitectura === 'hibrido' && 'Conectado a la red con inversor híbrido. Las baterías de respaldo son opcionales.'}
        </p>

        {arquitectura === 'hibrido' && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={Boolean(opciones.respaldo)} onChange={(event) => cambiar({ respaldo: event.target.checked })} className="size-4 accent-(--color-accent)" />
            ¿Incluir almacenamiento de respaldo?
          </label>
        )}

        {arquitectura === 'off_grid' && (
          <div className="mt-4">
            <p className={labelClass}>Consumo para dimensionar</p>
            <Toggle
              value={opciones.usarCargas ? 'cargas' : 'factura'}
              options={[
                ['factura', 'Consumo mensual / factura'],
                ['cargas', 'Tabla de cargas'],
              ]}
              onChange={(valor) => cambiar({ usarCargas: valor === 'cargas' })}
            />
          </div>
        )}

        {arquitectura === 'off_grid' && opciones.usarCargas && (
          <div className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                    {['Equipo', 'Potencia (W)', 'Cantidad', 'Horas/día', 'Simultaneidad', 'kWh/día', ''].map((titulo) => (
                      <th key={titulo} scope="col" className="px-1 pb-1.5 font-medium">
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila, i) => {
                    const diario = ((Number(fila.potenciaW) || 0) * (Number(fila.cantidad) || 0) * Math.min(24, Number(fila.horas) || 0)) / 1000
                    return (
                      <tr key={i}>
                        <td className="p-1">
                          <input type="text" value={fila.nombre} placeholder="Equipo" aria-label="Equipo" onChange={(event) => cambiarCarga(i, 'nombre', event.target.value)} className={celda} />
                        </td>
                        {[
                          ['potenciaW', 'Potencia en vatios'],
                          ['cantidad', 'Cantidad'],
                          ['horas', 'Horas de uso por día'],
                          ['simultaneidad', 'Factor de simultaneidad, de 0 a 1'],
                        ].map(([campo, descripcion]) => (
                          <td key={campo} className="w-24 p-1">
                            <input type="text" inputMode="decimal" value={fila[campo]} aria-label={descripcion} onChange={(event) => cambiarCarga(i, campo, event.target.value)} className={`${celda} font-mono`} />
                          </td>
                        ))}
                        <td className="w-20 p-1 text-right font-mono text-xs tabular-nums text-ink-muted">{fmt(diario, 2)}</td>
                        <td className="w-8 p-1">
                          <button type="button" onClick={() => cambiar({ cargas: filas.filter((_, j) => j !== i) })} aria-label={`Quitar ${fila.nombre || 'carga'}`} className="rounded p-1 text-ink-muted hover:text-danger">
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-1 py-4 text-center text-sm text-ink-dim">
                        Añade los equipos que alimentará el sistema.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => agregarCarga()} className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1 text-sm text-ink-muted hover:border-line-strong hover:text-ink">
                <Plus className="size-4" aria-hidden="true" />
                Añadir equipo
              </button>
              <label className="flex items-center gap-2 text-xs text-ink-dim">
                Equipos comunes
                <select
                  value=""
                  onChange={(event) => {
                    const comun = CARGAS_COMUNES[Number(event.target.value)]
                    if (comun) agregarCarga(...comun)
                  }}
                  className="rounded border border-line bg-base px-2 py-1 text-sm text-ink"
                >
                  <option value="">Elegir…</option>
                  {CARGAS_COMUNES.map(([nombre, potencia], i) => (
                    <option key={nombre} value={i}>
                      {nombre} · {potencia} W
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-1 text-xs text-ink-dim">Las potencias de los equipos comunes son valores de referencia: ajústalas a la placa de cada equipo.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Consumo diario" value={fmt(cargas.diarioKwh, 2)} unit="kWh/día" />
              <Stat label="Potencia pico simultánea" value={fmt(cargas.picoKw, 2)} unit="kW" />
              <Stat label="Inversor mínimo" value={fmt(cargas.picoKw * MARGEN_SOBRECARGA, 2)} unit="kW" />
            </div>
            <p className="mt-1 text-xs text-ink-dim">
              Consumo diario = Σ potencia × cantidad × horas. Potencia pico = Σ potencia × cantidad × simultaneidad. El inversor se elige con un{' '}
              {fmt((MARGEN_SOBRECARGA - 1) * 100, 0)} % de margen sobre el pico.
            </p>
          </div>
        )}
        {arquitectura === 'off_grid' && !usaCargas && !resumen.anualKwh && (
          <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Falta el consumo: llena la tabla de cargas o el consumo mensual más abajo.</p>
        )}
      </Panel>

      {conBateria && (
        <Panel title="Banco de baterías" icon={BatteryCharging}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelClass}>Batería</span>
              <select value={finanzas.bateriaId} onChange={(event) => actualizar('finanzas', { bateriaId: event.target.value })} className={`${inputClass} font-sans`}>
                <option value="">Elegir batería…</option>
                {ofrecidas.map((bateria) => (
                  <option key={bateria.id} value={bateria.id}>
                    {bateria.marca} {bateria.modelo} · {bateria.capacidad_kwh} kWh{rangoBateria(bateria) ? ` · ${RANGO[rangoBateria(bateria)]}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Días de autonomía"
              unit="días"
              value={opciones.autonomiaDias}
              options={[1, 2, 3]}
              onChange={(autonomiaDias) => cambiar({ autonomiaDias })}
              hint="De 1 a 3 días sin sol."
            />
            <NumberField
              label="Profundidad de descarga (DoD)"
              unit="%"
              value={opciones.dod}
              placeholder={almacenamiento ? fmt(almacenamiento.dod, 0) : '90'}
              onChange={(dod) => cambiar({ dod })}
              hint="Vacío: el recomendado para la batería (90 % en LFP, 80 % en otras)."
            />
            <NumberField
              label="N° de baterías"
              value={finanzas.bateriaCantidad}
              placeholder={almacenamiento?.recomendada ? String(almacenamiento.recomendada) : '1'}
              onChange={(bateriaCantidad) => actualizar('finanzas', { bateriaCantidad })}
              hint={almacenamiento?.recomendada ? `Recomendadas: ${almacenamiento.recomendada}. Vacío usa esa cantidad.` : 'Elige la batería para ver la cantidad recomendada.'}
            />
            <label className="block">
              <span className={labelClass}>Perfil horario del consumo</span>
              <select value={opciones.perfilCarga in PERFILES_CARGA ? opciones.perfilCarga : 'residencial'} onChange={(event) => cambiar({ perfilCarga: event.target.value })} className={`${inputClass} font-sans`}>
                {Object.entries(PERFILES_CARGA).map(([id, perfil]) => (
                  <option key={id} value={id}>
                    {perfil.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {almacenamiento && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Capacidad requerida" value={almacenamiento.requeridoKwh ? fmt(almacenamiento.requeridoKwh, 1) : '—'} unit="kWh" />
                <Stat label="Capacidad instalada" value={almacenamiento.capacidadKwh ? fmt(almacenamiento.capacidadKwh, 1) : '—'} unit="kWh" />
                <Stat label="Capacidad útil" value={almacenamiento.utilKwh ? fmt(almacenamiento.utilKwh, 1) : '—'} unit="kWh" />
                <Stat label="Descarga máxima" value={almacenamiento.descargaKw ? fmt(almacenamiento.descargaKw, 1) : '—'} unit="kW" />
              </div>
              <p className="mt-1 text-xs text-ink-dim">
                Capacidad requerida = consumo diario × días de autonomía ÷ DoD
                {almacenamiento.requeridoKwh ? ` = ${fmt(resumen.anualKwh / 365, 1)} kWh × ${opciones.autonomiaDias || 1} ÷ ${fmt(almacenamiento.dod, 0)} %.` : '.'}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {!almacenamiento.bateria && almacenamiento.obligatoria && (
                  <Check estado="danger" titulo="Batería obligatoria">
                    Un sistema aislado no funciona sin baterías: elige una.
                  </Check>
                )}
                {almacenamiento.bateria && almacenamiento.suficiente != null && (
                  <Check estado={almacenamiento.suficiente ? 'ok' : almacenamiento.obligatoria ? 'danger' : 'warn'} titulo="Capacidad del banco">
                    {almacenamiento.unidades} × {almacenamiento.bateria.modelo} = {fmt(almacenamiento.capacidadKwh, 1)} kWh frente a {fmt(almacenamiento.requeridoKwh, 1)} kWh requeridos.
                  </Check>
                )}
                {almacenamiento.bateria && (
                  <Check estado={almacenamiento.compatibilidad.estado} titulo="Compatibilidad inversor – batería">
                    {almacenamiento.compatibilidad.mensaje ?? 'Define el inversor para verificar la tensión de la batería.'}
                  </Check>
                )}
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  )
}
