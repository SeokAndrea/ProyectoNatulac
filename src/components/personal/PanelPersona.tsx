import { useState } from "react"
import { Loader2, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PuestoEstructura } from "@/lib/estructura"
import { PERMISOS, type Permiso } from "@/lib/permisos"
import {
  agregarPersonal,
  desactivarPersonal,
  editarPersonal,
  eliminarPersonal,
  guardarPermisosExtra,
  reactivarPersonal,
  restablecerPassword,
  type PersonalRegistrado,
  type PuestoAsignable,
} from "@/lib/personal"
import { useAccion } from "@/lib/useAccion"
import { EditorPermisosExtra } from "./EditorPermisosExtra"

const nombrePermiso = (codigo: Permiso) => PERMISOS.find((p) => p.codigo === codigo)?.nombre ?? codigo

/**
 * Panel de la derecha (pantalla completa en el teléfono): una persona para
 * ver, editar o crear (persona null). Si la base dice que no se puede
 * gestionar, queda de solo lectura y sin botones.
 */
export function PanelPersona({
  persona,
  usuarioSesion,
  pagina,
  asignables,
  puestos,
  ofrecibles,
  extrasActuales,
  puedeEliminar,
  nombreArea,
  errorInicial,
  onCerrar,
  onCambio,
}: {
  persona: PersonalRegistrado | null
  usuarioSesion: string
  pagina: string
  asignables: PuestoAsignable[]
  /** null = no se pudo leer la estructura. */
  puestos: PuestoEstructura[] | null
  /** Permisos que tiene quien edita: los únicos que puede dar como extra. */
  ofrecibles: Permiso[]
  extrasActuales: Permiso[]
  puedeEliminar: boolean
  nombreArea: string
  onCerrar: () => void
  /** Aviso que llega al reabrir el panel tras un guardado a medias. */
  errorInicial?: string | null
  /** Después de guardar, (des)activar o eliminar: recargar la lista. Con abrirId el panel queda abierto en esa persona. */
  onCambio: (opciones?: { abrirId?: string; error?: string }) => void
}) {
  const esNueva = persona === null
  const soloLectura = !esNueva && !persona.gestionable
  // La propia cuenta: se editan nombre, cédula y título; el puesto y los extras los cambia otra
  // persona, y no se ofrece desactivarse ni eliminarse (la dueña no podría volver a entrar).
  const esPropia = !esNueva && persona.usuario.toLowerCase() === usuarioSesion.toLowerCase()
  const puestoFijo = soloLectura || esPropia
  const [puestoId, setPuestoId] = useState(persona?.puestoId ?? "")
  const [titulo, setTitulo] = useState(persona?.titulo ?? "")
  const [nombre, setNombre] = useState(persona?.nombre ?? "")
  const [cedula, setCedula] = useState(persona?.cedula ?? "")
  const [usuario, setUsuario] = useState("")
  const [clave, setClave] = useState("")
  const [extras, setExtras] = useState<Set<Permiso>>(() => new Set(extrasActuales))
  const [confirmar, setConfirmar] = useState<"eliminar" | "desactivar" | null>(null)
  const [nuevaClave, setNuevaClave] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [verInicial, setVerInicial] = useState(true)
  const { enviando, error, setError, ejecutar } = useAccion()

  // El puesto de la persona puede no estar entre los asignables (ej. se lo dio alguien más alto): se muestra igual.
  const opciones =
    persona && !asignables.some((a) => a.puestoId === persona.puestoId)
      ? [{ puestoId: persona.puestoId, nombre: persona.puesto }, ...asignables]
      : asignables
  const puestoDe = puestos?.find((p) => p.id === puestoId) ?? null
  const permisosPuesto = new Set<Permiso>(puestoDe?.permisos ?? [])
  const extrasOriginales = new Set(extrasActuales)
  const extrasCambiaron = extras.size !== extrasOriginales.size || [...extras].some((p) => !extrasOriginales.has(p))
  // Los extra que ya están en el puesto sobran: no se ofrecen.
  const ofrecidos = ofrecibles.filter((p) => !permisosPuesto.has(p))
  const bloqueados = extrasActuales.filter((p) => !permisosPuesto.has(p))

  function cambiarExtra(permiso: Permiso, marcado: boolean) {
    setExtras((prev) => {
      const nuevo = new Set(prev)
      if (marcado) nuevo.add(permiso)
      else nuevo.delete(permiso)
      return nuevo
    })
  }

  async function guardar() {
    setAviso(null)
    const nombreLimpio = nombre.trim()
    if (!puestoId) return setError("Elige un puesto.")
    if (!nombreLimpio) return setError("Escribe el nombre.")
    if (esNueva && (!usuario.trim() || !clave)) return setError("Escribe el usuario y la contraseña inicial.")
    setVerInicial(false)
    let id = persona?.id ?? ""
    let parcial: string | null = null
    const ok = await ejecutar(async () => {
      if (esNueva) {
        const r = await agregarPersonal(
          usuarioSesion,
          { usuario: usuario.trim(), password: clave, puestoId, nombre: nombreLimpio, cedula: cedula.trim() || null, titulo: titulo.trim() || null },
          pagina,
        )
        if (!r.ok) return r
        id = r.id
      } else {
        const r = await editarPersonal(usuarioSesion, id, { nombre: nombreLimpio, cedula: cedula.trim() || null, puestoId, titulo: titulo.trim() || null }, pagina)
        if (!r.ok) return r
      }
      if (!esPropia && (extrasCambiaron || (esNueva && extras.size > 0))) {
        // Lo anterior ya se guardó: si esto falla, se avisa pero la lista igual se actualiza.
        try {
          const r = await guardarPermisosExtra(usuarioSesion, id, [...extras], pagina)
          if (!r.ok) parcial = r.error
        } catch {
          parcial = "No se pudo conectar."
        }
      }
      return { ok: true as const }
    })
    if (!ok) return
    if (parcial) {
      onCambio({
        abrirId: id,
        error: esNueva ? `La persona se creó, pero no se guardaron los permisos extra: ${parcial}` : `Se guardaron los datos, pero no los permisos extra: ${parcial}`,
      })
      return
    }
    onCambio()
  }

  async function cambiarActivo() {
    if (!persona) return
    const ok = await ejecutar(async () => {
      const hecho = persona.activo
        ? await desactivarPersonal(usuarioSesion, persona.id, pagina)
        : await reactivarPersonal(usuarioSesion, persona.id, pagina)
      return hecho ? { ok: true as const } : { ok: false as const, error: "No se pudo cambiar. Intenta de nuevo." }
    })
    setConfirmar(null)
    if (ok) onCambio()
  }

  async function eliminar() {
    if (!persona) return
    const ok = await ejecutar(() => eliminarPersonal(usuarioSesion, persona.id, false, pagina))
    setConfirmar(null)
    if (ok) onCambio()
  }

  async function poner() {
    if (!persona || !nuevaClave) return
    const ok = await ejecutar(async () =>
      (await restablecerPassword(usuarioSesion, persona.id, nuevaClave, pagina))
        ? { ok: true as const }
        : { ok: false as const, error: "No se pudo restablecer la contraseña." },
    )
    if (ok) {
      setNuevaClave(null)
      setAviso("Contraseña restablecida. La persona la cambia al entrar.")
    }
  }

  const titulo_ = esNueva ? "Nueva persona" : persona.nombre

  return (
    <aside
      aria-label={esNueva ? "Nueva persona" : `Editar ${persona.nombre}`}
      className="flex flex-col rounded-xl border border-border bg-card max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:overflow-y-auto max-lg:rounded-none lg:sticky lg:top-4 lg:w-96 lg:shrink-0 xl:w-[26rem]"
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{esNueva ? `Nueva · ${nombreArea}` : soloLectura ? "Solo para ver" : "Editar persona"}</p>
          <h2 className="truncate text-lg font-semibold text-foreground">{titulo_}</h2>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {soloLectura && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            <Lock className="size-4 shrink-0" />
            No puedes editar a esta persona.
          </p>
        )}

        <Campo etiqueta="Puesto" id="pp-puesto">
          {puestoFijo ? (
            <Lectura>{persona?.puesto}</Lectura>
          ) : (
            <Select value={puestoId} onValueChange={(v) => { setPuestoId(v); setError(null) }}>
              <SelectTrigger id="pp-puesto" aria-label="Puesto" className="h-11 w-full text-base">
                <SelectValue placeholder="Elige un puesto" />
              </SelectTrigger>
              <SelectContent>
                {opciones.map((o) => (
                  <SelectItem key={o.puestoId} value={o.puestoId}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Campo>

        <Campo etiqueta="Título visible" id="pp-titulo">
          {soloLectura ? <Lectura>{persona.titulo ?? "—"}</Lectura> : <Input id="pp-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Subjefe" className="h-11 text-base" />}
        </Campo>

        <Campo etiqueta="Nombre" id="pp-nombre">
          {soloLectura ? <Lectura>{persona.nombre}</Lectura> : <Input id="pp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11 text-base" />}
        </Campo>

        <Campo etiqueta="Cédula" id="pp-cedula">
          {soloLectura ? <Lectura>{persona.cedula ?? "—"}</Lectura> : <Input id="pp-cedula" value={cedula} inputMode="numeric" onChange={(e) => setCedula(e.target.value)} className="h-11 text-base" />}
        </Campo>

        <Campo etiqueta="Usuario" id="pp-usuario">
          {esNueva ? (
            <Input id="pp-usuario" value={usuario} autoCapitalize="none" onChange={(e) => setUsuario(e.target.value)} className="h-11 text-base" />
          ) : (
            <Lectura>{persona.usuario}</Lectura>
          )}
        </Campo>

        {esNueva && (
          <Campo etiqueta="Contraseña inicial" id="pp-clave">
            <Input id="pp-clave" type="text" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} className="h-11 text-base" />
            <p className="text-xs text-foreground">La persona la cambia en su primer ingreso.</p>
          </Campo>
        )}

        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-foreground">Permisos del puesto</h3>
          {puestos === null ? (
            <p className="text-sm text-foreground">No se pudieron leer los permisos del puesto.</p>
          ) : !puestoDe ? (
            <p className="text-sm text-foreground">Elige un puesto para ver sus permisos.</p>
          ) : puestoDe.todosLosPermisos ? (
            <p className="text-sm text-foreground">Todos los permisos.</p>
          ) : puestoDe.permisos.length === 0 ? (
            <p className="text-sm text-foreground">Este puesto no tiene permisos.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {puestoDe.permisos.map((p) => (
                <li key={p} className="rounded-md bg-muted px-2 py-1 text-sm text-foreground">
                  {nombrePermiso(p)}
                </li>
              ))}
            </ul>
          )}
        </section>

        {esPropia && !soloLectura && (
          <p className="text-sm text-foreground">Tu puesto y tus permisos extra los cambia otra persona.</p>
        )}

        {!esNueva && !puestoFijo && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Permisos extra</h3>
            <EditorPermisosExtra ofrecibles={ofrecidos} seleccion={extras} bloqueados={bloqueados} deshabilitado={enviando} onCambiar={cambiarExtra} />
          </section>
        )}
        {esNueva && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Permisos extra</h3>
            <EditorPermisosExtra ofrecibles={ofrecidos} seleccion={extras} deshabilitado={enviando} onCambiar={cambiarExtra} />
          </section>
        )}
        {puestoFijo && extrasActuales.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Permisos extra</h3>
            <ul className="flex flex-wrap gap-1.5">
              {extrasActuales.map((p) => (
                <li key={p} className="rounded-md bg-muted px-2 py-1 text-sm text-foreground">
                  {nombrePermiso(p)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {!soloLectura && (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          {(error ?? (verInicial ? errorInicial : null)) && <p className="text-sm text-destructive">{error ?? errorInicial}</p>}
          {aviso && <p className="text-sm text-success-foreground">{aviso}</p>}
          <div className="flex gap-2">
            <Button className="h-11 flex-1" onClick={guardar} disabled={enviando}>
              {enviando && <Loader2 className="size-4 animate-spin" />}
              {esNueva ? "Agregar" : "Guardar"}
            </Button>
            <Button variant="outline" className="h-11" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
          </div>

          {!esNueva && (
            <div className="flex flex-col gap-2 border-t border-dashed border-border pt-3">
              {nuevaClave === null ? (
                <button type="button" onClick={() => setNuevaClave("")} className="self-start text-sm font-medium text-info-foreground">
                  Restablecer contraseña
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label="Contraseña nueva" value={nuevaClave} autoComplete="off" onChange={(e) => setNuevaClave(e.target.value)} placeholder="Contraseña nueva" className="h-11 min-w-0 flex-1 text-base" />
                  <Button size="sm" onClick={poner} disabled={enviando || !nuevaClave}>
                    Poner
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setNuevaClave(null)} disabled={enviando}>
                    No
                  </Button>
                </div>
              )}

              {esPropia ? null : confirmar === "desactivar" ? (
                <Confirmacion texto={`¿${persona.activo ? "Desactivar" : "Reactivar"} a ${persona.nombre}?`} si="Sí" onSi={cambiarActivo} onNo={() => setConfirmar(null)} enviando={enviando} peligro={persona.activo} />
              ) : (
                <button type="button" onClick={() => setConfirmar("desactivar")} className={persona.activo ? "self-start text-sm font-medium text-destructive" : "self-start text-sm font-medium text-info-foreground"}>
                  {persona.activo ? "Desactivar" : "Reactivar"}
                </button>
              )}

              {puedeEliminar && !esPropia &&
                (confirmar === "eliminar" ? (
                  <Confirmacion texto="¿Seguro?" si="Sí, eliminar" onSi={eliminar} onNo={() => setConfirmar(null)} enviando={enviando} peligro />
                ) : (
                  <button type="button" onClick={() => setConfirmar("eliminar")} className="self-start text-sm font-medium text-destructive">
                    Eliminar
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

function Campo({ etiqueta, id, children }: { etiqueta: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {etiqueta}
      </label>
      {children}
    </div>
  )
}

function Lectura({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-11 items-center rounded-lg bg-muted px-3 text-base text-foreground">{children}</div>
}

function Confirmacion({ texto, si, onSi, onNo, enviando, peligro }: { texto: string; si: string; onSi: () => void; onNo: () => void; enviando: boolean; peligro: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
      <span className="min-w-0 flex-1">{texto}</span>
      <Button size="sm" variant={peligro ? "destructive" : "default"} onClick={onSi} disabled={enviando}>
        {si}
      </Button>
      <Button size="sm" variant="outline" onClick={onNo} disabled={enviando}>
        No
      </Button>
    </div>
  )
}
