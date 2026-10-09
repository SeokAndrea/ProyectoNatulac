import jsPDF from "jspdf"
import { FRANJA_ACTA } from "@/lib/actaIconos"
import { fechaHoraSif, minutosEntre, textoDuracion, type FallaSif, type Sif } from "@/lib/sif"

/*
 * Acta de una Solicitud de Intervención de Falla ya cerrada (jsPDF), con la
 * franja del Acta de Entrega de Turno arriba y espacio para las dos firmas.
 * Se importa recién al abrir el acta (no entra en la carga inicial).
 */

const AZUL: [number, number, number] = [44, 82, 190]
const GRIS: [number, number, number] = [95, 99, 110]

export function generarSifPdf(sif: Sif, codigoParada: string, fallas: FallaSif[]): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const M = 12
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const LIMITE_Y = 280
  let y = 8

  const franja = () => {
    const alto = (W * 57) / 850
    doc.addImage(FRANJA_ACTA, "PNG", M, 8, W, alto, undefined, "FAST")
    y = 8 + alto + 4
  }
  const asegurar = (alto: number) => {
    if (y + alto > LIMITE_Y) {
      doc.addPage()
      franja()
    }
  }
  const barra = (texto: string) => {
    asegurar(14)
    doc.setFillColor(...AZUL)
    doc.rect(M, y, W, 5.5, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(255)
    doc.text(texto, M + 2, y + 3.8)
    doc.setTextColor(0)
    y += 8
  }
  const dato = (x: number, etiqueta: string, valor: string) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.text(`${etiqueta}:`, x, y)
    const ancho = doc.getTextWidth(`${etiqueta}: `)
    doc.setFont("helvetica", "normal")
    doc.text(doc.splitTextToSize(valor, W / 2 - ancho - 4)[0] ?? "", x + ancho, y)
  }
  const par = (a: [string, string], b: [string, string]) => {
    dato(M + 1, ...a)
    dato(M + W / 2 + 1, ...b)
    y += 5.5
  }

  // ---------------------------------------------------------------- título
  franja()
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("SOLICITUD DE INTERVENCIÓN DE FALLA", M + W / 2, y + 2, { align: "center" })
  doc.setFontSize(10)
  doc.text(sif.codigo, M + W / 2, y + 8, { align: "center" })
  y += 14

  // ---------------------------------------------------------------- datos
  const falla = [sif.equipoNombre, sif.tipoNombre].filter(Boolean).join(" · ")
  barra("DATOS DE LA SOLICITUD")
  par(["Área solicitante", sif.areaNombre], ["Línea", sif.lineaNombre])
  par(["Código de parada", codigoParada], ["Falla", falla])
  par(["Generada", fechaHoraSif(sif.generadaEn)], ["Inicio de reparación", fechaHoraSif(sif.inicioReparacion)])
  par(["Cierre", fechaHoraSif(sif.cierre)], ["Tiempo de reparación", textoDuracion(minutosEntre(sif.inicioReparacion, sif.cierre))])
  par(["Responsable", sif.responsable ?? "—"], ["Entregada a", sif.entregadaA ?? "—"])
  y += 2

  // ---------------------------------------------------------------- historial
  barra(`HISTORIAL DE FALLAS (${fallas.length})`)
  const columnas: [string, number][] = [
    ["Fecha y hora", 32],
    ["Duración", 20],
    ["Cargada por", 28],
    ["Sistema · subsistema", 62],
    ["Registró", W - 142],
  ]
  const encabezado = () => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    let x = M + 1
    for (const [t, ancho] of columnas) {
      doc.text(t, x, y)
      x += ancho
    }
    doc.setTextColor(0)
    doc.setDrawColor(200)
    doc.line(M, y + 1.5, M + W, y + 1.5)
    y += 5.5
  }
  encabezado()
  doc.setFont("helvetica", "normal")
  for (const f of fallas) {
    if (y + 6 > LIMITE_Y) {
      asegurar(LIMITE_Y)
      encabezado()
      doc.setFont("helvetica", "normal")
    }
    const sistema = [f.equipo, f.subsistema].filter(Boolean).join(" · ") || "—"
    const celdas = [fechaHoraSif(f.inicio), textoDuracion(minutosEntre(f.inicio, f.fin)), f.origen, sistema, f.registro ?? "—"]
    let x = M + 1
    doc.setFontSize(8)
    celdas.forEach((c, i) => {
      doc.text(doc.splitTextToSize(c, columnas[i][1] - 2)[0] ?? "", x, y)
      x += columnas[i][1]
    })
    doc.setDrawColor(230)
    doc.line(M, y + 1.5, M + W, y + 1.5)
    y += 5.5
  }
  y += 2

  // ---------------------------------------------------------------- trabajo realizado
  barra("TRABAJO REALIZADO")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  for (const linea of doc.splitTextToSize(sif.trabajoRealizado ?? "—", W - 2) as string[]) {
    asegurar(5)
    doc.text(linea, M + 1, y)
    y += 4.5
  }

  // ---------------------------------------------------------------- firmas
  asegurar(38)
  y += 26
  const anchoFirma = W / 2 - 12
  const firma = (x: number, nombre: string, cargo: string) => {
    doc.setDrawColor(0)
    doc.line(x, y, x + anchoFirma, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(nombre, x + anchoFirma / 2, y + 4.5, { align: "center" })
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(cargo, x + anchoFirma / 2, y + 8.5, { align: "center" })
    doc.setTextColor(0)
  }
  firma(M + 4, sif.responsable ?? "", "Responsable de Mantenimiento")
  firma(M + W / 2 + 8, sif.entregadaA ?? "", "Supervisor que recibe")

  return doc.output("blob")
}
