import { describe, expect, it } from "vitest"
import type { TipoParada } from "@/lib/paradas"
import { filasDelSheet, parsearCsv, resolverHoras, sugerirTipo, urlCsvDelSheet } from "@/lib/sheetMantenimiento"

// Hora de planta en que se leyó el Sheet (casos reales del 08/10/2026).
const AHORA = "2026-10-08T13:30:00"
const r = (fechaInicio: string, horaInicio: string, fechaCierre: string, horaCierre: string, downtime: string, pendiente = false) => ({
  fechaInicio,
  horaInicio,
  fechaCierre,
  horaCierre,
  downtime,
  pendiente,
})

describe("fechas del Sheet de Mantenimiento", () => {
  it("si inicio, cierre y downtime cuadran, se usan tal cual", () => {
    expect(resolverHoras(r("7/10/2026", "4:36:00", "07/10/2026", "5:04:00", "0:28:00"), AHORA)).toEqual({
      inicio: "2026-10-07T04:36:00",
      fin: "2026-10-07T05:04:00",
      corregida: false,
    })
  })

  it("cruza la medianoche", () => {
    expect(resolverHoras(r("7/10/2026", "23:58:00", "08/10/2026", "0:18:00", "0:20:00"), AHORA)).toMatchObject({
      inicio: "2026-10-07T23:58:00",
      fin: "2026-10-08T00:18:00",
      corregida: false,
    })
  })

  it("inicio en el futuro (8/10 23:17 leído a las 13:30): manda el cierre", () => {
    expect(resolverHoras(r("8/10/2026", "23:17:00", "07/10/2026", "23:37:00", "0:20:00"), AHORA)).toEqual({
      inicio: "2026-10-07T23:17:00",
      fin: "2026-10-07T23:37:00",
      corregida: true,
    })
  })

  it("inicio en el futuro y sin fecha de cierre: fue el día anterior", () => {
    expect(resolverHoras(r("8/10/2026", "22:56:00", "", "23:17:00", "0:21:00"), AHORA)).toEqual({
      inicio: "2026-10-07T22:56:00",
      fin: "2026-10-07T23:17:00",
      corregida: true,
    })
  })

  it("8/10 23:58 → 08/10 0:18: el inicio fue el 07/10", () => {
    expect(resolverHoras(r("8/10/2026", "23:58:00", "08/10/2026", "0:18:00", "0:20:00"), AHORA)).toMatchObject({
      inicio: "2026-10-07T23:58:00",
      fin: "2026-10-08T00:18:00",
      corregida: true,
    })
  })

  it("pendiente: cuenta 0 min hasta que lo finalicen (no es la línea parada)", () => {
    expect(resolverHoras(r("8/10/2026", "11:05:00", "", "", "", true), AHORA)).toEqual({ inicio: "2026-10-08T11:05:00", fin: "2026-10-08T11:05:00", corregida: false })
    // El de la cámara aséptica de L1: pendiente desde el 05/08, no puede sumar dos meses de parada.
    expect(resolverHoras(r("5/08/2026", "10:00:00", "05/08/2026", "", "", true), AHORA)).toMatchObject({ fin: "2026-08-05T10:00:00" })
  })

  it("sin fecha de inicio no se puede ubicar", () => {
    expect(resolverHoras(r("", "11:05:00", "", "", ""), AHORA)).toBeNull()
  })
})

describe("propuesta de tipo", () => {
  const tipo = (codigo: string, nombre: string, equipoCodigo: string): TipoParada =>
    ({ codigo, nombre, equipoCodigo, clase: "NO_PROGRAMADA", familia: "EQUIPO", tiempoGuiaMin: null, prefijoPlanilla: "" }) as unknown as TipoParada
  const TIPOS = [
    tipo("CARDBOARD_PACKER_5", "Agrupador", "CARDBOARD_PACKER"),
    tipo("CARDBOARD_PACKER_7", "Empujador", "CARDBOARD_PACKER"),
    tipo("CARDBOARD_PACKER_GENERAL", "Falla en Cardboard Packer", "CARDBOARD_PACKER"),
    tipo("FILM_WRAPPER_5", "Unidad de Sellado", "FILM_WRAPPER"),
    tipo("A3_COMPACT_FLEX_15", "Sistema de Traccion - Traccion", "A3_COMPACT_FLEX"),
    tipo("A3_COMPACT_FLEX_33", "Mesa de Empalme - ASU", "A3_COMPACT_FLEX"),
    tipo("ROBOT_TAVIL_GENERAL", "Falla en Robot Tavil", "ROBOT_TAVIL"),
  ]

  it("cruza por el nombre del subsistema", () => {
    expect(sugerirTipo("CBP32", "CBP-EMP-05 /EMPUJADOR", TIPOS)).toBe("CARDBOARD_PACKER_7")
    expect(sugerirTipo("CBP32", "CBP-AGR-03 /AGRUPADOR", TIPOS)).toBe("CARDBOARD_PACKER_5")
    expect(sugerirTipo("FW32", "FW-SELL-05 /UNIDAD DE SELLADO", TIPOS)).toBe("FILM_WRAPPER_5")
    expect(sugerirTipo("A3CFLEX", "A3CF-TRA-13 /SISTEMA TRACCION", TIPOS)).toBe("A3_COMPACT_FLEX_15")
    expect(sugerirTipo("A3CFLEX", "A3CF-MES-21 /MESA DE EMPALME", TIPOS)).toBe("A3_COMPACT_FLEX_33")
  })

  it("sin subsistema o sin parecido: la falla general del equipo", () => {
    expect(sugerirTipo("CBP32", "", TIPOS)).toBe("CARDBOARD_PACKER_GENERAL")
    expect(sugerirTipo("TAVIL", "TAV-XYZ-99 /ALGO RARO", TIPOS)).toBe("ROBOT_TAVIL_GENERAL")
  })

  it("equipo que no conocemos: sin propuesta (queda por clasificar)", () => {
    expect(sugerirTipo("TECMI", "", TIPOS)).toBeNull()
  })
})

describe("lectura del Sheet", () => {
  it("el enlace se convierte en el CSV de la pestaña ÁREAS", () => {
    expect(urlCsvDelSheet("https://docs.google.com/spreadsheets/d/1G83BfN9buOnkCsY_3JowMolkslaAsQYzhqvAxnBqxVU/edit?usp=sharing")).toBe(
      "https://docs.google.com/spreadsheets/d/1G83BfN9buOnkCsY_3JowMolkslaAsQYzhqvAxnBqxVU/gviz/tq?tqx=out:csv&sheet=%C3%81REAS",
    )
    expect(urlCsvDelSheet("https://example.com")).toBeNull()
  })

  it("CSV con comillas, comas y saltos de línea dentro de una celda", () => {
    expect(parsearCsv('"a","b, c","d\ne"\n"1","",""')).toEqual([
      ["a", "b, c", "d\ne"],
      ["1", "", ""],
    ])
  })

  it("solo Aséptico, con sus columnas", () => {
    const csv = [
      '"IDNUMERO_ DE REPORTE","ÁREA ","TURNO","LÍNEA ","EQUIPO","CÓDIGO_SUBSISTEMA","SUPERVISOR","ESTATUS","REPORTA","TIPO DE FALLA","FECHA DE INICIO","HORA DE INICIO","FECHA DE CIERRE","HORA DE CIERRE","TIEMPO DE PROCURA","DOWNTIME"',
      '"6ff1c160","VACÍO","TURNO 1","LINEA 3","TECMI","","RICARDO","FINALIZADO","TECNICO","CAMBIO DE LONA","26/03/2026","13:42:48","26/03/2026","13:57:54","","0:15:06"',
      '"60b1e647","ASÉPTICO","TURNO 3","LINEA 2","FW32","FW-SELL-05 /UNIDAD DE SELLADO","RICARDO","FINALIZADO","TECNICO","SELLADO ABIERTO","7/10/2026","4:36:00","07/10/2026","5:04:00","","0:28:00"',
    ].join("\n")
    const { filas, corregidas } = filasDelSheet(csv, [], AHORA)
    expect(corregidas).toBe(0)
    expect(filas).toEqual([
      {
        id: "60b1e647",
        area: "ASÉPTICO",
        linea: "LINEA 2",
        equipo: "FW32",
        subsistema: "FW-SELL-05 /UNIDAD DE SELLADO",
        falla: "SELLADO ABIERTO",
        estatus: "FINALIZADO",
        inicio: "2026-10-07T04:36:00",
        fin: "2026-10-07T05:04:00",
        tipo_sugerido: null,
      },
    ])
  })
})
