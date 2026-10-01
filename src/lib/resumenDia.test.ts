import { describe, expect, it } from "vitest"
import { itemsDelDia, mensajeResumenDia, nombrePresentacion, totalPorLinea, type FilaResumenDia, type ValidacionDia } from "@/lib/resumenDia"

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

  it("una fila por sabor + presentación (suma las líneas), de más a menos cajas, pendientes", () => {
    expect(itemsDelDia(filas).map((i) => [i.saborNombre, i.volumenMl, i.cajasSupervisor, i.cajasOficiales, i.estado])).toEqual([
      ["Pera", 330, 4803, 4803, "PENDIENTE"],
      ["Pera", 250, 2401, 2401, "PENDIENTE"],
      ["Durazno", 1000, 960, 960, "PENDIENTE"],
    ])
  })

  it("total por línea (lo del supervisor), con las que no produjeron en 0", () => {
    const lineas = [
      { codigo: "LINEA_1", nombre: "Línea 1" },
      { codigo: "LINEA_2", nombre: "Línea 2" },
      { codigo: "LINEA_3", nombre: "Línea 3" },
      { codigo: "LINEA_4", nombre: "Línea 4" },
    ]
    expect(totalPorLinea(filas, lineas).map((l) => l.cajas)).toEqual([960, 1200, 6004, 0])
  })

  it("arma el mensaje para copiar", () => {
    expect(mensajeResumenDia("2026-10-01", itemsDelDia(filas))).toBe(
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

describe("validar el día", () => {
  const validaciones: ValidacionDia[] = [
    { saborNombre: "Pera", volumenMl: 250, estado: "EDITADO", cajas: 2380, nota: "Faltaban 21 cajas", validadoPorNombre: "Daniela" },
    { saborNombre: "Durazno", volumenMl: 1000, estado: "CONFIRMADO", cajas: null, nota: null, validadoPorNombre: "Daniela" },
  ]

  it("corregida cuenta la corrección; confirmada, lo del supervisor", () => {
    const items = itemsDelDia(filas, validaciones)
    const pera250 = items.find((i) => i.saborNombre === "Pera" && i.volumenMl === 250)!
    expect([pera250.estado, pera250.cajasSupervisor, pera250.cajasOficiales]).toEqual(["EDITADO", 2401, 2380])
    const durazno = items.find((i) => i.saborNombre === "Durazno")!
    expect([durazno.estado, durazno.cajasOficiales]).toEqual(["CONFIRMADO", 960])
  })

  it("el mensaje usa los números oficiales", () => {
    const mensaje = mensajeResumenDia("2026-10-01", itemsDelDia(filas, validaciones))
    expect(mensaje).toContain("TPA-250 cm³ Pera: 2.380 cajas")
    expect(mensaje).toContain("Total: 8.143 cajas")
  })

  it("una corrección sin producción del supervisor igual aparece", () => {
    const items = itemsDelDia(filas, [{ saborNombre: "Mango", volumenMl: 200, estado: "EDITADO", cajas: 50, nota: null, validadoPorNombre: null }])
    expect(items.find((i) => i.saborNombre === "Mango")).toMatchObject({ cajasSupervisor: 0, cajasOficiales: 50 })
  })
})
