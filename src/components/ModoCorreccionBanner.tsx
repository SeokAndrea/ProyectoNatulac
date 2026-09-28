import { useEffect, useState } from "react"
import { Loader2, Plus, Wrench, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"
import { presentacionesPorLineaLive, useCatalogosLive, velocidadesParaLive } from "@/lib/catalogosLive"
import { agregarCorridaOlvidada } from "@/lib/correccion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { listarSabores, nombreSaborConFamilia, type Sabor } from "@/lib/sabores"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { TurnoCorregido } from "@/lib/turnoCorreccion"

/*
 * Aviso fijo arriba de las páginas en modo corrección (migración 20261082):
 *   1. Sin corrección abierta: pide el motivo. Hasta entonces solo se ve.
 *   2. Con la corrección abierta (2 h): muestra las corridas del turno
 *      (sabor, presentación, lote, horario) para cargar PT o paradas sobre la
 *      correcta, y permite agregar una corrida olvidada.
 * Solo se corrigen datos: tanques y líneas de un turno cerrado no se tocan
 * (lo bloquea el servidor).
 */
export function ModoCorreccionBanner({ turno, onSalir }: { turno: TurnoCorregido; onSalir: () => void }) {
  const cierre = turno.fechaFin && turno.horaFin ? ` al ${turno.fechaFin} ${turno.horaFin.slice(0, 5)}` : ""
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm text-warning">
      <div className="flex flex-wrap items-center gap-3">
        <Wrench className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Corrigiendo el turno {turno.codigo}</p>
          <p className="text-xs">
            Del {turno.fecha} {turno.horaInicio.slice(0, 5)}
            {cierre}
            {turno.supervisorNombre ? ` · ${turno.supervisorNombre}` : ""}. Solo se corrigen datos (Producto Terminado,
            contador y paradas); tanques y líneas no se cambian.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onSalir}>
          <X className="size-3.5" />
          Salir de corrección
        </Button>
      </div>
      {turno.correccionActiva ? <CorreccionAbierta turno={turno} /> : <PedirMotivo turno={turno} />}
    </div>
  )
}

function PedirMotivo({ turno }: { turno: TurnoCorregido }) {
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function empezar() {
    setEnviando(true)
    setError(null)
    const r = await turno.iniciar(motivo)
    setEnviando(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <div className="flex flex-col gap-2 text-foreground">
      <Label className="text-xs">¿Por qué se corrige este turno? Queda en Auditoría y en el acta.</Label>
      <Textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej.: faltó cargar el PT de la línea 2 del final del turno."
        rows={2}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={empezar} disabled={enviando || motivo.trim().length < 5}>
          {enviando && <Loader2 className="size-3.5 animate-spin" />}
          Empezar corrección
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}

function CorreccionAbierta({ turno }: { turno: TurnoCorregido }) {
  const { corridas } = useProduccion(turno.id)
  const { lineas } = useCatalogosLive()
  const [agregando, setAgregando] = useState(false)
  const ordenadas = [...corridas].sort((a, b) => a.activadaEn.localeCompare(b.activadaEn))

  return (
    <div className="flex flex-col gap-2 text-foreground">
      <p className="text-xs text-muted-foreground">Motivo: {turno.motivo}</p>
      <p className="text-xs font-medium">Lo que corrió en este turno</p>
      {ordenadas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin corridas registradas.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {ordenadas.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{lineas.find((l) => l.codigo === c.linea)?.nombre ?? c.linea}</span>
              <span>{c.saborNombre ?? "—"}</span>
              <span>{c.presentacion} ml</span>
              {c.lote && <span>Lote {c.lote}</span>}
              <span className="text-muted-foreground">
                {horaCortaPlanta(c.activadaEn, turno.fecha)} –{" "}
                {c.finalizadaEn
                  ? horaCortaPlanta(c.finalizadaEn, turno.fecha)
                  : c.entregadaEn
                    ? `${horaCortaPlanta(c.entregadaEn, turno.fecha)} (entregada)`
                    : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {agregando ? (
        <FormCorridaOlvidada turno={turno} onCerrar={() => setAgregando(false)} />
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAgregando(true)}>
          <Plus className="size-3.5" />
          Agregar corrida olvidada
        </Button>
      )}
    </div>
  )
}

function FormCorridaOlvidada({ turno, onCerrar }: { turno: TurnoCorregido; onCerrar: () => void }) {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [linea, setLinea] = useState<LineaCodigo | "">("")
  const [saborId, setSaborId] = useState("")
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">("")
  const [envasesHora, setEnvasesHora] = useState("")
  const [lote, setLote] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  const presentacionesLinea = linea ? presentacionesPorLineaLive(velocidades, linea) : []
  const opcionesVelocidad = linea && presentacion ? velocidadesParaLive(velocidades, linea, presentacion) : []
  const valido = linea !== "" && saborId !== "" && presentacion !== "" && envasesHora !== "" && desde !== "" && hasta !== ""

  async function guardar() {
    if (!session || !valido) return
    setEnviando(true)
    setError(null)
    const r = await agregarCorridaOlvidada(
      session.username,
      turno,
      { linea, saborId, presentacion, envasesHora: Number(envasesHora), lote, desde, hasta },
      velocidades,
    )
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    // Las páginas cargan sus corridas por su cuenta: se recarga para que la nueva aparezca en todas.
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={linea}
          onValueChange={(v) => {
            setLinea(v as LineaCodigo)
            setPresentacion("")
            setEnvasesHora("")
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Línea" />
          </SelectTrigger>
          <SelectContent>
            {lineas
              .filter((l) => l.activo)
              .map((l) => (
                <SelectItem key={l.codigo} value={l.codigo}>
                  {l.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={saborId} onValueChange={setSaborId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sabor" />
          </SelectTrigger>
          <SelectContent>
            {sabores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {nombreSaborConFamilia(s.nombre, s.familiaNombre)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={presentacion}
          onValueChange={(v) => {
            setPresentacion(v as PresentacionCodigo)
            setEnvasesHora("")
          }}
          disabled={!linea}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Presentación" />
          </SelectTrigger>
          <SelectContent>
            {presentacionesLinea.map((codigo) => (
              <SelectItem key={codigo} value={codigo}>
                {presentaciones.find((p) => p.codigo === codigo)?.nombre ?? `${codigo} ml`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={envasesHora} onValueChange={setEnvasesHora} disabled={!presentacion}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Velocidad" />
          </SelectTrigger>
          <SelectContent>
            {opcionesVelocidad.map((o) => (
              <SelectItem key={o.envasesHora} value={String(o.envasesHora)}>
                {o.envasesHora} envases/h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Lote (opcional)" />
        <div className="flex items-center gap-2">
          <Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
          <span className="text-xs text-muted-foreground">a</span>
          <Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={guardar} disabled={!valido || enviando}>
          {enviando && <Loader2 className="size-3.5 animate-spin" />}
          Agregar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
