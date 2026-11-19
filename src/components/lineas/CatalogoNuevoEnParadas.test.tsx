import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FormParadaLinea } from "@/components/lineas/FormParadaLinea"
import { FormTerminarParada } from "@/components/lineas/FormTerminarParada"
import { PanelParadasLinea } from "@/components/lineas/PanelParadasLinea"
import type { Parada } from "@/lib/paradas"

/*
 * La apertura envía la falla junto con la parada. Al corregirla, Mantenimiento
 * usa el ID de la parada existente.
 */

const asignarFallaParada = vi.fn()
const terminarParada = vi.fn()
const anotarParada = vi.fn()
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
  asignarFallaParada: (...a: unknown[]) => asignarFallaParada(...a),
  leerFallasDeParadas: async () => new Map([["p1", { fallaProduccionId: "f1", fallaFinalId: null }]]),
}))
vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  terminarParada: (...a: unknown[]) => terminarParada(...a),
  anotarParada: (...a: unknown[]) => anotarParada(...a),
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
vi.mock("@/lib/paradasCatalogo", () => ({ useCatalogoParadas: () => [], useTiposActivos: () => [] }))
vi.mock("@/lib/mttoCatalogo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mttoCatalogo")>()),
  useCatalogoMtto: () => ({ equipos: [], subsistemas: [], cargando: false, recargar: async () => {} }),
}))

beforeEach(() => {
  asignarFallaParada.mockReset().mockResolvedValue({ ok: true })
  terminarParada.mockReset().mockResolvedValue({ ok: true })
  anotarParada.mockReset().mockResolvedValue({ ok: true })
})

describe("Parar con el catálogo nuevo", () => {
  it("envía la falla de Producción en la misma solicitud que la pausa", async () => {
    const pausar = vi.fn().mockResolvedValue({ ok: true })
    const onCerrar = vi.fn()
    render(<FormParadaLinea corridaId="c1" lineaCodigo="LINEA_2" areaCodigo="ASEPTICO" presentacionMl={1000} pausar={pausar} onCerrar={onCerrar} />)
    await userEvent.click(screen.getByText("Elegir falla"))
    await userEvent.type(screen.getByRole("textbox"), "Bajó la presión")
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    expect(pausar).toHaveBeenCalledExactlyOnceWith("c1", expect.objectContaining({
      tipoCodigo: "FALLA_EQUIPO", responsable: "POR_DEFINIR", fallaId: "f1", operacionId: expect.any(String),
    }))
    expect(onCerrar).toHaveBeenCalled()
  })

  it("si se pierde la respuesta, reintenta con el mismo ID de operación", async () => {
    const pausar = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue({ ok: true })
    const onCerrar = vi.fn()
    render(<FormParadaLinea corridaId="c1" lineaCodigo="LINEA_2" areaCodigo="ASEPTICO" presentacionMl={1000} responsableFijo="OPERACIONAL" pausar={pausar} onCerrar={onCerrar} />)
    await userEvent.click(screen.getByText("Elegir falla"))
    await userEvent.type(screen.getByRole("textbox"), "x")
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument()
    expect(onCerrar).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    expect(pausar).toHaveBeenCalledTimes(2)
    expect(pausar.mock.calls[1]).toEqual(pausar.mock.calls[0])
    expect(onCerrar).toHaveBeenCalled()
  })
})

it("retoma la cobertura desde el tramo sin confirmar aunque cambien los huecos", async () => {
  const ubicar = vi.fn().mockReturnValue([
    { inicio: "2026-10-31T10:00:00", fin: "2026-10-31T10:10:00" },
    { inicio: "2026-10-31T10:20:00", fin: "2026-10-31T10:30:00" },
  ])
  anotarParada.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error("sin red"))
  render(<PanelParadasLinea lineaCodigo="LINEA_2" nombreLinea="Línea 2" areaCodigo="ASEPTICO"
    usuario="mtto1" presentacionMl={1000} pendientes={[]} esMantenimiento
    cubrir={{ faltaMin: 20, ubicar }} onCambio={async () => {}} onCerrar={() => {}} />)
  await userEvent.click(screen.getByRole("button", { name: "Elegir falla" }))
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }))
  await screen.findByText(/No se pudo conectar/)
  ubicar.mockReturnValue([])
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }))
  expect(anotarParada).toHaveBeenCalledTimes(3)
  const [primero, segundo, reintento] = anotarParada.mock.calls
  expect(primero[1].fallaId).toBe("f1")
  expect(segundo[1].operacionId).not.toBe(primero[1].operacionId)
  expect(reintento).toEqual(segundo)
  expect(await screen.findByText(/Cubierto/)).toBeInTheDocument()
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
