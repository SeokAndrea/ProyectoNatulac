import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EtiquetaPaleta } from "./EtiquetaPaleta"
import { htmlEtiquetas } from "@/lib/imprimirEtiqueta"
import type { Paleta } from "@/lib/trazabilidadPaletizado"

const paleta = (over: Partial<Paleta> = {}): Paleta => ({
  id: "p1",
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  fechaProduccion: "2026-11-17",
  turnoTipo: "TURNO_2",
  creadaEn: "2026-11-17T14:42:00Z",
  numero: 12,
  ticket: "P-000124",
  tipoPaletizado: "AUTOMATICO",
  cajas: 120,
  conforme: true,
  observacionCodigos: [],
  observacionOtros: null,
  accionCorreccion: null,
  lote: "2411",
  saborCodigo: "MZ",
  saborNombre: "Manzana",
  presentacionMl: 1000,
  presentacionCodigo: "TBA-1000 cm3",
  editadaEn: null,
  editadaPor: null,
  saborNombreBase: "Manzana",
  creadaPor: "J. Pérez",
  vence: "2027-11-17",
  ticketSistema: true,
  impresiones: 0,
  impresaEn: null,
  anuladaEn: null,
  ...over,
})

describe("EtiquetaPaleta", () => {
  it("muestra los datos del diseño aprobado y el QR", () => {
    const { container } = render(<EtiquetaPaleta paleta={paleta()} />)
    for (const t of ["0012", "MZ · Manzana", "TBA-1000 cm3 · Automático", "120", "2411", "17/11/2026", "17/11/2027", "CONFORME", "P-000124", "Operador: J. Pérez"]) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
    expect(screen.getByText("2")).toBeInTheDocument() // turno
    expect(container.querySelector("svg")).not.toBeNull()
    expect(screen.queryByText(/Observación/)).toBeNull()
  })

  it("No conforme: franja, observación y acción; sin vida útil, VENCE —", () => {
    render(
      <EtiquetaPaleta
        paleta={paleta({ conforme: false, observacionCodigos: [2, 5], accionCorreccion: "Se reenvolvió", vence: null })}
      />,
    )
    expect(screen.getByText("NO CONFORME")).toBeInTheDocument()
    expect(screen.getByText(/2 Faltante de cajas en la paleta; 5 Poliestrech rasgado/)).toBeInTheDocument()
    expect(screen.getByText(/Se reenvolvió/)).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("una etiqueta por copia (1 a 4)", () => {
    const contar = (html: string) => (html.match(/class="etiqueta"/g) ?? []).length
    expect(contar(htmlEtiquetas(paleta(), 1))).toBe(1)
    expect(contar(htmlEtiquetas(paleta(), 2))).toBe(2)
    expect(contar(htmlEtiquetas(paleta(), 9))).toBe(4)
  })
})
