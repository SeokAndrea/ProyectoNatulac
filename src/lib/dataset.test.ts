import { describe, expect, it } from "vitest"
import { COLUMNAS_DATASET, datasetACsv, filaDataset } from "@/lib/dataset"
import type { FilaEstadistica } from "@/lib/estadisticas"

function fila(over: Partial<FilaEstadistica> = {}): FilaEstadistica {
  return {
    turnoId: "t1",
    turnoCodigo: "ASE-20260115-T1",
    fecha: "2026-01-15",
    horaInicio: "07:00",
    horaFin: "15:00",
    estado: "CERRADO",
    turnoTipo: "TURNO_1",
    grupo: "GRUPO_1",
    area: "ASEPTICO",
    supervisorUsuario: "jperez",
    supervisorNombre: "Juan Pérez",
    linea: "LINEA_1",
    turnoLineaId: "tl1",
    envasesLlenadora: 72000,
    paletas: 98,
    cajasSueltas: 40,
    cajasXPaleta: 60,
    envasesXCaja: 12,
    volumenMl: 1000,
    litrosProducidos: 9550,
    saborNombre: "Manzana (Jucosa)",
    ...over,
  }
}

describe("dataset de producción", () => {
  it("el encabezado del CSV son las COLUMNAS_DATASET en orden", () => {
    const csv = datasetACsv([fila()])
    expect(csv.split("\r\n")[0]).toBe(COLUMNAS_DATASET.join(","))
  })

  it("deriva fechas y calcula envases/merma por corrida", () => {
    const d = filaDataset(fila())
    expect(d.fecha_jornada).toBe("2026-01-15")
    expect(d.fecha_fin).toBe("2026-01-15") // Turno 1 no cruza medianoche
    expect(d.anio).toBe("2026")
    expect(d.mes).toBe("01")
    expect(d.dia_semana).toBe("jueves")
    expect(d.cajas).toBe("5920") // 98*60 + 40
    expect(d.envases_producto_terminado).toBe("71040") // 5920 * 12
    expect(d.tiempo_produccion_h).toBe("8")
    expect(d.merma_envase_pct).toBe("1.33") // 1 - 71040/72000
  })

  it("Turno 3 que cruza medianoche cae en la fecha siguiente", () => {
    const d = filaDataset(fila({ horaInicio: "22:30", horaFin: "07:00" }))
    expect(d.fecha_fin).toBe("2026-01-16")
  })

  it("mapea la familia del sabor cuando se le pasa el diccionario", () => {
    const mapa = new Map([["Manzana (Jucosa)", "Jucosa"]])
    expect(filaDataset(fila(), mapa).familia).toBe("Jucosa")
    expect(filaDataset(fila()).familia).toBe("")
  })

  it("columnas pendientes de migración van vacías", () => {
    const d = filaDataset(fila())
    expect(d.cant_paradas).toBe("")
    expect(d.litros_consumidos_tanque).toBe("")
    expect(d.merma_semielaborado_pct).toBe("")
  })
})
