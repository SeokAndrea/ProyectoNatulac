import { render, screen } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import App from "@/App"

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: { username: "mtto1", area: "MANTENIMIENTO", rol: "MANTENIMIENTO", esDueno: false, permisos: ["PARADAS_MANTENIMIENTO"], debeCompletarPerfil: false } }),
}))
vi.mock("@/pages/Login", () => ({ default: () => <p>login</p> }))
vi.mock("@/pages/PrimerIngreso", () => ({ default: () => <p>primer ingreso</p> }))
vi.mock("@/components/InicioSegunRol", () => ({ InicioSegunRol: () => <p>hub</p> }))
vi.mock("@/components/VersionChecker", () => ({ VersionChecker: () => null }))
vi.mock("@/pages/apps/Lineas", () => ({
  default: function Lineas() {
    const l = useLocation()
    return <p>Líneas {l.pathname}{l.search}</p>
  },
}))

describe("rutas", () => {
  it("el enlace viejo /mantenimiento entra a Líneas en Modo Paradas", async () => {
    render(
      <MemoryRouter initialEntries={["/mantenimiento"]}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText("Líneas /lineas?paradas=1")).toBeInTheDocument()
  })
})
