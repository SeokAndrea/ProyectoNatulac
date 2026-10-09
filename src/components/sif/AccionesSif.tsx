import { useEffect, useState } from "react"
import { Loader2, Lock, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { asignarResponsableSif, cerrarSif, listarSupervisoresEntrega, type Sif, type SupervisorEntrega } from "@/lib/sif"

const PAGINA = "Solicitudes de Intervención"
/** Opción del selector para escribir otro nombre (sin turno abierto, o recibe otra persona). */
const OTRO = "__otro__"

const claseCaja = "flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4"

/** Pendiente → en reparación: el responsable se escribe a mano. Al guardar queda la hora de inicio. */
export function AsignarResponsable({ sif, usuario, onHecho }: { sif: Sif; usuario: string; onHecho: () => void }) {
  const [responsable, setResponsable] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!responsable.trim()) return
    setEnviando(true)
    setError(null)
    const r = await asignarResponsableSif(usuario, sif.id, responsable.trim(), PAGINA)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onHecho()
  }

  return (
    <div className={claseCaja}>
      <div>
        <h3 className="text-sm font-semibold">Asignar responsable</h3>
        <p className="text-xs text-muted-foreground">Al guardar empieza la reparación y queda la hora de inicio.</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="sif-responsable">
        Responsable de la reparación
        <Input id="sif-responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre y apellido" />
      </label>
      <Button className="self-start" onClick={guardar} disabled={enviando || !responsable.trim()}>
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
        Guardar e iniciar reparación
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
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

  useEffect(() => {
    let vivo = true
    listarSupervisoresEntrega(usuario, sif.id).then((lista) => {
      if (!vivo) return
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
        )}
        {supervisores?.length === 0 && <span>No hay un turno abierto en esta área: escriba quién recibe.</span>}
        {eleccion === OTRO && (
          <Input id="sif-entrega-otro" value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Nombre de quien recibe" />
        )}
      </div>
      <Button className="self-start" onClick={() => setConfirmando(true)} disabled={!listo || enviando}>
        <Lock className="size-4" />
        Cerrar solicitud
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}

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
