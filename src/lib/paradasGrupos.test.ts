import { describe, expect, it } from "vitest"
import { agruparTipos } from "@/lib/paradasGrupos"
import type { FamiliaParada } from "@/lib/paradas"
import type { EquipoParada } from "@/lib/paradasEquipos"

const equipos = [
  { codigo: "HELIX", nombre: "Helix", activo: true, lineas: [] },
  { codigo: "A3_FLEX", nombre: "A3 Flex", activo: true, lineas: [] },
] as EquipoParada[]

const t = (nombre: string, familia: FamiliaParada, equipoCodigo: string | null = null) => ({ nombre, familia, equipoCodigo })

describe("agruparTipos", () => {
  const grupos = agruparTipos(
    [
      t("Descanso legal", "PROGRAMADA"),
      t("Sin motivo", "OCIOSO"),
      t("Atasco de la Cadena", "EQUIPO", "HELIX"),
      t("Falta de Vapor", "SUMINISTRO", "CALDERA"),
      t("Baja Presión de Agua Dura", "SUMINISTRO", "HIDRO"),
      t("Ajuste de Volumen", "EQUIPO", "A3_FLEX"),
      t("Nivel del BTD", "EQUIPO_PROCESO", "FLEX_DRINK"),
      t("Feriado", "EXTERNA"),
      t("Caída de Envases", "EQUIPO", "HELIX"),
    ],
    equipos,
  )

  it("ordena: programada, externa, suministro, equipo de proceso, un grupo por equipo y ocioso al final", () => {
    expect(grupos.map((g) => g.titulo)).toEqual([
      "Programada",
      "Línea no programada (LNPE)",
      "Suministro (S)",
      "Equipo de Proceso (EP)",
      "Helix",
      "A3 Flex",
      "Tiempo ocioso",
    ])
  })

  it("Suministro junta varios equipos en un solo grupo", () => {
    expect(grupos.find((g) => g.clave === "FAM:SUMINISTRO")?.tipos.map((x) => x.nombre)).toEqual([
      "Falta de Vapor",
      "Baja Presión de Agua Dura",
    ])
  })

  it("cada equipo de línea tiene su propio grupo, respetando el orden de entrada", () => {
    expect(grupos.find((g) => g.clave === "EQ:HELIX")?.tipos.map((x) => x.nombre)).toEqual(["Atasco de la Cadena", "Caída de Envases"])
  })
})
