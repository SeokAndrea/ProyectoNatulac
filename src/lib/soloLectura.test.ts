import { afterEach, describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import type { RolCodigo } from "@/lib/catalogos"
import { esSoloLectura, esSoloVista } from "@/lib/rolVista"
import { fijarSoloLectura, rpcBloqueada } from "@/lib/soloLectura"

function sesion(rol: RolCodigo, permisos: Session["permisos"] = []): Session {
  return { username: "prueba", nombre: "Prueba", cedula: null, area: "ASEPTICO", rol, esDueno: false, permisos, debeCompletarPerfil: false }
}
const visibles = (s: Session) => apps.filter((a) => puedeVerApp(s, a)).map((a) => a.slug)

describe("candado de solo lectura", () => {
  afterEach(() => fijarSoloLectura(false))

  it("apagado no bloquea nada", () => {
    expect(rpcBloqueada("iniciar_turno")).toBe(false)
  })

  it("prendido deja las lecturas y bloquea las escrituras", () => {
    fijarSoloLectura(true)
    expect(rpcBloqueada("listar_paradas")).toBe(false)
    expect(rpcBloqueada("turno_json")).toBe(false)
    expect(rpcBloqueada("completar_primer_ingreso")).toBe(false)
    expect(rpcBloqueada("iniciar_turno")).toBe(true)
    expect(rpcBloqueada("registrar_parada")).toBe(true)
    expect(rpcBloqueada("validar_turno")).toBe(true)
    expect(rpcBloqueada("registrar_acta")).toBe(true)
  })
})

describe("apps del rol que solo mira", () => {
  it("Solo Vista ve los dos paneles y nada más", () => {
    expect(visibles(sesion("VISTA")).sort()).toEqual(["panel-paradas", "panel-produccion"])
  })

  it("con el puesto Solo Vista: los dos paneles y solo lectura", () => {
    const s = { ...sesion("VISTA", ["REPORTES_PARADAS_VER"]), puestoId: "p-sv", puestoCodigo: "SOLO_VISTA" }
    expect(esSoloVista(s)).toBe(true)
    expect(esSoloLectura(s)).toBe(true)
    expect(visibles(s).sort()).toEqual(["panel-paradas", "panel-produccion"])
  })

  it("un puesto nuevo con rol equivalente VISTA y permisos NO es Solo Vista: ve sus tarjetas y guarda", () => {
    const s = { ...sesion("VISTA", ["LECTURAS_SI", "REPORTES_PARADAS_VER"]), area: null, puestoId: "p-aux", puestoCodigo: "AUXILIAR_DE_ALMACEN" }
    expect(esSoloVista(s)).toBe(false)
    expect(esSoloLectura(s)).toBe(false)
    const v = visibles(s)
    expect(v).toEqual(expect.arrayContaining(["servicios-industriales", "reportes-paradas"]))
    fijarSoloLectura(esSoloLectura(s))
    expect(rpcBloqueada("registrar_lectura_servicios_industriales")).toBe(false)
  })

  it("«Ver como» el puesto Solo Vista deja la vista de solo lectura aunque quien mira sea la dueña", () => {
    const s = { ...sesion("VISTA"), puestoId: "p-sv", puestoCodigo: "SOLO_VISTA", esDueno: false }
    expect(esSoloLectura(s)).toBe(true)
  })
})
