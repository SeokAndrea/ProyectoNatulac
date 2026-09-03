import { useMemo, useState } from "react"
import { Check, Loader2, Pencil, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { rangoDePreset, turnoEnFiltro, type PresetFecha, type RangoFecha } from "@/lib/auditoriaVista"
import {
  efectivo,
  type EstadoValidacion,
  type FilaValidacion,
  type OverridesValidacion,
  type TanqueEstado,
  type TurnoTanques,
  type ValoresProduccion,
} from "@/lib/validacion"

/*
 * Lista de VALIDAR — la reusa la página real y el preview /validar-demo.
 * Una fila por corrida (turno + línea + lote). Muestra los números del
 * supervisor y, si se editó, los corregidos al lado. Botones Sí /
 * Editar por fila (form inline). Arriba de las corridas de cada
 * supervisor, los tanques recibidos y dejados del turno (para cruzar
 * contra el acta). Ver plan-validar-produccion.md §3.
 */
const NUM = new Intl.NumberFormat("es-CO")
const PCT = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })

const PRESETS: { codigo: PresetFecha; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "DIAS_7", etiqueta: "Últimos 7 días" },
  { codigo: "FECHA", etiqueta: "Fecha exacta" },
]

const BADGE: Record<EstadoValidacion, "muted" | "success" | "warning"> = {
  PENDIENTE: "muted",
  CONFIRMADO: "success",
  EDITADO: "warning",
}

export function ValidarLista({
  filas,
  tanquesPorTurno = {},
  cargando = false,
  onConfirmar,
  onEditar,
  onRangoChange,
  presetInicial = "AYER",
}: {
  filas: FilaValidacion[]
  /** Tanques recibidos / dejados por código de turno — solo lectura, para cruzar con el acta. */
  tanquesPorTurno?: Record<string, TurnoTanques>
  cargando?: boolean
  onConfirmar: (turnoLineaId: string) => void | Promise<void>
  onEditar: (turnoLineaId: string, overrides: OverridesValidacion) => void | Promise<void>
  onRangoChange?: (rango: RangoFecha) => void
  presetInicial?: PresetFecha
}) {
  const [preset, setPreset] = useState<PresetFecha>(presetInicial)
  const [fechaExacta, setFechaExacta] = useState("")
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [busqueda, setBusqueda] = useState("")

  const rango = useMemo(() => rangoDePreset(preset, fechaExacta || "2026-01-01"), [preset, fechaExacta])

  const q = busqueda.trim().toLowerCase()
  const visibles = useMemo(() => {
    let r = filas.filter((f) => turnoEnFiltro(f.fecha, "", rango, null))
    if (soloPendientes) r = r.filter((f) => f.estado === "PENDIENTE")
    if (q) {
      r = r.filter((f) =>
        [f.supervisorNombre, f.areaNombre, f.turnoCodigo, f.linea, f.presentacion, f.sabor ?? "", f.lote ?? "", f.overrides?.lote ?? ""]
          .join("  ")
          .toLowerCase()
          .includes(q),
      )
    }
    return r
  }, [filas, rango, soloPendientes, q])

  /** fecha → supervisor → filas (los del mismo supervisor van juntos). */
  const porFecha = useMemo(() => {
    const orden = [...visibles].sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) ||
        a.supervisorNombre.localeCompare(b.supervisorNombre) ||
        a.turnoCodigo.localeCompare(b.turnoCodigo) ||
        a.linea.localeCompare(b.linea),
    )
    const dias: { fecha: string; supervisores: { nombre: string; area: string; filas: FilaValidacion[] }[] }[] = []
    for (const f of orden) {
      let dia = dias[dias.length - 1]
      if (!dia || dia.fecha !== f.fecha) {
        dia = { fecha: f.fecha, supervisores: [] }
        dias.push(dia)
      }
      let sup = dia.supervisores[dia.supervisores.length - 1]
      if (!sup || sup.nombre !== f.supervisorNombre) {
        sup = { nombre: f.supervisorNombre, area: f.areaNombre, filas: [] }
        dia.supervisores.push(sup)
      }
      sup.filas.push(f)
    }
    return dias
  }, [visibles])

  function cambiarPreset(p: PresetFecha) {
    setPreset(p)
    onRangoChange?.(rangoDePreset(p, fechaExacta || "2026-01-01"))
  }

  const pendientes = filas.filter((f) => f.estado === "PENDIENTE").length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.codigo}
            type="button"
            size="sm"
            variant={preset === p.codigo ? "default" : "outline"}
            onClick={() => cambiarPreset(p.codigo)}
          >
            {p.etiqueta}
          </Button>
        ))}
        {preset === "FECHA" && (
          <Input
            type="date"
            className="h-8 w-40"
            value={fechaExacta}
            onChange={(e) => {
              setFechaExacta(e.target.value)
              if (e.target.value) onRangoChange?.(rangoDePreset("FECHA", e.target.value))
            }}
          />
        )}
        <label className="ml-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Solo pendientes{pendientes ? ` (${pendientes})` : ""}
        </label>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por supervisor, sabor, lote, línea o código…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {cargando ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : porFecha.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {q
            ? `Nada coincide con “${busqueda.trim()}”.`
            : soloPendientes
              ? "Nada pendiente de validar en ese rango."
              : "Sin corridas en ese rango."}
        </p>
      ) : (
        porFecha.map(({ fecha, supervisores }) => (
          <div key={fecha} className="flex flex-col gap-6">
            <p className="-mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {formatearFecha(fecha)}
            </p>
            {supervisores.map((sup) => {
              const codigos = [...new Set(sup.filas.map((f) => f.turnoCodigo))]
              return (
                <div key={sup.nombre} className="flex flex-col gap-2 border-t-2 border-border pt-3">
                  <p className="text-lg font-bold text-foreground">
                    {sup.nombre}{" "}
                    <span className="text-xs font-normal tracking-wide text-muted-foreground uppercase">{sup.area}</span>
                  </p>
                  {codigos.map((cod) =>
                    tanquesPorTurno[cod] ? <PanelTanques key={cod} tanques={tanquesPorTurno[cod]} /> : null,
                  )}
                  {sup.filas.map((f) => (
                    <FilaCorrida key={f.turnoLineaId} fila={f} onConfirmar={onConfirmar} onEditar={onEditar} />
                  ))}
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

function FilaCorrida({
  fila,
  onConfirmar,
  onEditar,
}: {
  fila: FilaValidacion
  onConfirmar: (id: string) => void | Promise<void>
  onEditar: (id: string, ov: OverridesValidacion) => void | Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const val = <K extends keyof ValoresProduccion>(c: K) => efectivo(fila, c)
  const editado = fila.estado === "EDITADO"

  async function confirmar() {
    setTrabajando(true)
    await onConfirmar(fila.turnoLineaId)
    setTrabajando(false)
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">
            {fila.sabor ?? "Sin sabor"}
            {fila.lote ? <span className="text-muted-foreground"> · Lote {efectivoLote(fila)}</span> : null}
            {" · "}
            {fila.presentacion}
          </p>
          <p className="text-xs text-muted-foreground">
            Cód. {fila.turnoCodigo} · {fila.linea}
          </p>
        </div>
        <Badge variant={BADGE[fila.estado]}>
          {fila.estado === "PENDIENTE" ? "Pendiente" : fila.estado === "CONFIRMADO" ? "Confirmado" : "Editado"}
        </Badge>
        {!editando && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={trabajando} onClick={confirmar}>
              {trabajando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Sí
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" />
              Editar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground sm:grid-cols-3">
        <Celda etiqueta="Cajas" sup={NUM.format(fila.supervisor.cajas)} efe={NUM.format(val("cajas"))} editado={editado} />
        <Celda
          etiqueta="Contador"
          sup={NUM.format(fila.supervisor.envasesLlenadora)}
          efe={NUM.format(val("envasesLlenadora"))}
          editado={editado}
        />
        <Celda
          etiqueta="Consumido → producido"
          sup={`${NUM.format(fila.supervisor.litrosConsumidos)} → ${NUM.format(fila.supervisor.litrosProducidos)} L`}
          efe={`${NUM.format(val("litrosConsumidos"))} → ${NUM.format(val("litrosProducidos"))} L`}
          editado={editado}
        />
        <Celda
          etiqueta="Merma envases"
          sup={pct(fila.supervisor.mermaEnvasesPct)}
          efe={pct(val("mermaEnvasesPct"))}
          editado={editado}
        />
        <Celda
          etiqueta="Merma semielaborado"
          sup={pct(fila.supervisor.mermaSemielaboradoPct)}
          efe={pct(val("mermaSemielaboradoPct"))}
          editado={editado}
        />
        {fila.validadoPorNombre && (
          <span className="col-span-2 sm:col-span-1">
            <span className="font-medium text-foreground">Validó:</span> {fila.validadoPorNombre}
          </span>
        )}
      </div>

      {fila.overrides?.nota && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          Nota: {fila.overrides.nota}
        </p>
      )}

      {editando && (
        <FormEditar
          fila={fila}
          onCancelar={() => setEditando(false)}
          onGuardar={async (ov) => {
            setTrabajando(true)
            await onEditar(fila.turnoLineaId, ov)
            setTrabajando(false)
            setEditando(false)
          }}
        />
      )}
    </div>
  )
}

/** Tanques recibidos y dejados del turno — solo lectura, para cruzar contra el acta en papel. */
function PanelTanques({ tanques }: { tanques: TurnoTanques }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Tanques del turno {tanques.turnoCodigo}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ColumnaTanques titulo="Recibidos" tanques={tanques.recibidos} />
        <ColumnaTanques titulo="Dejados" tanques={tanques.dejados} />
      </div>
    </div>
  )
}

function ColumnaTanques({ titulo, tanques }: { titulo: string; tanques: TanqueEstado[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-foreground">{titulo}</p>
      {tanques.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin dato (no se confirmaron al inicio).</p>
      ) : (
        tanques.map((t) => (
          <p key={t.numeroTanque} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">T{t.numeroTanque}</span> · {t.condicion}
            {t.sabor ? ` · ${t.sabor}` : ""}
            {t.lote ? ` · Lote ${t.lote}` : ""}
            {t.volumenL != null ? ` · ${NUM.format(t.volumenL)} L` : ""}
          </p>
        ))
      )}
    </div>
  )
}

function FormEditar({
  fila,
  onCancelar,
  onGuardar,
}: {
  fila: FilaValidacion
  onCancelar: () => void
  onGuardar: (ov: OverridesValidacion) => void | Promise<void>
}) {
  const base = fila.supervisor
  const ov0 = fila.overrides ?? {}
  const [paletas, setPaletas] = useState(String(ov0.paletas ?? base.paletas))
  const [cajasSueltas, setCajasSueltas] = useState(String(ov0.cajasSueltas ?? base.cajasSueltas))
  const [envases, setEnvases] = useState(String(ov0.envasesLlenadora ?? base.envasesLlenadora))
  const [litros, setLitros] = useState(String(ov0.litrosConsumidos ?? base.litrosConsumidos))
  const [lote, setLote] = useState(ov0.lote ?? fila.lote ?? "")
  const [mEnv, setMEnv] = useState(ov0.mermaEnvasesPct != null ? String(ov0.mermaEnvasesPct) : "")
  const [mSemi, setMSemi] = useState(ov0.mermaSemielaboradoPct != null ? String(ov0.mermaSemielaboradoPct) : "")
  const [nota, setNota] = useState(ov0.nota ?? "")
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const ov: OverridesValidacion = {}
    const numOr = (s: string, prev: number) => (s.trim() === "" ? prev : Number(s))
    if (numOr(paletas, base.paletas) !== base.paletas) ov.paletas = numOr(paletas, base.paletas)
    if (numOr(cajasSueltas, base.cajasSueltas) !== base.cajasSueltas) ov.cajasSueltas = numOr(cajasSueltas, base.cajasSueltas)
    if (numOr(envases, base.envasesLlenadora) !== base.envasesLlenadora) ov.envasesLlenadora = numOr(envases, base.envasesLlenadora)
    if (numOr(litros, base.litrosConsumidos) !== base.litrosConsumidos) ov.litrosConsumidos = numOr(litros, base.litrosConsumidos)
    if (lote.trim() && lote.trim() !== (fila.lote ?? "")) ov.lote = lote.trim()
    if (mEnv.trim() !== "") ov.mermaEnvasesPct = Number(mEnv)
    if (mSemi.trim() !== "") ov.mermaSemielaboradoPct = Number(mSemi)
    if (nota.trim()) ov.nota = nota.trim()
    await onGuardar(ov)
    setGuardando(false)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-3 text-xs">
      <p className="text-muted-foreground">
        Deja en blanco lo que no cambie. Escribe un % de merma solo para pisar el cálculo.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Campo etiqueta="Paletas" value={paletas} onChange={setPaletas} />
        <Campo etiqueta="Cajas sueltas" value={cajasSueltas} onChange={setCajasSueltas} />
        <Campo etiqueta="Contador (envases)" value={envases} onChange={setEnvases} />
        <Campo etiqueta="Litros consumidos" value={litros} onChange={setLitros} />
        <Campo etiqueta="Lote" value={lote} onChange={setLote} texto />
        <Campo etiqueta="Merma envases %" value={mEnv} onChange={setMEnv} />
        <Campo etiqueta="Merma semi %" value={mSemi} onChange={setMSemi} />
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          <span className="text-muted-foreground">Nota</span>
          <Input className="h-8" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={guardando} onClick={guardar}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" /> : "Guardar corrección"}
        </Button>
        <Button size="sm" variant="ghost" disabled={guardando} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function Campo({
  etiqueta,
  value,
  onChange,
  texto,
}: {
  etiqueta: string
  value: string
  onChange: (v: string) => void
  texto?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground">{etiqueta}</span>
      <Input
        className="h-8"
        type={texto ? "text" : "number"}
        inputMode={texto ? "text" : "decimal"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function Celda({ etiqueta, sup, efe, editado }: { etiqueta: string; sup: string; efe: string; editado: boolean }) {
  const cambio = editado && sup !== efe
  return (
    <span>
      <span className="font-medium text-foreground">{etiqueta}:</span>{" "}
      {cambio ? (
        <>
          <s className="opacity-60">{sup}</s> <span className="font-semibold text-warning-foreground">{efe}</span>
        </>
      ) : (
        sup
      )}
    </span>
  )
}

function pct(v: number | null): string {
  return v == null ? "—" : `${PCT.format(v)}%`
}

function efectivoLote(fila: FilaValidacion): string {
  return fila.estado === "EDITADO" && fila.overrides?.lote ? fila.overrides.lote : (fila.lote ?? "")
}

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}
