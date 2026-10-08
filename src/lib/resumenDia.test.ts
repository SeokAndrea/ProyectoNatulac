import { describe, expect, it } from "vitest"
import {
  itemsDelDia,
  itemsDelDiaConTurnos,
  mensajeResumenDia,
  nombrePresentacion,
  pasosCambioPresentacion,
  saborEnMensaje,
  totalPorLinea,
  type FilaResumenDia,
  type FilaTurnoResumen,
  type ValidacionDia,
} from "@/lib/resumenDia"

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

  it("una fila por sabor + presentación (suma las líneas); por sabor y, dentro del sabor, por línea", () => {
    expect(itemsDelDia(filas).map((i) => [i.saborNombre, i.volumenMl, i.cajasSupervisor, i.cajasOficiales, i.estado])).toEqual([
      ["Durazno", 1000, 960, 960, "PENDIENTE"],
      // Pera 250 salió en la Línea 2 (y 3); Pera 330, solo en la 3.
      ["Pera", 250, 2401, 2401, "PENDIENTE"],
      ["Pera", 330, 4803, 4803, "PENDIENTE"],
    ])
  })

  it("dentro del sabor: Línea 1, 2, 3 y en cada línea de 1000 a 200", () => {
    const pera = ([
      [1000, "LINEA_1"],
      [330, "LINEA_3"],
      [200, "LINEA_2"],
      [250, "LINEA_2"],
    ] as const).map(([volumenMl, lineaCodigo]) => ({ saborNombre: "Pera", volumenMl, lineaCodigo, lineaNombre: "", cajas: 10 }))
    expect(itemsDelDia(pera).map((i) => i.volumenMl)).toEqual([1000, 250, 200, 330])
  })

  it("la Pera Jucosa es otra fila, después de la Pera clásica", () => {
    const conJucosa: FilaResumenDia[] = [
      { saborNombre: "Pera Jucosa", volumenMl: 200, lineaCodigo: "LINEA_2", lineaNombre: "Línea 2", cajas: 300 },
      { saborNombre: "Pera", volumenMl: 200, lineaCodigo: "LINEA_2", lineaNombre: "Línea 2", cajas: 500 },
    ]
    expect(itemsDelDia(conJucosa).map((i) => [i.saborNombre, i.cajasOficiales])).toEqual([
      ["Pera", 500],
      ["Pera Jucosa", 300],
    ])
  })

  it("dentro de un sabor va de 1000 a 200 aunque tenga menos cajas", () => {
    const pera: FilaResumenDia[] = [200, 330, 1000, 500].map((volumenMl, i) => ({
      saborNombre: "Pera",
      volumenMl,
      lineaCodigo: "LINEA_1",
      lineaNombre: "Línea 1",
      cajas: (i + 1) * 100,
    }))
    expect(itemsDelDia(pera).map((i) => i.volumenMl)).toEqual([1000, 500, 330, 200])
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
        "TBA-1000 cm³ Néctar de Durazno: 960 cajas",
        "TPA-250 cm³ Néctar de Pera: 2.401 cajas",
        "TPA-330 cm³ Néctar de Pera: 4.803 cajas",
        "",
        "Total: 8.164 cajas",
      ].join("\n"),
    )
  })

  it("en el mensaje los clásicos llevan «Néctar de» y la Naranja es Naranjada", () => {
    expect(["Pera", "Manzana", "Durazno", "Mango"].map(saborEnMensaje)).toEqual([
      "Néctar de Pera",
      "Néctar de Manzana",
      "Néctar de Durazno",
      "Néctar de Mango",
    ])
    expect(saborEnMensaje("Naranja")).toBe("Naranjada")
    expect(saborEnMensaje("Coctel")).toBe("Coctel")
    expect(saborEnMensaje("Pera Jucosa")).toBe("Pera Jucosa")
    expect(["Pera 35%", "Mango 35%", "Naranja 100%", "Té de Durazno", "Agua de Coco"].map(saborEnMensaje)).toEqual([
      "Néctar de Pera 35%",
      "Néctar de Mango 35%",
      "Naranja 100%",
      "Té de Durazno",
      "Agua de Coco",
    ])
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
    expect(mensaje).toContain("TPA-250 cm³ Néctar de Pera: 2.380 cajas")
    expect(mensaje).toContain("Total: 8.143 cajas")
  })

  it("una corrección sin producción del supervisor igual aparece", () => {
    const items = itemsDelDia(filas, [{ saborNombre: "Mango", volumenMl: 200, estado: "EDITADO", cajas: 50, nota: null, validadoPorNombre: null }])
    expect(items.find((i) => i.saborNombre === "Mango")).toMatchObject({ cajasSupervisor: 0, cajasOficiales: 50 })
  })
})

describe("cambiar la presentación de una fila", () => {
  it("250 → 200 sin fila de 200: deja 250 en 0 y crea 200 con esas cajas", () => {
    const items = itemsDelDia(filas)
    const pera250 = items.find((i) => i.saborNombre === "Pera" && i.volumenMl === 250)!
    expect(pasosCambioPresentacion(items, pera250, 200, 2401, "")).toEqual([
      { volumenMl: 250, cajas: 0, nota: "Pasó a 200 ml." },
      { volumenMl: 200, cajas: 2401, nota: "Incluye 2401 cajas de 250 ml." },
    ])
  })
  it("si el destino ya tenía cajas, las suma y agrega la nota", () => {
    const items = itemsDelDia(filas)
    const pera250 = items.find((i) => i.saborNombre === "Pera" && i.volumenMl === 250)!
    const pasos = pasosCambioPresentacion(items, pera250, 330, 100, "Se activó mal")
    expect(pasos[1]).toEqual({ volumenMl: 330, cajas: 4903, nota: "Incluye 100 cajas de 250 ml. Se activó mal" })
  })
})

describe("corrección por turno", () => {
  const porTurno: FilaTurnoResumen[] = [
    { turnoId: "t1", saborNombre: "Pera", volumenMl: 200, lineaCodigo: "LINEA_2", cajas: 420 },
    { turnoId: "t3", saborNombre: "Pera", volumenMl: 200, lineaCodigo: "LINEA_2", cajas: 300 },
    { turnoId: "t3", saborNombre: "Durazno", volumenMl: 330, lineaCodigo: "LINEA_3", cajas: 960 },
  ]

  it("el oficial del día es la suma de los turnos: lo corregido y lo del supervisor", () => {
    const { dia, turnos } = itemsDelDiaConTurnos(
      porTurno,
      [{ turnoId: "t1", saborNombre: "Pera", volumenMl: 200, estado: "EDITADO", cajas: 430, nota: "Faltó una camada", validadoPorNombre: "Analista" }],
      [],
    )
    expect(turnos.map((t) => [t.turnoId, t.saborNombre, t.cajasOficiales, t.estado])).toEqual([
      ["t3", "Durazno", 960, "PENDIENTE"],
      ["t1", "Pera", 430, "EDITADO"],
      ["t3", "Pera", 300, "PENDIENTE"],
    ])
    expect(dia.map((i) => [i.saborNombre, i.cajasSupervisor, i.cajasOficiales, i.estado])).toEqual([
      ["Durazno", 960, 960, "PENDIENTE"],
      ["Pera", 720, 730, "EDITADO"],
    ])
  })

  it("todos los turnos confirmados: el día queda confirmado", () => {
    const conf = (turnoId: string) => ({ turnoId, saborNombre: "Pera", volumenMl: 200, estado: "CONFIRMADO" as const, cajas: null, nota: null, validadoPorNombre: null })
    const { dia } = itemsDelDiaConTurnos(porTurno, [conf("t1"), conf("t3")], [])
    expect(dia.find((i) => i.saborNombre === "Pera")).toMatchObject({ cajasOficiales: 720, estado: "CONFIRMADO" })
  })

  it("sin correcciones por turno, vale la corrección global de antes", () => {
    const global: ValidacionDia[] = [{ saborNombre: "Pera", volumenMl: 200, estado: "EDITADO", cajas: 700, nota: null, validadoPorNombre: "Daniela" }]
    const { dia } = itemsDelDiaConTurnos(porTurno, [], global)
    expect(dia.find((i) => i.saborNombre === "Pera")).toMatchObject({ cajasOficiales: 700, estado: "EDITADO" })
  })
})
