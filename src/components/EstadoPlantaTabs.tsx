import { useEffect, useState } from "react"
import {
  ArrowRightLeft,
  Beaker,
  BroomSparkles,
  CheckCircle2,
  Container,
  Loader2,
  PackageOpen,
  PenLine,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import { TanqueEditForm } from "@/components/TanqueEditForm"
import { TanqueVisual } from "@/components/TanqueVisual"
import { useAuth } from "@/lib/auth"
import { listarDesvases, type Desvase } from "@/lib/desvases"
import { colorSabor } from "@/lib/coloresSabor"
import { nombreSaborConFamilia, unidadPreparacion, type Sabor } from "@/lib/sabores"
import { cn } from "@/lib/utils"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import type {
  CondicionTanque,
  DatosCambiarTanque,
  DatosIniciarPreparacion,
  ModoTransferencia,
  MotivoTransferencia,
  PreparacionRegistro,
  TanqueRecepcion,
} from "@/lib/preparacion/tipos"
import { useProduccion } from "@/lib/produccion/useProduccion"
import type { Corrida } from "@/lib/produccion/tipos"

const TANK_CAPACITY = 20000
/**
 * Techo de volumen que aguanta el CHECK de base (`preparaciones.volumen_l`
 * / `recepcion_tanques.volumen_l`, migración 20261008090000). Sólo
 * Transferir puede pasar de TANK_CAPACITY, y hasta acá — más que esto la
 * RPC lo rechaza con un error crudo de constraint, así que lo frenamos
 * antes con un mensaje claro.
 */
const TANK_MAX_VOLUMEN = 30000

/**
 * Desvase (sacar el resto de un tanque y guardarlo en pipa, ver
 * desvasarTanque en src/lib/preparacion/ajustes.ts) estaba pausado
 * porque no tenía un uso claro. Ahora sí lo tiene: es una de las 3
 * alternativas del guardrail #1 (plan-rework-tanques-lineas-recepcion.md
 * §6) para cuando NO se quiere sumar el resto al lote nuevo.
 */
const DESVASE_HABILITADO = true

export type ModoEstadoPlanta = "status" | "preparacion"

/*
 * Tanques: el estado CONTINUO de la planta, compartido entre Status
 * (src/pages/apps/Status.tsx) y Preparación (src/pages/apps/Preparacion.tsx)
 * — mismo dato, pero con acciones DISTINTAS según el prop "modo":
 *   - "status": el paso de revisión de INICIO (Confirmar/Editar, ver
 *     ConfirmarEstadoTanque) + "Corregir" si algo no coincide con la
 *     realidad después de confirmado (mismo TanqueEditForm que usa
 *     "Editar" — nombre distinto porque es un momento distinto, pero
 *     es la misma acción). Sin botones para arrancar algo nuevo — ni
 *     Iniciar Preparación/Liberar.
 *   - "preparacion": todas las acciones para arrancar algo nuevo —
 *     iniciar/liberar un tanque.
 *
 * Ciclo de vida de un tanque (modo "preparacion"): Limpio/Sucio (o
 * incluso ya Listo, para arrancar un lote nuevo que reemplaza al
 * actual) → "Iniciar Preparación" (sabor + tambores; el volumen sale
 * solo de tambores × sabor.volumen) → En Preparación (no liberado) →
 * "Liberar" → Listo (recién ahí una corrida lo puede tomar). Limpio y
 * Vacío eran la misma cosa (nada adentro, disponible) — se fusionaron
 * en Limpio, que además puede llegar de CIP (limpieza terminada).
 *
 * Líneas dejó de vivir acá — es su propia pieza, LineasEstadoPlanta
 * (src/components/LineasEstadoPlanta.tsx), y su propia página, Líneas
 * (src/pages/apps/Lineas.tsx) — ver plan-rework-3-modulos-y-merma.md,
 * Fase 1: "la página de líneas debe ser su propia página como tal".
 * Este componente todavía necesita leer, de solo lectura, las corridas
 * del módulo Producción — para saber si el tanque que se está por
 * transferir/reactivar tiene una corrida activa tomando de él ahora
 * mismo (corridaActivaEnEsteTanque, más abajo) — por eso llama a
 * useProduccion() acá adentro, sin usar ninguna de sus mutaciones.
 */
export function EstadoPlantaTabs({ sabores, modo }: { sabores: Sabor[]; modo: ModoEstadoPlanta }) {
  const { session } = useAuth()
  const {
    tanques,
    preparaciones,
    cargando,
    cambiarCondicionTanque,
    confirmarEstadoTanque,
    iniciarPreparacion,
    liberarLote,
    ajustarPreparacion,
    transferirTanque,
    desvasarTanque,
    medirTanque,
  } = usePreparacion()
  const { corridas, cargando: cargandoProduccion } = useProduccion()

  if (cargando || cargandoProduccion) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3">
      {tanques.map((t) => (
        <TanqueCard
          key={t.numeroTanque}
          tanque={t}
          sabores={sabores}
          modo={modo}
          preparaciones={preparaciones.filter((p) => p.numeroTanque === t.numeroTanque)}
          tanquesDelTurno={tanques}
          corridasDelTurno={corridas}
          areaCodigo={session?.area ?? null}
          usuarioSesion={session?.username ?? ""}
          onCambiarCondicion={cambiarCondicionTanque}
          onConfirmarEstadoTanque={confirmarEstadoTanque}
          onIniciarPreparacion={iniciarPreparacion}
          onLiberarLote={liberarLote}
          onAjustar={ajustarPreparacion}
          onTransferir={transferirTanque}
          onDesvasar={desvasarTanque}
          onMedirTanque={medirTanque}
        />
      ))}
    </div>
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

// nombreCondicionLinea/badgeVariantCondicionLinea se movieron a LineasEstadoPlanta.tsx (Líneas ya no vive acá).

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
  corridasDelTurno,
  areaCodigo,
  usuarioSesion,
  onCambiarCondicion,
  onConfirmarEstadoTanque,
  onIniciarPreparacion,
  onLiberarLote,
  onAjustar,
  onTransferir,
  onDesvasar,
  onMedirTanque,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  modo: ModoEstadoPlanta
  preparaciones: PreparacionRegistro[]
  tanquesDelTurno: TanqueRecepcion[]
  corridasDelTurno: Corrida[]
  areaCodigo: string | null
  usuarioSesion: string
  onCambiarCondicion: (datos: DatosCambiarTanque) => Promise<Resultado>
  onConfirmarEstadoTanque: (numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN") => Promise<Resultado>
  onIniciarPreparacion: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  onLiberarLote: (loteId: string) => Promise<Resultado>
  onAjustar: (loteId: string, litros: number, detalle: string | null) => Promise<Resultado>
  onTransferir: (
    numeroTanqueOrigen: 1 | 2 | 3,
    numeroTanqueDestino: 1 | 2 | 3,
    modo: ModoTransferencia,
    motivo: MotivoTransferencia,
  ) => Promise<Resultado>
  onDesvasar: (numeroTanque: 1 | 2 | 3) => Promise<Resultado>
  onMedirTanque: (numeroTanque: 1 | 2 | 3, volumenReal: number) => Promise<Resultado>
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
  const [motivoTransferencia, setMotivoTransferencia] = useState<MotivoTransferencia>("CONSOLIDAR_RESTOS")
  const [confirmandoRedireccion, setConfirmandoRedireccion] = useState(false)
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [errorTransferir, setErrorTransferir] = useState<string | null>(null)
  /** Después de transferir: medir el tanque destino para fijar el volumen real (no solo el calculado). */
  const [medirDestino, setMedirDestino] = useState<1 | 2 | 3 | null>(null)
  const [volMedido, setVolMedido] = useState("")
  const [midiendo, setMidiendo] = useState(false)
  const [errorMedir, setErrorMedir] = useState<string | null>(null)
  const [confirmandoDesvase, setConfirmandoDesvase] = useState(false)
  const [desvasando, setDesvasando] = useState(false)
  const [errorDesvase, setErrorDesvase] = useState<string | null>(null)

  async function cambiarCip(condicion: "CIP" | "LIMPIO") {
    setCambiandoCip(true)
    await onCambiarCondicion({ numeroTanque: tanque.numeroTanque, condicion, saborId: null, volumenL: null, lote: null })
    setCambiandoCip(false)
  }

  const loteAbierto = preparaciones.find((p) => !p.liberadoEn && !p.cerradoEn) ?? null
  const loteActivo = preparaciones.find((p) => p.liberadoEn && !p.cerradoEn) ?? null
  const corridaActivaEnEsteTanque = loteActivo ? (corridasDelTurno.find((l) => l.loteId === loteActivo.id && l.activa) ?? null) : null
  /** Guardrail #1: el tanque tiene producto sin usar — al preparar encima, se suma solo por default (ver iniciar_preparacion). */
  const tieneResto = (tanque.condicion === "LISTO" || tanque.condicion === "STANDBY") && (tanque.volumenL ?? 0) > 0
  const destinosDisponibles = tanquesDelTurno.filter(
    (t) =>
      t.numeroTanque !== tanque.numeroTanque &&
      (t.condicion === "LIMPIO" || ((t.condicion === "LISTO" || t.condicion === "STANDBY") && t.saborId !== null && t.saborId === tanque.saborId)),
  )

  async function transferir() {
    if (tanqueDestino === "" || transferExcedeMax) return
    if (corridaActivaEnEsteTanque && !confirmandoRedireccion) {
      setConfirmandoRedireccion(true)
      return
    }
    setTransfiriendo(true)
    setErrorTransferir(null)
    const resultado = await onTransferir(tanque.numeroTanque, tanqueDestino, modoTransferencia, motivoTransferencia)
    setTransfiriendo(false)
    if (!resultado.ok) {
      setErrorTransferir(resultado.error)
      return
    }
    setMostrarTransferir(false)
    setMedirDestino(tanqueDestino as 1 | 2 | 3)
    setVolMedido("")
    setErrorMedir(null)
    setTanqueDestino("")
    setModoTransferencia("LIQUIDO")
    setMotivoTransferencia("CONSOLIDAR_RESTOS")
    setConfirmandoRedireccion(false)
  }

  /** El destino ya tiene su propio lote (Listo o Con Restos) — ahí sí hace falta elegir qué identidad sobrevive. Si está Limpio, los dos modos dan lo mismo. */
  const tanqueDestinoElegido = destinosDisponibles.find((t) => t.numeroTanque === tanqueDestino) ?? null
  const destinoConLotePropio = tanqueDestinoElegido !== null && tanqueDestinoElegido.condicion !== "LIMPIO"
  const volumenTransferido = tanque.volumenL ?? 0
  const volumenDestinoResultante = volumenTransferido + (tanqueDestinoElegido?.volumenL ?? 0)
  /** El CHECK de base rechaza pasar de TANK_MAX_VOLUMEN — se frena antes con un mensaje claro. */
  const transferExcedeMax = volumenDestinoResultante > TANK_MAX_VOLUMEN

  /** Tanque destino tal como quedó DESPUÉS de la transferencia (dato fresco del turno). */
  const destinoMedicion = medirDestino !== null ? tanquesDelTurno.find((t) => t.numeroTanque === medirDestino) : undefined

  async function guardarMedicion() {
    if (!destinoMedicion || destinoMedicion.saborId === null) return
    const real = Number(volMedido)
    if (!Number.isFinite(real) || real < 0) return
    setMidiendo(true)
    setErrorMedir(null)
    const resultado = await onMedirTanque(destinoMedicion.numeroTanque, real)
    setMidiendo(false)
    if (!resultado.ok) {
      setErrorMedir(resultado.error)
      return
    }
    setMedirDestino(null)
    setVolMedido("")
  }

  async function desvasar() {
    if (!confirmandoDesvase) {
      setConfirmandoDesvase(true)
      return
    }
    setDesvasando(true)
    setErrorDesvase(null)
    const resultado = await onDesvasar(tanque.numeroTanque)
    setDesvasando(false)
    if (!resultado.ok) {
      setErrorDesvase(resultado.error)
      return
    }
    setConfirmandoDesvase(false)
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
      <CardContent className="flex flex-col gap-3 px-2 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">
            <Container className="size-4.5 text-muted-foreground" />
            Tanque {tanque.numeroTanque}
          </span>
          <Badge variant={badgeVariantCondicion[tanque.condicion]} className="shrink-0">
            {nombreCondicionTanque(tanque.condicion, tanque.volumenL)}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
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
              <p className="num text-xl font-bold text-foreground">
                {(tanque.volumenL ?? 0).toLocaleString("es-CO")} L
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {tanque.condicion === "LISTO" && (
            <p className="text-sm break-words text-muted-foreground">
              {tanque.saborNombre ?? "Sin sabor"}
              {tanque.lote ? ` · Lote ${tanque.lote}` : ""}
            </p>
          )}

          {tanque.condicion === "STANDBY" && (
            <p className="text-sm break-words text-muted-foreground">
              Resto de {tanque.saborNombre ?? "sabor sin datos"}
              {tanque.lote ? ` · Lote ${tanque.lote}` : ""} — el lote ya se cerró. Para usarlo:
              Transferir o preparar encima (se suma al lote nuevo).
            </p>
          )}

          {tanque.condicion === "EN_PREPARACION" && (
            <p className="text-sm break-words text-muted-foreground">
              {loteAbierto
                ? `${loteAbierto.saborNombre ?? "Sin sabor"}${loteAbierto.lote ? ` · Lote ${loteAbierto.lote}` : ""} · ${loteAbierto.tambores} ${unidadPreparacion(loteAbierto.saborNombre)}${loteAbierto.volumenActualL ? ` · ${loteAbierto.volumenActualL} L` : ""}`
                : "Sin datos de la preparación."}
            </p>
          )}

          {tanque.condicion === "SUCIO" && (
            <p className="text-sm break-words text-muted-foreground">
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
          ) : (
            <div className="flex flex-col gap-2">
              {tieneResto && (
                <p className="text-xs text-muted-foreground">
                  Quedan {(tanque.volumenL ?? 0).toLocaleString("es-CO")} L de {tanque.saborNombre} sin usar — al preparar
                  encima, se suman solos al lote nuevo. Para otra cosa: Transferir o Desvase.
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
                  <Button size="sm" variant="outline" onClick={desvasar} disabled={desvasando}>
                    {desvasando ? <Loader2 className="size-3.5 animate-spin" /> : <PackageOpen className="size-3.5" />}
                    {confirmandoDesvase ? "¿Seguro? Sí, desvasar" : "Desvase"}
                  </Button>
                )}
                {DESVASE_HABILITADO && confirmandoDesvase && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmandoDesvase(false)} disabled={desvasando}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          ))}

        {errorDesvase && (
          <p className="text-xs text-destructive" role="alert">
            {errorDesvase}
          </p>
        )}

        {modo === "preparacion" && mostrarTransferir && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Manda los <span className="font-medium text-foreground">{volumenTransferido.toLocaleString("es-CO")} L</span> de{" "}
              {tanque.saborNombre} a otro tanque con el mismo sabor — este tanque queda Sucio.
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

            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">¿Por qué se transfiere?</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={motivoTransferencia === "CONSOLIDAR_RESTOS" ? "default" : "outline"}
                  onClick={() => setMotivoTransferencia("CONSOLIDAR_RESTOS")}
                >
                  Consolidar restos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={motivoTransferencia === "ENRUTAR_MANIFOLD" ? "default" : "outline"}
                  onClick={() => setMotivoTransferencia("ENRUTAR_MANIFOLD")}
                >
                  No parar la línea
                </Button>
              </div>
            </div>

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

            {tanqueDestinoElegido && (
              <p className="text-xs text-muted-foreground">
                Se transfieren <span className="font-medium text-foreground">{volumenTransferido.toLocaleString("es-CO")} L</span>.
                El Tanque {tanqueDestinoElegido.numeroTanque} queda con ~
                <span className="font-medium text-foreground">{volumenDestinoResultante.toLocaleString("es-CO")} L</span>{" "}
                (calculado — falta medir el tanque).
                {volumenDestinoResultante > TANK_CAPACITY && !transferExcedeMax && (
                  <span className="text-warning">
                    {" "}
                    Queda sobre los {TANK_CAPACITY.toLocaleString("es-CO")} L nominales del tanque.
                  </span>
                )}
              </p>
            )}

            {transferExcedeMax && (
              <p className="text-xs text-destructive" role="alert">
                No se puede: el Tanque {tanqueDestinoElegido?.numeroTanque} quedaría con ~
                {volumenDestinoResultante.toLocaleString("es-CO")} L y el máximo permitido es{" "}
                {TANK_MAX_VOLUMEN.toLocaleString("es-CO")} L. Baja primero el tanque destino o transfiere a otro.
              </p>
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
              <Button
                size="sm"
                disabled={tanqueDestino === "" || transfiriendo || transferExcedeMax}
                onClick={transferir}
              >
                {transfiriendo ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                {confirmandoRedireccion ? "Sí, transferir" : "Transferir"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMostrarTransferir(false)
                  setTanqueDestino("")
                  setModoTransferencia("LIQUIDO")
                  setMotivoTransferencia("CONSOLIDAR_RESTOS")
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

        {modo === "preparacion" && medirDestino !== null && destinoMedicion && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-warning/40 bg-warning-soft/30 p-3">
            <p className="text-xs text-muted-foreground">
              El Tanque {destinoMedicion.numeroTanque} quedó con ~
              <span className="font-medium text-foreground">{(destinoMedicion.volumenL ?? 0).toLocaleString("es-CO")} L</span>{" "}
              (calculado por la transferencia). Mide el tanque y confirma el volumen real.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                className="h-8 w-32"
                placeholder={String(destinoMedicion.volumenL ?? 0)}
                value={volMedido}
                onChange={(e) => setVolMedido(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">L</span>
              <Button size="sm" disabled={midiendo || volMedido.trim() === ""} onClick={guardarMedicion}>
                {midiendo ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Guardar volumen real
              </Button>
              <Button size="sm" variant="ghost" disabled={midiendo} onClick={() => setMedirDestino(null)}>
                Está bien así
              </Button>
            </div>
            {errorMedir && (
              <p className="text-xs text-destructive" role="alert">
                {errorMedir}
              </p>
            )}
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
  const [desvasesGuardados, setDesvasesGuardados] = useState<Desvase[]>([])
  const [desvaseId, setDesvaseId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setDesvaseId("")
    if (!DESVASE_HABILITADO || !saborId || !areaCodigo) {
      setDesvasesGuardados([])
      return
    }
    listarDesvases(usuarioSesion, areaCodigo, saborId).then(setDesvasesGuardados)
  }, [saborId, areaCodigo, usuarioSesion])

  const saborElegido = sabores.find((s) => s.id === saborId)
  const unidadPrep = unidadPreparacion(saborElegido ? `${saborElegido.nombre} ${saborElegido.familiaNombre}` : null)
  const desvaseElegido = desvasesGuardados.find((r) => r.id === desvaseId)
  const litrosEstimados =
    saborElegido?.volumen && tambores !== "" && Number(tambores) > 0
      ? Math.round(Number(tambores) * saborElegido.volumen) + volumenRestante + (desvaseElegido?.litros ?? 0)
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
      desvaseId: desvaseId || null,
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

      {DESVASE_HABILITADO && saborId !== "" && desvasesGuardados.length > 0 && (
        <Select value={desvaseId} onValueChange={setDesvaseId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sumar un desvase guardado (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {desvasesGuardados.map((r) => (
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
          {desvaseElegido ? ` + ${desvaseElegido.litros.toLocaleString("es-CO")} L guardados` : ""}
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
