import { describe, expect, it } from "vitest"
import { mensajeResumenDia, nombrePresentacion, porSaborYPresentacion, totalPorLinea, type FilaResumenDia } from "@/lib/resumenDia"

const filas: FilaResumenDia[] = [
  { saborNombre: "Pera", volumenMl: 250, lineaCodigo: "LINEA_2", lineaNombre: "Línea 2", cajas: 1200 },
  { saborNombre: "Pera", volumenMl: 250, lineaCodigo: "LINEA_3", lineaNombre: "Línea 3", cajas: 1201 },
  { saborNombre: "Pera", volumenMl: 330, lineaCodigo: "LINEA_3", lineaNombre: "Línea 3", cajas: 4803 },
  { saborNombre: "Durazno", volumenMl: 1000, lineaCodigo: "LINEA_1", lineaNombre: "Línea 1", cajas: 960 },
]

describe("resumen del día", () => {
  it("nombra la presentación con el tipo de envase", () => {
    expect(nombrePresentacion(250)).toBe("TPA-250 cm³")
    expect(nombrePresentacion(500)).toBe("TBA-500 cm³")
    expect(nombrePresentacion(1000)).toBe("TBA-1000 cm³")
  })

  it("suma las líneas por sabor + presentación, de más a menos cajas", () => {
    expect(porSaborYPresentacion(filas)).toEqual([
      { saborNombre: "Pera", volumenMl: 330, cajas: 4803 },
      { saborNombre: "Pera", volumenMl: 250, cajas: 2401 },
      { saborNombre: "Durazno", volumenMl: 1000, cajas: 960 },
    ])
  })

  it("total por línea, con las que no produjeron en 0", () => {
    const lineas = [
      { codigo: "LINEA_1", nombre: "Línea 1" },
      { codigo: "LINEA_2", nombre: "Línea 2" },
      { codigo: "LINEA_3", nombre: "Línea 3" },
      { codigo: "LINEA_4", nombre: "Línea 4" },
    ]
    expect(totalPorLinea(filas, lineas).map((l) => l.cajas)).toEqual([960, 1200, 6004, 0])
  })

  it("arma el mensaje para copiar", () => {
    expect(mensajeResumenDia("2026-10-01", filas)).toBe(
      [
        "Buenos días, producción del día 01/10/2026",
        "",
        "TPA-330 cm³ Pera: 4.803 cajas",
        "TPA-250 cm³ Pera: 2.401 cajas",
        "TBA-1000 cm³ Durazno: 960 cajas",
        "",
        "Total: 8.164 cajas",
      ].join("\n"),
    )
  })

  it("sin producción", () => {
    expect(mensajeResumenDia("2026-10-01", [])).toBe("Buenos días, producción del día 01/10/2026\n\nSin producción registrada.")
  })
})
