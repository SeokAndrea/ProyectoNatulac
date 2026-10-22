import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  alVencerSesion,
  avisoSalida,
  fetchConSesion,
  fijarTokenSesion,
  HEADER_SESION,
  limpiarAvisoSalida,
  sesionRechazada,
} from "@/lib/sesionToken"

const BASE = "http://192.168.10.143:4035/api/rpc/listar_lineas"
const STORAGE = "http://192.168.10.143:4035/archivos/actas/a.pdf"

function headerEnviado(espia: ReturnType<typeof vi.fn>): string | null {
  const init = espia.mock.calls[0][1] as RequestInit | undefined
  return new Headers(init?.headers).get(HEADER_SESION)
}

describe("credencial en cada petición", () => {
  let espia: ReturnType<typeof vi.fn>

  beforeEach(() => {
    espia = vi.fn().mockResolvedValue(new Response("{}"))
    vi.stubGlobal("fetch", espia)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fijarTokenSesion(null)
  })

  it("sin sesión no manda credencial", async () => {
    await fetchConSesion(BASE, { headers: { apikey: "k" } })
    expect(headerEnviado(espia)).toBeNull()
  })

  it("con sesión la suma a las peticiones a la base, sin perder los otros headers", async () => {
    fijarTokenSesion("abc")
    await fetchConSesion(BASE, { method: "POST", headers: { apikey: "k" } })
    expect(headerEnviado(espia)).toBe("abc")
    const init = espia.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get("apikey")).toBe("k")
    expect(init.method).toBe("POST")
  })

  it("no la manda a los PDF de actas", async () => {
    fijarTokenSesion("abc")
    await fetchConSesion(STORAGE, {})
    expect(headerEnviado(espia)).toBeNull()
  })

  it("no pisa una credencial puesta a mano (cerrar sesión manda la vieja)", async () => {
    fijarTokenSesion("nueva")
    await fetchConSesion(BASE, { headers: { [HEADER_SESION]: "vieja" } })
    expect(headerEnviado(espia)).toBe("vieja")
  })
})

describe("la base rechaza la credencial", () => {
  afterEach(() => {
    alVencerSesion(null)
    limpiarAvisoSalida()
  })

  it("cierra la sesión y deja el aviso para la pantalla de entrada", () => {
    const cerrar = vi.fn()
    alVencerSesion(cerrar)
    sesionRechazada()
    expect(cerrar).toHaveBeenCalledOnce()
    expect(avisoSalida()).toMatch(/venció/)
    limpiarAvisoSalida()
    expect(avisoSalida()).toBeNull()
  })
})
