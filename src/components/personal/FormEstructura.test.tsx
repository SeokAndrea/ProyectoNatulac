import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AreaEstructura, PuestoEstructura } from "@/lib/estructura"

/*
 * Formularios de Áreas y puestos: el aviso antes de desactivar un área con
 * gente y el rol equivalente del puesto (solo para ver).
 */
const guardarArea = vi.fn()
vi.mock("@/lib/estructura", async (orig) => ({
  ...(await orig<object>()),
  guardarArea: (...a: unknown[]) => guardarArea(...a),
  guardarPuesto: vi.fn(),
}))

import { FormArea } from "./FormArea"
import { FormPuesto } from "./FormPuesto"

const area = (over: Partial<AreaEstructura>): AreaEstructura => ({
  codigo: "ALMACEN", nombre: "Almacén", tipo: "APOYO", activo: true, orden: 9, personas: 0, ...over,
})
const puesto = (over: Partial<PuestoEstructura>): PuestoEstructura => ({
  id: "p1", codigo: "AUX", nombre: "Auxiliar de almacén", areaCodigo: "ALMACEN", nivel: 3, activo: true,
  todosLosPermisos: false, rolEquivalente: "VISTA", personas: 0, permisos: [], ...over,
})

beforeEach(() => {
  guardarArea.mockReset()
  guardarArea.mockResolvedValue({ ok: true })
})

describe("FormArea", () => {
  it("desactivar un área con gente pide confirmar con la cantidad de personas", async () => {
    const onGuardada = vi.fn()
    const user = userEvent.setup()
    render(<FormArea area={area({ personas: 3 })} usuario="local" pagina="/areas-puestos" onCerrar={() => {}} onGuardada={onGuardada} />)
    await user.click(screen.getByRole("checkbox", { name: "Activa" }))
    await user.click(screen.getByRole("button", { name: "Guardar" }))
    expect(screen.getByRole("alert").textContent).toContain("Esta área tiene 3 personas")
    expect(guardarArea).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Sí, desactivar" }))
    expect(guardarArea).toHaveBeenCalledTimes(1)
    expect(onGuardada).toHaveBeenCalledWith("ALMACEN")
  })

  it("un área sin gente se desactiva sin preguntar", async () => {
    const user = userEvent.setup()
    render(<FormArea area={area({ personas: 0 })} usuario="local" pagina="/areas-puestos" onCerrar={() => {}} onGuardada={() => {}} />)
    await user.click(screen.getByRole("checkbox", { name: "Activa" }))
    await user.click(screen.getByRole("button", { name: "Guardar" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(guardarArea).toHaveBeenCalledTimes(1)
  })
})

describe("FormPuesto", () => {
  it("muestra el rol equivalente del puesto, sin poder cambiarlo", () => {
    render(<FormPuesto puesto={puesto({ rolEquivalente: "SUPERVISOR" })} areaCodigo="ALMACEN" nombreArea="Almacén" usuario="local" pagina="/" onCerrar={() => {}} onGuardado={() => {}} />)
    expect(screen.getByText("Rol equivalente")).toBeTruthy()
    expect(screen.getByText("Supervisor")).toBeTruthy()
  })

  it("un puesto nuevo avisa que toma el rol más básico del área", () => {
    render(<FormPuesto puesto={null} areaCodigo="ALMACEN" nombreArea="Almacén" usuario="local" pagina="/" onCerrar={() => {}} onGuardado={() => {}} />)
    expect(screen.getByText("El más básico del área")).toBeTruthy()
  })
})
