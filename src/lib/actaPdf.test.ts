import { describe, expect, it } from "vitest"
import { generarActaPdf, notaParadaActa, finDelTurno, renglonParadaActa, sinReportarActa } from "@/lib/actaPdf"
import type { Parada } from "@/lib/paradas"
import { LINEAS_DEMO, PRESENTACIONES_DEMO, contador, corrida, prep, pt, tanque } from "@/lib/auditoriaDemoFixture"

const VELOCIDADES_DEMO = (["LINEA_1", "LINEA_2", "LINEA_3"] as const).map((linea, i) => ({
  id: `v${i}`,
  linea,
  presentacion: "350" as const,
  maquina: "Llenadora",
  envasesHora: 9000,
  litrosHora: 3150,
  activo: true,
}))

describe("generarActaPdf", () => {
  it("genera un PDF sin datos cargados (turno recién abierto)", async () => {
    const blob = await generarActaPdf({
      codigo: "T1-2026-09-16-1",
      fecha: "2026-09-16",
      turnoTipo: "TURNO_1",
      grupo: "GRUPO_1" as const,
      tanquesEncontrados: null,
      tanques: [],
      preparaciones: [],
      corridas: [],
      contadores: [],
      productoTerminado: [],
      novedades: [],
      ajustesVolumen: [],
      supervisorNombre: "Javier Bello",
      area: "ASEPTICO",
      lineas: LINEAS_DEMO,
      presentaciones: PRESENTACIONES_DEMO,
      velocidades: [...VELOCIDADES_DEMO],
    })
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe("application/pdf")
  })

  it("genera un PDF con un turno completo (lote, corrida, contador, PT y novedades)", async () => {
    const loteId = "lote-1"
    const corridaId = "corrida-1"
    const blob = await generarActaPdf({
      codigo: "T1-2026-09-16-1",
      fecha: "2026-09-16",
      turnoTipo: "TURNO_1",
      grupo: "GRUPO_1" as const,
      tanquesEncontrados: [
        { numeroTanque: 1, condicion: "LISTO", volumenL: 16600, saborNombre: "Pera Clásica", lote: "5" },
        { numeroTanque: 2, condicion: "LIMPIO", volumenL: null, saborNombre: null, lote: null },
        { numeroTanque: 3, condicion: "LIMPIO", volumenL: null, saborNombre: null, lote: null },
      ],
      tanques: [
        tanque({ numeroTanque: 1, activadaEn: "2026-09-16T07:00:00", condicion: "LIMPIO" }),
        tanque({ numeroTanque: 2, activadaEn: "2026-09-16T07:00:00", condicion: "LIMPIO" }),
        tanque({
          numeroTanque: 3,
          activadaEn: "2026-09-16T07:00:00",
          condicion: "LISTO",
          saborNombre: "Pera Clásica",
          volumenL: 10500,
          lote: "6",
        }),
      ],
      preparaciones: [
        prep({
          id: loteId,
          numeroTanque: 1,
          creadoEn: "2026-09-16T06:00:00",
          saborNombre: "Pera Clásica",
          lote: "5",
          volumenActualL: 0,
        }),
      ],
      corridas: [
        corrida({
          id: corridaId,
          linea: "LINEA_1",
          activadaEn: "2026-09-16T07:05:00",
          saborNombre: "Pera Clásica",
          lote: "5",
          loteId,
          activa: false,
          finalizadaEn: "2026-09-16T14:00:00",
        }),
      ],
      contadores: [contador({ id: "c1", linea: "LINEA_1", creadoEn: "2026-09-16T14:00:00", envasesLlenadora: 23438, corridaId })],
      productoTerminado: [pt({ id: "pt1", linea: "LINEA_1", creadoEn: "2026-09-16T14:00:00", paletas: 40, cajasSueltas: 3, corridaId, litrosProducidos: 8004 })],
      novedades: [
        { id: "n1", texto: "Falla el fluido eléctrico", creadoEn: "2026-09-16T08:42:00", creadoPorNombre: "Javier Bello" },
        { id: "n2", texto: "Arrancando envasado línea 1", creadoEn: "2026-09-16T11:32:00", creadoPorNombre: "Javier Bello" },
      ],
      ajustesVolumen: [
        {
          id: "av1",
          loteId,
          numeroTanque: 1,
          lote: "5",
          saborNombre: "Pera Clásica",
          litros: 200,
          detalle: "Completar volumen del tanque",
          usuarioNombre: "Javier Bello",
          creadoEn: "2026-09-16T07:10:00",
        },
      ],
      paradas: [
        {
          id: "p1",
          clase: "PROGRAMADA",
          origen: "MANUAL",
          responsable: "OPERACIONAL",
          subsistemaCodigo: null, lote: null, sabor: null, terminadaPor: null,
          lineaCodigo: "LINEA_1",
          turnoTipo: "TURNO_1",
          tipoCodigo: "CAMBIO_SABOR",
          tipoNombre: "Cambio de Sabor",
          tiempoGuiaMin: 25,
          nota: "Cambio a Pera",
          justificacionDesvio: "Faltó un operario",
          inicio: "2026-09-16T09:00:00",
          fin: "2026-09-16T09:40:00",
          supervisorNombre: "Javier Bello",
        },
        {
          id: "p2",
          clase: "OCIOSO",
          origen: "MANUAL",
          responsable: "OPERACIONAL",
          subsistemaCodigo: null, lote: null, sabor: null, terminadaPor: null,
          lineaCodigo: "LINEA_2",
          turnoTipo: "TURNO_1",
          tipoCodigo: null,
          tipoNombre: "Tiempo ocioso",
          tiempoGuiaMin: null,
          nota: "Sin paletas",
          justificacionDesvio: null,
          inicio: "2026-09-16T10:00:00",
          fin: "2026-09-16T10:20:00",
          supervisorNombre: "Javier Bello",
        },
      ],
      supervisorNombre: "Javier Bello",
      area: "ASEPTICO",
      lineas: LINEAS_DEMO,
      presentaciones: PRESENTACIONES_DEMO,
      velocidades: [...VELOCIDADES_DEMO],
    })
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe("application/pdf")
  })
})

describe("paradas en el acta", () => {
  it("la nota no repite el nombre del tipo", () => {
    expect(notaParadaActa({ nota: "CAMBIO DE LOTE", tipoNombre: "Cambio de Lote", origen: "MANUAL", justificacionDesvio: null })).toBeNull()
    expect(notaParadaActa({ nota: "COLISION CON EMPUJADOR", tipoNombre: "Film Wrapper · Caida de envases", origen: "MANUAL", justificacionDesvio: null })).toBe(
      "COLISION CON EMPUJADOR",
    )
  })

  it("las del Sheet: solo lo que escribió Mantenimiento, sin el código del final y completo", () => {
    expect(
      notaParadaActa({
        nota: "Mantenimiento — Cartones mal posicionados en el almacén, se ajusta magazine — CBP32 · CBP-MAG-13 /MAGAZINE DE CARTONES",
        tipoNombre: "Cardboard Packer · Magazine",
        origen: "SHEET",
        justificacionDesvio: null,
      }),
    ).toBe("Cartones mal posicionados en el almacén, se ajusta magazine")
    const larga = notaParadaActa({ nota: `Mantenimiento — ${"x".repeat(200)}`, tipoNombre: "Mantenimiento · Sin equipo", origen: "SHEET", justificacionDesvio: null })
    expect(larga).toBe("x".repeat(200))
  })

  it("textos larguísimos no se cortan: el recuadro sigue en otra hoja", async () => {
    const parada = (i: number) => ({
      id: `p${i}`,
      clase: "NO_PROGRAMADA" as const,
      origen: "SHEET" as const,
      responsable: "MANTENIMIENTO" as const,
      subsistemaCodigo: null, lote: null, sabor: null, terminadaPor: null,
      lineaCodigo: "LINEA_1",
      turnoTipo: "TURNO_1" as const,
      tipoCodigo: null,
      tipoNombre: "Mantenimiento · Sin equipo",
      tiempoGuiaMin: null,
      nota: `Mantenimiento — ${"falla del empujador con atasco de envases ".repeat(15)}`,
      justificacionDesvio: null,
      inicio: `2026-09-16T${String(7 + (i % 10)).padStart(2, "0")}:00:00`,
      fin: `2026-09-16T${String(7 + (i % 10)).padStart(2, "0")}:10:00`,
      supervisorNombre: null,
    })
    const base = {
      codigo: "T1-2026-09-16-1",
      fecha: "2026-09-16",
      turnoTipo: "TURNO_1" as const,
      grupo: "GRUPO_1" as const,
      tanquesEncontrados: null,
      tanques: [],
      preparaciones: [],
      corridas: [],
      contadores: [],
      productoTerminado: [],
      ajustesVolumen: [],
      supervisorNombre: "Javier Bello",
      area: "ASEPTICO" as const,
      lineas: LINEAS_DEMO,
      presentaciones: PRESENTACIONES_DEMO,
      velocidades: [...VELOCIDADES_DEMO],
    }
    // El Blob de jsdom no tiene .text().
    const leer = (b: Blob) =>
      new Promise<string>((ok) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.readAsText(b)
      })
    const paginas = async (b: Blob) => ((await leer(b)).match(/\/Type \/Page\b/g) ?? []).length
    const corta = await generarActaPdf({ ...base, novedades: [] })
    const larga = await generarActaPdf({
      ...base,
      paradas: Array.from({ length: 12 }, (_, i) => parada(i)),
      novedades: [{ id: "n1", texto: "Novedad muy larga. ".repeat(400), creadoEn: "2026-09-16T08:42:00", creadoPorNombre: "Javier Bello" }],
    })
    expect(await paginas(larga)).toBeGreaterThan((await paginas(corta)) + 1)
  })
})

describe("paradas de la línea en el acta", () => {
  it("tiempo sin reportar de la línea: solo si hay y se pudo medir", () => {
    expect(sinReportarActa({ sinReportarMin: 116 })).toBe("Sin reportar: 1 h 56 min")
    expect(sinReportarActa({ sinReportarMin: 0 })).toBeNull()
    expect(sinReportarActa({ sinReportarMin: null })).toBeNull()
    expect(sinReportarActa(undefined)).toBeNull()
  })
})

describe("renglón de parada en el acta (todas, con Responsable y el tramo del turno)", () => {
  const par = (over: Partial<Parada>): Parada =>
    ({
      id: "p",
      origen: "MANUAL",
      responsable: "OPERACIONAL",
      lineaCodigo: "LINEA_1",
      tipoNombre: "Llenadora · Atasco",
      nota: null,
      justificacionDesvio: null,
      inicio: "2026-10-26T14:00:00",
      fin: "2026-10-26T16:30:00",
      ...over,
    }) as Parada
  const FIN_TURNO = "2026-10-26T22:00:00"
  const DESPUES = new Date("2026-10-27T09:00:00")

  it("Mantenimiento: lo dice y cuenta el tramo del turno (150), no el total", () => {
    // El servidor ya recortó el comienzo al turno: 14:00 a 16:30.
    const r = renglonParadaActa(par({ responsable: "MANTENIMIENTO" }), FIN_TURNO, DESPUES)
    expect(r.min).toBe(150)
    expect(r.texto).toContain("Mantenimiento")
    expect(r.texto).toContain("150 min")
    expect(r.texto).not.toContain("210")
    expect(r.texto).not.toContain("en curso")
  })

  it("Operacional también sale, con su Responsable", () => {
    const r = renglonParadaActa(par({}), FIN_TURNO, DESPUES)
    expect(r.texto).toContain("Operacional")
    expect(r.min).toBe(150)
  })

  it("una parada abierta sale «en curso» y cuenta hasta el fin del turno", () => {
    const r = renglonParadaActa(par({ fin: null, responsable: "MANTENIMIENTO" }), FIN_TURNO, DESPUES)
    expect(r.min).toBe(480)
    expect(r.texto).toContain("en curso")
  })

  it("una parada abierta al cerrar el turno sale «en curso» con los minutos de su tramo", () => {
    // El servidor recorta el fin al cierre del turno, pero la parada sigue abierta.
    const r = renglonParadaActa(par({ abierta: true, responsable: "MANTENIMIENTO" }), FIN_TURNO, DESPUES)
    expect(r.min).toBe(150)
    expect(r.texto).toContain("150 min (en curso)")
  })

  it("el acta con paradas abiertas y de Mantenimiento se genera", async () => {
    const blob = await generarActaPdf({
      codigo: "T2-2026-10-26-1",
      fecha: "2026-10-26",
      turnoTipo: "TURNO_2",
      grupo: "GRUPO_1" as const,
      tanquesEncontrados: null,
      tanques: [],
      preparaciones: [],
      corridas: [],
      contadores: [],
      productoTerminado: [],
      novedades: [],
      ajustesVolumen: [],
      supervisorNombre: "Javier Bello",
      area: "ASEPTICO" as const,
      lineas: LINEAS_DEMO,
      presentaciones: PRESENTACIONES_DEMO,
      velocidades: [...VELOCIDADES_DEMO],
      paradas: [par({ responsable: "MANTENIMIENTO" }), par({ id: "q", fin: null })],
      finTurno: FIN_TURNO,
    })
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe("finDelTurno", () => {
  it("arma el ISO local del cierre; null si el turno sigue abierto", () => {
    expect(finDelTurno({ fechaFin: "2026-10-26", horaFin: "14:00:00" })).toBe("2026-10-26T14:00:00")
    expect(finDelTurno({ fechaFin: "2026-10-26", horaFin: "14:00" })).toBe("2026-10-26T14:00:00")
    expect(finDelTurno({ fechaFin: null, horaFin: null })).toBeNull()
  })
})
