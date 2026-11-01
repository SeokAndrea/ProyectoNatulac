import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { PermisoEstructura, PuestoEstructura } from "@/lib/estructura"

import { MatrizPermisos } from "./MatrizPermisos"

const puesto = (over: Partial<PuestoEstructura>): PuestoEstructura => ({
  id: "x",
  codigo: "x",
  nombre: "X",
  areaCodigo: "MANTENIMIENTO",
  nivel: 3,
  activo: true,
  todosLosPermisos: false,
  personas: 1,
  permisos: [],
  ...over,
})
const PUESTOS = [
  puesto({ id: "tec", nombre: "Técnico de Mantenimiento", nivel: 3 }),
  puesto({ id: "jefe", nombre: "Jefe", nivel: 1, permisos: ["CATALOGO_PARADAS"] }),
  puesto({ id: "sup", nombre: "Supervisor", nivel: 2 }),
]
const PERMISOS: PermisoEstructura[] = [
  { codigo: "CATALOGO_PARADAS", nombre: "Editar Catálogo de Paradas", tema: "PARADAS" },
  { codigo: "SIF_GESTIONAR", nombre: "Gestionar solicitudes de intervención de falla", tema: "MANTENIMIENTO" },
  { codigo: "VALIDAR", nombre: "Validar producción", tema: "DATOS" },
]
const caja = (permiso: string, puesto: string) => screen.getByRole("checkbox", { name: `${permiso} × ${puesto}` })

describe("MatrizPermisos", () => {
  it("marca lo que el puesto tiene y deja libre lo demás", () => {
    render(<MatrizPermisos puestos={PUESTOS} permisos={PERMISOS} onGuardar={vi.fn()} />)
    expect(caja("Editar Catálogo de Paradas", "Jefe")).toBeChecked()
    expect(caja("Editar Catálogo de Paradas", "Técnico de Mantenimiento")).not.toBeChecked()
  })

  it("dos casillas marcadas habilitan «Guardar cambios (2)» y se mandan esos 2 cambios", async () => {
    const onGuardar = vi.fn().mockResolvedValue({ ok: true })
    render(<MatrizPermisos puestos={PUESTOS} permisos={PERMISOS} onGuardar={onGuardar} />)
    expect(screen.getByRole("button", { name: /Guardar cambios \(0\)/ })).toBeDisabled()
    await userEvent.click(caja("Validar producción", "Supervisor"))
    await userEvent.click(caja("Editar Catálogo de Paradas", "Jefe"))
    const boton = screen.getByRole("button", { name: "Guardar cambios (2)" })
    expect(boton).toBeEnabled()
    await userEvent.click(boton)
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar.mock.calls[0][0]).toHaveLength(2)
    expect(onGuardar.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        { puestoId: "sup", permiso: "VALIDAR", activo: true },
        { puestoId: "jefe", permiso: "CATALOGO_PARADAS", activo: false },
      ]),
    )
    expect(await screen.findByText("2 cambios guardados")).toBeInTheDocument()
  })

  it("marcar y desmarcar la misma casilla deja el botón deshabilitado", async () => {
    render(<MatrizPermisos puestos={PUESTOS} permisos={PERMISOS} onGuardar={vi.fn()} />)
    await userEvent.click(caja("Validar producción", "Supervisor"))
    await userEvent.click(caja("Validar producción", "Supervisor"))
    expect(screen.getByRole("button", { name: /Guardar cambios/ })).toBeDisabled()
  })

  it("un puesto con todos los permisos no es columna", () => {
    render(<MatrizPermisos puestos={[...PUESTOS, puesto({ id: "sa", nombre: "Super Administrador", nivel: null, todosLosPermisos: true })]} permisos={PERMISOS} onGuardar={vi.fn()} />)
    expect(screen.queryByText("Super Administrador")).not.toBeInTheDocument()
  })

  it("si la base rechaza, muestra el error y no pierde las marcas", async () => {
    const onGuardar = vi.fn().mockResolvedValue({ ok: false, error: "No puedes dar ese permiso." })
    render(<MatrizPermisos puestos={PUESTOS} permisos={PERMISOS} onGuardar={onGuardar} />)
    await userEvent.click(caja("Validar producción", "Supervisor"))
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios (1)" }))
    expect(await screen.findByText("No puedes dar ese permiso.")).toBeInTheDocument()
    expect(caja("Validar producción", "Supervisor")).toBeChecked()
  })

  it("tras guardar con la lista sin recargar, el contador vuelve a 0 y no se reenvía", async () => {
    const onGuardar = vi.fn().mockResolvedValue({ ok: true })
    render(<MatrizPermisos puestos={PUESTOS} permisos={PERMISOS} onGuardar={onGuardar} />)
    await userEvent.click(caja("Validar producción", "Supervisor"))
    await userEvent.click(caja("Validar producción", "Técnico de Mantenimiento"))
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios (2)" }))
    expect(await screen.findByText("2 cambios guardados")).toBeInTheDocument()
    const boton = screen.getByRole("button", { name: "Guardar cambios (0)" })
    expect(boton).toBeDisabled()
    await userEvent.click(boton)
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(caja("Validar producción", "Supervisor")).toBeChecked()
  })
})
