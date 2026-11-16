import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { CatalogoFallas } from "@/lib/catalogoFallas/tipos"
import { ElegirFallaMtto } from "./ElegirFallaMtto"

/*
 * Catálogo nuevo: la Llenadora tiene «General › Sin clasificar › Falla nueva» (reservado) y un
 * sistema «Dosificación › Válvulas» recién cargado, todavía sin fallas. Al identificar una
 * «Falla nueva» hay que poder llegar a ese subsistema para crearle la primera falla.
 */
const catalogo: CatalogoFallas = {
  equipos: [
    { id: "eq1", sufijo: "LLE", nombre: "Llenadora", tipo: "LINEA", activo: true, lineas: ["l1"] },
    { id: "eq2", sufijo: "OTRA", nombre: "Equipo de otra línea", tipo: "LINEA", activo: true, lineas: ["l2"] },
  ],
  sistemas: [
    { id: "si-gen", equipoId: "eq1", sufijo: "GEN", nombre: "General", activo: true, reservada: true },
    { id: "si-dos", equipoId: "eq1", sufijo: "DOS", nombre: "Dosificación", activo: true },
    { id: "si-off", equipoId: "eq1", sufijo: "OFF", nombre: "Sistema desactivado", activo: false },
  ],
  subsistemas: [
    { id: "su-sc", sistemaId: "si-gen", sufijo: "SC", nombre: "Sin clasificar", codigoSheet: null, activo: true, reservada: true },
    { id: "su-val", sistemaId: "si-dos", sufijo: "VAL", nombre: "Válvulas", codigoSheet: null, activo: true },
  ],
  fallas: [{ id: "f-nueva", subsistemaId: "su-sc", numero: 1, nombre: "Falla nueva", clase: "NO_PROGRAMADA", activo: true, codigo: "LLE-GEN-SC-01", reservada: true }],
}

vi.mock("@/lib/catalogoFallas/useCatalogoFallas", () => ({
  useCatalogoFallas: () => ({ catalogo, cargando: false, recargar: vi.fn() }),
}))
vi.mock("@/lib/catalogosLive", () => ({ useCatalogosLive: () => ({ lineasTodas: [{ id: "l1", codigo: "LINEA_1" }] }) }))
vi.mock("@/lib/catalogoFallas/api", () => ({ agregarFallas: vi.fn() }))

const opciones = (etiqueta: string) =>
  within(screen.getByLabelText(etiqueta))
    .getAllByRole("option")
    .map((o) => o.textContent)

describe("ElegirFallaMtto", () => {
  it("quien puede crear ve los sistemas sin fallas y llega a su subsistema", async () => {
    render(<ElegirFallaMtto lineaCodigo="LINEA_1" fallaProduccionId="f-nueva" usuario="jefe" puedeCrear onCambiar={vi.fn()} />)

    expect(opciones("Equipo")).toEqual(["Elige…", "Llenadora"])
    // Arranca en la «Falla nueva» (General) y Dosificación también está, aunque no tenga fallas; el desactivado no.
    expect(opciones("Sistema")).toEqual(["Elige…", "Dosificación", "General"])

    await userEvent.selectOptions(screen.getByLabelText("Sistema"), "si-dos")
    expect(opciones("Subsistema")).toEqual(["Elige…", "Válvulas"])
    await userEvent.selectOptions(screen.getByLabelText("Subsistema"), "su-val")
    expect(screen.getByLabelText("Falla nueva en este subsistema")).toBeInTheDocument()
  })

  it("quien no puede crear solo ve los sistemas que tienen fallas para elegir", () => {
    render(<ElegirFallaMtto lineaCodigo="LINEA_1" fallaProduccionId="f-nueva" usuario="mtto" puedeCrear={false} onCambiar={vi.fn()} />)
    expect(opciones("Sistema")).toEqual(["Elige…", "General"])
  })
})
