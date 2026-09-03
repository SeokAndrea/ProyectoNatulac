import { useEffect, useState } from "react"
import {
  ArrowRightLeft,
  Beaker,
  BroomSparkles,
  CheckCircle2,
  Container,
  Factory,
  Loader2,
  PackageOpen,
  PauseCircle,
  PenLine,
  PlayCircle,
  RefreshCw,
  Square,
  TriangleAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import { LineaVisual, type EstadoVisualLinea } from "@/components/LineaVisual"
import { TanqueEditForm } from "@/components/TanqueEditForm"
import { TanqueVisual } from "@/components/TanqueVisual"
import { useAuth } from "@/lib/auth"
import { nombrePorCodigo, type LineaCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive, presentacionesPorLineaLive, velocidadesParaLive } from "@/lib/catalogosLive"
import { obtenerUltimaConfiguracionLinea } from "@/lib/lineas"
import { listarReservasTobos, type ReservaTobo } from "@/lib/reservasTobos"
import { nombreSaborConFamilia, unidadPreparacion, type Sabor } from "@/lib/sabores"
import { cn } from "@/lib/utils"
import {
  useTurno,
  type CondicionLinea,
  type CondicionTanque,
  type DatosActivarLinea,
  type DatosCambiarLinea,
  type DatosIniciarPreparacion,
  type LineaEnTurno,
  type LineaEstado,
  type ModoTransferencia,
  type PreparacionRegistro,
  type TanqueRecepcion,
  type TurnoActivo,
} from "@/lib/turno"

const TANK_CAPACITY = 20000

/**
 * Desvase (guardar el resto de un tanque aparte, ver envasarTanque en
 * src/lib/turno.tsx) estaba pausado porque no tenía un uso claro.
 * Ahora sí lo tiene: es una de las 3 alternativas del guardrail #1
 * (plan-rework-tanques-lineas-recepcion.md §6) para cuando NO se
 * quiere sumar el resto al lote nuevo.
 */
const DESVASE_HABILITADO = true

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
 *   - "status": el paso de revisión de INICIO (Confirmar/Editar, ver
 *     ConfirmarEstadoTanque) + "Corregir" si algo no coincide con la
 *     realidad después de confirmado (mismo TanqueEditForm que usa
 *     "Editar" — nombre distinto porque es un momento distinto, pero
 *     es la misma acción). Sin botones para arrancar algo nuevo — ni
 *     Iniciar Preparación/Liberar en tanques, ni Activar/Detener en
 *     líneas.
 *   - "preparacion": todas las acciones para arrancar algo nuevo —
 *     iniciar/liberar un tanque, activar/detener una corrida.
 *
 * Ciclo de vida de un tanque (modo "preparacion"): Limpio/Sucio (o
 * incluso ya Listo, para arrancar un lote nuevo que reemplaza al
 * actual) → "Iniciar Preparación" (sabor + tambores; el volumen sale
 * solo de tambores × sabor.volumen) → En Preparación (no liberado) →
 * "Liberar" → Listo (recién ahí una corrida lo puede tomar). Limpio y
 * Vacío eran la misma cosa (nada adentro, disponible) — se fusionaron
 * en Limpio, que además puede llegar de CIP (limpieza terminada).
 *
 * Ciclo de vida de una corrida (modo "preparacion"): Activar (tanque
 * LISTO + presentación + velocidad; sabor/lote salen del tanque
 * elegido) → Detener → Parada (reversible, Continuar retoma la misma
 * corrida) o Terminó Lote/Terminó Línea (liberan la línea para una
 * corrida nueva; la corrida queda "esperando cierre" hasta que se
 * registre su contador, ver ProductoTerminado.tsx). La diferencia
 * entre las dos: Terminó Lote SIEMPRE cierra el tanque (Sucio/Standby,
 * como si el producto se hubiera acabado); Terminó Línea deja el
 * tanque tal cual — solo para la línea, sin decir nada sobre el lote
 * (ver mantiene_tanque en 20260967090000_terminar_linea_sin_cerrar_lote.sql).
 */
export function EstadoPlantaTabs({ turno, sabores, modo }: { turno: TurnoActivo; sabores: Sabor[]; modo: ModoEstadoPlanta }) {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const {
    activarLinea,
    pausarLinea,
    continuarLinea,
    terminarSaborLinea,
    terminarLinea,
    detenerLineaPorFalla,
    descartarRestoTanque,
    continuarSiguienteLote,
    cambiarCondicionTanque,
    cambiarCondicionLinea,
    confirmarEstadoTanque,
    confirmarEstadoLinea,
    iniciarPreparacion,
    liberarLote,
    ajustarPreparacion,
    transferirTanque,
    envasarTanque,
    reactivarLote,
  } = useTurno()

  const tanquesListos = turno.tanques.filter((t) => t.condicion === "LISTO")

  return (
    <Tabs defaultValue="tanques" className="mx-auto max-w-3xl">
      <TabsList className="h-12 p-1.5">
        <TabsTrigger value="tanques" className="h-9 px-4">
          <Container className="size-6" />
          Tanques
        </TabsTrigger>
        <TabsTrigger value="lineas" className="h-9 px-4">
          <Factory className="size-6" />
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
            tanquesDelTurno={turno.tanques}
            lineasDelTurno={turno.lineas}
            areaCodigo={session?.area ?? null}
            usuarioSesion={session?.username ?? ""}
            onCambiarCondicion={cambiarCondicionTanque}
            onConfirmarEstadoTanque={confirmarEstadoTanque}
            onIniciarPreparacion={iniciarPreparacion}
            onLiberarLote={liberarLote}
            onAjustar={ajustarPreparacion}
            onTransferir={transferirTanque}
            onEnvasar={envasarTanque}
            onReactivarLote={reactivarLote}
            onDescartarResto={descartarRestoTanque}
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
              areaCodigo={session?.area ?? null}
              lineaTurno={turno.lineas.find((tl) => tl.linea === l.codigo && tl.activa) ?? null}
              lineaEstado={turno.lineasEstado.find((le) => le.linea === l.codigo) ?? null}
              tanquesListos={tanquesListos}
              presentaciones={presentaciones}
              velocidades={velocidades}
              onActivar={activarLinea}
              onPausar={pausarLinea}
              onContinuar={continuarLinea}
              onTerminarSabor={terminarSaborLinea}
              onTerminarLinea={terminarLinea}
              onDetenerLineaPorFalla={detenerLineaPorFalla}
              onContinuarSiguienteLote={continuarSiguienteLote}
              onConfirmarEstadoLinea={confirmarEstadoLinea}
              onCambiarCondicionLinea={cambiarCondicionLinea}
            />
          ))}
      </TabsContent>
    </Tabs>
  )
}

/*
 * Rename de estados (plan-rework-tanques-lineas-recepcion.md §9): "Sucio"
 * deja de existir como palabra propia — un tanque que se drenó del todo
 * es conceptualmente "Con Restos", solo que con 0 L. "Listo" pasa a
 * llamarse "Liberado" (ya no hace falta el prefijo "En Preparación").
 * El código interno (CondicionTanque, recepcion_tanques.condicion) NO
 * cambia — es solo el rótulo que ve el supervisor.
 */
function nombreCondicionTanque(condicion: CondicionTanque, volumenL: number | null): string {
  switch (condicion) {
    case "LISTO":
      return "Liberado"
    case "SUCIO":
      return "Con Restos 0 L"
    case "EN_PREPARACION":
      return "En Preparación No Liberado"
    case "STANDBY":
      return `Con Restos ${volumenL != null ? volumenL.toLocaleString("es-CO") : "—"} L`
    case "CIP":
      return "En CIP"
    case "LIMPIO":
      return "Limpio"
  }
}
const badgeVariantCondicion: Record<CondicionTanque, "success" | "warning" | "muted" | "secondary"> = {
  LISTO: "success",
  EN_PREPARACION: "warning",
  SUCIO: "muted",
  STANDBY: "secondary",
  CIP: "warning",
  LIMPIO: "success",
}

const nombreCondicionLinea: Record<CondicionLinea, string> = {
  DETENIDA: "Detenida",
  LISTA: "Lista para arrancar",
  CIP: "En CIP",
  CAMBIO_PRESENTACION: "Cambio de Presentación",
  SIN_PROGRAMACION: "Sin programación",
}
const badgeVariantCondicionLinea: Record<CondicionLinea, "success" | "warning" | "muted" | "danger" | "info"> = {
  DETENIDA: "danger",
  LISTA: "success",
  CIP: "warning",
  CAMBIO_PRESENTACION: "warning",
  SIN_PROGRAMACION: "info",
}

type Resultado = { ok: true } | { ok: false; error: string }

/** "Restos del lote 0003" ya viene con el texto completo (ver registrar_producto_terminado) — no le antepone "Lote " de nuevo. */
function textoUltimoLote(lote: string): string {
  return lote.startsWith("Restos del lote") ? ` · ${lote}` : ` · Lote ${lote}`
}

function TanqueCard({
  tanque,
  sabores,
  modo,
  preparaciones,
  tanquesDelTurno,
  lineasDelTurno,
  areaCodigo,
  usuarioSesion,
  onCambiarCondicion,
  onConfirmarEstadoTanque,
  onIniciarPreparacion,
  onLiberarLote,
  onAjustar,
  onTransferir,
  onEnvasar,
  onReactivarLote,
  onDescartarResto,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  modo: ModoEstadoPlanta
  preparaciones: PreparacionRegistro[]
  tanquesDelTurno: TanqueRecepcion[]
  lineasDelTurno: LineaEnTurno[]
  areaCodigo: string | null
  usuarioSesion: string
  onCambiarCondicion: Parameters<typeof TanqueEditForm>[0]["onGuardar"]
  onConfirmarEstadoTanque: (numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN") => Promise<Resultado>
  onIniciarPreparacion: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  onLiberarLote: (loteId: string) => Promise<Resultado>
  onAjustar: (loteId: string, litros: number, detalle: string | null) => Promise<Resultado>
  onTransferir: (numeroTanqueOrigen: 1 | 2 | 3, numeroTanqueDestino: 1 | 2 | 3, modo: ModoTransferencia) => Promise<Resultado>
  onEnvasar: (numeroTanque: 1 | 2 | 3) => Promise<Resultado>
  onReactivarLote: (numeroTanque: 1 | 2 | 3) => Promise<Resultado>
  onDescartarResto: (numeroTanque: 1 | 2 | 3, motivo: string) => Promise<Resultado>
}) {
  const [editando, setEditando] = useState(false)
  const [mostrarFormPrep, setMostrarFormPrep] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [mostrarAjuste, setMostrarAjuste] = useState(false)
  const [litrosAjuste, setLitrosAjuste] = useState("")
  const [detalleAjuste, setDetalleAjuste] = useState("")
  const [ajustando, setAjustando] = useState(false)
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null)
  const [cambiandoCip, setCambiandoCip] = useState(false)
  const [mostrarTransferir, setMostrarTransferir] = useState(false)
  const [tanqueDestino, setTanqueDestino] = useState<1 | 2 | 3 | "">("")
  const [modoTransferencia, setModoTransferencia] = useState<ModoTransferencia>("LIQUIDO")
  const [confirmandoRedireccion, setConfirmandoRedireccion] = useState(false)
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [errorTransferir, setErrorTransferir] = useState<string | null>(null)
  const [reactivando, setReactivando] = useState(false)
  const [errorReactivar, setErrorReactivar] = useState<string | null>(null)
  const [confirmandoEnvasar, setConfirmandoEnvasar] = useState(false)
  const [envasando, setEnvasando] = useState(false)
  const [errorEnvasar, setErrorEnvasar] = useState<string | null>(null)
  /** Guardrail #1, opción "Descartar" (plan-rework-tanques-lineas-recepcion.md §6). */
  const [mostrarDescartar, setMostrarDescartar] = useState(false)
  const [motivoDescarte, setMotivoDescarte] = useState("")
  const [descartando, setDescartando] = useState(false)
  const [errorDescartar, setErrorDescartar] = useState<string | null>(null)

  async function confirmarDescarte() {
    setDescartando(true)
    setErrorDescartar(null)
    const resultado = await onDescartarResto(tanque.numeroTanque, motivoDescarte)
    setDescartando(false)
    if (!resultado.ok) {
      setErrorDescartar(resultado.error)
      return
    }
    setMostrarDescartar(false)
    setMotivoDescarte("")
  }

  async function cambiarCip(condicion: "CIP" | "LIMPIO") {
    setCambiandoCip(true)
    await onCambiarCondicion({ numeroTanque: tanque.numeroTanque, condicion, saborId: null, volumenL: null, lote: null })
    setCambiandoCip(false)
  }

  const loteAbierto = preparaciones.find((p) => !p.liberadoEn && !p.cerradoEn) ?? null
  const loteActivo = preparaciones.find((p) => p.liberadoEn && !p.cerradoEn) ?? null
  const corridaActivaEnEsteTanque = loteActivo ? (lineasDelTurno.find((l) => l.loteId === loteActivo.id && l.activa) ?? null) : null
  /** Guardrail #1: el tanque tiene producto sin usar — al preparar encima, se suma solo por default (ver iniciar_preparacion). */
  const tieneResto = (tanque.condicion === "LISTO" || tanque.condicion === "STANDBY") && (tanque.volumenL ?? 0) > 0
  const destinosDisponibles = tanquesDelTurno.filter(
    (t) =>
      t.numeroTanque !== tanque.numeroTanque &&
      (t.condicion === "LIMPIO" || ((t.condicion === "LISTO" || t.condicion === "STANDBY") && t.saborId !== null && t.saborId === tanque.saborId)),
  )

  async function transferir() {
    if (tanqueDestino === "") return
    if (corridaActivaEnEsteTanque && !confirmandoRedireccion) {
      setConfirmandoRedireccion(true)
      return
    }
    setTransfiriendo(true)
    setErrorTransferir(null)
    const resultado = await onTransferir(tanque.numeroTanque, tanqueDestino, modoTransferencia)
    setTransfiriendo(false)
    if (!resultado.ok) {
      setErrorTransferir(resultado.error)
      return
    }
    setMostrarTransferir(false)
    setTanqueDestino("")
    setModoTransferencia("LIQUIDO")
    setConfirmandoRedireccion(false)
  }

  /** El destino ya tiene su propio lote (Listo o Con Restos) — ahí sí hace falta elegir qué identidad sobrevive. Si está Limpio, los dos modos dan lo mismo. */
  const tanqueDestinoElegido = destinosDisponibles.find((t) => t.numeroTanque === tanqueDestino) ?? null
  const destinoConLotePropio = tanqueDestinoElegido !== null && tanqueDestinoElegido.condicion !== "LIMPIO"

  async function envasar() {
    if (!confirmandoEnvasar) {
      setConfirmandoEnvasar(true)
      return
    }
    setEnvasando(true)
    setErrorEnvasar(null)
    const resultado = await onEnvasar(tanque.numeroTanque)
    setEnvasando(false)
    if (!resultado.ok) {
      setErrorEnvasar(resultado.error)
      return
    }
    setConfirmandoEnvasar(false)
  }

  async function reactivar() {
    setReactivando(true)
    setErrorReactivar(null)
    const resultado = await onReactivarLote(tanque.numeroTanque)
    setReactivando(false)
    if (!resultado.ok) setErrorReactivar(resultado.error)
  }

  const color = colorSabor(
    tanque.condicion === "SUCIO"
      ? tanque.ultimoSaborNombre
      : tanque.condicion === "EN_PREPARACION"
        ? (loteAbierto?.saborNombre ?? null)
        : tanque.saborNombre,
  )

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">
            <Container className="size-4.5 text-muted-foreground" />
            Tanque {tanque.numeroTanque}
          </span>
          <Badge variant={badgeVariantCondicion[tanque.condicion]} className="shrink-0">
            {nombreCondicionTanque(tanque.condicion, tanque.volumenL)}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <TanqueVisual
            numeroTanque={tanque.numeroTanque}
            condicion={tanque.condicion}
            volumenL={tanque.volumenL}
            volumenInicialL={tanque.volumenInicialL}
            color={color}
            capacidad={TANK_CAPACITY}
            square
          />
          <div className="min-w-0 flex-1">
            {(tanque.condicion === "LISTO" || tanque.condicion === "STANDBY") && (
              <p className="num text-2xl font-bold text-foreground">{(tanque.volumenL ?? 0).toLocaleString("es-CO")} L</p>
            )}
          </div>
        </div>

        <div>
          {tanque.condicion === "LISTO" && (
            <p className="text-sm text-muted-foreground">
              {tanque.saborNombre ?? "Sin sabor"}
              {tanque.lote ? ` · Lote ${tanque.lote}` : ""}
            </p>
          )}

          {tanque.condicion === "STANDBY" && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">
                Resto de {tanque.saborNombre ?? "sabor sin datos"}
                {tanque.lote ? ` · Lote ${tanque.lote}` : ""} — el lote ya se cerró.
              </p>
              {modo === "preparacion" && (
                <>
                  <Button size="sm" variant="outline" className="self-start" disabled={reactivando} onClick={reactivar}>
                    {reactivando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Reactivar Lote
                  </Button>
                  {errorReactivar && (
                    <p className="text-xs text-destructive" role="alert">
                      {errorReactivar}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {tanque.condicion === "EN_PREPARACION" && (
            <p className="text-sm text-muted-foreground">
              {loteAbierto
                ? `${loteAbierto.saborNombre ?? "Sin sabor"}${loteAbierto.lote ? ` · Lote ${loteAbierto.lote}` : ""} · ${loteAbierto.tambores} ${unidadPreparacion(loteAbierto.saborNombre)}${loteAbierto.volumenL ? ` · ${loteAbierto.volumenL} L` : ""}`
                : "Sin datos de la preparación."}
            </p>
          )}

          {tanque.condicion === "SUCIO" && (
            <p className="text-sm text-muted-foreground">
              {tanque.ultimoSaborNombre
                ? `Último: ${tanque.ultimoSaborNombre}${tanque.ultimoLote ? textoUltimoLote(tanque.ultimoLote) : ""}`
                : "Sin datos del sabor anterior."}
            </p>
          )}

          {tanque.condicion === "LIMPIO" && <p className="text-sm text-muted-foreground">Disponible para preparación.</p>}

          {tanque.condicion === "CIP" && (
            <p className="text-sm text-muted-foreground">
              Proceso de limpieza{tanque.cipIniciadoEn ? ` desde las ${tanque.cipIniciadoEn.slice(11, 16)}` : ""}.
            </p>
          )}
        </div>

        {/* También en modo "status": si al editar el tanque queda En Preparación, se debe poder liberar aquí mismo sin ir a Preparación. */}
        {(modo === "preparacion" || modo === "status") && tanque.condicion === "EN_PREPARACION" && loteAbierto && (
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              className="self-start"
              disabled={liberando || ajustando}
              onClick={async () => {
                setLiberando(true)
                await onLiberarLote(loteAbierto.id)
                setLiberando(false)
              }}
            >
              {liberando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Liberar (marcar Listo)
            </Button>

            {mostrarAjuste ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
                <p className="text-xs text-muted-foreground">Sumar jugo o agua al volumen del lote (antes de liberar).</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="Litros"
                    className="h-8 w-24"
                    value={litrosAjuste}
                    onChange={(e) => setLitrosAjuste(e.target.value)}
                  />
                  <Input
                    placeholder="Detalle (opcional)"
                    className="h-8 w-40"
                    value={detalleAjuste}
                    onChange={(e) => setDetalleAjuste(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={ajustando || !(Number(litrosAjuste) > 0)}
                    onClick={async () => {
                      setAjustando(true)
                      setErrorAjuste(null)
                      const r = await onAjustar(loteAbierto.id, Number(litrosAjuste), detalleAjuste.trim() || null)
                      setAjustando(false)
                      if (!r.ok) {
                        setErrorAjuste(r.error)
                        return
                      }
                      setLitrosAjuste("")
                      setDetalleAjuste("")
                      setMostrarAjuste(false)
                    }}
                  >
                    {ajustando ? <Loader2 className="size-3.5 animate-spin" /> : "Sumar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ajustando}
                    onClick={() => {
                      setMostrarAjuste(false)
                      setErrorAjuste(null)
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
                {errorAjuste && (
                  <p className="text-xs text-destructive" role="alert">
                    {errorAjuste}
                  </p>
                )}
              </div>
            ) : (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setMostrarAjuste(true)}>
                Ajustar
              </Button>
            )}
          </div>
        )}

        {modo === "preparacion" && tanque.condicion === "CIP" && (
          <Button size="sm" className="self-start" disabled={cambiandoCip} onClick={() => cambiarCip("LIMPIO")}>
            {cambiandoCip ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Terminó CIP
          </Button>
        )}

        {modo === "preparacion" &&
          tanque.condicion !== "EN_PREPARACION" &&
          tanque.condicion !== "CIP" &&
          (mostrarFormPrep ? (
            <FormularioIniciarPreparacion
              numeroTanque={tanque.numeroTanque}
              sabores={sabores}
              volumenRestante={
                tanque.condicion === "LISTO" || tanque.condicion === "STANDBY" ? (tanque.volumenL ?? 0) : 0
              }
              areaCodigo={areaCodigo}
              usuarioSesion={usuarioSesion}
              onIniciar={async (datos) => {
                const resultado = await onIniciarPreparacion(datos)
                if (resultado.ok) setMostrarFormPrep(false)
                return resultado
              }}
              onCancelar={() => setMostrarFormPrep(false)}
            />
          ) : mostrarDescartar ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs text-foreground">
                Se van a descartar los {(tanque.volumenL ?? 0).toLocaleString("es-CO")} L de {tanque.saborNombre} — quedan
                como merma de este lote. Contá qué pasó (opcional).
              </p>
              <Textarea
                value={motivoDescarte}
                onChange={(e) => setMotivoDescarte(e.target.value.slice(0, 140))}
                maxLength={140}
                rows={2}
                placeholder="Motivo del descarte"
                className="text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{motivoDescarte.length}/140</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setMostrarDescartar(false)} disabled={descartando}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    variant="outline"
                    onClick={confirmarDescarte}
                    disabled={descartando}
                  >
                    {descartando ? <Loader2 className="size-3.5 animate-spin" /> : <TriangleAlert className="size-3.5" />}
                    Confirmar descarte
                  </Button>
                </div>
              </div>
              {errorDescartar && (
                <p className="text-xs text-destructive" role="alert">
                  {errorDescartar}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tieneResto && (
                <p className="text-xs text-muted-foreground">
                  Quedan {(tanque.volumenL ?? 0).toLocaleString("es-CO")} L de {tanque.saborNombre} sin usar — si preparás
                  encima, se suman solos al lote nuevo. Si preferís otra cosa: Transferir, Desvase, o Descartar.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setMostrarFormPrep(true)}>
                  <Beaker className="size-3.5" />
                  {tanque.condicion === "LISTO" ? "Iniciar nueva preparación" : "Iniciar Preparación"}
                </Button>
                <Button size="sm" variant="outline" disabled={cambiandoCip} onClick={() => cambiarCip("CIP")}>
                  {cambiandoCip ? <Loader2 className="size-3.5 animate-spin" /> : <BroomSparkles className="size-3.5" />}
                  Iniciar CIP
                </Button>
                {tieneResto && destinosDisponibles.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setMostrarTransferir(true)}>
                    <ArrowRightLeft className="size-3.5" />
                    Transferir
                  </Button>
                )}
                {DESVASE_HABILITADO && tieneResto && (
                  <Button size="sm" variant="outline" onClick={envasar} disabled={envasando}>
                    {envasando ? <Loader2 className="size-3.5 animate-spin" /> : <PackageOpen className="size-3.5" />}
                    {confirmandoEnvasar ? "¿Seguro? Sí, desvasar" : "Desvase"}
                  </Button>
                )}
                {DESVASE_HABILITADO && confirmandoEnvasar && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmandoEnvasar(false)} disabled={envasando}>
                    Cancelar
                  </Button>
                )}
                {tieneResto && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => setMostrarDescartar(true)}
                  >
                    <TriangleAlert className="size-3.5" />
                    Descartar
                  </Button>
                )}
              </div>
            </div>
          ))}

        {errorEnvasar && (
          <p className="text-xs text-destructive" role="alert">
            {errorEnvasar}
          </p>
        )}

        {modo === "preparacion" && mostrarTransferir && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Manda los {(tanque.volumenL ?? 0).toLocaleString("es-CO")} L de {tanque.saborNombre} a otro tanque con el mismo sabor —
              este tanque queda Sucio.
            </p>
            <Select value={String(tanqueDestino)} onValueChange={(v) => setTanqueDestino(Number(v) as 1 | 2 | 3)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tanque destino" />
              </SelectTrigger>
              <SelectContent>
                {destinosDisponibles.map((t) => (
                  <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                    {t.condicion === "LIMPIO"
                      ? `Tanque ${t.numeroTanque} · Limpio (mueve el lote entero)`
                      : `Tanque ${t.numeroTanque} · ${t.saborNombre} · ${(t.volumenL ?? 0).toLocaleString("es-CO")} L`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {destinoConLotePropio && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  El tanque destino ya tiene su propio lote — ¿cuál de los dos identidades se queda?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={modoTransferencia === "LIQUIDO" ? "default" : "outline"}
                    onClick={() => setModoTransferencia("LIQUIDO")}
                  >
                    Líquido — se suma al lote del destino
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={modoTransferencia === "LOTE" ? "default" : "outline"}
                    onClick={() => setModoTransferencia("LOTE")}
                  >
                    Lote — este lote se queda con lo que ya tenía el destino
                  </Button>
                </div>
              </div>
            )}

            {confirmandoRedireccion && corridaActivaEnEsteTanque && (
              <p className="text-xs text-warning">
                La corrida activa de esta línea va a pasar a tomar del tanque destino al confirmar. ¿Continuar?
              </p>
            )}

            {errorTransferir && (
              <p className="text-xs text-destructive" role="alert">
                {errorTransferir}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" disabled={tanqueDestino === "" || transfiriendo} onClick={transferir}>
                {transfiriendo ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                {confirmandoRedireccion ? "Sí, transferir" : "Transferir"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMostrarTransferir(false)
                  setTanqueDestino("")
                  setConfirmandoRedireccion(false)
                  setErrorTransferir(null)
                }}
                disabled={transfiriendo}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {modo === "status" && (
          <ConfirmarEstadoTanque
            tanque={tanque}
            sabores={sabores}
            momento="INICIO"
            onConfirmar={() => onConfirmarEstadoTanque(tanque.numeroTanque, "INICIO")}
            onGuardarEdicion={(datos) => onCambiarCondicion({ ...datos, momento: "INICIO" })}
          />
        )}

        {(modo === "status" || modo === "preparacion") &&
          (!editando ? (
            <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setEditando(true)}>
              <PenLine className="size-3.5" />
              Editar
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
  volumenRestante,
  areaCodigo,
  usuarioSesion,
  onIniciar,
  onCancelar,
}: {
  numeroTanque: 1 | 2 | 3
  sabores: Sabor[]
  /** Litros que ya están físicamente en el tanque (resto de Standby) — se suman al nuevo lote, no desaparecen. */
  volumenRestante: number
  areaCodigo: string | null
  usuarioSesion: string
  onIniciar: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  onCancelar: () => void
}) {
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const [tambores, setTambores] = useState("")
  const [agua, setAgua] = useState("")
  const [azucar, setAzucar] = useState("")
  const [acidoCitrico, setAcidoCitrico] = useState("")
  const [reservas, setReservas] = useState<ReservaTobo[]>([])
  const [reservaId, setReservaId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setReservaId("")
    if (!DESVASE_HABILITADO || !saborId || !areaCodigo) {
      setReservas([])
      return
    }
    listarReservasTobos(usuarioSesion, areaCodigo, saborId).then(setReservas)
  }, [saborId, areaCodigo, usuarioSesion])

  const saborElegido = sabores.find((s) => s.id === saborId)
  const unidadPrep = unidadPreparacion(saborElegido ? `${saborElegido.nombre} ${saborElegido.familiaNombre}` : null)
  const reservaElegida = reservas.find((r) => r.id === reservaId)
  const litrosEstimados =
    saborElegido?.volumen && tambores !== "" && Number(tambores) > 0
      ? Math.round(Number(tambores) * saborElegido.volumen) + volumenRestante + (reservaElegida?.litros ?? 0)
      : null
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
      reservaId: reservaId || null,
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Nueva preparación (lote independiente, no se suma a otros)
        {volumenRestante > 0 ? ` — se suman los ${volumenRestante.toLocaleString("es-CO")} L que quedaban en el tanque.` : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
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
        <Input placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
        <Input
          type="number"
          min={0}
          placeholder={unidadPrep === "kits" ? "Kits" : "Tambores"}
          value={tambores}
          onChange={(e) => setTambores(e.target.value)}
        />
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

      {DESVASE_HABILITADO && saborId !== "" && reservas.length > 0 && (
        <Select value={reservaId} onValueChange={setReservaId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sumar algo guardado (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {reservas.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.litros.toLocaleString("es-CO")} L · desvasado {new Date(r.creadoEn).toLocaleDateString("es-CO")}
                {r.loteOrigen ? ` · Lote ${r.loteOrigen}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {litrosEstimados !== null && (
        <p className={cn("text-xs", excedeCapacidad ? "font-medium text-destructive" : "text-muted-foreground")}>
          ≈ <span className="font-medium text-foreground">{litrosEstimados.toLocaleString("es-CO")} L</span> con este sabor (
          {saborElegido?.volumen?.toLocaleString("es-CO")} L por tambor)
          {reservaElegida ? ` + ${reservaElegida.litros.toLocaleString("es-CO")} L guardados` : ""}
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
  areaCodigo,
  lineaTurno,
  lineaEstado,
  tanquesListos,
  presentaciones,
  velocidades,
  onActivar,
  onPausar,
  onContinuar,
  onTerminarSabor,
  onTerminarLinea,
  onDetenerLineaPorFalla,
  onContinuarSiguienteLote,
  onConfirmarEstadoLinea,
  onCambiarCondicionLinea,
}: {
  lineaCodigo: LineaCodigo
  nombreLinea: string
  modo: ModoEstadoPlanta
  areaCodigo: string | null
  lineaTurno: LineaEnTurno | null
  lineaEstado: LineaEstado | null
  tanquesListos: TanqueRecepcion[]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  onActivar: (datos: DatosActivarLinea) => Promise<Resultado>
  onPausar: (turnoLineaId: string) => Promise<Resultado>
  onContinuar: (turnoLineaId: string) => Promise<Resultado>
  onTerminarSabor: (turnoLineaId: string) => Promise<Resultado>
  onTerminarLinea: (turnoLineaId: string) => Promise<Resultado>
  onDetenerLineaPorFalla: (turnoLineaId: string, motivo: string) => Promise<Resultado>
  onContinuarSiguienteLote: (turnoLineaId: string) => Promise<Resultado>
  onConfirmarEstadoLinea: (turnoLineaId: string) => Promise<Resultado>
  onCambiarCondicionLinea: (datos: DatosCambiarLinea) => Promise<Resultado>
}) {
  const activa = lineaTurno !== null
  const pausada = lineaTurno?.pausadaEn != null
  const loteTerminado = lineaTurno?.loteTerminado != null
  const condicionLinea = lineaEstado?.condicion ?? "DETENIDA"
  const [editando, setEditando] = useState(false)
  const [detener, setDetener] = useState(false)
  /** "Falla" en Detener: a diferencia de Parada/Terminó, pide motivo antes de confirmar — igual que DETENIDA más abajo. */
  const [fallaPendiente, setFallaPendiente] = useState(false)
  const [editandoEstadoLinea, setEditandoEstadoLinea] = useState(false)
  const [enviandoEstadoLinea, setEnviandoEstadoLinea] = useState(false)
  const [errorEstadoLinea, setErrorEstadoLinea] = useState<string | null>(null)
  /** DETENIDA lleva una nota libre (falla u observación, máx. 140): al elegirla no se guarda de inmediato, se muestra el textarea y luego se confirma. */
  const [detenidaPendiente, setDetenidaPendiente] = useState(false)
  const [observacionBorrador, setObservacionBorrador] = useState(lineaEstado?.observacion ?? "")
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">(lineaTurno?.presentacion ?? "")
  const [envasesHora, setEnvasesHora] = useState<number | "">(lineaTurno?.envasesHora ?? "")
  const [numeroTanque, setNumeroTanque] = useState<1 | 2 | 3 | "">("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [enviandoAccion, setEnviandoAccion] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const presentacionesDisponibles = presentacionesPorLineaLive(velocidades, lineaCodigo)
  const opcionesVelocidad = presentacion ? velocidadesParaLive(velocidades, lineaCodigo, presentacion) : []
  const tanqueElegido = tanquesListos.find((t) => t.numeroTanque === numeroTanque) ?? null

  /**
   * Prellena presentación/velocidad con lo que la línea ya tenía
   * (si hay una corrida activa) o, si no, con lo ÚLTIMO que esa línea
   * usó (plan-rework-tanques-lineas-recepcion.md §12) — así el
   * supervisor no tiene que retipear lo mismo cada vez que arranca una
   * corrida nueva. Solo se prellena si el valor sigue siendo válido
   * para esta línea (el catálogo pudo haber cambiado).
   */
  async function empezarEdicion() {
    setNumeroTanque("")
    setError(null)
    setEditando(true)

    if (lineaTurno) {
      setPresentacion(lineaTurno.presentacion)
      setEnvasesHora(lineaTurno.envasesHora)
      return
    }

    setPresentacion("")
    setEnvasesHora("")
    if (!areaCodigo) return

    const ultima = await obtenerUltimaConfiguracionLinea(areaCodigo, lineaCodigo)
    if (!ultima || ultima.presentacionVolumenMl === null) return

    const presentacionCodigo = String(ultima.presentacionVolumenMl)
    if (!presentacionesDisponibles.includes(presentacionCodigo)) return
    setPresentacion(presentacionCodigo)

    if (ultima.envasesHora === null) return
    const opciones = velocidadesParaLive(velocidades, lineaCodigo, presentacionCodigo)
    if (opciones.some((o) => o.envasesHora === ultima.envasesHora)) {
      setEnvasesHora(ultima.envasesHora)
    }
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
      confirmarInicio: modo === "status",
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
    setErrorAccion(null)
    const resultado = await fn(lineaTurno.id)
    setEnviandoAccion(false)
    setDetener(false)
    if (!resultado.ok) setErrorAccion(resultado.error)
  }

  /** "Detener por falla": termina la corrida y anota el motivo en un solo paso — ver detenerLineaPorFalla en turno.tsx. */
  async function confirmarFalla() {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onDetenerLineaPorFalla(lineaTurno.id, observacionBorrador)
    setEnviandoAccion(false)
    if (!resultado.ok) {
      setErrorAccion(resultado.error)
      return
    }
    setFallaPendiente(false)
    setDetener(false)
    setObservacionBorrador("")
  }

  async function cambiarEstadoLinea(condicion: CondicionLinea, observacion?: string | null) {
    setEnviandoEstadoLinea(true)
    setErrorEstadoLinea(null)
    const resultado = await onCambiarCondicionLinea({ linea: lineaCodigo, condicion, observacion })
    setEnviandoEstadoLinea(false)
    if (!resultado.ok) {
      setErrorEstadoLinea(resultado.error)
      return
    }
    setDetenidaPendiente(false)
    setEditandoEstadoLinea(false)
  }

  function elegirCondicionLinea(v: CondicionLinea) {
    if (v === "DETENIDA") {
      // No se guarda de inmediato: se muestra el textarea de falla/observación y se confirma con el botón.
      setObservacionBorrador(lineaEstado?.observacion ?? "")
      setDetenidaPendiente(true)
      return
    }
    setDetenidaPendiente(false)
    cambiarEstadoLinea(v)
  }

  /** Control de estado continuo de la línea (sin corrida activa) — Select de las condiciones + nota libre en DETENIDA + atajos de CIP. */
  function renderEstadoLinea() {
    const mostrarNotaDetenida = detenidaPendiente || condicionLinea === "DETENIDA"
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        {condicionLinea === "CIP" ? (
          <p className="text-xs text-muted-foreground">
            Proceso de limpieza{lineaEstado?.cipIniciadoEn ? ` desde las ${lineaEstado.cipIniciadoEn.slice(11, 16)}` : ""}.
          </p>
        ) : (
          <Select
            value={detenidaPendiente ? "DETENIDA" : condicionLinea}
            onValueChange={(v) => elegirCondicionLinea(v as CondicionLinea)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* "Lista" no se ofrece para elegir a mano — nadie la usa en la
                  planta (plan-rework-tanques-lineas-recepcion.md §12). Sigue
                  existiendo por dentro como destino de "Terminó CIP". */}
              <SelectItem value="DETENIDA">Detenida</SelectItem>
              <SelectItem value="CAMBIO_PRESENTACION">Cambio de Presentación</SelectItem>
              <SelectItem value="SIN_PROGRAMACION">Sin programación</SelectItem>
            </SelectContent>
          </Select>
        )}

        {condicionLinea !== "CIP" && mostrarNotaDetenida && (
          <div className="flex flex-col gap-1.5">
            <Textarea
              value={observacionBorrador}
              onChange={(e) => setObservacionBorrador(e.target.value.slice(0, 140))}
              maxLength={140}
              rows={2}
              placeholder="Falla u observación (opcional) — se muestra en el dashboard"
              className="text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{observacionBorrador.length}/140</span>
              <Button
                size="sm"
                disabled={enviandoEstadoLinea}
                onClick={() => cambiarEstadoLinea("DETENIDA", observacionBorrador)}
              >
                {enviandoEstadoLinea ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                {condicionLinea === "DETENIDA" && !detenidaPendiente ? "Guardar nota" : "Marcar Detenida"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {condicionLinea === "CIP" ? (
            <Button size="sm" disabled={enviandoEstadoLinea} onClick={() => cambiarEstadoLinea("LISTA")}>
              {enviandoEstadoLinea ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Terminó CIP
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={enviandoEstadoLinea} onClick={() => cambiarEstadoLinea("CIP")}>
              {enviandoEstadoLinea ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
              Iniciar CIP
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDetenidaPendiente(false)
              setEditandoEstadoLinea(false)
            }}
            disabled={enviandoEstadoLinea}
          >
            Cerrar
          </Button>
        </div>

        {errorEstadoLinea && (
          <p className="text-xs text-destructive" role="alert">
            {errorEstadoLinea}
          </p>
        )}
      </div>
    )
  }

  /** "¿Parada momentánea, terminó el lote, falla, o solo la línea?" — compartido entre Preparación y el "Detener" de Status. */
  function renderDetenerConfirm() {
    // "Falla" pide motivo antes de confirmar (plan-rework-tanques-lineas-recepcion.md §12:
    // corta la corrida Y anota el motivo en un solo paso, no dos que se pueden desincronizar).
    if (fallaPendiente) {
      return (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs text-foreground">
            La línea se detiene y el tanque se conserva para cuando se retome. Contá qué pasó (opcional).
          </p>
          <Textarea
            value={observacionBorrador}
            onChange={(e) => setObservacionBorrador(e.target.value.slice(0, 140))}
            maxLength={140}
            rows={2}
            placeholder="Falla — se muestra en el dashboard"
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{observacionBorrador.length}/140</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setFallaPendiente(false)} disabled={enviandoAccion}>
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmarFalla} disabled={enviandoAccion}>
                {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <TriangleAlert className="size-3.5" />}
                Confirmar falla
              </Button>
            </div>
          </div>
          {errorAccion && (
            <p className="text-xs text-destructive" role="alert">
              {errorAccion}
            </p>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs text-muted-foreground">
          ¿Fue una parada momentánea, una falla que corta la corrida, se terminó el lote, o solo se para la línea (el
          tanque sigue Listo)?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => accion(onPausar)} disabled={enviandoAccion}>
            {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
            Parada
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-warning/40 text-warning-foreground hover:bg-warning-soft/40"
            onClick={() => setFallaPendiente(true)}
            disabled={enviandoAccion}
          >
            <TriangleAlert className="size-3.5" />
            Falla
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => accion(onTerminarSabor)}
            disabled={enviandoAccion}
          >
            <Square className="size-3.5" />
            Terminó Lote
          </Button>
          <Button size="sm" variant="outline" onClick={() => accion(onTerminarLinea)} disabled={enviandoAccion}>
            <Square className="size-3.5" />
            Terminó Línea
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDetener(false)} disabled={enviandoAccion}>
            <PlayCircle className="size-3.5" />
            Continuar
          </Button>
        </div>
        {errorAccion && (
          <p className="text-xs text-destructive" role="alert">
            {errorAccion}
          </p>
        )}
      </div>
    )
  }

  /**
   * Formulario de Activar/Cambiar corrida — compartido entre Preparación
   * y el "Corregir"/"Editar" de Status. En Status, guardar además
   * cuenta como revisión (confirmarInicio) — la corrida nueva que
   * reemplaza a la anterior nace ya confirmada, en vez de quedar
   * pendiente de revisar de nuevo apenas se corrige.
   */
  function renderFormularioEdicion() {
    return (
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
    )
  }

  const numeroLinea = Number(lineaCodigo.replace("LINEA_", "")) || 0
  const estadoVisual: EstadoVisualLinea = !activa
    ? condicionLinea === "CIP"
      ? "cip"
      : condicionLinea === "CAMBIO_PRESENTACION"
        ? "cambio_presentacion"
        : "libre"
    : loteTerminado
      ? "terminada"
      : pausada
        ? "parada"
        : "corriendo"

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Factory className="size-4 text-muted-foreground" />
            {nombreLinea}
          </p>
          <Badge
            variant={!activa ? badgeVariantCondicionLinea[condicionLinea] : loteTerminado ? "warning" : pausada ? "warning" : "success"}
            className="shrink-0"
          >
            {!activa ? nombreCondicionLinea[condicionLinea] : loteTerminado ? "Terminó el Lote" : pausada ? "Parada" : "Corriendo"}
          </Badge>
        </div>

        <LineaVisual numeroLinea={numeroLinea} estado={estadoVisual} color={colorSabor(lineaTurno?.saborNombre ?? null)} square />

        {activa && lineaTurno && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
          (!editando && loteTerminado && lineaTurno ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-xs text-foreground">
                Se terminó el lote{lineaTurno.lote ? ` ${lineaTurno.lote}` : ""} que estaba usando esta corrida — ¿terminó el
                sabor o sigue con el siguiente lote?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => accion(onContinuarSiguienteLote)} disabled={enviandoAccion}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Continuar al siguiente lote
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => accion(onTerminarSabor)}
                  disabled={enviandoAccion}
                >
                  <Square className="size-3.5" />
                  Terminó Lote
                </Button>
              </div>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : !editando && pausada && lineaTurno ? (
            <div className="flex flex-wrap gap-2">
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
                Terminó Lote
              </Button>
              <Button variant="outline" size="sm" onClick={() => accion(onTerminarLinea)} disabled={enviandoAccion}>
                <Square className="size-3.5" />
                Terminó Línea
              </Button>
            </div>
          ) : !editando && !detener && editandoEstadoLinea ? (
            renderEstadoLinea()
          ) : !editando && !detener ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={empezarEdicion}>
                <PenLine className="size-3.5" />
                {activa ? "Editar" : "Activar corrida"}
              </Button>
              {activa ? (
                <Button variant="outline" size="sm" onClick={() => setDetener(true)}>
                  <PauseCircle className="size-3.5" />
                  Detener
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditandoEstadoLinea(true)}>
                  <PenLine className="size-3.5" />
                  Editar
                </Button>
              )}
            </div>
          ) : !editando && detener ? (
            renderDetenerConfirm()
          ) : (
            renderFormularioEdicion()
          ))}

        {modo === "status" && lineaTurno && !editando && !detener && (
          !lineaTurno.confirmadoInicioEn ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-sm text-foreground">{nombreLinea}: así quedó del turno anterior — confirma o corrige.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={enviandoAccion} onClick={() => accion(onConfirmarEstadoLinea)}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Confirmar
                </Button>
                <Button size="sm" variant="outline" onClick={empezarEdicion}>
                  Editar
                </Button>
              </div>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={empezarEdicion}>
                <PenLine className="size-3.5" />
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDetener(true)}>
                <PauseCircle className="size-3.5" />
                Detener
              </Button>
            </div>
          )
        )}

        {modo === "status" && lineaTurno && detener && renderDetenerConfirm()}
        {modo === "status" && lineaTurno && editando && renderFormularioEdicion()}

        {modo === "status" &&
          !activa &&
          (editandoEstadoLinea ? (
            renderEstadoLinea()
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() => setEditandoEstadoLinea(true)}
            >
              <PenLine className="size-3.5" />
              Editar
            </Button>
          ))}
      </CardContent>
    </Card>
  )
}
