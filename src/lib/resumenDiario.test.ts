import { describe, expect, it } from "vitest"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { Parada } from "@/lib/paradas"
import type { ItemDia } from "@/lib/resumenDia"
import { cajasPorGrupo, cajasPorSaborYTurno, etiquetar, lineasDelDia, paradasQueMasQuitaron, type FilaPorTurno, type TurnoDelDia } from "@/lib/resumenDiario"
import type { TurnoActivo } from "@/lib/turno"

/** Datos reales del lunes 06/10 (actas A20261006_T1G2 y A20261006_T3G3_2), reducidos a la Línea 2. */
const pres = (codigo: string, envasesXCaja: number): PresentacionLive =>
  ({ id: codigo, codigo, nombre: `${codigo} ml`, volumenMl: Number(codigo), cajasXCamada: 0, cantCamada: 0, cajasXPaleta: 100, litrosXCaja: 0, envasesXCaja, activo: true }) as PresentacionLive
const PRESENTACIONES = [pres("200", 24), pres("250", 24), pres("330", 18)]

function turno(id: string, tipo: TurnoActivo["turnoTipo"], grupo: TurnoActivo["grupo"], supervisor: string, corridas: { id: string; pres: string; llenadora: number; cajas: number }[]): TurnoActivo {
  return {
    id,
    codigo: id,
    fecha: "2026-10-06",
    horaInicio: "07:00:00",
    turnoTipo: tipo,
    grupo,
    supervisorNombre: supervisor,
    lineas: corridas.map((c) => ({ id: c.id, linea: "LINEA_2", presentacion: c.pres })),
    contadores: corridas.map((c) => ({ id: `c-${c.id}`, linea: "LINEA_2", turnoLineaId: c.id, envasesLlenadora: c.llenadora })),
    productoTerminado: corridas.map((c) => ({ id: `pt-${c.id}`, linea: "LINEA_2", turnoLineaId: c.id, presentacion: c.pres, paletas: 0, cajasSueltas: c.cajas })),
  } as unknown as TurnoActivo
}

const T1 = turno("t1", "TURNO_1", "GRUPO_2", "Javier Bello", [
  { id: "l0002", pres: "250", llenadora: 2121, cajas: 18 },
  { id: "l0003", pres: "200", llenadora: 8214, cajas: 300 },
  { id: "l0004", pres: "200", llenadora: 11046, cajas: 120 },
])
const T3 = turno("t3", "TURNO_3", "GRUPO_3", "Gabriel Chacón", [{ id: "d0001", pres: "200", llenadora: 4552, cajas: 280 }])
const del = (t: TurnoActivo, etiqueta: string, cajas: number): TurnoDelDia => ({ turno: t, etiqueta, novedades: [], actaStoragePath: null, cajas })
const TURNOS = [del(T1, "T1", 438), del(T3, "T3", 280)]
const POR_TURNO: FilaPorTurno[] = [
  { turnoId: "t1", saborNombre: "Pera", volumenMl: 250, lineaCodigo: "LINEA_2", cajas: 18 },
  { turnoId: "t1", saborNombre: "Pera", volumenMl: 200, lineaCodigo: "LINEA_2", cajas: 420 },
  { turnoId: "t3", saborNombre: "Durazno", volumenMl: 200, lineaCodigo: "LINEA_2", cajas: 280 },
]

describe("resumen diario", () => {
  it("merma del día de la línea: todos los envases juntos (no el promedio de los turnos)", () => {
    const [l2] = lineasDelDia([{ codigo: "LINEA_2", nombre: "Línea 2" }], TURNOS, POR_TURNO, [], PRESENTACIONES)
    // 718 cajas × 24 = 17.232 empacados contra 25.933 de la llenadora.
    expect(l2).toMatchObject({ cajas: 718, mermaPct: 33.55, paradasMin: 0 })
  })

  it("una corrida sin PT no cuenta como merma", () => {
    const sinPt = { ...T3, productoTerminado: [] } as TurnoActivo
    const [l2] = lineasDelDia([{ codigo: "LINEA_2", nombre: "Línea 2" }], [del(sinPt, "T3", 0)], [], [], PRESENTACIONES)
    expect(l2.mermaPct).toBeNull()
  })

  it("cajas por sabor: una columna por turno y el número oficial del día", () => {
    const items: ItemDia[] = [
      { saborNombre: "Durazno", volumenMl: 200, cajasSupervisor: 280, estado: "PENDIENTE", cajasOficiales: 280, nota: null, validadoPorNombre: null },
      { saborNombre: "Pera", volumenMl: 250, cajasSupervisor: 18, estado: "PENDIENTE", cajasOficiales: 18, nota: null, validadoPorNombre: null },
      { saborNombre: "Pera", volumenMl: 200, cajasSupervisor: 420, estado: "EDITADO", cajasOficiales: 430, nota: "Faltaba una camada", validadoPorNombre: "Analista" },
    ]
    expect(cajasPorSaborYTurno(items, POR_TURNO, TURNOS).map((f) => [f.saborNombre, f.volumenMl, f.porTurno, f.oficial, f.corregida])).toEqual([
      ["Durazno", 200, [0, 280], 280, false],
      ["Pera", 250, [18, 0], 18, false],
      ["Pera", 200, [420, 0], 430, true],
    ])
  })

  it("dos turnos del mismo tipo llevan la hora", () => {
    const t2a = { ...T1, id: "a", turnoTipo: "TURNO_2", horaInicio: "15:00:00" } as TurnoActivo
    const t2b = { ...T1, id: "b", turnoTipo: "TURNO_2", horaInicio: "19:30:00" } as TurnoActivo
    expect(etiquetar([T1, t2a, t2b]).map((x) => x.etiqueta)).toEqual(["T1", "T2 15:00", "T2 19:30"])
  })

  it("cajas por grupo", () => {
    expect(cajasPorGrupo(TURNOS).map((g) => [g.nombre, g.turnos, g.supervisores, g.cajas])).toEqual([
      ["Grupo 2", ["T1"], ["Javier Bello"], 438],
      ["Grupo 3", ["T3"], ["Gabriel Chacón"], 280],
    ])
  })

  it("paradas que más quitaron: suma por tipo y línea, de más a menos minutos", () => {
    const p = (tipoNombre: string, linea: string, inicio: string, fin: string): Parada =>
      ({ id: `${tipoNombre}${inicio}`, tipoCodigo: tipoNombre, tipoNombre, lineaCodigo: linea, inicio, fin }) as Parada
    const paradas = [
      p("Transportador de Salida", "LINEA_3", "2026-10-06T14:20:00", "2026-10-06T14:25:00"),
      p("Agrupador", "LINEA_3", "2026-10-06T14:08:00", "2026-10-06T14:27:00"),
      p("Transportador de Salida", "LINEA_3", "2026-10-06T14:21:00", "2026-10-06T14:23:00"),
      p("Falla sin especificar", "LINEA_2", "2026-10-06T14:05:00", "2026-10-06T14:05:00"),
    ]
    expect(paradasQueMasQuitaron(paradas).map((x) => [x.nombre, x.veces, x.minutos])).toEqual([
      ["Agrupador", 1, 19],
      ["Transportador de Salida", 2, 7],
    ])
  })
})
