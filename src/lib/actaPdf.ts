import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo, type AreaCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import { agruparPorSaborYLote } from "@/lib/agruparProduccion"
import { textoCondicionTanque } from "@/lib/tanques"
import { LIMITE_MERMA, mermaCorrida, type TurnoActivo } from "@/lib/turno"

/**
 * Genera el acta de turno como PDF (jsPDF + jspdf-autotable) — reemplaza
 * el viejo "Generar Acta (PDF)" por window.print(). Compacto, sin
 * gráficos: encabezado con datos fijos, tanques encontrados vs
 * dejados, producido por sabor/lote con merma y justificación, firma.
 */
export function generarActaPdf(params: {
  turno: TurnoActivo
  supervisorNombre: string
  area: AreaCodigo | null
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
}): Blob {
  const { turno, supervisorNombre, area, presentaciones } = params
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const margenX = 14
  let y = 16

  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text("ACTA DE TURNO", margenX, y)
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(turno.codigo, 196, y, { align: "right" })
  y += 6

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    body: [
      ["Nombre (Usuario)", supervisorNombre, "Turno", nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)],
      ["Grupo", nombrePorCodigo(GRUPOS, turno.grupo), "Fecha", turno.fecha],
      ["Área", area ? nombrePorCodigo(AREAS, area) : "—", "Código del Turno", turno.codigo],
    ],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("CONDICIONES DE LOS TANQUES", margenX, y)

  const filasEncontrado = turno.tanquesEncontrados
    ? ([1, 2, 3] as const)
        .map((n) => {
          const t = turno.tanquesEncontrados!.find((x) => x.numeroTanque === n)
          return t ? `Tanque ${n}: ${textoCondicionTanque(t.condicion, t.volumenL, t.saborNombre)}` : `Tanque ${n}: —`
        })
        .join("\n")
    : "No se registró (el turno se cerró sin completar la revisión de inicio en Status)."

  const filasDejado = ([1, 2, 3] as const)
    .map((n) => {
      const t = turno.tanques.find((x) => x.numeroTanque === n)
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

  const grupos = agruparPorSaborYLote(turno.lineas)
  const filasProducido: string[][] = []
  for (const g of grupos) {
    for (const l of g.lotes) {
      let cajasLote = 0
      let litrosLote = 0
      let envasesLote = 0
      const mermas: number[] = []
      const justificaciones: string[] = []

      for (const corrida of l.corridas) {
        const pt = turno.productoTerminado.find((p) => p.turnoLineaId === corrida.id)
        const pres = presentaciones.find((p) => p.codigo === corrida.presentacion)
        if (pt && pres) {
          const cajas = pt.paletas * pres.cajasXPaleta + pt.cajasSueltas
          cajasLote += cajas
          litrosLote += pt.litrosProducidos
          envasesLote += cajas * pres.envasesXCaja
        }
        const merma = mermaCorrida(corrida.id, turno, presentaciones)
        if (merma) {
          mermas.push(merma.pct)
          const contadorConJustificacion = turno.contadores.find((c) => c.turnoLineaId === corrida.id && c.justificacion && !c.parcial)
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
  y = (doc as any).lastAutoTable.finalY + 24

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
