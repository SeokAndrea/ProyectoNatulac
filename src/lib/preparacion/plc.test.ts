import { describe, expect, it, vi } from "vitest"
import type { EstadoBridge } from "@/lib/plc/bridge"

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }))

import { kitsDeMedioEnMedio, mapearEstadoPlc, vistaVivaTanque } from "./plc"

/** Como lo devuelve estado_preparacion_plc (migración 20261115990000); PostgREST manda numeric como texto o número. */
const respuesta = {
  habilitado: true,
  tanques: [
    {
      numero_tanque: 1,
      cola: [
        {
          id: "c1",
          numero_tanque: 1,
          estado: "PENDIENTE",
          agua_formula_l: "2000.0",
          kits: "2.5",
          kits_listos: true,
          kits_usados: null,
          iniciada_en: "2026-11-09T10:00:00Z",
          terminada_en: "2026-11-09T10:30:00Z",
          preparacion_id: null,
          ajustes: [
            { id: "a1", litros: "120", iniciado_en: "2026-11-09T10:20:00Z", hecho_en: "2026-11-09T10:22:00Z", sumado: false, no_sumado_motivo: null },
          ],
        },
      ],
      carga_del_lote: null,
      desglose: null,
    },
    {
      numero_tanque: 2,
      cola: [],
      carga_del_lote: {
        id: "c0",
        numero_tanque: 2,
        estado: "CONFIRMADA",
        agua_formula_l: null,
        kits: 3,
        kits_listos: true,
        kits_usados: "3",
        iniciada_en: "2026-11-09T08:00:00Z",
        terminada_en: null,
        preparacion_id: "p2",
        ajustes: null,
      },
      desglose: {
        lote_id: "p2",
        lote: "L-77",
        unidades: "3",
        litros_por_unidad: "200",
        agua_l: "1800",
        resto_l: "0",
        desvase_l: "150.5",
        total_l: "2650.5",
        ajustes: [{ origen: "PLC", litros: "100", creado_en: "2026-11-09T09:00:00Z", detalle: "Ajuste de agua del PLC" }],
      },
    },
  ],
}

describe("mapearEstadoPlc", () => {
  it("mapearEstadoPlc pasa números que llegan como texto y nulls", () => {
    const e = mapearEstadoPlc(respuesta)
    expect(e.habilitado).toBe(true)
    expect(e.tanques).toHaveLength(2)
    const [t1, t2] = e.tanques
    expect(t1.numeroTanque).toBe(1)
    expect(t1.cola[0]).toEqual({
      id: "c1",
      numeroTanque: 1,
      estado: "PENDIENTE",
      aguaFormulaL: 2000,
      kits: 2.5,
      kitsListos: true,
      kitsUsados: null,
      iniciadaEn: "2026-11-09T10:00:00Z",
      terminadaEn: "2026-11-09T10:30:00Z",
      ajustes: [{ id: "a1", litros: 120, iniciadoEn: "2026-11-09T10:20:00Z", hechoEn: "2026-11-09T10:22:00Z", sumado: false, noSumadoMotivo: null }],
    })
    expect(t1.cargaDelLote).toBeNull()
    expect(t1.desglose).toBeNull()
    expect(t2.cargaDelLote?.kitsUsados).toBe(3)
    expect(t2.cargaDelLote?.aguaFormulaL).toBeNull()
    expect(t2.cargaDelLote?.ajustes).toEqual([])
    expect(t2.desglose).toEqual({
      loteId: "p2",
      lote: "L-77",
      unidades: 3,
      litrosPorUnidad: 200,
      aguaL: 1800,
      restoL: 0,
      desvaseL: 150.5,
      totalL: 2650.5,
      ajustes: [{ origen: "PLC", litros: 100, creadoEn: "2026-11-09T09:00:00Z", detalle: "Ajuste de agua del PLC" }],
    })
  })

  it("sin respuesta, deshabilitado y sin tanques", () => {
    expect(mapearEstadoPlc(null)).toEqual({ habilitado: false, tanques: [] })
    expect(mapearEstadoPlc({ habilitado: false, tanques: [] })).toEqual({ habilitado: false, tanques: [] })
    expect(mapearEstadoPlc({ habilitado: true, tanques: null })).toEqual({ habilitado: true, tanques: [] })
  })
})

/** Mensaje del bridge con una preparación en curso en el tanque 2. */
function bridge(cambios: Partial<EstadoBridge> = {}, prep: Partial<NonNullable<EstadoBridge["preparacion"]>> = {}): EstadoBridge {
  return {
    timestamp: "2026-11-09T10:00:00Z",
    fuente: "plc",
    conectado: true,
    tanque_activo: 2,
    setpoint_l: 2000,
    litros_actuales: 300,
    litros_tanque: 1500,
    caudal_l_min: 1200,
    valvulas: { "1": false, "2": true, "3": false },
    auxiliares: { "1": false, "2": false, "3": false },
    llenando: true,
    area: "ASEPTICO",
    preparacion: { activa: true, fase_1: true, fase_2: false, fase_3: false, kits: 0, ajuste_l: 0, ...prep },
    ...cambios,
  }
}

describe("vistaVivaTanque", () => {
  it("vistaVivaTanque: null sin conexión, sin preparación, con otro tanque o con el bridge de otra área", () => {
    expect(vistaVivaTanque(null, 2, "ASEPTICO")).toBeNull()
    expect(vistaVivaTanque(bridge({ conectado: false }), 2, "ASEPTICO")).toBeNull()
    expect(vistaVivaTanque(bridge({ preparacion: null }), 2, "ASEPTICO")).toBeNull()
    expect(vistaVivaTanque(bridge({}, { activa: false }), 2, "ASEPTICO")).toBeNull()
    expect(vistaVivaTanque(bridge(), 1, "ASEPTICO")).toBeNull()
    expect(vistaVivaTanque(bridge({ area: "PRUEBAS" }), 2, "ASEPTICO")).toBeNull()
    expect(vistaVivaTanque(bridge({ area: "PRUEBAS" }), 2, "PRUEBAS")).not.toBeNull()
    expect(vistaVivaTanque(bridge(), 2, "ASEPTICO")).toEqual({
      fase: 1,
      llenando: true,
      aguaFormulaL: 2000,
      litrosAgua: 1500,
      caudalLMin: 1200,
      kits: null,
      ajusteL: null,
      litrosAjuste: null,
    })
  })

  it("sin campo area, solo vale para ASEPTICO", () => {
    const viejo = bridge({ area: undefined })
    expect(vistaVivaTanque(viejo, 2, "ASEPTICO")).not.toBeNull()
    expect(vistaVivaTanque(viejo, 2, null)).not.toBeNull()
    expect(vistaVivaTanque(viejo, 2, "PRUEBAS")).toBeNull()
  })

  it("fase por los booleanos (3 gana a 2 gana a 1)", () => {
    expect(vistaVivaTanque(bridge({}, { fase_1: true, fase_2: true }), 2, "ASEPTICO")?.fase).toBe(2)
    expect(vistaVivaTanque(bridge({}, { fase_1: true, fase_2: true, fase_3: true }), 2, "ASEPTICO")?.fase).toBe(3)
    expect(vistaVivaTanque(bridge({}, { fase_1: false }), 2, "ASEPTICO")?.fase).toBeNull()
  })

  it("litrosAgua usa litros_tanque y si falta litros_actuales", () => {
    expect(vistaVivaTanque(bridge({ litros_tanque: null }), 2, "ASEPTICO")?.litrosAgua).toBe(300)
  })

  it("con ajuste_l > 0, litrosAjuste = litros_actuales", () => {
    const v = vistaVivaTanque(bridge({ litros_actuales: 45 }, { fase_1: false, fase_3: true, kits: 2.5, ajuste_l: 120 }), 2, "ASEPTICO")
    expect(v?.ajusteL).toBe(120)
    expect(v?.litrosAjuste).toBe(45)
    expect(v?.kits).toBe(2.5)
  })

  it("la válvula del tanque marca si está llenando", () => {
    expect(vistaVivaTanque(bridge({ valvulas: { "1": false, "2": false, "3": false }, llenando: false }), 2, "ASEPTICO")?.llenando).toBe(false)
  })
})

describe("kitsDeMedioEnMedio", () => {
  it("kitsDeMedioEnMedio: 2 y 2,5 sí; 2,3 no", () => {
    expect(kitsDeMedioEnMedio(2)).toBe(true)
    expect(kitsDeMedioEnMedio(2.5)).toBe(true)
    expect(kitsDeMedioEnMedio(2.3)).toBe(false)
    expect(kitsDeMedioEnMedio(0)).toBe(false)
    expect(kitsDeMedioEnMedio(-1)).toBe(false)
    expect(kitsDeMedioEnMedio(Number.NaN)).toBe(false)
  })
})
