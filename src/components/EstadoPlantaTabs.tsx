import { useState } from "react"
import { Beaker, CheckCircle2, Container, Factory, Layers, Loader2, PauseCircle, PenLine, PlayCircle, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import { TanqueEditForm } from "@/components/TanqueEditForm"
import { nombrePorCodigo, type LineaCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive, presentacionesPorLineaLive, velocidadesParaLive } from "@/lib/catalogosLive"
import type { Sabor } from "@/lib/sabores"
import { cn } from "@/lib/utils"
import {
  useTurno,
  type CondicionTanque,
  type DatosActivarLinea,
  type DatosIniciarPreparacion,
  type LineaEnTurno,
  type PreparacionRegistro,
  type TanqueRecepcion,
  type TurnoActivo,
} from "@/lib/turno"

const TANK_CAPACITY = 20000

/** Color estable por sabor (mismo sabor = mismo color siempre). */
const COLORES_SABOR = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]
function colorSabor(nombre: string | null): string {
  if (!nombre) return "var(--muted-foreground)"
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 997
  return COLORES_SABOR[hash % COLORES_SABOR.length]
}

export type ModoEstadoPlanta = "status" | "preparacion"

/*
 * Tanques y Líneas: el estado CONTINUO de la planta, compartido entre
 * Status (src/pages/apps/Status.tsx) y Preparación
 * (src/pages/apps/Preparacion.tsx) — mismo dato, pero con acciones
 * DISTINTAS según el prop "modo":
 *   - "status": solo ver + corregir a mano si algo no coincide con la
 *     realidad ("Cambiar estado manualmente" en tanques). Sin botones
 *     para arrancar algo nuevo — ni Iniciar Preparación/Liberar en
 *     tanques, ni Activar/Detener en líneas.
 *   - "preparacion": todas las acciones para arrancar algo nuevo —
 *     iniciar/liberar un tanque, activar/detener una corrida.
 *
 * Ciclo de vida de un tanque (modo "preparacion"): Vacío/Sucio (o
 * incluso ya Listo, para arrancar un lote nuevo que reemplaza al
 * actual) → "Iniciar Preparación" (sabor + tambores; el volumen sale
 * solo de tambores × sabor.volumen) → En Preparación (no liberado) →
 * "Liberar" → Listo (recién ahí una corrida lo puede tomar).
 *
 * Ciclo de vida de una corrida (modo "preparacion"): Activar (tanque
 * LISTO + presentación + velocidad; sabor/lote salen del tanque
 * elegido) → Detener → Parada (reversible, Continuar retoma la misma
 * corrida) o Terminó Sabor (libera la línea para una corrida nueva;
 * la corrida queda "esperando cierre" hasta que se registre su
 * contador, ver ProductoTerminado.tsx).
 */
export function EstadoPlantaTabs({ turno, sabores, modo }: { turno: TurnoActivo; sabores: Sabor[]; modo: ModoEstadoPlanta }) {
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const {
    activarLinea,
    pausarLinea,
    continuarLinea,
    terminarSaborLinea,
    cambiarCondicionTanque,
    confirmarEstadoTanque,
    iniciarPreparacion,
    liberarLote,
  } = useTurno()

  const tanquesListos = turno.tanques.filter((t) => t.condicion === "LISTO")

  return (
    <Tabs defaultValue="tanques" className="mx-auto max-w-3xl">
      <TabsList>
        <TabsTrigger value="tanques">
          <Container className="size-4" />
          Tanques
        </TabsTrigger>
        <TabsTrigger value="lineas">
          <Factory className="size-4" />
          Líneas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tanques" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {turno.tanques.map((t) => (
          <TanqueCard
            key={t.numeroTanque}
            tanque={t}
            sabores={sabores}
            modo={modo}
            preparaciones={turno.preparaciones.filter((p) => p.numeroTanque === t.numeroTanque)}
            onCambiarCondicion={cambiarCondicionTanque}
            onConfirmarEstadoTanque={confirmarEstadoTanque}
            onIniciarPreparacion={iniciarPreparacion}
            onLiberarLote={liberarLote}
          />
        ))}
      </TabsContent>

      <TabsContent value="lineas" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {lineas
          .filter((l) => l.activo)
          .map((l) => (
            <LineaCard
              key={l.codigo}
              lineaCodigo={l.codigo}
              nombreLinea={l.nombre}
              modo={modo}
              lineaTurno={turno.lineas.find((tl) => tl.linea === l.codigo && tl.activa) ?? null}
              tanquesListos={tanquesListos}
              presentaciones={presentaciones}
              velocidades={velocidades}
              onActivar={activarLinea}
              onPausar={pausarLinea}
              onContinuar={continuarLinea}
              onTerminarSabor={terminarSaborLinea}
            />
          ))}
      </TabsContent>
    </Tabs>
  )
}

const nombreCondicion: Record<CondicionTanque, string> = {
  LISTO: "Listo (liberado)",
  SUCIO: "Sucio",
  VACIO: "Vacío",
  EN_PREPARACION: "En Preparación (no liberado)",
}
const badgeVariantCondicion: Record<CondicionTanque, "success" | "warning" | "muted"> = {
  LISTO: "success",
  EN_PREPARACION: "warning",
  SUCIO: "muted",
  VACIO: "muted",
}

type Resultado = { ok: true } | { ok: false; error: string }

function TanqueCard({
  tanque,
  sabores,
  modo,
  preparaciones,
  onCambiarCondicion,
  onConfirmarEstadoTanque,
  onIniciarPreparacion,
  onLiberarLote,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  modo: ModoEstadoPlanta
  preparaciones: PreparacionRegistro[]
  onCambiarCondicion: Parameters<typeof TanqueEditForm>[0]["onGuardar"]
  onConfirmarEstadoTanque: (numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN") => Promise<Resultado>
  onIniciarPreparacion: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  onLiberarLote: (loteId: string) => Promise<Resultado>
}) {
  const [editando, setEditando] = useState(false)
  const [mostrarFormPrep, setMostrarFormPrep] = useState(false)
  const [liberando, setLiberando] = useState(false)

  const pct = tanque.condicion === "LISTO" ? Math.min(100, ((tanque.volumenL ?? 0) / TANK_CAPACITY) * 100) : 0
  const color = colorSabor(tanque.saborNombre)
  const loteAbierto = preparaciones.find((p) => !p.liberadoEn && !p.cerradoEn) ?? null

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex gap-4">
          <div className="relative h-32 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {tanque.condicion === "LISTO" && (
              <div
                className="absolute inset-x-0 bottom-0 transition-[height] duration-700"
                style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
              >
                <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]" style={{ backgroundColor: color }} />
                <div
                  className="liquid-wave-2 absolute -top-1 h-2.5 w-[170%] rounded-[50%]"
                  style={{ backgroundColor: color, opacity: 0.55 }}
                />
              </div>
            )}
            {tanque.condicion === "EN_PREPARACION" && (
              <Layers className="alert-pulse absolute inset-x-0 top-1/2 mx-auto size-5 -translate-y-1/2 text-warning" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Container className="size-4 text-muted-foreground" />
                Tanque {tanque.numeroTanque}
              </p>
              <Badge variant={badgeVariantCondicion[tanque.condicion]}>{nombreCondicion[tanque.condicion]}</Badge>
            </div>

            {tanque.condicion === "LISTO" && (
              <>
                <p className="num mt-2 text-xl font-semibold">{(tanque.volumenL ?? 0).toLocaleString("es-CO")} L</p>
                <p className="text-xs text-muted-foreground">
                  {tanque.saborNombre ?? "Sin sabor"}
                  {tanque.lote ? ` · Lote ${tanque.lote}` : ""}
                </p>
              </>
            )}

            {tanque.condicion === "EN_PREPARACION" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {loteAbierto
                  ? `${loteAbierto.saborNombre ?? "Sin sabor"}${loteAbierto.lote ? ` · Lote ${loteAbierto.lote}` : ""} · ${loteAbierto.tambores} tambores${loteAbierto.volumenL ? ` · ${loteAbierto.volumenL} L` : ""}`
                  : "Sin datos de la preparación."}
              </p>
            )}

            {tanque.condicion === "SUCIO" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tanque.ultimoSaborNombre
                  ? `Último: ${tanque.ultimoSaborNombre}${tanque.ultimoLote ? ` · Lote ${tanque.ultimoLote}` : ""}`
                  : "Sin datos del sabor anterior."}
              </p>
            )}

            {tanque.condicion === "VACIO" && <p className="mt-2 text-xs text-muted-foreground">Disponible para preparación.</p>}
          </div>
        </div>

        {modo === "preparacion" && (
          <ConfirmarEstadoTanque
            tanque={tanque}
            sabores={sabores}
            momento="INICIO"
            onConfirmar={() => onConfirmarEstadoTanque(tanque.numeroTanque, "INICIO")}
            onGuardarEdicion={(datos) => onCambiarCondicion({ ...datos, momento: "INICIO" })}
          />
        )}

        {modo === "preparacion" && tanque.condicion === "EN_PREPARACION" && loteAbierto && (
          <Button
            size="sm"
            className="self-start"
            disabled={liberando}
            onClick={async () => {
              setLiberando(true)
              await onLiberarLote(loteAbierto.id)
              setLiberando(false)
            }}
          >
            {liberando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Liberar (marcar Listo)
          </Button>
        )}

        {modo === "preparacion" &&
          tanque.condicion !== "EN_PREPARACION" &&
          (mostrarFormPrep ? (
            <FormularioIniciarPreparacion
              numeroTanque={tanque.numeroTanque}
              sabores={sabores}
              onIniciar={onIniciarPreparacion}
              onCancelar={() => setMostrarFormPrep(false)}
            />
          ) : (
            <Button size="sm" variant="outline" className="self-start" onClick={() => setMostrarFormPrep(true)}>
              <Beaker className="size-3.5" />
              {tanque.condicion === "LISTO" ? "Iniciar nueva preparación" : "Iniciar Preparación"}
            </Button>
          ))}

        {modo === "status" &&
          (!editando ? (
            <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setEditando(true)}>
              <PenLine className="size-3.5" />
              Cambiar estado manualmente
            </Button>
          ) : (
            <TanqueEditForm
              tanque={tanque}
              sabores={sabores}
              onGuardar={async (datos) => {
                const resultado = await onCambiarCondicion(datos)
                if (resultado.ok) setEditando(false)
                return resultado
              }}
              onCancelar={() => setEditando(false)}
            />
          ))}
      </CardContent>
    </Card>
  )
}

function FormularioIniciarPreparacion({
  numeroTanque,
  sabores,
  onIniciar,
  onCancelar,
}: {
  numeroTanque: 1 | 2 | 3
  sabores: Sabor[]
  onIniciar: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  onCancelar: () => void
}) {
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const [tambores, setTambores] = useState("")
  const [agua, setAgua] = useState("")
  const [azucar, setAzucar] = useState("")
  const [acidoCitrico, setAcidoCitrico] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const saborElegido = sabores.find((s) => s.id === saborId)
  const litrosEstimados =
    saborElegido?.volumen && tambores !== "" && Number(tambores) > 0 ? Math.round(Number(tambores) * saborElegido.volumen) : null
  const excedeCapacidad = litrosEstimados !== null && litrosEstimados > TANK_CAPACITY

  const valido = saborId !== "" && lote.trim() !== "" && tambores !== "" && Number(tambores) >= 0 && !excedeCapacidad

  async function handleSubmit() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await onIniciar({
      numeroTanque,
      saborId: saborId || null,
      lote: lote.trim(),
      tambores: Number(tambores),
      agua: agua.trim() === "" ? null : Number(agua),
      azucar: azucar.trim() === "" ? null : Number(azucar),
      acidoCitrico: acidoCitrico.trim() === "" ? null : Number(acidoCitrico),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Nueva preparación (lote independiente, no se suma a otros)</p>
      <div className="grid grid-cols-2 gap-2">
        <Select value={saborId} onValueChange={setSaborId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sabor" />
          </SelectTrigger>
          <SelectContent>
            {sabores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nombre} ({s.familiaNombre})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
        <Input type="number" min={0} placeholder="Tambores" value={tambores} onChange={(e) => setTambores(e.target.value)} />
        <Input type="number" min={0} placeholder="Agua (L)" value={agua} onChange={(e) => setAgua(e.target.value)} />
        <Input type="number" min={0} placeholder="Azúcar (kg)" value={azucar} onChange={(e) => setAzucar(e.target.value)} />
        <Input
          type="number"
          min={0}
          placeholder="Ácido cítrico (kg)"
          value={acidoCitrico}
          onChange={(e) => setAcidoCitrico(e.target.value)}
        />
      </div>

      {litrosEstimados !== null && (
        <p className={cn("text-xs", excedeCapacidad ? "font-medium text-destructive" : "text-muted-foreground")}>
          ≈ <span className="font-medium text-foreground">{litrosEstimados.toLocaleString("es-CO")} L</span> con este sabor (
          {saborElegido?.volumen?.toLocaleString("es-CO")} L por tambor)
          {excedeCapacidad && ` — supera la capacidad del tanque (${TANK_CAPACITY.toLocaleString("es-CO")} L)`}
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!valido || enviando} onClick={handleSubmit}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
          Iniciar Preparación
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function LineaCard({
  lineaCodigo,
  nombreLinea,
  modo,
  lineaTurno,
  tanquesListos,
  presentaciones,
  velocidades,
  onActivar,
  onPausar,
  onContinuar,
  onTerminarSabor,
}: {
  lineaCodigo: LineaCodigo
  nombreLinea: string
  modo: ModoEstadoPlanta
  lineaTurno: LineaEnTurno | null
  tanquesListos: TanqueRecepcion[]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  onActivar: (datos: DatosActivarLinea) => Promise<Resultado>
  onPausar: (turnoLineaId: string) => Promise<Resultado>
  onContinuar: (turnoLineaId: string) => Promise<Resultado>
  onTerminarSabor: (turnoLineaId: string) => Promise<Resultado>
}) {
  const activa = lineaTurno !== null
  const pausada = lineaTurno?.pausadaEn != null
  const [editando, setEditando] = useState(false)
  const [detener, setDetener] = useState(false)
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">(lineaTurno?.presentacion ?? "")
  const [envasesHora, setEnvasesHora] = useState<number | "">(lineaTurno?.envasesHora ?? "")
  const [numeroTanque, setNumeroTanque] = useState<1 | 2 | 3 | "">("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [enviandoAccion, setEnviandoAccion] = useState(false)

  const presentacionesDisponibles = presentacionesPorLineaLive(velocidades, lineaCodigo)
  const opcionesVelocidad = presentacion ? velocidadesParaLive(velocidades, lineaCodigo, presentacion) : []
  const tanqueElegido = tanquesListos.find((t) => t.numeroTanque === numeroTanque) ?? null

  function empezarEdicion() {
    setPresentacion(lineaTurno?.presentacion ?? "")
    setEnvasesHora(lineaTurno?.envasesHora ?? "")
    setNumeroTanque("")
    setError(null)
    setEditando(true)
  }

  const valido = presentacion !== "" && envasesHora !== "" && numeroTanque !== ""

  async function guardar() {
    if (!valido) return
    setGuardando(true)
    setError(null)
    const resultado = await onActivar({
      linea: lineaCodigo,
      presentacion,
      envasesHora: Number(envasesHora),
      numeroTanque,
    })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setEditando(false)
  }

  async function accion(fn: (turnoLineaId: string) => Promise<Resultado>) {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    await fn(lineaTurno.id)
    setEnviandoAccion(false)
    setDetener(false)
  }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Factory className="size-4 text-muted-foreground" />
            {nombreLinea}
          </p>
          <Badge variant={!activa ? "muted" : pausada ? "warning" : "success"}>
            {!activa ? "Detenida" : pausada ? "Parada" : "Activa"}
          </Badge>
        </div>

        {activa && lineaTurno && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Presentación</p>
              <p className="font-medium text-foreground">{lineaTurno.presentacion} ml</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Velocidad</p>
              <p className="num font-medium text-foreground">{lineaTurno.envasesHora} env/h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sabor / Lote</p>
              <p className="font-medium text-foreground">
                {lineaTurno.saborNombre ?? "—"}
                {lineaTurno.lote ? ` · ${lineaTurno.lote}` : ""}
              </p>
            </div>
          </div>
        )}

        {modo === "preparacion" &&
          (!editando && pausada && lineaTurno ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => accion(onContinuar)} disabled={enviandoAccion}>
              {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
              Continuar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => accion(onTerminarSabor)}
              disabled={enviandoAccion}
            >
              <Square className="size-3.5" />
              Terminó Sabor
            </Button>
          </div>
        ) : !editando && !detener ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={empezarEdicion}>
              <PenLine className="size-3.5" />
              {activa ? "Cambiar" : "Activar corrida"}
            </Button>
            {activa && (
              <Button variant="outline" size="sm" onClick={() => setDetener(true)}>
                <PauseCircle className="size-3.5" />
                Detener
              </Button>
            )}
          </div>
        ) : !editando && detener ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">¿Fue una parada momentánea o se terminó el sabor?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => accion(onPausar)} disabled={enviandoAccion}>
                {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
                Parada
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => accion(onTerminarSabor)}
                disabled={enviandoAccion}
              >
                <Square className="size-3.5" />
                Terminó Sabor
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDetener(false)} disabled={enviandoAccion}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={numeroTanque === "" ? "" : String(numeroTanque)}
                onValueChange={(v) => setNumeroTanque(Number(v) as 1 | 2 | 3)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tanquesListos.length === 0 ? "Ningún tanque Listo" : "Tanque"} />
                </SelectTrigger>
                <SelectContent>
                  {tanquesListos.length === 0 ? (
                    <SelectItem value="__ninguno" disabled>
                      Ningún tanque está Listo (liberado) todavía
                    </SelectItem>
                  ) : (
                    tanquesListos.map((t) => (
                      <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                        Tanque {t.numeroTanque} · {t.saborNombre ?? "Sin sabor"}
                        {t.lote ? ` · Lote ${t.lote}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Select
                value={presentacion}
                onValueChange={(v) => {
                  setPresentacion(v)
                  setEnvasesHora("")
                }}
                disabled={presentacionesDisponibles.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={presentacionesDisponibles.length === 0 ? "Sin datos" : "Presentación"} />
                </SelectTrigger>
                <SelectContent>
                  {presentacionesDisponibles.map((codigo) => (
                    <SelectItem key={codigo} value={codigo}>
                      {nombrePorCodigo(presentaciones, codigo)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={envasesHora === "" ? "" : String(envasesHora)}
                onValueChange={(v) => setEnvasesHora(Number(v))}
                disabled={!presentacion || opcionesVelocidad.length === 0}
              >
                <SelectTrigger className="col-span-2 w-full">
                  <SelectValue placeholder="Velocidad" />
                </SelectTrigger>
                <SelectContent>
                  {opcionesVelocidad.map((v) => (
                    <SelectItem key={v.envasesHora} value={String(v.envasesHora)}>
                      {v.envasesHora} env/h · {v.litrosHora} L/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tanqueElegido && (
              <p className="text-xs text-muted-foreground">
                Toma {tanqueElegido.saborNombre ?? "sin sabor"}
                {tanqueElegido.lote ? ` · Lote ${tanqueElegido.lote}` : ""} del Tanque {tanqueElegido.numeroTanque}.
              </p>
            )}

            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" disabled={!valido || guardando} onClick={guardar}>
                {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          ))}
      </CardContent>
    </Card>
  )
}
