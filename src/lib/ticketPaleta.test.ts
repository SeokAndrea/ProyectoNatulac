import { describe, expect, it } from "vitest"
import { extraerTicket, lineaPresentacion, lineaSabor, numeroLinea, numeroPaleta4, textoQR, textoVence } from "./ticketPaleta"
import type { Paleta } from "./trazabilidadPaletizado"

const paleta = (over: Partial<Paleta> = {}): Paleta => ({
  id: "p1",
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  fechaProduccion: "2026-11-17",
  turnoTipo: "TURNO_1",
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

describe("ticket de paleta", () => {
  it("Nº de paleta con 4 dígitos, sin el código del sabor", () => {
    expect(numeroPaleta4(12)).toBe("0012")
    expect(numeroPaleta4(1234)).toBe("1234")
    expect(numeroPaleta4(null)).toBe("----")
  })

  it("línea, sabor y presentación como en el diseño aprobado", () => {
    expect(numeroLinea("Línea 3")).toBe("3")
    expect(numeroLinea("Llenadora A")).toBe("Llenadora A")
    expect(lineaSabor(paleta())).toBe("MZ · Manzana")
    // Jucosa: el código ya la distingue, sin la familia al lado.
    expect(lineaSabor(paleta({ saborCodigo: "MZJ", saborNombre: "Manzana (Jucosa)", saborNombreBase: "Manzana" }))).toBe("MZJ · Manzana")
    expect(lineaSabor(paleta({ saborCodigo: null }))).toBe("Manzana")
    expect(lineaPresentacion(paleta())).toBe("TBA-1000 cm3 · Automático")
    expect(lineaPresentacion(paleta({ tipoPaletizado: "MANUAL" }))).toBe("TBA-1000 cm3 · Manual")
  })

  it("vencimiento o «—» si el sabor no tenía vida útil", () => {
    expect(textoVence("2027-08-14")).toBe("14/08/2027")
    expect(textoVence(null)).toBe("—")
  })

  it("texto del QR (versión 1)", () => {
    expect(textoQR(paleta())).toBe("NTLPT1;T=P-000124;L=1;F=2026-11-17;V=2027-11-17;S=MZ;P=1000;N=0012;CJ=120;LT=2411;TU=1;C=C")
    expect(textoQR(paleta({ conforme: false, vence: null, lote: "A;B" }))).toContain(";V=;")
    expect(textoQR(paleta({ conforme: false, lote: "A;B" }))).toMatch(/LT=A B;TU=1;C=NC$/)
  })

  it("del texto pegado saca el ticket", () => {
    expect(extraerTicket("NTLPT1;T=P-000124;L=1;F=2026-11-17")).toBe("P-000124")
    expect(extraerTicket("  ntlpt1;t=p-000124;L=1 ")).toBe("P-000124")
    expect(extraerTicket(" p-000124 ")).toBe("P-000124")
    expect(extraerTicket("4471")).toBe("4471")
    expect(extraerTicket("   ")).toBeNull()
  })
})
