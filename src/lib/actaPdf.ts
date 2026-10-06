import jsPDF from "jspdf"
import { AREAS, TURNO_TIPOS, nombreGrupo, nombrePorCodigo, type AreaCodigo, type GrupoCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { eficienciaDelTurno } from "@/lib/eficiencia"
import { agruparPorSaborYLote } from "@/lib/agruparProduccion"
import { LIMITE_MERMA } from "@/lib/turno"
import { mermaCorrida } from "@/lib/reportes"
import { mermaEnvasesDeCorridas } from "@/lib/reportes/realidadProduccion"
import { FRANJA_ACTA, ICONO_CONTADOR_BUENOS, ICONO_CONTADOR_DESECHO, ICONO_CONTADOR_LLENADORA } from "@/lib/actaIconos"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { EsquemaTurnos, ResponsableTurno, TanqueEncontrado } from "@/lib/sesionTurno"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { CondicionTanque, TanqueRecepcion, PreparacionRegistro, AjusteVolumenRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { duracionMin, fmtDesvio, type Parada } from "@/lib/paradas"
import type { NovedadTurno } from "@/lib/novedades"
import type { LecturaServiciosIndustriales } from "@/lib/panelProduccion"
import { tramoT2 } from "@/lib/turno12x12"

/*
 * Acta de Entrega de Turno en PDF (jsPDF), CALCADA del acta real de Natulac
 * ("Info que no va en el pryecto/Acta de Entrega.pdf"): una cuadrícula de 9
 * columnas iguales, como la hoja de Excel original, con la franja + logo de
 * arriba (sacada del PDF real, actaIconos.ts), barras azules de título y
 * encabezados celestes.
 *
 *   Página 1: 1.1–1.5 encabezado · 1.6 tanques recibidos · 1.7 semielaborado
 *             · 1.8 tanques entregados · 1.9 producción · 2.1 eficiencia y
 *             merma + paradas por línea.
 *   Página 2: 2.2 contadores (recuadros por sabor + lote, con los dibujitos)
 *             · 2.3 novedades. La firma del supervisor va en 1.4, al lado del nombre.
 *
 * Lo que el sistema suma al formato original va dentro de las mismas
 * casillas: las paradas en los recuadros por línea de 2.1; ajustes de
 * agua/jugo, entregas automáticas, Servicios Industriales y correcciones
 * en 2.3; relevos en 1.4. 1.9 es solo el resumen de cajas (sin calidad /
 * no conforme) y la firma es solo la del supervisor saliente (dueño, 2026-10-01).
 */

const LIMITE_MERMA_PCT = LIMITE_MERMA * 100

/** Colores del acta real (el azul, una variante más suave del original #1024F0). */
const AZUL: [number, number, number] = [44, 82, 190]
const CELESTE: [number, number, number] = [109, 158, 235]
const ROJO: [number, number, number] = [200, 30, 30]

/** "8:42" a partir de un ISO local, en hora de planta. */
function horaNovedad(iso: string): string {
  return horaCortaPlanta(iso, iso)
}

/** Merma promedio del turno para UNA línea — simple promedio de la merma de cada corrida comparable (mismo criterio que "Producido"). */
function mermaPromedioLinea(
  corridas: Corrida[],
  contadores: ContadorRegistro[],
  productoTerminado: ProductoTerminadoRegistro[],
  presentaciones: PresentacionLive[],
  lineaCodigo: string,
): number | null {
  const mermas = corridas
    .filter((c) => c.linea === lineaCodigo)
    .map((c) => mermaCorrida(c.id, contadores, productoTerminado, presentaciones))
    .filter((m): m is NonNullable<typeof m> => m !== null)
  if (mermas.length === 0) return null
  return Math.round((mermas.reduce((a, m) => a + m.pct, 0) / mermas.length) * 100) / 100
}

const NOMBRE_CONDICION: Record<CondicionTanque, string> = {
  LISTO: "Listo",
  STANDBY: "Con restos",
  EN_PREPARACION: "En preparación",
  SUCIO: "Sucio",
  CIP: "En CIP",
  LIMPIO: "Limpio",
}

export async function generarActaPdf(params: {
  codigo: string
  fecha: string
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  tanquesEncontrados: TanqueEncontrado[] | null
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  novedades: NovedadTurno[]
  ajustesVolumen: AjusteVolumenRegistro[]
  /** Paradas registradas en este turno (ver cargarParadasDelTurno). Van en los recuadros por línea de 2.1. */
  paradas?: Parada[]
  /** Lecturas de Servicios Industriales con turno_id = este turno (ver migración 20261057). Van en 2.3. */
  serviciosIndustriales?: LecturaServiciosIndustriales[]
  supervisorNombre: string
  /** Quién estuvo a cargo y cuándo. Con más de uno (relevo, ej. 12x12) se listan en 1.4. */
  responsables?: ResponsableTurno[]
  esquema?: EsquemaTurnos
  /** Hora real de inicio del turno ("HH:MM[:SS]"). En 12x12 distingue el T2 del día y el de la noche. */
  horaInicio?: string | null
  /** Correcciones abiertas después del cierre. Van al final de 2.3. */
  correcciones?: { nombre: string; motivo: string; creadaEn: string }[]
  area: AreaCodigo | null
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
  velocidades: VelocidadLive[]
}): Promise<Blob> {
  const {
    codigo,
    fecha,
    turnoTipo,
    grupo,
    tanquesEncontrados,
    tanques,
    preparaciones,
    corridas,
    contadores,
    productoTerminado,
    novedades,
    ajustesVolumen,
    paradas = [],
    serviciosIndustriales = [],
    supervisorNombre,
    responsables = [],
    esquema,
    horaInicio = null,
    correcciones = [],
    area,
    lineas,
    presentaciones,
    velocidades,
  } = params

  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const M = 6.5
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const C = W / 9 // una columna de la grilla original
  const ALTO_FRANJA = (W * 57) / 850
  const LIMITE_Y = 289
  let y = 0

  // ---------------------------------------------------------------- helpers
  type Color = number | [number, number, number]
  const color = (c: Color) => (typeof c === "number" ? ([c, c, c] as [number, number, number]) : c)
  /** Recorta con "…" para que entre en el ancho (fuente y tamaño actuales). */
  const ajustar = (texto: string, ancho: number) => {
    if (doc.getTextWidth(texto) <= ancho) return texto
    let t = texto
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > ancho) t = t.slice(0, -1)
    return `${t}…`
  }
  /**
   * Una celda de la grilla: borde negro fino, fondo opcional y texto (una o
   * varias líneas con "\n") centrado vertical; horizontal según `alinear`.
   */
  const celda = (
    x: number,
    yc: number,
    w: number,
    h: number,
    texto = "",
    o: { fondo?: [number, number, number]; color?: Color; negrita?: boolean; tamano?: number; alinear?: "center" | "left" | "right" } = {},
  ) => {
    doc.setDrawColor(0)
    doc.setLineWidth(0.15)
    if (o.fondo) {
      doc.setFillColor(...o.fondo)
      doc.rect(x, yc, w, h, "FD")
    } else doc.rect(x, yc, w, h, "S")
    if (!texto) return
    const lineasTexto = texto.split("\n")
    doc.setFont("helvetica", o.negrita ? "bold" : "normal")
    // Si no entra, primero achica la letra (hasta 5 pt); recién ahí recorta con "…".
    let tamano = o.tamano ?? 7.5
    doc.setFontSize(tamano)
    while (tamano > 5 && lineasTexto.some((l) => doc.getTextWidth(l) > w - 1.6)) {
      tamano -= 0.5
      doc.setFontSize(tamano)
    }
    doc.setTextColor(...color(o.color ?? (o.fondo ? 255 : 0)))
    const altoLinea = tamano * 0.3528 * 1.15
    const alinear = o.alinear ?? "center"
    const xt = alinear === "center" ? x + w / 2 : alinear === "left" ? x + 1.2 : x + w - 1.2
    lineasTexto.forEach((l, i) => {
      const yt = yc + h / 2 + (i - (lineasTexto.length - 1) / 2) * altoLinea
      doc.text(ajustar(l, w - 1.6), xt, yt, { align: alinear, baseline: "middle" })
    })
  }
  /** Barra azul de título de sección, a todo el ancho. */
  const barra = (texto: string) => {
    asegurar(4.2 + 12)
    celda(M, y, W, 4.2, texto, { fondo: AZUL, negrita: true, tamano: 8 })
    y += 4.2
  }
  /** Franja + logo arriba de cada página, como el acta real. */
  const franja = () => {
    doc.addImage(FRANJA_ACTA, "PNG", M, 5, W, ALTO_FRANJA, undefined, "FAST")
    y = 5 + ALTO_FRANJA
  }
  const nuevaPagina = () => {
    doc.addPage()
    franja()
    y += 2
  }
  /** Si lo que sigue no entra en la página, pasa a una nueva. */
  const asegurar = (alto: number) => {
    if (y + alto > LIMITE_Y) nuevaPagina()
  }
  const miles = (n: number) => Math.round(n).toLocaleString("es-CO")
  const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

  // ---------------------------------------------------------------- franja y título
  franja()
  doc.setDrawColor(0)
  doc.setLineWidth(0.15)
  doc.line(M, y, M, y + 7)
  doc.line(M + W, y, M + W, y + 7)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(0)
  doc.text("ACTA DE ENTREGA DE TURNO", M + W / 2, y + 4.2, { align: "center", baseline: "middle" })
  y += 7

  // ---------------------------------------------------------------- 1.1–1.5 encabezado
  const [anio, mes, dia] = fecha.split("-")
  // 12x12: el T2 se parte a las 19:00 (src/lib/turno12x12.ts); se dice cuál de los dos es.
  const tramo = tramoT2(esquema, turnoTipo, horaInicio)
  const turnoTexto = `${nombrePorCodigo(TURNO_TIPOS, turnoTipo)}${esquema === "12x12" ? " · 12x12" : ""}${tramo ? `\n${tramo.desde}–${tramo.hasta}` : ""}`
  const supervisorTexto =
    responsables.length > 1
      ? responsables
          .map((r) => `${r.nombre} (${horaCortaPlanta(r.desde, fecha)}–${r.hasta ? horaCortaPlanta(r.hasta, fecha) : "cierre"})`)
          .join(" / ")
      : supervisorNombre
  const fila = 6
  const etiqueta = { fondo: AZUL, negrita: true, tamano: 7.5 } as const
  const valor = { negrita: true, tamano: 8 } as const
  celda(M, y, C, fila, "1.1 Fecha:", etiqueta)
  celda(M + C, y, C, fila, `${dia}/${mes}/${anio}`, valor)
  celda(M + 2 * C, y, C, fila, "1.2 Turno:", etiqueta)
  celda(M + 3 * C, y, C, fila, turnoTexto, tramo ? { ...valor, tamano: 6.5 } : valor)
  celda(M + 4 * C, y, C, fila, "1.3 Grupo:", etiqueta)
  celda(M + 5 * C, y, C, fila, nombreGrupo(grupo), valor)
  // Fila del supervisor más alta: al lado va su firma (la única del acta, dueño 2026-10-01).
  const filaFirma = 10
  celda(M + 6 * C, y, C, fila + filaFirma, "1.5\nIdentificación:", etiqueta)
  celda(M + 7 * C, y, 2 * C, fila + filaFirma, `${codigo}\n${area ? nombrePorCodigo(AREAS, area) : ""}`, { tamano: 7.5 })
  celda(M, y + fila, C, filaFirma, "1.4 Supervisor:", etiqueta)
  celda(M + C, y + fila, 2.5 * C, filaFirma, supervisorTexto, { ...valor, tamano: responsables.length > 1 ? 6.5 : 8 })
  celda(M + 3.5 * C, y + fila, 0.7 * C, filaFirma, "Firma:", etiqueta)
  celda(M + 4.2 * C, y + fila, 1.8 * C, filaFirma)
  y += fila + filaFirma

  // ---------------------------------------------------------------- 1.6 / 1.8 tanques
  const bloqueTanques = (
    titulo: string,
    datos: (n: 1 | 2 | 3) => { condicion: CondicionTanque; volumenL: number | null; saborNombre: string | null; lote: string | null } | null,
  ) => {
    barra(titulo)
    const bloque = 3 * C
    ;([1, 2, 3] as const).forEach((n, i) => {
      const x = M + i * bloque
      const t = datos(n)
      const conProducto = t !== null && (t.condicion === "LISTO" || t.condicion === "STANDBY")
      celda(x, y, 1.5 * C, 4.5, `Tanque ${n}`, { fondo: AZUL, negrita: true })
      celda(x + 1.5 * C, y, C, 4.5, "Lote", { fondo: AZUL, negrita: true })
      celda(x + 2.5 * C, y, 0.5 * C, 4.5, conProducto ? (t.lote ?? "") : "", { negrita: true, tamano: 7 })
      celda(x, y + 4.5, C, 4.5, "Cantidad", { fondo: CELESTE, negrita: true })
      celda(x + C, y + 4.5, 2 * C, 4.5, "Sabor / Status", { fondo: CELESTE, negrita: true })
      const sabor = t === null ? "Sin registrar" : conProducto ? `${t.saborNombre ?? "Sin sabor"}${t.condicion === "STANDBY" ? " (con restos)" : ""}` : NOMBRE_CONDICION[t.condicion]
      celda(x, y + 9, C, 6, conProducto ? miles(t.volumenL ?? 0) : "0", { negrita: true, tamano: 8 })
      celda(x + C, y + 9, 2 * C, 6, sabor, { negrita: conProducto, tamano: 8 })
    })
    y += 15
  }
  bloqueTanques("1.6 CONDICIÓN EN LA QUE RECIBEN LOS TANQUES", (n) => tanquesEncontrados?.find((t) => t.numeroTanque === n) ?? null)

  // ---------------------------------------------------------------- 1.7 semielaborado
  barra("1.7 SEGUIMIENTO DEL SEMIELABORADO")
  {
    // Sabor y tanque 1 · Merma 0.5 · Vol. inicial 1 · Vol. preparado 1.5 · Comparativo por línea 3 · Vol. final 1.5 · % Rend. 0.5 (= 9)
    const anchos = [C, 0.5 * C, C, 1.5 * C, ...lineas.map(() => (3 * C) / lineas.length), 1.5 * C, 0.5 * C]
    const xs = anchos.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? M : acc[i - 1] + anchos[i - 1]], [])
    const h1 = 4.2
    const enc = { fondo: CELESTE, negrita: true, tamano: 7 } as const
    celda(xs[0], y, anchos[0], 2 * h1, "Sabor\nTanque", enc)
    celda(xs[1], y, anchos[1], 2 * h1, "Merma\nSemielab.", { ...enc, tamano: 4.5 })
    celda(xs[2], y, anchos[2], 2 * h1, "Volumen Inicial\n(Visor)", { ...enc, tamano: 6.5 })
    celda(xs[3], y, anchos[3], 2 * h1, "Volumen Preparado", enc)
    celda(xs[4], y, 3 * C, h1, "Comparativo Vol. Vs Contadores por Línea (Parcial)", { ...enc, tamano: 6.5 })
    lineas.forEach((l, i) => celda(xs[4 + i], y + h1, anchos[4 + i], h1, l.nombre, { ...enc, tamano: 6.5 }))
    const iFinal = 4 + lineas.length
    celda(xs[iFinal], y, anchos[iFinal], 2 * h1, "Volumen Final (Envasado)", { ...enc, tamano: 6.5 })
    celda(xs[iFinal + 1], y, anchos[iFinal + 1], 2 * h1, "%\nRend.", { ...enc, tamano: 6 })
    y += 2 * h1

    const loteIdsCorridos = new Set(corridas.map((c) => c.loteId).filter((id): id is string => id !== null))
    const lotesDelTurno = preparaciones.filter((p) => loteIdsCorridos.has(p.id))
    const filas = lotesDelTurno.map((lote) => {
      const corridasLote = corridas.filter((c) => c.loteId === lote.id)
      const inicio = lote.volumenAlIniciarTurnoL ?? lote.volumenPreparadoL ?? 0
      const consumo = inicio - (lote.volumenActualL ?? 0)
      const ptPorLinea = lineas.map((l) => {
        const ids = corridasLote.filter((c) => c.linea === l.codigo).map((c) => c.id)
        return productoTerminado.filter((p) => p.corridaId && ids.includes(p.corridaId)).reduce((a, p) => a + p.litrosProducidos, 0)
      })
      const envasado = ptPorLinea.reduce((a, b) => a + b, 0)
      const rendimiento = consumo > 0 ? Math.round((envasado / consumo) * 1000) / 10 : null
      return [
        `${lote.saborNombre ?? "Sin sabor"}\nLote ${lote.lote ?? "—"} · TQ${lote.numeroTanque}`,
        consumo > 0 ? miles(consumo - envasado) : "--",
        miles(inicio),
        miles(lote.volumenPreparadoL ?? 0),
        ...ptPorLinea.map((v) => (v > 0 ? miles(v) : "--")),
        miles(envasado),
        rendimiento !== null ? String(rendimiento).replace(".", ",") : "--",
      ]
    })
    const altoFila = 5.6
    const totalFilas = Math.max(filas.length, 1)
    for (let f = 0; f < totalFilas; f++) {
      asegurar(altoFila)
      const datos = filas[f]
      anchos.forEach((w, i) => celda(xs[i], y, w, altoFila, datos ? datos[i] : "", { negrita: true, tamano: i === 0 ? 6 : 7 }))
      y += altoFila
    }
  }

  bloqueTanques("1.8 CONDICIÓN EN LA QUE ENTREGAN LOS TANQUES", (n) => tanques.find((t) => t.numeroTanque === n) ?? null)

  // ---------------------------------------------------------------- 1.9 producción
  barra("1.9 ESTADO DE LA PRODUCCIÓN/REALIZADO")
  {
    // Resumen de las cajas hechas, a todo el ancho: Presentación | Línea | Cajas, con el total.
    const enc = { fondo: CELESTE, negrita: true, tamano: 7 } as const
    celda(M, y, 3 * C, 4.5, "Presentación", enc)
    celda(M + 3 * C, y, 3 * C, 4.5, "Línea", enc)
    celda(M + 6 * C, y, 3 * C, 4.5, "Cajas", enc)
    y += 4.5
    const filas: [string, string, number][] = []
    for (const l of lineas) {
      for (const pres of presentaciones) {
        const items = productoTerminado.filter((p) => p.linea === l.codigo && p.presentacion === pres.codigo)
        if (items.length === 0) continue
        filas.push([pres.nombre, l.nombre, items.reduce((a, p) => a + p.paletas * pres.cajasXPaleta + p.cajasSueltas, 0)])
      }
    }
    const altoFila = 4.5
    asegurar((Math.max(filas.length, 1) + 1) * altoFila)
    if (filas.length === 0) {
      celda(M, y, W, altoFila, "Sin producción cargada en el turno.", { tamano: 7 })
      y += altoFila
    }
    for (const [presentacion, linea, cajas] of filas) {
      celda(M, y, 3 * C, altoFila, presentacion, { negrita: true, tamano: 7.5 })
      celda(M + 3 * C, y, 3 * C, altoFila, linea, { negrita: true, tamano: 7.5 })
      celda(M + 6 * C, y, 3 * C, altoFila, miles(cajas), { negrita: true, tamano: 7.5 })
      y += altoFila
    }
    if (filas.length > 1) {
      celda(M, y, 6 * C, altoFila, "Total", { fondo: CELESTE, negrita: true, tamano: 7.5 })
      celda(M + 6 * C, y, 3 * C, altoFila, miles(filas.reduce((a, f) => a + f[2], 0)), { negrita: true, tamano: 8 })
      y += altoFila
    }
  }

  // ---------------------------------------------------------------- 2.1 eficiencia, merma, gráfico y paradas
  barra("2.1 CONDICIONES EFICIENCIA Y MERMA")
  {
    // Meta y eficiencia con paradas (src/lib/eficiencia.ts). El acta se genera con el turno ya cerrado.
    const eficiencia = eficienciaDelTurno({
      turnoTipo,
      esquema,
      horaInicio,
      estado: "CERRADO",
      horasTranscurridas: 0,
      corridas,
      contadores,
      presentaciones,
      velocidades,
      paradas,
      lineas: lineas.map((l) => l.codigo),
    })
    const bloque = W / lineas.length
    const sub = bloque / 3
    lineas.forEach((l, i) => {
      const x = M + i * bloque
      const e = eficiencia.porLinea.get(l.codigo)
      const merma = mermaPromedioLinea(corridas, contadores, productoTerminado, presentaciones, l.codigo)
      celda(x, y, bloque, 4.5, l.nombre, { fondo: CELESTE, negrita: true })
      celda(x, y + 4.5, sub, 5, "Eficiencia", { fondo: CELESTE, negrita: true })
      celda(x + sub, y + 4.5, sub, 5, "Merma", { fondo: CELESTE, negrita: true })
      celda(x + 2 * sub, y + 4.5, sub, 5, "Cajas real / meta", { fondo: CELESTE, negrita: true, tamano: 6 })
      celda(x, y + 9.5, sub, 6, e?.eficienciaPct != null ? `${e.eficienciaPct}%` : "--", { negrita: true, tamano: 8 })
      celda(x + sub, y + 9.5, sub, 6, merma !== null ? `${String(merma).replace(".", ",")}%` : "--", {
        negrita: true,
        tamano: 8,
        color: merma !== null && merma > LIMITE_MERMA_PCT ? ROJO : 0,
      })
      celda(
        x + 2 * sub,
        y + 9.5,
        sub,
        6,
        e?.realCajas != null || e?.metaCajas != null ? `${e?.realCajas != null ? miles(e.realCajas) : "--"} / ${e?.metaCajas != null ? miles(e.metaCajas) : "--"}` : "--",
        { negrita: true, tamano: 7 },
      )
    })
    y += 15.5

    // Recuadros por línea (en el acta real van en blanco): acá, las paradas de cada línea.
    const textosParadas = lineas.map((l) => {
      const propias = paradas
        .filter((p) => numeroLinea(p.lineaCodigo) === numeroLinea(l.codigo))
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
      if (propias.length === 0) return ["Sin paradas registradas."]
      const total = propias.reduce((a, p) => a + duracionMin(p), 0)
      return [
        ...propias.map((p) => {
          const min = duracionMin(p)
          const guia = p.tiempoGuiaMin != null ? ` (guía ${p.tiempoGuiaMin}, ${fmtDesvio(min - p.tiempoGuiaMin)})` : ""
          const nota = [p.nota, p.justificacionDesvio ? `Justif.: ${p.justificacionDesvio}` : null].filter(Boolean).join(" — ")
          return `• ${horaNovedad(p.inicio)} ${p.tipoNombre}: ${min} min${guia}${nota ? ` — ${nota}` : ""}`
        }),
        `Total: ${total} min`,
      ]
    })
    doc.setFontSize(6.5)
    const envueltos = textosParadas.map((ls) => ls.flatMap((t) => doc.splitTextToSize(t, W / lineas.length - 3) as string[]))
    // Se ajusta a lo escrito (la línea con más texto manda).
    const altoRecuadro = 2 + Math.max(...envueltos.map((e) => e.length)) * 2.8
    asegurar(4.5 + altoRecuadro)
    lineas.forEach((l, i) => {
      const x = M + (i * W) / lineas.length
      celda(x, y, W / lineas.length, 4.5, `${l.nombre} · Paradas`, { fondo: CELESTE, negrita: true })
      celda(x, y + 4.5, W / lineas.length, altoRecuadro)
      doc.setFontSize(6.5)
      doc.setTextColor(0)
      envueltos[i].forEach((t, j) => {
        doc.setFont("helvetica", t.startsWith("Total:") ? "bold" : "normal")
        doc.text(t, x + 1.5, y + 4.5 + 3.2 + j * 2.8)
      })
    })
    y += 4.5 + altoRecuadro
  }

  // ---------------------------------------------------------------- 2.2 contadores (sigue a continuación; pasa de página solo si no entra)
  {
    const recuadros: ({ sabor: string; lote: string; corridas: Corrida[] } | null)[] = agruparPorSaborYLote(corridas).flatMap((g) =>
      g.lotes.map((lote) => ({ sabor: g.saborNombre ?? "Sin sabor", lote: lote.lote ?? "—", corridas: lote.corridas })),
    )
    // Como el acta real: la grilla se completa con recuadros vacíos (mínimo 3, de a 3 por fila).
    while (recuadros.length < 3 || recuadros.length % 3 !== 0) recuadros.push(null)

    const ALTO = { barra: 4.2, nombre: 4.5, lineas: 4.2, icono: 8, dato: 4.5 }
    const altoRecuadro = ALTO.barra + ALTO.nombre + ALTO.lineas + 3 * ALTO.icono + 2 * ALTO.dato
    const anchoRecuadro = W / 3
    const anchoVertical = 4.5
    const anchoIcono = 20
    const anchoLinea = (anchoRecuadro - anchoVertical - anchoIcono) / lineas.length
    const iconos = [ICONO_CONTADOR_LLENADORA, ICONO_CONTADOR_BUENOS, ICONO_CONTADOR_DESECHO]
    const numOVacio = (n: number | null) => (n === null ? "" : miles(n))
    asegurar(4.2 + altoRecuadro)
    barra("2.2 CONTADOR DE LLENADORA")

    recuadros.forEach((r, i) => {
      const columna = i % 3
      if (columna === 0) asegurar(altoRecuadro)
      const x = M + columna * anchoRecuadro
      let yr = y

      // Datos por línea: null = esa línea no corrió este sabor + lote (celda vacía).
      const porLinea = lineas.map((l) => {
        if (!r) return null
        const ids = r.corridas.filter((c) => c.linea === l.codigo).map((c) => c.id)
        if (ids.length === 0) return null
        const conts = contadores.filter((c) => c.corridaId !== null && ids.includes(c.corridaId))
        const c1 = conts.length > 0 ? conts.reduce((a, c) => a + c.envasesLlenadora, 0) : null
        const conC2 = conts.filter((c) => c.envasesBuenos !== null)
        const c2 = conC2.length > 0 ? conC2.reduce((a, c) => a + (c.envasesBuenos ?? 0), 0) : null
        const cajas = productoTerminado
          .filter((p) => p.corridaId !== null && ids.includes(p.corridaId))
          .reduce((a, p) => a + p.paletas * (presentaciones.find((x) => x.codigo === p.presentacion)?.cajasXPaleta ?? 0) + p.cajasSueltas, 0)
        return {
          c1,
          c2,
          desecho: c1 !== null && c2 !== null ? c1 - c2 : null,
          merma: mermaEnvasesDeCorridas(ids, contadores, productoTerminado, presentaciones).pct,
          cajas,
        }
      })

      celda(x, yr, anchoRecuadro, ALTO.barra, "sabor", { fondo: CELESTE })
      yr += ALTO.barra
      celda(x, yr, anchoRecuadro, ALTO.nombre, r ? `${r.sabor} — Lote ${r.lote}` : "", { negrita: true, tamano: 7.5 })
      yr += ALTO.nombre
      celda(x, yr, anchoVertical + anchoIcono, ALTO.lineas)
      lineas.forEach((l, j) => celda(x + anchoVertical + anchoIcono + j * anchoLinea, yr, anchoLinea, ALTO.lineas, l.nombre, { fondo: CELESTE, tamano: 6.5 }))
      yr += ALTO.lineas

      celda(x, yr, anchoVertical, 3 * ALTO.icono)
      doc.setFontSize(6)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(0)
      doc.text("CONTADORES", x + anchoVertical / 2 + 1, yr + (3 * ALTO.icono) / 2 + doc.getTextWidth("CONTADORES") / 2, { angle: 90 })
      const filas: ((d: NonNullable<(typeof porLinea)[number]>) => string)[] = [
        (d) => numOVacio(d.c1),
        (d) => numOVacio(d.c2),
        (d) => numOVacio(d.desecho),
      ]
      filas.forEach((valorFila, f) => {
        const yf = yr + f * ALTO.icono
        celda(x + anchoVertical, yf, anchoIcono, ALTO.icono)
        doc.addImage(iconos[f], "PNG", x + anchoVertical + 1, yf + 0.6, anchoIcono - 2, ALTO.icono - 1.2, undefined, "FAST")
        porLinea.forEach((d, j) =>
          celda(x + anchoVertical + anchoIcono + j * anchoLinea, yf, anchoLinea, ALTO.icono, d ? valorFila(d) : "", { tamano: 7.5 }),
        )
      })
      yr += 3 * ALTO.icono

      // Lo que el sistema suma al formato original: % Merma y Cajas por línea.
      const extras: [string, (d: NonNullable<(typeof porLinea)[number]>) => string, boolean][] = [
        ["% Merma", (d) => (d.merma !== null ? `${String(d.merma).replace(".", ",")}%` : "--"), true],
        ["Cajas", (d) => numOVacio(d.cajas), false],
      ]
      extras.forEach(([nombre, valorFila, esMerma]) => {
        celda(x, yr, anchoVertical + anchoIcono, ALTO.dato, nombre, { negrita: true, tamano: 7 })
        porLinea.forEach((d, j) => {
          const alerta = esMerma && d !== null && d.merma !== null && d.merma > LIMITE_MERMA_PCT
          celda(x + anchoVertical + anchoIcono + j * anchoLinea, yr, anchoLinea, ALTO.dato, d ? valorFila(d) : "", {
            negrita: true,
            tamano: 7.5,
            color: alerta ? ROJO : 0,
          })
        })
        yr += ALTO.dato
      })
      if (columna === 2) y += altoRecuadro
    })
  }

  // ---------------------------------------------------------------- justificación de mermas de envases
  // La justificación se escribe con el contador (Producto Terminado) cuando la merma pasa del límite.
  {
    const filasJustificacion = agruparPorSaborYLote(corridas).flatMap((g) =>
      g.lotes.flatMap((lote) =>
        lineas.flatMap((l) => {
          const ids = lote.corridas.filter((c) => c.linea === l.codigo).map((c) => c.id)
          if (ids.length === 0) return []
          const merma = mermaEnvasesDeCorridas(ids, contadores, productoTerminado, presentaciones).pct
          const textos = contadores
            .filter((c) => c.corridaId !== null && ids.includes(c.corridaId) && c.justificacion.trim() !== "")
            .map((c) => c.justificacion.trim())
          const pasada = merma !== null && merma > LIMITE_MERMA_PCT
          if (!pasada && textos.length === 0) return []
          return [
            {
              linea: l.nombre,
              saborLote: `${g.saborNombre ?? "Sin sabor"} — Lote ${lote.lote ?? "—"}`,
              merma,
              pasada,
              justificacion: textos.length > 0 ? textos.join(" / ") : "Sin justificación cargada.",
            },
          ]
        }),
      ),
    )
    if (filasJustificacion.length > 0) {
      const enc = { fondo: CELESTE, negrita: true, tamano: 7 } as const
      asegurar(4.2 + 4.5 + 5)
      barra("JUSTIFICACIÓN DE MERMAS DE ENVASES")
      celda(M, y, C, 4.5, "Línea", enc)
      celda(M + C, y, 2 * C, 4.5, "Sabor — Lote", enc)
      celda(M + 3 * C, y, C, 4.5, "% Merma", enc)
      celda(M + 4 * C, y, 5 * C, 4.5, "Justificación", enc)
      y += 4.5
      for (const f of filasJustificacion) {
        doc.setFontSize(7)
        doc.setFont("helvetica", "normal")
        const texto = doc.splitTextToSize(f.justificacion, 5 * C - 2.4) as string[]
        const alto = Math.max(5, 2 + texto.length * 3)
        asegurar(alto)
        celda(M, y, C, alto, f.linea, { negrita: true, tamano: 7 })
        celda(M + C, y, 2 * C, alto, f.saborLote, { negrita: true, tamano: 7 })
        celda(M + 3 * C, y, C, alto, f.merma !== null ? `${String(f.merma).replace(".", ",")}%` : "--", {
          negrita: true,
          tamano: 7.5,
          color: f.pasada ? ROJO : 0,
        })
        celda(M + 4 * C, y, 5 * C, alto)
        doc.setFontSize(7)
        doc.setFont("helvetica", "normal")
        doc.setTextColor(0)
        texto.forEach((t, i) => doc.text(t, M + 4 * C + 1.2, y + alto / 2 + (i - (texto.length - 1) / 2) * 3, { baseline: "middle" }))
        y += alto
      }
    }
  }

  // ---------------------------------------------------------------- 2.3 novedades (+ lo que registra el sistema)
  {
    const textos: { texto: string; negrita?: boolean }[] = novedades.map((n) => ({ texto: `${horaNovedad(n.creadoEn)}  ${n.texto}` }))
    const entregas = corridas.filter((c) => c.entregaAutomatica)
    const grupos: [string, string[]][] = [
      [
        "Ajustes de volumen (agua / jugo)",
        ajustesVolumen.map(
          (a) =>
            `${horaNovedad(a.creadoEn)}  ${a.numeroTanque !== null ? `Tanque ${a.numeroTanque} · ` : ""}${a.saborNombre ?? "Sin sabor"} Lote ${a.lote ?? "—"}: +${miles(a.litros)} L${a.detalle ? ` (${a.detalle})` : ""}${a.usuarioNombre ? ` — ${a.usuarioNombre}` : ""}`,
        ),
      ],
      [
        "Líneas entregadas automáticamente (revisar PT del tramo)",
        entregas.map(
          (c) =>
            `${c.entregadaEn ? horaCortaPlanta(c.entregadaEn, fecha) : "--"}  ${lineas.find((l) => l.codigo === c.linea)?.nombre ?? c.linea} · ${c.saborNombre ?? "Sin sabor"} Lote ${c.lote ?? "—"}`,
        ),
      ],
      [
        "Servicios Industriales",
        serviciosIndustriales.map((l) =>
          [
            horaNovedad(l.actualizadoEn),
            l.temperaturaQuantum !== null ? `Temp. Quantum ${l.temperaturaQuantum}°C` : null,
            l.aguaOsmotizada !== null ? `Agua osmotizada ${miles(l.aguaOsmotizada)} L` : null,
            l.gasoil !== null ? `Gasoil ${miles(l.gasoil)} L` : null,
          ]
            .filter(Boolean)
            .join("  ·  "),
        ),
      ],
      [
        "Correcciones posteriores al cierre",
        correcciones.map(
          (c) =>
            `${new Date(c.creadaEn).toLocaleString("es-CO", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })}  ${c.nombre}: ${c.motivo}`,
        ),
      ],
    ]
    for (const [titulo, lineasGrupo] of grupos) {
      if (lineasGrupo.length === 0) continue
      textos.push({ texto: "" }, { texto: titulo, negrita: true }, ...lineasGrupo.map((t) => ({ texto: t })))
    }
    if (textos.length === 0) textos.push({ texto: "Sin novedades cargadas en el turno." })

    doc.setFontSize(8)
    const envueltas = textos.flatMap((t) => (t.texto ? (doc.splitTextToSize(t.texto, W - 16) as string[]) : [""]).map((l) => ({ texto: l, negrita: t.negrita })))
    const altoLinea = 3.6
    // Se ajusta a lo escrito.
    const alto = 2.5 + envueltas.length * altoLinea
    asegurar(4.2 + alto)
    barra("2.3 NOVEDADES DEL TURNO")
    celda(M, y, W, alto)
    doc.setTextColor(0)
    envueltas.forEach((l, i) => {
      doc.setFont("helvetica", l.negrita ? "bold" : "normal")
      doc.setFontSize(8)
      doc.text(l.texto, M + 12, y + 4 + i * altoLinea)
    })
    y += alto
  }

  return doc.output("blob")
}
