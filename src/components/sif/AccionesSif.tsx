import { useEffect, useState } from "react"
import { CheckCheck, Loader2, Lock, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  asignarResponsableSif,
  cerrarSif,
  errorDesactualizado,
  listarPersonalMantenimiento,
  listarSupervisoresEntrega,
  marcarRevisadaSif,
  type PersonaMantenimiento,
  type Sif,
  type SupervisorEntrega,
} from "@/lib/sif"
import { ErrorSif } from "./ErrorSif"

const PAGINA = "Solicitudes de Intervención"
/** Opción del selector para escribir otro nombre (sin turno abierto, o recibe otra persona). */
const OTRO = "__otro__"

const claseCaja = "flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4"
/** En pantalla angosta la acción va a todo el ancho: se alcanza sin apuntar (los 44 px con el dedo los da el botón). */
export const CLASE_BOTON_ACCION = "self-stretch sm:self-start"

/** Inspección → revisada: una nota opcional de lo que se revisó. Si la falla vuelve, pasa a Intervención. */
export function MarcarRevisada({ sif, usuario, onHecho }: { sif: Sif; usuario: string; onHecho: () => void }) {
  const [revision, setRevision] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setEnviando(true)
    setError(null)
    const r = await marcarRevisadaSif(usuario, sif.id, revision.trim(), PAGINA)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho()
  }

  return (
    <div className={claseCaja}>
      <div>
        <h3 className="text-sm font-semibold">Marcar revisada</h3>
        <p className="text-xs text-muted-foreground">Si la falla se repite otra vez en la jornada, pasa a Solicitud de Intervención.</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="sif-revision">
        Qué se revisó (opcional)
        <Textarea id="sif-revision" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Qué se revisó o se ajustó" rows={3} />
      </label>
      <Button className={CLASE_BOTON_ACCION} onClick={guardar} disabled={enviando}>
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
        Marcar revisada
      </Button>
      {error && <ErrorSif mensaje={error} {...(errorDesactualizado(error) ? { accion: "Actualizar", onAccion: onHecho } : {})} />}
    </div>
  )
}

/**
 * Quién se encarga: se elige del personal de Mantenimiento (cada uno tiene
 * usuario; dueña, 2026-10-28), con quien está usando la app elegido de
 * entrada si es de Mantenimiento. Inspección → «En revisión»; Intervención
 * pendiente → en reparación. Al guardar queda la hora.
 */
export function AsignarResponsable({ sif, usuario, onHecho }: { sif: Sif; usuario: string; onHecho: () => void }) {
  const inspeccion = sif.estado === "INSPECCION"
  const [personal, setPersonal] = useState<PersonaMantenimiento[] | null>(null)
  const [eleccion, setEleccion] = useState("")
  const [otro, setOtro] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listarPersonalMantenimiento(usuario).then((r) => {
      if (!vivo) return
      // Si no carga la lista, se escribe el nombre: que falle la red no frena la asignación.
      const lista = r.ok ? r.data : []
      setPersonal(lista)
      setEleccion(lista.find((p) => p.usuario === usuario.toLowerCase())?.nombre ?? (lista.length > 0 ? "" : OTRO))
    })
    return () => {
      vivo = false
    }
  }, [usuario])

  const responsable = (eleccion === OTRO ? otro : eleccion).trim()

  async function guardar() {
    if (!responsable) return
    setEnviando(true)
    setError(null)
    const r = await asignarResponsableSif(usuario, sif.id, responsable, PAGINA)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho()
  }

  return (
    <div className={claseCaja}>
      <div>
        <h3 className="text-sm font-semibold">Asignar responsable</h3>
        <p className="text-xs text-muted-foreground">
          {inspeccion
            ? "Al guardar queda «En revisión» con la hora. Después se marca revisada."
            : "Al guardar empieza la reparación y queda la hora de inicio."}
        </p>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {inspeccion ? "Quién la revisa" : "Responsable de la reparación"}
        {personal === null ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          personal.length > 0 && (
            <Select value={eleccion} onValueChange={setEleccion}>
              <SelectTrigger className="w-full" aria-label="Responsable">
                <SelectValue placeholder="Elige a la persona de Mantenimiento…" />
              </SelectTrigger>
              <SelectContent>
                {personal.map((p) => (
                  <SelectItem key={p.usuario} value={p.nombre}>
                    {p.nombre}
                  </SelectItem>
                ))}
                <SelectItem value={OTRO}>Otra persona (escribir)</SelectItem>
              </SelectContent>
            </Select>
          )
        )}
        {personal?.length === 0 && <span>No se pudo cargar el personal de Mantenimiento: escriba el nombre.</span>}
        {eleccion === OTRO && (
          <Input id="sif-responsable" aria-label="Nombre del responsable" value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Nombre y apellido" />
        )}
      </div>
      <Button className={CLASE_BOTON_ACCION} onClick={guardar} disabled={enviando || !responsable}>
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
        {inspeccion ? "Guardar responsable" : "Guardar e iniciar reparación"}
      </Button>
      {error && <ErrorSif mensaje={error} {...(errorDesactualizado(error) ? { accion: "Actualizar", onAccion: onHecho } : {})} />}
    </div>
  )
}

/** En reparación → cerrada: trabajo realizado y a qué supervisor del turno se le entrega. Pide confirmación. */
export function CerrarSif({ sif, usuario, onHecho }: { sif: Sif; usuario: string; onHecho: () => void }) {
  const [trabajo, setTrabajo] = useState("")
  const [supervisores, setSupervisores] = useState<SupervisorEntrega[] | null>(null)
  const [eleccion, setEleccion] = useState("")
  const [otro, setOtro] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorSupervisores, setErrorSupervisores] = useState(false)

  useEffect(() => {
    let vivo = true
    listarSupervisoresEntrega(usuario, sif.id).then((r) => {
      if (!vivo) return
      // Si no cargan, se escribe quién recibe: que falle la red no frena el cierre.
      const lista = r.ok ? r.data : []
      setErrorSupervisores(!r.ok)
      setSupervisores(lista)
      setEleccion(lista[0]?.nombre ?? OTRO)
    })
    return () => {
      vivo = false
    }
  }, [usuario, sif.id])

  const entregadaA = eleccion === OTRO ? otro.trim() : eleccion
  const listo = trabajo.trim() !== "" && entregadaA !== ""

  async function cerrar() {
    setEnviando(true)
    setError(null)
    const r = await cerrarSif(usuario, sif.id, trabajo.trim(), entregadaA, PAGINA)
    setEnviando(false)
    setConfirmando(false)
    if (!r.ok) return setError(r.error)
    onHecho()
  }

  return (
    <div className={claseCaja}>
      <div>
        <h3 className="text-sm font-semibold">Cerrar la solicitud</h3>
        <p className="text-xs text-muted-foreground">Cargue lo que se hizo y a qué supervisor del turno se le entrega la línea.</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="sif-trabajo">
        Trabajo realizado
        <Textarea id="sif-trabajo" value={trabajo} onChange={(e) => setTrabajo(e.target.value)} placeholder="Qué se encontró y qué se hizo" rows={4} />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        Se entrega a
        {supervisores === null ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          supervisores.length > 0 && (
            <Select value={eleccion} onValueChange={setEleccion}>
              <SelectTrigger className="w-full" aria-label="Se entrega a">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supervisores.map((s) => (
                  <SelectItem key={`${s.nombre}-${s.turnoCodigo}`} value={s.nombre}>
                    {s.nombre} · turno {s.turnoCodigo}
                  </SelectItem>
                ))}
                <SelectItem value={OTRO}>Otra persona (escribir)</SelectItem>
              </SelectContent>
            </Select>
          )
        )}
        {supervisores?.length === 0 && (
          <span>
            {errorSupervisores
              ? "No se pudo cargar la lista de supervisores: escriba quién recibe."
              : "No hay un turno abierto en esta área: escriba quién recibe."}
          </span>
        )}
        {eleccion === OTRO && (
          <Input
            id="sif-entrega-otro"
            aria-label="Nombre de quien recibe"
            value={otro}
            onChange={(e) => setOtro(e.target.value)}
            placeholder="Nombre de quien recibe"
          />
        )}
      </div>
      <Button className={CLASE_BOTON_ACCION} onClick={() => setConfirmando(true)} disabled={!listo || enviando}>
        <Lock className="size-4" />
        Cerrar solicitud
      </Button>
      {error && <ErrorSif mensaje={error} {...(errorDesactualizado(error) ? { accion: "Actualizar", onAccion: onHecho } : {})} />}

      <Dialog open={confirmando} onOpenChange={(a) => !a && !enviando && setConfirmando(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Seguro que quiere cerrar la solicitud de intervención?</DialogTitle>
            <DialogDescription>No se puede deshacer. Queda la hora de cierre y la solicitud ya no se puede editar.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={cerrar} disabled={enviando}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Sí, cerrar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
