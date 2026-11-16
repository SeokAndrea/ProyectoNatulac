import { describe, expect, it } from "vitest"
import { generarSifPdf } from "@/lib/sifPdf"
import type { FallaSif, Sif } from "@/lib/sif"

const sif = {
  id: "s1",
  codigo: "SIF20261113_1",
  estado: "CERRADA",
  lineaNombre: "Línea 1",
  areaNombre: "Aséptico",
  tipoNombre: "Falla de nivel",
  equipoNombre: "BTD",
  generadaEn: "2026-11-13T08:00:00Z",
  inicioReparacion: "2026-11-13T09:00:00Z",
  cierre: "2026-11-13T10:00:00Z",
  responsable: "Juan",
  entregadaA: "Ana",
  trabajoRealizado: "Cambio de sensor",
} as unknown as Sif

const falla = (over: Partial<FallaSif>): FallaSif => ({
  id: "p",
  inicio: "2026-11-13T08:00:00Z",
  fin: "2026-11-13T08:20:00Z",
  responsable: "Mantenimiento",
  equipo: "BTD",
  subsistema: "Nivel",
  registro: "Ana",
  nota: null,
  solucion: null,
  ...over,
})

describe("generarSifPdf", () => {
  it("arma el acta con observaciones largas sin romperse (varias páginas)", () => {
    const larga = "El nivel del BTD bajó de golpe y la llenadora se detuvo. ".repeat(15)
    const fallas = Array.from({ length: 30 }, (_, i) => falla({ id: `p${i}`, nota: larga, solucion: i % 2 ? larga : null }))
    const pdf = generarSifPdf(sif, "CPL1-6", fallas)
    expect(pdf.size).toBeGreaterThan(0)
  })
})
