import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
// El correo de mantenimiento no es de este test.
vi.mock("./CorreoMantenimiento", () => ({ CorreoMantenimiento: () => null }))

import { AjustesDuena } from "./AjustesDuena"

beforeEach(() => {
  rpc.mockReset()
  // Todos los ajustes arrancan apagados; guardar sale bien.
  rpc.mockImplementation((funcion: string) => Promise.resolve({ data: funcion.startsWith("guardar_") ? null : false, error: null }))
})

/** El renglón de un interruptor, por su título. */
function renglon(titulo: string) {
  return screen.getByText(titulo).closest("div") as HTMLElement
}

describe("AjustesDuena", () => {
  it("el interruptor de la preparación con PLC pide confirmar y guarda", async () => {
    const user = userEvent.setup()
    render(<AjustesDuena usuario="duena" />)
    expect(rpc).toHaveBeenCalledWith("preparacion_plc_area_activo", { p_area_codigo: "ASEPTICO" })

    const fila = renglon("Preparación con PLC (Aséptico)")
    await waitFor(() => expect(within(fila).getByText("Apagado · el supervisor escribe los kits")).toBeInTheDocument())

    await user.click(within(fila).getByRole("switch"))
    expect(
      within(fila).getByText(
        "Desde ahora Preparación toma del PLC los kits y los ajustes de agua; el supervisor solo elige sabor y lote. Hazlo con el bridge funcionando y el usuario plc-bridge con su clave. ¿Encender?",
      ),
    ).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith("guardar_preparacion_plc", expect.anything())

    await user.click(within(fila).getByRole("button", { name: "Sí, encender" }))
    expect(rpc).toHaveBeenCalledWith("guardar_preparacion_plc", { p_usuario: "duena", p_area_codigo: "ASEPTICO", p_activo: true })
    await waitFor(() => expect(within(fila).getByText("Encendido · los kits y ajustes llegan del PLC")).toBeInTheDocument())

    // Apagar avisa que se descartan las cargas sin registrar.
    await user.click(within(fila).getByRole("switch"))
    expect(
      within(fila).getByText("Preparación vuelve al formulario manual y las cargas del PLC que no se registraron se descartan. ¿Apagar?"),
    ).toBeInTheDocument()
  })
})
