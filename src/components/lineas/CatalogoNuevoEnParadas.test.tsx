import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FormParadaLinea } from "@/components/lineas/FormParadaLinea"
import { FormTerminarParada } from "@/components/lineas/FormTerminarParada"
import type { Parada } from "@/lib/paradas"

/*
 * Parar y Terminar con el catálogo nuevo encendido (migraciones 20261113790000
 * y 20261113890000): la parada va con el tipo genérico y después se le pone
 * la falla (Producción al Parar, Mantenimiento al Terminar).
 */

const asignarFallaRecienRegistrada = vi.fn()
const asignarFallaParada = vi.fn()
const terminarParada = vi.fn()
const opcion = {
  falla: { id: "f1", subsistemaId: "cam", numero: 1, nombre: "Baja presión", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-01" },
  subsistema: { id: "cam", nombre: "Cámara aséptica" },
  sistema: { id: "sup", nombre: "Superestructura" },
  equipo: { id: "cf", nombre: "Compact Flex" },
}

vi.mock("@/lib/catalogoFallas/switch", () => ({ useCatalogoModular: () => true }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { username: "mtto1", esDueno: false, permisos: [], rol: "MANTENIMIENTO" } }) }))
vi.mock("@/lib/catalogoFallas/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogoFallas/paradas")>()),
  asignarFallaRecienRegistrada: (...a: unknown[]) => asignarFallaRecienRegistrada(...a),
  asignarFallaParada: (...a: unknown[]) => asignarFallaParada(...a),
  leerFallasDeParadas: async () => new Map([["p1", { fallaProduccionId: "f1", fallaFinalId: null }]]),
}))
vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  terminarParada: (...a: unknown[]) => terminarParada(...a),
  paradaCruzoTurnoCerrado: async () => false,
}))
// Los buscadores se prueban aparte: acá basta con elegir la falla.
vi.mock("@/components/catalogo-fallas/BuscadorParada", () => ({
  BuscadorParada: ({ onElegir }: { onElegir: (e: unknown) => void }) => (
    <button type="button" onClick={() => onElegir({ falla: opcion })}>
      Elegir falla
    </button>
  ),
}))
vi.mock("@/components/catalogo-fallas/ElegirFallaMtto", () => ({
  ElegirFallaMtto: ({ fallaProduccionId, onCambiar }: { fallaProduccionId: string | null; onCambiar: (o: unknown) => void }) => (
    <button type="button" onClick={() => onCambiar({ ...opcion, falla: { ...opcion.falla, id: "f2", codigo: "CF-LLE-VAL-02" } })}>
      Mantenimiento cambia la falla (Producción dijo {fallaProduccionId})
    </button>
  ),
}))
vi.mock("@/lib/paradasEquipos", () => ({ useEquiposParadas: () => [] }))
vi.mock("@/lib/paradasCatalogo", () => ({ useCatalogoParadas: () => [] }))
vi.mock("@/lib/mttoCatalogo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mttoCatalogo")>()),
  useCatalogoMtto: () => ({ equipos: [], subsistemas: [], cargando: false, recargar: async () => {} }),
}))

beforeEach(() => {
  asignarFallaRecienRegistrada.mockReset().mockResolvedValue({ ok: true })
  asignarFallaParada.mockReset().mockResolvedValue({ ok: true })
  terminarParada.mockReset().mockResolvedValue({ ok: true })
})

describe("Parar con el catálogo nuevo", () => {
  it("pausa con el tipo genérico y después le pone la falla de Producción", async () => {
    const pausar = vi.fn().mockResolvedValue({ ok: true })
    const onCerrar = vi.fn()
    render(<FormParadaLinea corridaId="c1" lineaCodigo="LINEA_2" areaCodigo="ASEPTICO" presentacionMl={1000} pausar={pausar} onCerrar={onCerrar} />)
    await userEvent.click(screen.getByRole("radio", { name: "Mantenimiento" }))
    await userEvent.click(screen.getByText("Elegir falla"))
    await userEvent.type(screen.getByRole("textbox"), "Bajó la presión")
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    expect(pausar).toHaveBeenCalledWith("c1", expect.objectContaining({ tipoCodigo: "FALLA_EQUIPO", responsable: "MANTENIMIENTO" }))
    expect(asignarFallaRecienRegistrada).toHaveBeenCalledWith("mtto1", "LINEA_2", "f1", "Líneas")
    expect(onCerrar).toHaveBeenCalled()
  })

  it("si no se pudo poner la falla, avisa y no deja volver a parar (la parada ya quedó)", async () => {
    asignarFallaRecienRegistrada.mockResolvedValue({ ok: false, error: "sin red" })
    const pausar = vi.fn().mockResolvedValue({ ok: true })
    const onCerrar = vi.fn()
    render(<FormParadaLinea corridaId="c1" lineaCodigo="LINEA_2" areaCodigo="ASEPTICO" presentacionMl={1000} responsableFijo="OPERACIONAL" pausar={pausar} onCerrar={onCerrar} />)
    await userEvent.click(screen.getByText("Elegir falla"))
    await userEvent.type(screen.getByRole("textbox"), "x")
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    expect(await screen.findByText(/quedó registrada, pero sin la falla/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /confirmar parada/i })).toBeDisabled()
    expect(onCerrar).not.toHaveBeenCalled()
  })
})

const parada: Parada = {
  id: "p1",
  clase: "NO_PROGRAMADA",
  origen: "MANUAL",
  responsable: "MANTENIMIENTO",
  lineaCodigo: "LINEA_2",
  turnoTipo: "TURNO_1",
  tipoCodigo: "FALLA_EQUIPO",
  tipoNombre: "Baja presión · Cámara aséptica",
  tiempoGuiaMin: null,
  nota: "Bajó la presión",
  justificacionDesvio: null,
  inicio: "2026-10-31T10:00:00",
  fin: null,
  supervisorNombre: null,
  subsistemaCodigo: null,
  lote: null,
  sabor: null,
  terminadaPor: null,
}

describe("Terminar con el catálogo nuevo (Mantenimiento)", () => {
  it("parte de la falla de Producción, no pide el catálogo viejo y deja la suya como la de Mantenimiento", async () => {
    const onTerminada = vi.fn()
    render(<FormTerminarParada parada={parada} usuario="mtto1" areaCodigo="ASEPTICO" esMantenimiento onTerminada={onTerminada} />)
    const cambiar = await screen.findByText(/Mantenimiento cambia la falla \(Producción dijo f1\)/)
    expect(screen.queryByLabelText(/equipo de mantenimiento/i)).toBeNull()
    await userEvent.click(cambiar)
    await userEvent.type(screen.getByLabelText(/qué se realizó/i), "Se cambió la válvula")
    await userEvent.type(screen.getByLabelText(/minutos/i), "20")
    await userEvent.click(screen.getByRole("button", { name: /terminar parada/i }))
    expect(terminarParada).toHaveBeenCalledWith("mtto1", "p1", expect.objectContaining({ tipoCodigo: "FALLA_EQUIPO", solucion: "Se cambió la válvula" }), "Líneas")
    expect(asignarFallaParada).toHaveBeenCalledWith("mtto1", "p1", "f2", "MANTENIMIENTO", "Líneas")
    expect(onTerminada).toHaveBeenCalled()
  })

  it("sin falla elegida no deja terminar", async () => {
    render(<FormTerminarParada parada={parada} usuario="mtto1" areaCodigo="ASEPTICO" esMantenimiento onTerminada={vi.fn()} />)
    await screen.findByText(/Mantenimiento cambia la falla/)
    await userEvent.type(screen.getByLabelText(/qué se realizó/i), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "20")
    expect(screen.getByRole("button", { name: /terminar parada/i })).toBeDisabled()
  })
})
