import { afterEach, describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import type { RolCodigo } from "@/lib/catalogos"
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

describe("apps de los roles que solo miran", () => {
  it("Solo Vista ve los dos paneles y nada más", () => {
    expect(visibles(sesion("VISTA")).sort()).toEqual(["panel-paradas", "panel-produccion"])
  })

  it("Sistema de Gestión ve documentos, Programación y los paneles; nada del turno", () => {
    const v = visibles(sesion("GESTION", ["AUDITORIA_VER", "RESUMEN_VER"]))
    expect(v.sort()).toEqual(["auditoria", "mis-actas", "panel-paradas", "panel-produccion", "programacion", "resumen-dia"])
  })
})
