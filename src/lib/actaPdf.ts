import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo, type AreaCodigo, type GrupoCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import { agruparPorSaborYLote } from "@/lib/agruparProduccion"
import { textoCondicionTanque } from "@/lib/tanques"
import { LIMITE_MERMA } from "@/lib/turno"
import { mermaCorrida } from "@/lib/reportes"
import type { TanqueEncontrado } from "@/lib/sesionTurno"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Parada } from "@/lib/paradas"

/**
 * Genera el acta de turno como PDF (jsPDF + jspdf-autotable) — reemplaza
 * el viejo "Generar Acta (PDF)" por window.print(). Compacto, sin
 * gráficos: encabezado con datos fijos, tanques encontrados vs
 * dejados, producido por sabor/lote con merma y justificación, firma.
 *
 * Ya no recibe un TurnoActivo (el blob viejo) — recibe las piezas
 * sueltas: cabecera (de useSesionTurno()) + corridas/contadores/PT
 * (Producción y Producto Terminado) + tanques (Preparación).
 */
export function generarActaPdf(params: {
  codigo: string
  fecha: string
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  tanquesEncontrados: TanqueEncontrado[] | null
  tanques: TanqueRecepcion[]
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  /** Vista previa FASE A′ (plan-paradas.md §3) — todavía no atado al turno real. */
  paradasAbiertas?: Parada[]
  supervisorNombre: string
  area: AreaCodigo | null
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
}): Blob {
  const {
    codigo,
    fecha,
    turnoTipo,
    grupo,
    tanquesEncontrados,
    tanques,
    corridas,
    contadores,
    productoTerminado,
    paradasAbiertas,
    supervisorNombre,
    area,
    lineas,
    presentaciones,
  } = params
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const margenX = 14
  let y = 16

  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text("ACTA DE TURNO", margenX, y)
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(codigo, 196, y, { align: "right" })
  y += 6

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    body: [
      ["Nombre (Usuario)", supervisorNombre, "Turno", nombrePorCodigo(TURNO_TIPOS, turnoTipo)],
      ["Grupo", nombrePorCodigo(GRUPOS, grupo), "Fecha", fecha],
      ["Área", area ? nombrePorCodigo(AREAS, area) : "—", "Código del Turno", codigo],
    ],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("CONDICIONES DE LOS TANQUES", margenX, y)

  const filasEncontrado = tanquesEncontrados
    ? ([1, 2, 3] as const)
        .map((n) => {
          const t = tanquesEncontrados.find((x) => x.numeroTanque === n)
          return t ? `Tanque ${n}: ${textoCondicionTanque(t.condicion, t.volumenL, t.saborNombre)}` : `Tanque ${n}: —`
        })
        .join("\n")
    : "No se registró (el turno se cerró sin completar la revisión de inicio en Status)."

  const filasDejado = ([1, 2, 3] as const)
    .map((n) => {
      const t = tanques.find((x) => x.numeroTanque === n)
      return t ? `Tanque ${n}: ${textoCondicionTanque(t.condicion, t.volumenL, t.saborNombre)}` : `Tanque ${n}: —`
    })
    .join("\n")

  autoTable(doc, {
    startY: y + 2,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5, valign: "top" },
    head: [["Condiciones encontradas", "Condiciones dejadas"]],
    body: [[filasEncontrado, filasDejado]],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("PRODUCIDO", margenX, y)

  const grupos = agruparPorSaborYLote(corridas)
  const filasProducido: string[][] = []
  for (const g of grupos) {
    for (const l of g.lotes) {
      let cajasLote = 0
      let litrosLote = 0
      let envasesLote = 0
      const mermas: number[] = []
      const justificaciones: string[] = []

      for (const corrida of l.corridas) {
        const pt = productoTerminado.find((p) => p.corridaId === corrida.id)
        const pres = presentaciones.find((p) => p.codigo === corrida.presentacion)
        if (pt && pres) {
          const cajas = pt.paletas * pres.cajasXPaleta + pt.cajasSueltas
          cajasLote += cajas
          litrosLote += pt.litrosProducidos
          envasesLote += cajas * pres.envasesXCaja
        }
        const merma = mermaCorrida(corrida.id, contadores, productoTerminado, presentaciones)
        if (merma) {
          mermas.push(merma.pct)
          const contadorConJustificacion = contadores.find((c) => c.corridaId === corrida.id && c.justificacion)
          if (merma.pct > LIMITE_MERMA * 100 && contadorConJustificacion) {
            justificaciones.push(contadorConJustificacion.justificacion)
          }
        }
      }

      const mermaProm = mermas.length === 0 ? null : Math.round((mermas.reduce((a, b) => a + b, 0) / mermas.length) * 100) / 100
      const superaLimite = mermaProm !== null && mermaProm > LIMITE_MERMA * 100

      filasProducido.push([
        `${g.saborNombre ?? "Sin sabor"} — Lote ${l.lote ?? "—"}`,
        cajasLote.toLocaleString("es-CO"),
        litrosLote.toLocaleString("es-CO"),
        envasesLote.toLocaleString("es-CO"),
        mermaProm !== null ? `${mermaProm}%` : "—",
        justificaciones.join(" · ") || (superaLimite ? "Falta justificar" : "—"),
      ])
    }
  }

  autoTable(doc, {
    startY: y + 2,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    head: [["Sabor — Lote", "Cajas", "Litros", "Envases", "Merma de línea", "Justificación (>3%)"]],
    body: filasProducido.length > 0 ? filasProducido : [["Sin registros", "—", "—", "—", "—", "—"]],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  if (paradasAbiertas && paradasAbiertas.length > 0) {
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("PARADAS — CONTINÚAN EN EL TURNO SIGUIENTE", margenX, y)

    autoTable(doc, {
      startY: y + 2,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5 },
      head: [["Línea", "Tipo"]],
      body: paradasAbiertas.map((p) => [nombrePorCodigo(lineas, p.lineaCodigo), p.tipoNombre]),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 18
  } else {
    y += 18
  }

  if (y > 270) y = 270
  doc.setDrawColor(0, 0, 0)
  doc.line(margenX, y, margenX + 75, y)
  y += 5
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("FIRMA DE SUPERVISOR", margenX, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.text(supervisorNombre, margenX, y)

  return doc.output("blob")
}
