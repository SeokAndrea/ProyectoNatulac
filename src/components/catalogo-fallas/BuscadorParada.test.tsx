import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { BuscadorParada } from "./BuscadorParada"

/*
 * «Falla nueva» (migración 20261114890000): un enlace pequeño bajo el selector
 * de Equipo que elige la falla reservada de ese equipo, o la «Parada nueva» de
 * un grupo de «Otras paradas». Sin equipo elegido pide elegirlo.
 */

// «Equipo no listado» se creó primero (en la migración): en el desplegable igual va al final.
const CATALOGO = {
  equipos: [
    { id: "enl", sufijo: "ENL", nombre: "Equipo no listado", tipo: "SERVICIOS", activo: true, lineas: [], reservada: true },
    { id: "cf", sufijo: "CF", nombre: "Compact Flex", tipo: "LINEA", activo: true, lineas: ["l1"] },
  ],
  sistemas: [
    { id: "gen-enl", equipoId: "enl", sufijo: "GEN", nombre: "General", activo: true, reservada: true },
    { id: "sup", equipoId: "cf", sufijo: "SUP", nombre: "Superestructura", activo: true },
    { id: "gen", equipoId: "cf", sufijo: "GEN", nombre: "General", activo: true, reservada: true },
  ],
  subsistemas: [
    { id: "sin-enl", sistemaId: "gen-enl", sufijo: "SIN", nombre: "Sin clasificar", codigoSheet: null, activo: true, reservada: true },
    { id: "cam", sistemaId: "sup", sufijo: "CAM", nombre: "Cámara aséptica", codigoSheet: null, activo: true },
    { id: "sin", sistemaId: "gen", sufijo: "SIN", nombre: "Sin clasificar", codigoSheet: null, activo: true, reservada: true },
  ],
  fallas: [
    { id: "nueva-enl", subsistemaId: "sin-enl", numero: 1, nombre: "Falla nueva", clase: "NO_PROGRAMADA", activo: true, codigo: "ENL-GEN-SIN-01", reservada: true },
    { id: "f1", subsistemaId: "cam", numero: 1, nombre: "Baja presión", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-01" },
    { id: "nueva-cf", subsistemaId: "sin", numero: 1, nombre: "Falla nueva", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-GEN-SIN-01", reservada: true },
  ],
}

const TIPOS = [
  { codigo: "CAMBIO_SABOR", nombre: "Cambio de Sabor", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 25, prefijoPlanilla: "PP", secuenciaPlanilla: null, codigoConLinea: true },
  { codigo: "PARADA_NUEVA_LNPE", nombre: "Parada nueva · LNPE", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 99, codigoConLinea: true },
]

vi.mock("@/lib/catalogoFallas/useCatalogoFallas", () => ({ useCatalogoFallas: () => ({ catalogo: CATALOGO, cargando: false }) }))
vi.mock("@/lib/catalogosLive", () => ({ useCatalogosLive: () => ({ lineasTodas: [{ id: "l1", codigo: "LINEA_1" }] }) }))
vi.mock("@/lib/paradasCatalogo", () => ({ useTiposActivos: () => TIPOS }))
vi.mock("@/lib/paradasEquipos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradasEquipos")>()),
  useEquiposParadas: () => [],
}))

function montar() {
  const onElegir = vi.fn()
  render(<BuscadorParada lineaCodigo="LINEA_1" area="ASEPTICO" onElegir={onElegir} />)
  return onElegir
}

describe("«Falla nueva» en el buscador", () => {
  it("con un equipo elegido, elige la falla reservada de ese equipo", async () => {
    const onElegir = montar()
    await userEvent.selectOptions(screen.getByLabelText("Equipo"), "cf")
    await userEvent.click(screen.getByRole("button", { name: "Falla nueva" }))
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ falla: expect.objectContaining({ falla: expect.objectContaining({ id: "nueva-cf" }) }) }))
    // Queda como una falla elegida, con su equipo y subsistema.
    expect(screen.getByText(/Sin clasificar · Compact Flex/)).toBeInTheDocument()
    expect(screen.getByText("CF-GEN-SIN-01")).toBeInTheDocument()
  })

  it("sin equipo elegido no elige nada y pide elegirlo", async () => {
    const onElegir = montar()
    await userEvent.click(screen.getByRole("button", { name: "Falla nueva" }))
    expect(onElegir).not.toHaveBeenCalled()
    expect(screen.getByRole("status")).toHaveTextContent(/Elige primero el equipo/)
  })

  it("el aviso de elegir equipo se va al elegir uno", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Falla nueva" }))
    await userEvent.selectOptions(screen.getByLabelText("Equipo"), "cf")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("con «Otras paradas» el enlace dice «Parada nueva» y muestra la de cada grupo", async () => {
    const onElegir = montar()
    await userEvent.selectOptions(screen.getByLabelText("Equipo"), "__otras")
    await userEvent.click(screen.getByRole("button", { name: "Parada nueva" }))
    expect(screen.queryByText("Cambio de Sabor")).toBeNull()
    await userEvent.click(screen.getByText("Parada nueva · LNPE"))
    expect(onElegir).toHaveBeenCalledWith({ tipo: expect.objectContaining({ codigo: "PARADA_NUEVA_LNPE" }) })
  })

  it("el desplegable de equipo deja «Equipo no listado» al final", async () => {
    montar()
    const opciones = screen.getByLabelText("Equipo").querySelectorAll("option")
    expect([...opciones].map((o) => o.textContent)).toEqual(["Todos los equipos", "Compact Flex", "Equipo no listado", "Otras paradas (no son de equipo)"])
  })

  it("con «Equipo no listado» elegido, «Falla nueva» elige la de ese equipo", async () => {
    const onElegir = montar()
    await userEvent.selectOptions(screen.getByLabelText("Equipo"), "enl")
    await userEvent.click(screen.getByRole("button", { name: "Falla nueva" }))
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ falla: expect.objectContaining({ falla: expect.objectContaining({ id: "nueva-enl" }) }) }))
  })
})
