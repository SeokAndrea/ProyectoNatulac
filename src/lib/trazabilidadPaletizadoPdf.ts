import jsPDF from "jspdf"
import { autoTable } from "jspdf-autotable"
import {
  OBSERVACIONES,
  PRESENTACIONES_HOJA,
  codigoSabor,
  fechaHoja,
  numeroTurno,
  textoObservacionCorto,
  type Hoja,
} from "@/lib/trazabilidadPaletizado"

/*
 * Hoja 1-PR-F-040 Rev.01 «Trazabilidad de paletizado» en PDF (jsPDF): una
 * página por hoja (línea + día + presentación + tipo de paletizado). Las
 * casillas de presentación que la planta no llena se imprimen y nunca se
 * marcan. Se importa recién al exportar (no entra en la carga inicial).
 */

const TINTA: [number, number, number] = [30, 33, 40]

export function generarTrazabilidadPdf(hojas: Hoja[]): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
  const M = 10
  const W = doc.internal.pageSize.getWidth() - 2 * M
  doc.setDrawColor(...TINTA)
  doc.setTextColor(...TINTA)

  const casilla = (x: number, y: number, marcada: boolean) => {
    doc.setLineWidth(0.3)
    doc.rect(x, y - 3, 3.2, 3.2)
    if (marcada) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.text("X", x + 0.75, y - 0.45)
    }
  }

  hojas.forEach((h, i) => {
    if (i > 0) doc.addPage()
    let y = M

    // Cabecera: título, código y revisión.
    doc.setLineWidth(0.3)
    doc.rect(M, y, W * 0.7, 14)
    doc.rect(M + W * 0.7, y, W * 0.15, 14)
    doc.rect(M + W * 0.85, y, W * 0.15, 14)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text("TRAZABILIDAD DE PALETIZADO", M + (W * 0.7) / 2, y + 8.8, { align: "center" })
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.text("Código", M + W * 0.775, y + 5, { align: "center" })
    doc.text("Revisión", M + W * 0.925, y + 5, { align: "center" })
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("1-PR-F-040", M + W * 0.775, y + 10.5, { align: "center" })
    doc.text("01", M + W * 0.925, y + 10.5, { align: "center" })
    y += 17

    // 1.1 Fecha, línea, 1.2 Tipo de paletizado.
    doc.rect(M, y, W, 8)
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text("1.1 Fecha:", M + 2, y + 5.3)
    doc.setFont("helvetica", "normal")
    doc.text(fechaHoja(h.fecha), M + 20, y + 5.3)
    doc.setFont("helvetica", "bold")
    doc.text("Línea:", M + 60, y + 5.3)
    doc.setFont("helvetica", "normal")
    doc.text(h.lineaNombre, M + 72, y + 5.3)
    doc.setFont("helvetica", "bold")
    const xTipo = M + 130
    doc.text("1.2 Tipo de paletizado:", xTipo, y + 5.3)
    casilla(xTipo + 40, y + 5.6, h.tipoPaletizado === "AUTOMATICO")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("Automático", xTipo + 45, y + 5.3)
    casilla(xTipo + 70, y + 5.6, h.tipoPaletizado === "MANUAL")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("Manual", xTipo + 75, y + 5.3)
    y += 10

    // 1.3 Presentación: todas las casillas de la hoja; se marca solo la de esta hoja.
    doc.rect(M, y, W, 8)
    doc.setFont("helvetica", "bold")
    doc.text("1.3 Presentación:", M + 2, y + 5.3)
    let x = M + 33
    const paso = (W - 35) / PRESENTACIONES_HOJA.length
    for (const c of PRESENTACIONES_HOJA) {
      casilla(x, y + 5.6, h.presentacionHoja === c)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.text(c, x + 4.5, y + 5.3)
      x += paso
    }
    if (!h.presentacionHoja) {
      // Presentación sin casilla en la hoja: se escribe al lado para que no falte.
      doc.setFontSize(7)
      doc.text(`(${h.presentacionCodigo})`, M + W - 2, y + 7.4, { align: "right" })
    }
    y += 11

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.4, lineColor: TINTA, lineWidth: 0.2, textColor: TINTA, valign: "middle" },
      headStyles: { fillColor: [235, 237, 241], textColor: TINTA, fontStyle: "bold", halign: "center", fontSize: 7.5 },
      columnStyles: {
        0: { halign: "center", cellWidth: 18 },
        1: { halign: "center", cellWidth: 20 },
        2: { halign: "center", cellWidth: 24 },
        3: { halign: "center", cellWidth: 30 },
        4: { halign: "center", cellWidth: 18 },
        5: { halign: "center", cellWidth: 15 },
        6: { halign: "center", cellWidth: 22 },
      },
      head: [
        [
          "1.3.1\nNº de paleta",
          "1.3.2\nSabor",
          "1.3.3\nLote",
          "1.3.4\nNº ticket de paleta",
          "1.3.5\nNº cajas",
          "1.3.6\nTurno",
          "1.3.7\nConformidad",
          "1.3.8\nObservación / desviación",
          "1.3.9\nAcción de corrección",
        ],
      ],
      body: h.paletas.map((p) => [
        p.numero ?? "",
        codigoSabor(p),
        p.lote ?? "",
        p.ticket ?? "",
        p.cajas ?? "",
        numeroTurno(p.turnoTipo),
        p.conforme ? "C" : "NC",
        textoObservacionCorto(p),
        p.accionCorreccion ?? "",
      ]),
    })

    // Leyenda al pie de la última tabla de esta hoja.
    const finTabla = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
    let yl = finTabla + 5
    if (yl > doc.internal.pageSize.getHeight() - 22) {
      doc.addPage()
      yl = M + 4
    }
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "bold")
    doc.text("Conformidad:", M, yl)
    doc.setFont("helvetica", "normal")
    doc.text("C = conforme, NC = no conforme.", M + 19, yl)
    yl += 4
    doc.setFont("helvetica", "bold")
    doc.text("Observación / desviación (solo si es NC):", M, yl)
    doc.setFont("helvetica", "normal")
    const leyenda = OBSERVACIONES.map((o) => `${o.codigo} ${o.texto.toLowerCase()}`).join("; ") + "."
    doc.text(doc.splitTextToSize(leyenda, W - 58), M + 58, yl)
  })

  if (hojas.length === 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    doc.text("No hay paletas con estos filtros.", M, M + 10)
  }
  return doc.output("blob")
}

/** «trazabilidad-paletizado-2026-11-11.pdf» (+ líneas si no son todas). */
export function nombreArchivoTrazabilidad(fecha: string, lineas: string[] | null): string {
  const sufijo = lineas && lineas.length ? `-${lineas.map((l) => l.replace(/^LINEA_/, "L")).join("-")}` : ""
  return `trazabilidad-paletizado-${fecha}${sufijo}.pdf`
}
