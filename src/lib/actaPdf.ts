import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo, type AreaCodigo, type GrupoCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import { velocidadesParaLive, type LineaLive, type PresentacionLive, type VelocidadLive } from "@/lib/catalogosLive"
import { agruparPorSaborYLote } from "@/lib/agruparProduccion"
import { textoCondicionTanque } from "@/lib/tanques"
import { LIMITE_MERMA } from "@/lib/turno"
import { mermaCorrida } from "@/lib/reportes"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { TanqueEncontrado } from "@/lib/sesionTurno"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { TanqueRecepcion, PreparacionRegistro, AjusteVolumenRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Parada } from "@/lib/paradas"
import type { NovedadTurno } from "@/lib/novedades"
import type { LecturaServiciosIndustriales } from "@/lib/panelProduccion"

/*
 * Genera el Acta de Entrega de Turno como PDF (jsPDF + jspdf-autotable) —
 * calcado del formato real de Natulac (ver "Info que no va en el
 * pryecto/Acta de Entrega.pdf"): banner con el logo, encabezado 1.1-1.5,
 * tanques recibidos (1.6), semielaborado por lote (1.7), ajustes de
 * volumen (agua/jugo, cuando hubo), tanques entregados (1.8), estado de
 * la producción (1.9), eficiencia/merma y contador de llenadora por
 * línea (2.1/2.2), novedades del turno (2.3), lecturas de Servicios
 * Industriales asociadas a este turno (2.4) y firma.
 *
 * Reemplaza la versión compacta anterior. No reproduce el gráfico de
 * barras de tiempo (jspdf-autotable no dibuja gráficos) — el reparto
 * Producción/Paradas/Mantenimiento del gráfico sale como tabla en 2.1.
 * Tampoco reproduce "Problemas de Calidad / cajas no conforme" (1.9):
 * ese dato se dropeó del esquema (producto_terminado ya no tiene
 * retenido/no-conforme, ver §2.9 del plan de rework) — la columna
 * queda en el PDF por formato pero sin dato ("—"), no se inventa.
 *
 * Firma: solo la del supervisor que cierra (decisión del dueño,
 * 2026-09-16) — el acta real pide 5 firmas (Saliente/Mantenimiento/
 * Entrante/Analista/Jefe de Producción) pero el sistema hoy solo sabe
 * el nombre del supervisor que finaliza.
 */

const LIMITE_MERMA_PCT = LIMITE_MERMA * 100

/** Azul de marca Natulac — banner de cabecera y etiquetas del encabezado (1.1-1.5). */
const AZUL_NATULAC: [number, number, number] = [21, 71, 145]

/** "8:42" a partir de un ISO local, en hora de planta. */
function horaNovedad(iso: string): string {
  return horaCortaPlanta(iso, iso)
}

/**
 * Logo de Natulac (public/IconoNatulac.png) en base64, para el banner del
 * acta — se pide una sola vez por PDF. null si no se pudo traer (ej. este
 * módulo corriendo fuera del navegador, sin `/IconoNatulac.png` servido):
 * el banner sale igual, solo sin el ícono.
 */
async function cargarLogoBase64(): Promise<string | null> {
  try {
    const resp = await fetch("/IconoNatulac.png")
    if (!resp.ok) return null
    const buffer = await resp.arrayBuffer()
    let binario = ""
    const bytes = new Uint8Array(buffer)
    for (const b of bytes) binario += String.fromCharCode(b)
    return `data:image/png;base64,${btoa(binario)}`
  } catch {
    return null
  }
}

/**
 * Eficiencia promedio del turno para UNA línea: promedio de (envases/hora
 * real ÷ máxima disponible) de cada corrida que tuvo esa línea, ponderado
 * por litros producidos (una corrida sin PT todavía pesa 1, para no
 * desaparecer del promedio). null si la línea no corrió nada.
 *
 * No se reutiliza produccionPorLineaDe() del Panel (esa mira solo la
 * corrida ACTIVA ahora mismo — al generar el acta el turno ya cerró, así
 * que ninguna corrida sigue activa y siempre daría null).
 */
function eficienciaPromedioLinea(
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  velocidades: VelocidadLive[],
  lineaCodigo: string,
): number | null {
  const corridasLinea = corridas.filter((c) => c.linea === lineaCodigo)
  if (corridasLinea.length === 0) return null

  let sumaPonderada = 0
  let pesoTotal = 0
  for (const c of corridasLinea) {
    const opciones = velocidadesParaLive(velocidades, c.linea, c.presentacion)
    const maxima = Math.max(c.envasesHora, ...opciones.map((o) => o.envasesHora))
    if (maxima <= 0) continue
    const ratio = c.envasesHora / maxima
    const litros = productoTerminado.filter((p) => p.corridaId === c.id).reduce((a, p) => a + p.litrosProducidos, 0)
    const peso = litros > 0 ? litros : 1
    sumaPonderada += ratio * peso
    pesoTotal += peso
  }
  return pesoTotal > 0 ? Math.round((sumaPonderada / pesoTotal) * 100) : null
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
  /** Vista previa FASE A′ (plan-paradas.md §3) — todavía no atado al turno real. */
  paradasAbiertas?: Parada[]
  /** Lecturas de Servicios Industriales con turno_id = este turno (ver migración 20261057). */
  serviciosIndustriales?: LecturaServiciosIndustriales[]
  supervisorNombre: string
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
    paradasAbiertas,
    serviciosIndustriales,
    supervisorNombre,
    area,
    lineas,
    presentaciones,
    velocidades,
  } = params
  const logoBase64 = await cargarLogoBase64()
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const margenX = 14
  const anchoPagina = doc.internal.pageSize.getWidth()
  let y = 16

  /** Franja de marca (azul) a todo el ancho, EN Y=0 — solo para la cabecera, con el logo. */
  function bannerCabecera(alto: number) {
    doc.setFillColor(...AZUL_NATULAC)
    doc.rect(0, 0, anchoPagina, alto, "F")
    if (logoBase64) {
      const lado = alto - 4
      doc.addImage(logoBase64, "PNG", margenX, (alto - lado) / 2, lado, lado, undefined, "FAST")
    }
    y = alto + 5
  }

  function titulo(texto: string) {
    if (y > 270) {
      doc.addPage()
      y = 16
    }
    doc.setFontSize(9.5)
    doc.setFont("helvetica", "bold")
    doc.text(texto, margenX, y)
  }
  function finTabla() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 3.5
  }

  bannerCabecera(14)

  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text("ACTA DE ENTREGA DE TURNO", margenX, y)
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(codigo, anchoPagina - margenX, y, { align: "right" })
  y += 5

  // ---------------- 1.1-1.5 ENCABEZADO ----------------
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    columnStyles: {
      0: { fillColor: AZUL_NATULAC, textColor: 255, fontStyle: "bold" },
      2: { fillColor: AZUL_NATULAC, textColor: 255, fontStyle: "bold" },
    },
    body: [
      ["Fecha", fecha, "Turno", nombrePorCodigo(TURNO_TIPOS, turnoTipo)],
      ["Grupo", nombrePorCodigo(GRUPOS, grupo), "Área", area ? nombrePorCodigo(AREAS, area) : "—"],
      ["Supervisor", supervisorNombre, "Código del turno", codigo],
    ],
  })
  finTabla()

  // ---------------- 1.6 CONDICIÓN EN LA QUE RECIBEN LOS TANQUES ----------------
  titulo("1.6 CONDICIÓN EN LA QUE RECIBEN LOS TANQUES")
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    head: [["Tanque", "Lote", "Cantidad / Estado"]],
    body: ([1, 2, 3] as const).map((n) => {
      const t = tanquesEncontrados?.find((x) => x.numeroTanque === n)
      return t
        ? [`Tanque ${n}`, t.lote ?? "—", textoCondicionTanque(t.condicion, t.volumenL, t.saborNombre)]
        : [`Tanque ${n}`, "—", "No se registró (revisión de inicio sin completar en Status)"]
    }),
  })
  finTabla()

  // ---------------- 1.7 SEGUIMIENTO DEL SEMIELABORADO ----------------
  const loteIdsCorridos = new Set(corridas.map((c) => c.loteId).filter((id): id is string => id !== null))
  const lotesDelTurno = preparaciones.filter((p) => loteIdsCorridos.has(p.id))

  titulo("1.7 SEGUIMIENTO DEL SEMIELABORADO")
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 0.9 },
    head: [["Sabor — Lote", "Vol. preparado", "Vol. inicio turno", ...lineas.map((l) => `PT ${l.nombre}`), "Vol. final", "% Rendimiento"]],
    body:
      lotesDelTurno.length > 0
        ? lotesDelTurno.map((lote) => {
            const corridasLote = corridas.filter((c) => c.loteId === lote.id)
            const inicio = lote.volumenAlIniciarTurnoL ?? lote.volumenPreparadoL ?? 0
            const final = lote.volumenActualL ?? 0
            const consumo = inicio - final
            const ptPorLinea = lineas.map((l) => {
              const corridasLoteLinea = corridasLote.filter((c) => c.linea === l.codigo).map((c) => c.id)
              return productoTerminado
                .filter((p) => p.corridaId && corridasLoteLinea.includes(p.corridaId))
                .reduce((a, p) => a + p.litrosProducidos, 0)
            })
            const ptTotal = ptPorLinea.reduce((a, b) => a + b, 0)
            const pctRendimiento = consumo > 0 ? Math.round((ptTotal / consumo) * 1000) / 10 : null
            return [
              `${lote.saborNombre ?? "Sin sabor"} — Lote ${lote.lote ?? "—"}`,
              `${Math.round(lote.volumenPreparadoL ?? 0).toLocaleString("es-CO")} L`,
              `${Math.round(inicio).toLocaleString("es-CO")} L`,
              ...ptPorLinea.map((l) => (l > 0 ? `${Math.round(l).toLocaleString("es-CO")} L` : "—")),
              `${Math.round(final).toLocaleString("es-CO")} L`,
              pctRendimiento !== null ? `${pctRendimiento}%` : "—",
            ]
          })
        : [["Sin lotes corridos en este turno", "—", "—", ...lineas.map(() => "—"), "—", "—"]],
  })
  finTabla()

  // ---------------- AJUSTES DE AGUA/JUGO (botón "Ajustar" en Preparación) ----------------
  if (ajustesVolumen.length > 0) {
    titulo("AJUSTES DE VOLUMEN (AGUA / JUGO)")
    autoTable(doc, {
      startY: y + 1.5,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1 },
      head: [["Hora", "Tanque", "Sabor — Lote", "Litros", "Detalle", "Quién"]],
      body: ajustesVolumen.map((a) => [
        horaNovedad(a.creadoEn),
        a.numeroTanque !== null ? `Tanque ${a.numeroTanque}` : "—",
        `${a.saborNombre ?? "Sin sabor"} — Lote ${a.lote ?? "—"}`,
        `+${a.litros.toLocaleString("es-CO")} L`,
        a.detalle ?? "—",
        a.usuarioNombre ?? "—",
      ]),
    })
    finTabla()
  }

  // ---------------- 1.8 CONDICIÓN EN LA QUE ENTREGAN LOS TANQUES ----------------
  titulo("1.8 CONDICIÓN EN LA QUE ENTREGAN LOS TANQUES")
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    head: [["Tanque", "Lote", "Cantidad / Estado"]],
    body: ([1, 2, 3] as const).map((n) => {
      const t = tanques.find((x) => x.numeroTanque === n)
      return t
        ? [`Tanque ${n}`, t.lote ?? "—", textoCondicionTanque(t.condicion, t.volumenL, t.saborNombre)]
        : [`Tanque ${n}`, "—", "—"]
    }),
  })
  finTabla()

  // ---------------- 1.9 ESTADO DE LA PRODUCCIÓN / REALIZADO ----------------
  titulo("1.9 ESTADO DE LA PRODUCCIÓN / REALIZADO")
  const filasProduccion: string[][] = []
  for (const l of lineas) {
    for (const pres of presentaciones) {
      const items = productoTerminado.filter((p) => p.linea === l.codigo && p.presentacion === pres.codigo)
      if (items.length === 0) continue
      const cajas = items.reduce((a, p) => a + p.paletas * pres.cajasXPaleta + p.cajasSueltas, 0)
      filasProduccion.push([`${pres.nombre} — ${l.nombre}`, cajas.toLocaleString("es-CO"), "—", "—", "—"])
    }
  }
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    head: [["Presentación — Línea", "Cajas", "Problemas de calidad", "Cajas no conforme", "Descripción / acciones"]],
    body: filasProduccion.length > 0 ? filasProduccion : [["Sin producción cargada", "—", "—", "—", "—"]],
    // "Problemas de calidad" / "Cajas no conforme" ya no tienen dato en el esquema (producto_terminado sin
    // retenido/no-conforme, ver plan-rework-3-modulos-y-merma.md §2.9) — quedan en "—" a propósito.
  })
  finTabla()

  // ---------------- 2.1 CONDICIONES EFICIENCIA Y MERMA ----------------
  titulo("2.1 CONDICIONES EFICIENCIA Y MERMA")
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    head: [["Línea", "Eficiencia", "Merma"]],
    body: lineas.map((l) => {
      const ef = eficienciaPromedioLinea(corridas, productoTerminado, velocidades, l.codigo)
      const merma = mermaPromedioLinea(corridas, contadores, productoTerminado, presentaciones, l.codigo)
      return [
        l.nombre,
        ef !== null ? `${ef}%` : "—",
        merma !== null ? `${merma}%${merma > LIMITE_MERMA_PCT ? " ⚠" : ""}` : "—",
      ]
    }),
  })
  finTabla()

  // ---------------- 2.2 CONTADOR DE LLENADORA ----------------
  titulo("2.2 CONTADOR DE LLENADORA")
  const gruposSabor = agruparPorSaborYLote(corridas)
  const filasContador: string[][] = []
  for (const g of gruposSabor) {
    const corridasSabor = g.lotes.flatMap((l) => l.corridas)
    const porLinea = lineas.map((l) => {
      const corridasLinea = corridasSabor.filter((c) => c.linea === l.codigo)
      let llenadora = 0
      let pt = 0
      for (const c of corridasLinea) {
        const m = mermaCorrida(c.id, contadores, productoTerminado, presentaciones)
        if (m) {
          llenadora += m.envasesLlenadora
          pt += m.envasesProductoTerminado
        }
      }
      return { llenadora, pt, diferencia: llenadora - pt }
    })
    if (porLinea.every((p) => p.llenadora === 0 && p.pt === 0)) continue
    filasContador.push([`${g.saborNombre ?? "Sin sabor"} — Contador (envases)`, ...porLinea.map((p) => p.llenadora.toLocaleString("es-CO"))])
    filasContador.push([`${g.saborNombre ?? "Sin sabor"} — Producto terminado (envases)`, ...porLinea.map((p) => p.pt.toLocaleString("es-CO"))])
    filasContador.push([`${g.saborNombre ?? "Sin sabor"} — Diferencia`, ...porLinea.map((p) => p.diferencia.toLocaleString("es-CO"))])
  }
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    head: [["Sabor — Concepto", ...lineas.map((l) => l.nombre)]],
    body: filasContador.length > 0 ? filasContador : [["Sin contadores cargados", ...lineas.map(() => "—")]],
  })
  finTabla()

  // ---------------- PARADAS QUE CONTINÚAN (propio del sistema, no del formato original) ----------------
  if (paradasAbiertas && paradasAbiertas.length > 0) {
    titulo("PARADAS — CONTINÚAN EN EL TURNO SIGUIENTE")
    autoTable(doc, {
      startY: y + 1.5,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1 },
      head: [["Línea", "Tipo"]],
      body: paradasAbiertas.map((p) => [nombrePorCodigo(lineas, p.lineaCodigo), p.tipoNombre]),
    })
    finTabla()
  }

  // ---------------- 2.3 NOVEDADES DEL TURNO ----------------
  titulo("2.3 NOVEDADES DEL TURNO")
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    columnStyles: { 0: { cellWidth: 18 } },
    body:
      novedades.length > 0
        ? novedades.map((n) => [horaNovedad(n.creadoEn), n.texto])
        : [["—", "Sin novedades cargadas en el turno."]],
  })
  finTabla()

  // ---------------- 2.4 SERVICIOS INDUSTRIALES ----------------
  titulo("2.4 SERVICIOS INDUSTRIALES")
  autoTable(doc, {
    startY: y + 1.5,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1 },
    columnStyles: { 0: { cellWidth: 18 } },
    head: [["Hora", "Temp. Quantum", "Agua Osmotizada", "Gasoil"]],
    body:
      serviciosIndustriales && serviciosIndustriales.length > 0
        ? serviciosIndustriales.map((l) => [
            horaNovedad(l.actualizadoEn),
            l.temperaturaQuantum !== null ? `${l.temperaturaQuantum}°C` : "—",
            l.aguaOsmotizada !== null ? `${l.aguaOsmotizada.toLocaleString("es-CO")} L` : "—",
            l.gasoil !== null ? `${l.gasoil.toLocaleString("es-CO")} L` : "—",
          ])
        : [["—", "Sin lecturas cargadas en el turno.", "", ""]],
  })
  finTabla()

  // ---------------- FIRMA ----------------
  if (y > 275) {
    doc.addPage()
    y = 16
  }
  y += 4
  doc.setDrawColor(...AZUL_NATULAC)
  doc.setLineWidth(0.6)
  doc.line(margenX, y, margenX + 75, y)
  doc.setLineWidth(0.2)
  y += 5
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("FIRMA DE SUPERVISOR SALIENTE", margenX, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.text(supervisorNombre, margenX, y)

  return doc.output("blob")
}
