import { useMemo, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { MensajeError } from "@/components/MensajeError"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { guardarEquipoMtto, guardarSubsistemaMtto, useCatalogoMtto, type EquipoMtto, type SubsistemaMtto } from "@/lib/mttoCatalogo"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { useAccion } from "@/lib/useAccion"

/*
 * Códigos de Mantenimiento: sus equipos y subsistemas (códigos del Sheet).
 * Catálogo propio, aparte del de Producción. Nada se borra: se desactiva.
 * Lo editan Mantenimiento y la dueña (el servidor lo vuelve a validar) y cada
 * cambio queda en Auditoría. Las paradas ya terminadas guardan el nombre de
 * ese día, así que renombrar no cambia los reportes viejos.
 */

const selectClase =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

export default function CodigosMantenimiento() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  const { equipos, subsistemas, cargando, recargar } = useCatalogoMtto()
  const equiposProduccion = useEquiposParadas()
  const [elegido, setElegido] = useState("")
  const [verInactivos, setVerInactivos] = useState(false)
  const { enviando, error, setError, ejecutar } = useAccion()

  const equipo = equipos.find((e) => e.codigo === (elegido || equipos.find((x) => x.activo)?.codigo)) ?? null
  const delEquipo = useMemo(
    () => subsistemas.filter((s) => s.equipoCodigo === equipo?.codigo && (verInactivos || s.activo)),
    [subsistemas, equipo?.codigo, verInactivos],
  )

  async function guardar(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    if (await ejecutar(fn)) await recargar()
  }

  return (
    <AppShell title="Códigos de Mantenimiento" description="Equipos y subsistemas de Mantenimiento">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Equipo
            <select className={selectClase} value={equipo?.codigo ?? ""} onChange={(e) => setElegido(e.target.value)}>
              {equipos.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombre}
                  {e.activo ? "" : " (inactivo)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>
        <MensajeError error={error} />

        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            {equipo && (
              <FilaEquipo
                key={equipo.codigo}
                equipo={equipo}
                opcionesProduccion={equiposProduccion.filter((e) => e.activo)}
                deshabilitado={enviando}
                onGuardar={(d) => guardar(() => guardarEquipoMtto(usuario, { codigo: equipo.codigo, ...d }))}
              />
            )}
            <NuevoEquipo
              deshabilitado={enviando}
              onGuardar={async (codigo, nombre) => {
                await guardar(() => guardarEquipoMtto(usuario, { codigo, nombre, equipoProduccionCodigo: null, activo: true }))
                setElegido(codigo.trim().toUpperCase())
              }}
              onError={setError}
            />

            {equipo && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-foreground">Subsistemas de {equipo.nombre}</h2>
                {delEquipo.length === 0 && <p className="text-sm text-muted-foreground">No hay subsistemas.</p>}
                {delEquipo.map((s) => (
                  <FilaSubsistema
                    key={s.id + s.nombre + s.activo}
                    s={s}
                    deshabilitado={enviando}
                    onGuardar={(nombre, activo) => guardar(() => guardarSubsistemaMtto(usuario, { equipoCodigo: s.equipoCodigo, codigo: s.codigo, nombre, activo }))}
                  />
                ))}
                <NuevoSubsistema
                  deshabilitado={enviando}
                  onGuardar={(codigo, nombre) => guardar(() => guardarSubsistemaMtto(usuario, { equipoCodigo: equipo.codigo, codigo, nombre, activo: true }))}
                />
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function FilaEquipo({
  equipo,
  opcionesProduccion,
  deshabilitado,
  onGuardar,
}: {
  equipo: EquipoMtto
  opcionesProduccion: { codigo: string; nombre: string }[]
  deshabilitado: boolean
  onGuardar: (d: { nombre: string; equipoProduccionCodigo: string | null; activo: boolean }) => void
}) {
  const [nombre, setNombre] = useState(equipo.nombre)
  const [prod, setProd] = useState(equipo.equipoProduccionCodigo ?? "")
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Nombre del equipo
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Equipo de Producción que se preselecciona
          <select className={selectClase} value={prod} onChange={(e) => setProd(e.target.value)}>
            <option value="">Ninguno</option>
            {opcionesProduccion.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => onGuardar({ nombre, equipoProduccionCodigo: prod || null, activo: !equipo.activo })}>
          {equipo.activo ? "Desactivar" : "Activar"}
        </Button>
        <Button size="sm" disabled={deshabilitado || nombre.trim() === ""} onClick={() => onGuardar({ nombre, equipoProduccionCodigo: prod || null, activo: equipo.activo })}>
          Guardar
        </Button>
      </div>
    </section>
  )
}

function NuevoEquipo({ deshabilitado, onGuardar, onError }: { deshabilitado: boolean; onGuardar: (codigo: string, nombre: string) => Promise<void>; onError: (e: string | null) => void }) {
  const [codigo, setCodigo] = useState("")
  const [nombre, setNombre] = useState("")
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Código del equipo nuevo
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value.slice(0, 40))} className="h-9 w-40" />
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Nombre
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9" />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={deshabilitado}
        onClick={async () => {
          if (codigo.trim() === "" || nombre.trim() === "") return onError("Escribe el código y el nombre del equipo.")
          await onGuardar(codigo, nombre)
          setCodigo("")
          setNombre("")
        }}
      >
        Agregar equipo
      </Button>
    </div>
  )
}

function FilaSubsistema({ s, deshabilitado, onGuardar }: { s: SubsistemaMtto; deshabilitado: boolean; onGuardar: (nombre: string, activo: boolean) => void }) {
  const [nombre, setNombre] = useState(s.nombre)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
      <span className={`num w-32 shrink-0 text-sm font-medium ${s.activo ? "text-foreground" : "text-muted-foreground line-through"}`}>{s.codigo}</span>
      <Input aria-label={`Nombre de ${s.codigo}`} value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8 min-w-40 flex-1" />
      <Button size="sm" variant="outline" disabled={deshabilitado || nombre.trim() === "" || nombre === s.nombre} onClick={() => onGuardar(nombre, s.activo)}>
        Guardar
      </Button>
      <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => onGuardar(s.nombre, !s.activo)}>
        {s.activo ? "Desactivar" : "Activar"}
      </Button>
    </div>
  )
}

function NuevoSubsistema({ deshabilitado, onGuardar }: { deshabilitado: boolean; onGuardar: (codigo: string, nombre: string) => Promise<void> | void }) {
  const [codigo, setCodigo] = useState("")
  const [nombre, setNombre] = useState("")
  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Código nuevo
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value.slice(0, 40))} className="h-9 w-40" />
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Nombre
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9" />
      </label>
      <Button
        size="sm"
        disabled={deshabilitado || codigo.trim() === "" || nombre.trim() === ""}
        onClick={async () => {
          await onGuardar(codigo, nombre)
          setCodigo("")
          setNombre("")
        }}
      >
        Agregar
      </Button>
    </div>
  )
}
