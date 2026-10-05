// Documento PDF de la propuesta (A4, 3 hojas) dibujado directamente con jsPDF: texto y gráficas
// vectoriales, sin capturar la pantalla. Recibe la clase jsPDF (se carga bajo demanda en la app)
// y los datos ya calculados; devuelve el documento listo para `save()`.

const ANCHO = 210
const ALTO = 297
const MARGEN = 16
const UTIL = ANCHO - MARGEN * 2

const TINTA = [17, 20, 26]
const TENUE = [91, 100, 114]
const LINEA = [217, 221, 227]
const FONDO = [244, 245, 247]
const ACENTO = [245, 158, 11]
const SERIE_1 = [57, 135, 229] // consumo / flujo
const SERIE_2 = [217, 89, 38] // generación
const AREA = [226, 237, 251] // serie 1 al 15 % sobre blanco
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const num = (n, decimales = 0) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: decimales, minimumFractionDigits: 0 })
const dinero = (n, decimales = 0) => (n == null || !Number.isFinite(n) ? '—' : `${n < 0 ? '-' : ''}$${num(Math.abs(n), decimales)}`)
// Las fuentes estándar del PDF solo cubren Latin-1: se sustituye lo que quedaría como un símbolo roto.
const seguro = (texto) =>
  String(texto ?? '')
    .replace(/₂/g, '2')
    .replace(/[−–—]/g, '-')
    .replace(/[^\u0000-ÿ]/g, '')

// Marcas "redondas" del eje que cubren [min, max] en unos 4 pasos.
function marcas(min, max) {
  const bruto = (max - min || 1) / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)
  const lista = []
  for (let valor = Math.floor(min / paso) * paso; valor <= Math.ceil(max / paso) * paso + paso / 2; valor += paso) {
    lista.push(Math.abs(valor) < paso / 1e6 ? 0 : valor)
  }
  return lista
}

const compacto = (n) => {
  const abs = Math.abs(n)
  const texto = abs >= 1e6 ? `${num(abs / 1e6, 1)}M` : abs >= 1e3 ? `${num(abs / 1e3, 1)}k` : num(abs)
  return `${n < 0 ? '-' : ''}$${texto}`
}

export function construirPropuestaPdf(jsPDF, datos) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { propuesta, sistema, evaluacion, proyeccion } = datos
  const TOTAL_PAGINAS = 3

  const texto = (contenido, x, y, opciones = {}) => {
    const { tamano = 10, color = TINTA, negrita = false, fuente = 'helvetica', align = 'left', ancho } = opciones
    doc.setFont(fuente, negrita ? 'bold' : 'normal')
    doc.setFontSize(tamano)
    doc.setTextColor(...color)
    const lineas = ancho ? doc.splitTextToSize(seguro(contenido), ancho) : seguro(contenido)
    doc.text(lineas, x, y, { align })
    return Array.isArray(lineas) ? lineas.length : 1
  }

  const pie = (pagina) => {
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, ALTO - 14, ANCHO - MARGEN, ALTO - 14)
    texto(`${propuesta.id} · ${propuesta.fecha} · Estimación preliminar sujeta a verificación en sitio.`, MARGEN, ALTO - 9, { tamano: 7.5, color: TENUE })
    texto(`Página ${pagina} de ${TOTAL_PAGINAS}`, ANCHO - MARGEN, ALTO - 9, { tamano: 7.5, color: TENUE, align: 'right' })
  }

  // Encabezado de las hojas interiores: banda oscura delgada con membrete y título de la hoja.
  const encabezado = (titulo, pagina) => {
    doc.setFillColor(...TINTA)
    doc.rect(0, 0, ANCHO, 20, 'F')
    doc.setFillColor(...ACENTO)
    doc.rect(0, 20, ANCHO, 1, 'F')
    texto(propuesta.empresa, MARGEN, 12.5, { tamano: 11, color: [255, 255, 255], negrita: true })
    texto(propuesta.id, ANCHO - MARGEN, 12.5, { tamano: 10, color: ACENTO, fuente: 'courier', negrita: true, align: 'right' })
    texto(titulo, MARGEN, 33, { tamano: 15, negrita: true })
    pie(pagina)
    return 41
  }

  const tarjeta = (x, y, ancho, alto, etiqueta, valor, unidad) => {
    doc.setFillColor(...FONDO)
    doc.roundedRect(x, y, ancho, alto, 1.5, 1.5, 'F')
    doc.setFillColor(...ACENTO)
    doc.rect(x, y, 1, alto, 'F')
    texto(etiqueta.toUpperCase(), x + 4, y + 6, { tamano: 6.5, color: TENUE })
    texto(valor, x + 4, y + 14.5, { tamano: 14, negrita: true })
    if (unidad) texto(unidad, x + 4, y + 19.5, { tamano: 7.5, color: TENUE })
  }

  // Tabla clave-valor con título; devuelve la y donde termina.
  const tabla = (titulo, filas, y) => {
    texto(titulo, MARGEN, y, { tamano: 10.5, negrita: true })
    doc.setFillColor(...ACENTO)
    doc.rect(MARGEN, y + 1.8, 10, 0.6, 'F')
    let cursor = y + 8
    doc.setLineWidth(0.15)
    for (const [clave, valor] of filas) {
      texto(clave, MARGEN, cursor, { tamano: 9, color: TENUE })
      const lineas = texto(valor, MARGEN + 62, cursor, { tamano: 9, ancho: UTIL - 62 })
      cursor += 4.2 * lineas + 1.2
      doc.setDrawColor(...LINEA)
      doc.line(MARGEN, cursor - 3.4, ANCHO - MARGEN, cursor - 3.4)
      cursor += 0.6
    }
    return cursor + 4
  }

  const leyenda = (items, x, y) => {
    let cursor = x
    for (const [color, etiqueta] of items) {
      doc.setFillColor(...color)
      doc.roundedRect(cursor, y - 2.3, 2.6, 2.6, 0.4, 0.4, 'F')
      texto(etiqueta, cursor + 4, y, { tamano: 8, color: TENUE })
      cursor += 8 + doc.getTextWidth(etiqueta)
    }
  }

  const ejes = (x, y, ancho, alto, ticks, formato) => {
    const [piso, techo] = [ticks[0], ticks.at(-1)]
    const aY = (valor) => y + alto * (1 - (valor - piso) / (techo - piso))
    doc.setLineWidth(0.15)
    for (const tick of ticks) {
      doc.setDrawColor(...(tick === 0 ? TENUE : LINEA))
      doc.line(x, aY(tick), x + ancho, aY(tick))
      texto(formato(tick), x - 2, aY(tick) + 1, { tamano: 7, color: TENUE, align: 'right' })
    }
    return aY
  }

  const graficoMensual = (x, y, ancho, alto, consumo, generacion) => {
    leyenda(
      [
        [SERIE_1, 'Consumo'],
        [SERIE_2, 'Generación solar estimada'],
      ],
      x,
      y - 4,
    )
    const aY = ejes(x, y, ancho, alto, marcas(0, Math.max(...consumo, ...generacion)), (valor) => num(valor))
    const banda = ancho / 12
    const barra = Math.min(4.2, (banda - 3) / 2)
    MESES.forEach((mes, i) => {
      const x0 = x + i * banda + (banda - barra * 2 - 0.5) / 2
      doc.setFillColor(...SERIE_1)
      doc.rect(x0, aY(consumo[i]), barra, aY(0) - aY(consumo[i]), 'F')
      doc.setFillColor(...SERIE_2)
      doc.rect(x0 + barra + 0.5, aY(generacion[i]), barra, aY(0) - aY(generacion[i]), 'F')
      texto(mes, x + i * banda + banda / 2, y + alto + 4.5, { tamano: 7, color: TENUE, align: 'center' })
    })
    texto('kWh', x - 2, y - 2.5, { tamano: 6.5, color: TENUE, align: 'right' })
  }

  const graficoFlujo = (x, y, ancho, alto, flujo, payback) => {
    const anios = flujo.length - 1
    const valores = flujo.map((punto) => punto.acumulado)
    const ticks = marcas(Math.min(0, ...valores), Math.max(0, ...valores))
    const [piso, techo] = [ticks[0], ticks.at(-1)]
    const aX = (anio) => x + (ancho * anio) / anios
    const yDe = (valor) => y + alto * (1 - (valor - piso) / (techo - piso))

    // El área va primero para que la rejilla y la línea queden encima.
    const puntos = flujo.map((punto) => [aX(punto.anio), yDe(punto.acumulado)])
    const contorno = [...puntos, [aX(anios), yDe(0)], [aX(0), yDe(0)]]
    doc.setFillColor(...AREA)
    doc.lines(contorno.slice(1).map((punto, i) => [punto[0] - contorno[i][0], punto[1] - contorno[i][1]]), contorno[0][0], contorno[0][1], [1, 1], 'F', true)

    ejes(x, y, ancho, alto, ticks, compacto)
    doc.setDrawColor(...SERIE_1)
    doc.setLineWidth(0.6)
    for (let i = 1; i < puntos.length; i++) doc.line(puntos[i - 1][0], puntos[i - 1][1], puntos[i][0], puntos[i][1])
    for (const punto of flujo.filter((p) => p.anio % 5 === 0)) {
      texto(punto.anio === 0 ? 'Año 0' : String(punto.anio), aX(punto.anio), y + alto + 4.5, { tamano: 7, color: TENUE, align: 'center' })
    }

    const marcador = (px, py) => {
      doc.setFillColor(255, 255, 255)
      doc.circle(px, py, 1.7, 'F')
      doc.setFillColor(...SERIE_1)
      doc.circle(px, py, 1.2, 'F')
    }
    if (payback != null) {
      doc.setDrawColor(...TENUE)
      doc.setLineWidth(0.2)
      doc.line(aX(payback), y, aX(payback), yDe(0))
      marcador(aX(payback), yDe(0))
      texto(`Payback: ${payback.toFixed(1)} años`, aX(payback) + 2, y + 3, { tamano: 8.5, negrita: true })
    }
    const ultimo = flujo.at(-1)
    marcador(aX(anios), yDe(ultimo.acumulado))
    texto(dinero(ultimo.acumulado), aX(anios) - 2.5, yDe(ultimo.acumulado) - 2.5, { tamano: 8.5, negrita: true, align: 'right' })
  }

  // ------------------------------------------------------------ Hoja 1: portada y resumen
  doc.setFillColor(...TINTA)
  doc.rect(0, 0, ANCHO, 46, 'F')
  doc.setFillColor(...ACENTO)
  doc.rect(0, 46, ANCHO, 1.4, 'F')
  texto(propuesta.empresa, MARGEN, 21, { tamano: 20, color: [255, 255, 255], negrita: true })
  texto('Propuesta de sistema fotovoltaico', MARGEN, 30, { tamano: 11, color: ACENTO })
  texto(propuesta.id, ANCHO - MARGEN, 21, { tamano: 14, color: [255, 255, 255], fuente: 'courier', negrita: true, align: 'right' })
  texto(propuesta.fecha, ANCHO - MARGEN, 30, { tamano: 10, color: [200, 205, 214], align: 'right' })

  const columnas = [
    ['Cliente', propuesta.cliente || 'Por definir'],
    ['Proyecto / dirección', propuesta.direccion || 'Por definir'],
    ['Diseñador / asesor', propuesta.asesor || 'Por definir'],
  ]
  columnas.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + (UTIL / 3) * i
    texto(etiqueta.toUpperCase(), x, 58, { tamano: 6.5, color: TENUE })
    texto(valor, x, 63.5, { tamano: 10.5, negrita: true, ancho: UTIL / 3 - 4 })
  })

  const yImagen = 76
  const altoImagen = 92
  if (datos.imagenTecho) {
    doc.addImage(datos.imagenTecho, 'JPEG', MARGEN, yImagen, UTIL, altoImagen)
  } else {
    doc.setFillColor(...FONDO)
    doc.rect(MARGEN, yImagen, UTIL, altoImagen, 'F')
    texto('Vista satelital no disponible: traza el techo en el módulo de Diseño.', ANCHO / 2, yImagen + altoImagen / 2, { tamano: 9, color: TENUE, align: 'center' })
  }
  if (datos.techo) {
    texto(
      `Arreglo de ${sistema.numPaneles} módulos sobre ${num(datos.techo.areaM2, 0)} m² de techo · azimut ${num(datos.techo.azimut, 0)}° · inclinación ${num(datos.techo.inclinacion, 0)}°`,
      MARGEN,
      yImagen + altoImagen + 5,
      { tamano: 8, color: TENUE },
    )
  }

  const yTarjetas = 182
  const anchoTarjeta = (UTIL - 12) / 4
  const tarjetas = [
    ['Potencia DC', num(evaluacion.kwp, 2), 'kWp instalados'],
    ['Potencia AC', num(evaluacion.potenciaAcKw, 2), 'kW de inversores'],
    ['Generación anual', num(evaluacion.generacionAnualKwh, 0), 'kWh estimados'],
    ['Ahorro año 1', dinero(proyeccion?.ahorroAnual), 'estimado'],
  ]
  tarjetas.forEach((item, i) => tarjeta(MARGEN + (anchoTarjeta + 4) * i, yTarjetas, anchoTarjeta, 24, ...item))

  texto('Resumen', MARGEN, 220, { tamano: 10.5, negrita: true })
  const frases = [
    `Se propone un sistema fotovoltaico de ${num(evaluacion.kwp, 2)} kWp con ${sistema.numPaneles} módulos ${sistema.panel.marca} ${sistema.panel.modelo} de ${sistema.panel.potencia_wp} Wp` +
      (sistema.inversor ? ` y ${sistema.cantidad} inversor(es) ${sistema.inversor.marca} ${sistema.inversor.modelo}.` : '.'),
    evaluacion.cobertura != null
      ? `La generación estimada de ${num(evaluacion.generacionAnualKwh, 0)} kWh al año cubre el ${num(evaluacion.cobertura * 100, 0)} % del consumo anual de ${num(datos.consumo.anualKwh, 0)} kWh.`
      : '',
    proyeccion
      ? `Con una inversión de ${dinero(proyeccion.costoTotal)} y un ahorro de ${dinero(proyeccion.ahorroAnual)} el primer año, la inversión se recupera en ${proyeccion.payback == null ? 'más de 25' : num(proyeccion.payback, 1)} años.`
      : '',
  ]
  texto(frases.filter(Boolean).join(' '), MARGEN, 227, { tamano: 9.5, color: TENUE, ancho: UTIL })
  pie(1)

  // ------------------------------------------------------------ Hoja 2: especificaciones y equipos
  doc.addPage()
  let y = encabezado('Especificaciones técnicas y equipos', 2)
  const { panel, inversor } = sistema
  y = tabla(
    'Módulos fotovoltaicos',
    [
      ['Marca y modelo', `${panel.marca} ${panel.modelo}`],
      ['Potencia unitaria', `${panel.potencia_wp} Wp`],
      ['Cantidad', `${sistema.numPaneles} módulos`],
      ['Potencia total DC', `${num(evaluacion.kwp, 2)} kWp`],
      ['Dimensiones', panel.largo_mm ? `${panel.largo_mm} × ${panel.ancho_mm} mm` : '—'],
      ['Voc / Isc', `${num(panel.voc, 2)} V / ${num(panel.isc, 2)} A`],
      ['Vmp / Imp', `${num(panel.vmp, 2)} V / ${num(panel.imp, 2)} A`],
    ],
    y,
  )
  if (inversor) {
    y = tabla(
      'Inversor',
      [
        ['Marca y modelo', `${inversor.marca} ${inversor.modelo}`],
        ['Potencia AC nominal', `${num(inversor.potencia_ac_nominal_kw, 2)} kW por unidad`],
        ['Cantidad', `${sistema.cantidad} unidad(es) · ${num(evaluacion.potenciaAcKw, 2)} kW AC en total`],
        ['Seguidores MPPT', inversor.mppt_num ? `${inversor.mppt_num} por unidad` : '—'],
        ['Rango MPPT / Voc máx.', `${inversor.v_mppt_min ?? '—'} – ${inversor.v_mppt_max ?? '—'} V / ${inversor.voc_max ?? '—'} V`],
        ['Red compatible', [].concat(inversor.tipo_red ?? '—').join('; ')],
      ],
      y,
    )
  }
  if (datos.bateria) {
    const { equipo, cantidad, capacidadKwh, autonomiaHoras } = datos.bateria
    y = tabla(
      'Almacenamiento',
      [
        ['Marca y modelo', `${equipo.marca} ${equipo.modelo}`],
        ['Cantidad', `${cantidad} unidad(es)`],
        ['Capacidad total', `${num(capacidadKwh, 2)} kWh · ${equipo.voltaje_nominal_v ?? '—'} V · ${equipo.tipo_quimica ?? ''}`],
        ['Autonomía estimada', autonomiaHoras ? `${num(autonomiaHoras, 1)} horas al consumo promedio` : '—'],
      ],
      y,
    )
  }
  const strings = evaluacion.strings
  y = tabla(
    'Parámetros eléctricos',
    [
      ['Tensión de servicio', datos.red.label],
      ['Transformador', datos.red.transformadorKva ? `${datos.red.transformadorKva} kVA` : 'Sin dato'],
      ['Interruptor principal', datos.red.interruptorA ? `${datos.red.interruptorA} A` : 'Sin dato'],
      ['Ratio DC/AC', evaluacion.ratio.valor ? num(evaluacion.ratio.valor, 2) : '—'],
      ['Corriente AC del sistema', evaluacion.interconexion.corrienteSolar ? `${num(evaluacion.interconexion.corrienteSolar, 1)} A a ${datos.red.voltaje} V` : '—'],
      ['Arreglo de strings', strings.strings ? `${strings.strings} string(s) de ~${strings.porString} módulos · ${num(strings.vocString, 0)} V en frío` : '—'],
    ],
    y,
  )
  if (datos.techo) {
    tabla(
      'Techo',
      [
        ['Área en planta', `${num(datos.techo.areaM2, 1)} m²`],
        ['Azimut / inclinación', `${num(datos.techo.azimut, 0)}° / ${num(datos.techo.inclinacion, 0)}°`],
        ['Capacidad física', datos.techo.cantidad != null ? `Caben hasta ${datos.techo.cantidad} módulos en orientación ${datos.techo.orientacion}` : '—'],
      ],
      y,
    )
  }

  // ------------------------------------------------------------ Hoja 3: análisis financiero
  doc.addPage()
  y = encabezado('Análisis financiero y retorno', 3)
  texto('Generación solar estimada vs. consumo mensual', MARGEN, y + 2, { tamano: 10.5, negrita: true })
  if (datos.consumo.mensual && evaluacion.generacionPorMes) {
    graficoMensual(MARGEN + 12, y + 16, UTIL - 12, 52, datos.consumo.mensual, evaluacion.generacionPorMes)
  }
  y += 84
  texto('Flujo de caja acumulado a 25 años', MARGEN, y, { tamano: 10.5, negrita: true })
  if (proyeccion) {
    graficoFlujo(MARGEN + 14, y + 8, UTIL - 16, 62, proyeccion.flujo, proyeccion.payback)
  } else {
    texto('Faltan la tarifa o el precio por Watt para proyectar el flujo de caja.', MARGEN, y + 10, { tamano: 9, color: TENUE })
  }
  y += 86

  const anchoMetrica = (UTIL - 8) / 3
  const metricas = [
    ['Inversión total', dinero(proyeccion?.costoTotal), datos.precioWp ? `${dinero(datos.precioWp, 2)} por Wp instalado` : ''],
    ['Payback', proyeccion ? (proyeccion.payback == null ? '> 25' : num(proyeccion.payback, 1)) : '—', 'años'],
    ['ROI acumulado a 25 años', proyeccion ? `${num(proyeccion.roi, 0)} %` : '—', 'ganancia neta / inversión'],
    ['Ahorro a 25 años', dinero(proyeccion?.ahorroTotal), 'suma de ahorros anuales'],
    ['Ganancia neta', dinero(proyeccion?.gananciaNeta), 'ahorro menos inversión'],
    ['CO2 evitado', proyeccion ? `${num(proyeccion.co2Toneladas, 1)} t` : '—', 'toneladas en 25 años'],
  ]
  metricas.forEach((item, i) => tarjeta(MARGEN + (anchoMetrica + 4) * (i % 3), y + Math.floor(i / 3) * 28, anchoMetrica, 24, ...item))
  if (datos.supuestos) texto(datos.supuestos, MARGEN, y + 62, { tamano: 7.5, color: TENUE, ancho: UTIL })

  return doc
}
