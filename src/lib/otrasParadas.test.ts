import { describe, expect, it } from "vitest"
import type { TipoParadaEditable } from "@/lib/paradasCatalogo"
import { codigoMuestra, gruposOtrasParadas, parecidas, siguienteSecuencia, tipoNuevo } from "./otrasParadas"

const t = (codigo: string, nombre: string, familia: TipoParadaEditable["familia"], prefijo: string, secuencia: number | null, activo = true): TipoParadaEditable => ({
  codigo,
  nombre,
  clase: familia === "PROGRAMADA" ? "PROGRAMADA" : "NO_PROGRAMADA",
  familia,
  tiempoGuiaMin: null,
  prefijoPlanilla: prefijo,
  secuenciaPlanilla: secuencia,
  activo,
})

const tipos = [
  t("CAMBIO_LOTE", "Cambio de Lote", "PROGRAMADA", "PP", null),
  t("VENTAS", "Disponibilidad de Ventas", "EXTERNA", "LNPE", 1),
  t("INSUMOS", "Falta de Insumos/Paletas", "EXTERNA", "LNPE", 2),
  t("FERIADO", "Feriado", "EXTERNA", "LNPE", 6, false),
  t("DESVASE", "Desvase de Producto", "OPERACIONAL", "OP", 1),
  t("POR_CLASIFICAR", "Parada por clasificar", "OPERACIONAL", "", null),
  t("MORDAZA", "Mordaza", "EQUIPO", "A3F", 3),
]

describe("gruposOtrasParadas", () => {
  it("agrupa por prefijo, sin las de equipo ni las especiales, y siempre ofrece el ocioso", () => {
    const g = gruposOtrasParadas(tipos)
    expect(g.map((x) => x.clave)).toEqual(["PP", "LNPE", "OP", "OCIOSO"])
    expect(g[1].nombre).toBe("Línea no programada (LNPE)")
    expect(g[1].cuenta).toMatch(/ocioso/)
    expect(g[3].tipos).toEqual([])
  })

  it("sin inactivas, si no se piden", () => {
    expect(gruposOtrasParadas(tipos, false)[1].tipos.map((x) => x.codigo)).toEqual(["VENTAS", "INSUMOS"])
  })
})

describe("número y código", () => {
  const [pp, lnpe, , ocioso] = gruposOtrasParadas(tipos)
  it("sigue al mayor del grupo, también contando inactivas; PP no numera", () => {
    expect(siguienteSecuencia(lnpe)).toBe(7)
    expect(siguienteSecuencia(pp)).toBeNull()
  })
  it("muestra el código de la Línea 1", () => {
    expect(codigoMuestra(lnpe, 7)).toBe("LNPEL1-7")
    expect(codigoMuestra(pp, null)).toBe("PPL1")
    expect(codigoMuestra(ocioso, null)).toBe("Sin código")
  })
  it("arma el tipo nuevo con clase de la familia y código interno único", () => {
    const nuevo = tipoNuevo(lnpe, "  Falta de  Insumos/Paletas ", 30, tipos)
    expect(nuevo).toMatchObject({ familia: "EXTERNA", clase: "NO_PROGRAMADA", prefijoPlanilla: "LNPE", secuenciaPlanilla: 7, tiempoGuiaMin: null, lineas: [] })
    expect(nuevo.nombre).toBe("Falta de Insumos/Paletas")
    expect(tipoNuevo(pp, "Cambio de lote", 15, tipos)).toMatchObject({ codigo: "CAMBIO_DE_LOTE", clase: "PROGRAMADA", tiempoGuiaMin: 15 })
    expect(tipoNuevo(lnpe, "Ventas", null, [...tipos, t("VENTAS", "x", "EXTERNA", "LNPE", 9)]).codigo).toBe("VENTAS_2")
  })
})

it("parecidas encuentra por palabra que dice algo, sin tildes", () => {
  expect(parecidas("Sin paletas", tipos).map((x) => x.codigo)).toEqual(["INSUMOS"])
  expect(parecidas("Sin la", tipos)).toEqual([])
  expect(parecidas("mordaza", tipos)).toEqual([])
})
