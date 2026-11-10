import { describe, expect, it } from "vitest"
import { seccionesConDatos, TODAS } from "@/components/indicadores/seccionesConDatos"
import { mesVacio } from "@/lib/indicadores/tipos"

const pres = { corrio: true, prod: 100, plan: 120, merma: 2, paradas: [] }

describe("seccionesConDatos", () => {
  it("mientras calcula, todas", () => {
    expect(seccionesConDatos(null, "AUTO", null)).toEqual(TODAS)
  })

  it("solo las pantallas con algo que mostrar", () => {
    const datos = { ...mesVacio(), eficiencia: { "1": 80 }, presentaciones: { "2|1000": pres } }
    expect(seccionesConDatos(datos, "MANUAL", null)).toEqual(["1", "2"])
  })

  it("semielaborado, ausentismo e incidencias", () => {
    const datos = { ...mesVacio(), semielaborado: { Clasicos: 99.5, Selecto: null } }
    const aMano = { ...mesVacio(), ausentismo: null, incidencias: [{ titulo: "x" }] } as never
    expect(seccionesConDatos(datos, "AUTO", aMano)).toEqual(["semi", "inc"])
  })

  it("incidencias: alcanza con los días sin incidentes", () => {
    expect(seccionesConDatos(mesVacio(), "AUTO", { ...mesVacio(), diasSinIncidentes: 0 })).toEqual(["inc"])
    expect(seccionesConDatos(mesVacio(), "AUTO", { ...mesVacio(), diasSinIncidentes: null })).toEqual([])
  })
})

describe("seccionesConDatos — Vacío", () => {
  const vacio = (eficiencia: number | null, cajas: number | null) => ({
    ...mesVacio(),
    vacio: { eficiencia, presentaciones: { "AL-340": { cajas, cajasPlan: null, mermaEmpaque: null, mermaSemi: null, paradas: [] } } },
  })

  it("aparece solo si hay algo cargado a mano, aunque el mes sea automático", () => {
    expect(seccionesConDatos(mesVacio(), "AUTO", vacio(86, null))).toEqual(["vacio"])
    expect(seccionesConDatos(mesVacio(), "AUTO", vacio(null, 9640))).toEqual(["vacio"])
    expect(seccionesConDatos(mesVacio(), "AUTO", vacio(null, null))).toEqual([])
    expect(seccionesConDatos(mesVacio(), "AUTO", mesVacio())).toEqual([])
  })
})
