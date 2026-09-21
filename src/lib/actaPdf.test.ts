import { describe, expect, it } from "vitest"
import { generarActaPdf } from "@/lib/actaPdf"
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
      grupo: "GRUPO_1",
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
      grupo: "GRUPO_1",
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
      paradasAbiertas: [],
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
