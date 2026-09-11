import { useState } from "react"
import { Beaker, CheckCircle2, Factory, Loader2, PauseCircle, PenLine, PlayCircle, Square, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineaVisual, type EstadoVisualLinea } from "@/components/LineaVisual"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import { useAuth } from "@/lib/auth"
import { nombrePorCodigo, type LineaCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive, presentacionesPorLineaLive, velocidadesParaLive } from "@/lib/catalogosLive"
import { obtenerUltimaConfiguracionLinea } from "@/lib/lineas"
import { colorSabor } from "@/lib/coloresSabor"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import { useProduccion } from "@/lib/produccion/useProduccion"
import type { CondicionLinea, Corrida, DatosActivarLinea, DatosCambiarLinea, LineaEstado } from "@/lib/produccion/tipos"

type Resultado = { ok: true } | { ok: false; error: string }

const nombreCondicionLinea: Record<CondicionLinea, string> = {
  DETENIDA: "Parada",
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

/*
 * Líneas: el estado CONTINUO de las 3 líneas — antes vivía como pestaña
 * compartida adentro de EstadoPlantaTabs.tsx, ahora es su propia pieza y
 * su propia página (src/pages/apps/Lineas.tsx), más una sección
 * embebida en Status (revisión de INICIO) — ver
 * plan-rework-3-modulos-y-merma.md, Fase 1: "la página de líneas debe
 * ser su propia página como tal". Mismo prop "modo" que Tanques
 * (EstadoPlantaTabs.tsx) — ver el comentario ahí para el detalle
 * status/preparación.
 *
 * Costura #1 del plan: activar una corrida necesita leer, de solo
 * lectura, qué tanques están Listos — por eso llama a usePreparacion()
 * acá adentro además de useProduccion(), sin usar ninguna mutación de
 * Preparación.
 */
export function LineasEstadoPlanta({ modo }: { modo: ModoEstadoPlanta }) {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const { tanques, cargando: cargandoPreparacion } = usePreparacion()
  const {
    corridas,
    lineasEstado,
    cargando: cargandoProduccion,
    activarLinea,
    pausarLinea,
    continuarLinea,
    detenerLineaPorFalla,
    continuarSiguienteLote,
    seguirMismoLote,
    cambiarCondicionLinea,
    confirmarEstadoLinea,
  } = useProduccion()

  if (cargandoCatalogos || cargandoPreparacion || cargandoProduccion) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const tanquesListos = tanques.filter((t) => t.condicion === "LISTO")

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
      {lineas
        .filter((l) => l.activo)
        .map((l) => (
          <LineaCard
            key={l.codigo}
            lineaCodigo={l.codigo}
            nombreLinea={l.nombre}
            modo={modo}
            areaCodigo={session?.area ?? null}
            lineaTurno={corridas.find((c) => c.linea === l.codigo && c.activa) ?? null}
            corridaEsperandoPt={corridas.find((c) => c.linea === l.codigo && c.esperandoCierre) ?? null}
            lineaEstado={lineasEstado.find((le) => le.linea === l.codigo) ?? null}
            tanquesListos={tanquesListos}
            presentaciones={presentaciones}
            velocidades={velocidades}
            onActivar={activarLinea}
            onPausar={pausarLinea}
            onContinuar={continuarLinea}
            onDetenerLineaPorFalla={detenerLineaPorFalla}
            onContinuarSiguienteLote={continuarSiguienteLote}
            onSeguirMismoLote={seguirMismoLote}
            onConfirmarEstadoLinea={confirmarEstadoLinea}
            onCambiarCondicionLinea={cambiarCondicionLinea}
          />
        ))}
    </div>
  )
}

function LineaCard({
  lineaCodigo,
  nombreLinea,
  modo,
  areaCodigo,
  lineaTurno,
  corridaEsperandoPt,
  lineaEstado,
  tanquesListos,
  presentaciones,
  velocidades,
  onActivar,
  onPausar,
  onContinuar,
  onDetenerLineaPorFalla,
  onContinuarSiguienteLote,
  onSeguirMismoLote,
  onConfirmarEstadoLinea,
  onCambiarCondicionLinea,
}: {
  lineaCodigo: LineaCodigo
  nombreLinea: string
  modo: ModoEstadoPlanta
  areaCodigo: string | null
  lineaTurno: Corrida | null
  corridaEsperandoPt: Corrida | null
  lineaEstado: LineaEstado | null
  tanquesListos: TanqueRecepcion[]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  onActivar: (datos: DatosActivarLinea) => Promise<Resultado>
  onPausar: (corridaId: string, motivo?: string) => Promise<Resultado>
  onContinuar: (corridaId: string) => Promise<Resultado>
  onDetenerLineaPorFalla: (corridaId: string, motivo: string) => Promise<Resultado>
  onContinuarSiguienteLote: (corridaId: string, numeroTanque?: number) => Promise<Resultado>
  onSeguirMismoLote: (corridaId: string) => Promise<Resultado>
  onConfirmarEstadoLinea: (corridaId: string) => Promise<Resultado>
  onCambiarCondicionLinea: (datos: DatosCambiarLinea) => Promise<Resultado>
}) {
  const activa = lineaTurno !== null
  const pausada = lineaTurno?.pausadaEn != null
  const loteTerminado = lineaTurno?.loteTerminado != null
  const condicionLinea = lineaEstado?.condicion ?? "DETENIDA"
  /** Sin corrida activa, pero quedó una corrida detenida esperando que se cargue su Producto Terminado. */
  const esperandoPt = !activa && corridaEsperandoPt !== null
  const [editando, setEditando] = useState(false)
  /** Confirmación de "Arrancar línea": el resumen de qué se va a arrancar antes de mandarlo (cambio brusco → confirmar dos veces). */
  const [confirmarActivar, setConfirmarActivar] = useState(false)
  /** "Parada Operacional": muestra el textarea del motivo (obligatorio) antes de pausar. */
  const [mostrarParada, setMostrarParada] = useState(false)
  /** "Detener línea": 2ª confirmación — deja la corrida esperando el PT. */
  const [confirmarDetener, setConfirmarDetener] = useState(false)
  const [enviandoEstadoLinea, setEnviandoEstadoLinea] = useState(false)
  const [errorEstadoLinea, setErrorEstadoLinea] = useState<string | null>(null)
  const [observacionBorrador, setObservacionBorrador] = useState(lineaEstado?.observacion ?? "")
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">(lineaTurno?.presentacion ?? "")
  const [envasesHora, setEnvasesHora] = useState<number | "">(lineaTurno?.envasesHora ?? "")
  const [numeroTanque, setNumeroTanque] = useState<1 | 2 | 3 | "">("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [enviandoAccion, setEnviandoAccion] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  /** "Continuar al siguiente lote" falló el auto-detect → mostrar el selector de tanque a mano. */
  const [continuarEligeTanque, setContinuarEligeTanque] = useState(false)
  const [tanqueContinuar, setTanqueContinuar] = useState<number | "">("")

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
    setConfirmarActivar(false)
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

  /** Paso 1: llenar el formulario y pasar al resumen. Paso 2 (confirmarActivar): mandar. */
  async function guardar() {
    if (!valido) return
    if (!confirmarActivar) {
      setConfirmarActivar(true)
      return
    }
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
    setConfirmarActivar(false)
  }

  function cerrarEdicion() {
    setEditando(false)
    setConfirmarActivar(false)
  }

  async function accion(fn: (corridaId: string) => Promise<Resultado>) {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await fn(lineaTurno.id)
    setEnviandoAccion(false)
    if (!resultado.ok) setErrorAccion(resultado.error)
  }

  /**
   * "Continuar al siguiente lote". Sin tanque = auto-detecta el lote+1
   * (mismo sabor, un solo tanque Listo). Si eso falla, abre el selector
   * de tanque a mano y se reintenta con el que elija el supervisor.
   */
  async function continuarSiguiente(numeroTanque?: number) {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onContinuarSiguienteLote(lineaTurno.id, numeroTanque)
    setEnviandoAccion(false)
    if (!resultado.ok) {
      setErrorAccion(resultado.error)
      if (numeroTanque === undefined) setContinuarEligeTanque(true)
      return
    }
    setContinuarEligeTanque(false)
    setTanqueContinuar("")
  }

  /** "Parada Operacional": pausa la corrida con un motivo obligatorio. Sigue activa, se puede Continuar o Detener línea. */
  async function confirmarParada() {
    if (!lineaTurno || observacionBorrador.trim() === "") return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onPausar(lineaTurno.id, observacionBorrador.trim())
    setEnviandoAccion(false)
    if (!resultado.ok) {
      setErrorAccion(resultado.error)
      return
    }
    setMostrarParada(false)
    setObservacionBorrador("")
  }

  /** "Detener línea": la corrida pasa a Esperando PT + la línea queda Detenida con el motivo. */
  async function confirmarDetenerLinea() {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onDetenerLineaPorFalla(lineaTurno.id, observacionBorrador.trim())
    setEnviandoAccion(false)
    if (!resultado.ok) {
      setErrorAccion(resultado.error)
      return
    }
    setConfirmarDetener(false)
    setObservacionBorrador("")
  }

  async function cambiarEstadoLinea(condicion: CondicionLinea, observacion?: string | null) {
    setEnviandoEstadoLinea(true)
    setErrorEstadoLinea(null)
    const resultado = await onCambiarCondicionLinea({ linea: lineaCodigo, condicion, observacion })
    setEnviandoEstadoLinea(false)
    if (!resultado.ok) {
      setErrorEstadoLinea(resultado.error)
    }
  }

  /**
   * Botones de condición de línea: Sin programación / Cambio de Presentación / CIP.
   * `bloqueadoPorCorrida` = la línea tiene una corrida activa (o detenida sin
   * su Producto Terminado): se muestran los 3 pero deshabilitados y con la
   * razón, porque `cambiar_condicion_linea` los rechaza en ese estado
   * (migración 20261027).
   */
  function renderCondicionBotones({ bloqueadoPorCorrida = false }: { bloqueadoPorCorrida?: boolean } = {}) {
    const deshabilitado = enviandoEstadoLinea || bloqueadoPorCorrida
    return (
      <div className="flex flex-col gap-2">
        {condicionLinea === "CIP" && !bloqueadoPorCorrida ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              En CIP{lineaEstado?.cipIniciadoEn ? ` desde las ${horaCortaPlanta(lineaEstado.cipIniciadoEn, lineaEstado.cipIniciadoEn)}` : ""}.
            </p>
            <Button size="sm" disabled={enviandoEstadoLinea} onClick={() => cambiarEstadoLinea("LISTA")}>
              {enviandoEstadoLinea ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Terminó CIP
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={!bloqueadoPorCorrida && condicionLinea === "SIN_PROGRAMACION" ? "default" : "outline"}
              disabled={deshabilitado}
              onClick={() => cambiarEstadoLinea("SIN_PROGRAMACION")}
            >
              Sin programación
            </Button>
            <Button
              size="sm"
              variant={!bloqueadoPorCorrida && condicionLinea === "CAMBIO_PRESENTACION" ? "default" : "outline"}
              disabled={deshabilitado}
              onClick={() => cambiarEstadoLinea("CAMBIO_PRESENTACION")}
            >
              Cambio de Presentación
            </Button>
            <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => cambiarEstadoLinea("CIP")}>
              {enviandoEstadoLinea ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
              Iniciar CIP
            </Button>
          </div>
        )}
        {bloqueadoPorCorrida && (
          <p className="text-[11px] text-muted-foreground">
            Para cambiar el estado de la línea, primero detén la corrida y carga su Producto Terminado.
          </p>
        )}
        {errorEstadoLinea && (
          <p className="text-xs text-destructive" role="alert">
            {errorEstadoLinea}
          </p>
        )}
      </div>
    )
  }

  /** "Parada Operacional": pausa la corrida con un motivo OBLIGATORIO. */
  function renderParadaOperacional() {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs text-foreground">
          Parada Operacional — la corrida se pausa (se puede Continuar o Detener línea). Escribe el motivo.
        </p>
        <Textarea
          value={observacionBorrador}
          onChange={(e) => setObservacionBorrador(e.target.value.slice(0, 140))}
          maxLength={140}
          rows={2}
          placeholder="Motivo de la parada — se muestra en el dashboard"
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{observacionBorrador.length}/140</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMostrarParada(false)
                setObservacionBorrador("")
              }}
              disabled={enviandoAccion}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarParada} disabled={enviandoAccion || observacionBorrador.trim() === ""}>
              {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
              Confirmar parada
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

  /** "Detener línea": 2ª confirmación. La corrida queda Esperando PT (se cierra al cargar el Producto Terminado). */
  function renderDetenerLinea() {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-3">
        <p className="text-xs text-foreground">
          Esto detiene la corrida{lineaTurno?.lote ? ` del Lote ${lineaTurno.lote}` : ""}. Queda <span className="font-medium">esperando que cargues su Producto Terminado</span> para cerrarse. No se puede deshacer.
        </p>
        <Textarea
          value={observacionBorrador}
          onChange={(e) => setObservacionBorrador(e.target.value.slice(0, 140))}
          maxLength={140}
          rows={2}
          placeholder="Motivo (opcional) — se muestra en el dashboard"
          className="text-sm"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirmarDetener(false)
              setObservacionBorrador("")
            }}
            disabled={enviandoAccion}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirmarDetenerLinea}
            disabled={enviandoAccion}
          >
            {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
            Sí, detener línea
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

        {confirmarActivar && valido && tanqueElegido && (
          <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
            Vas a arrancar <span className="font-medium">{nombreLinea}</span> con{" "}
            <span className="font-medium">{tanqueElegido.saborNombre ?? "sin sabor"}</span>
            {tanqueElegido.lote ? ` · Lote ${tanqueElegido.lote}` : ""} del Tanque {tanqueElegido.numeroTanque}, a{" "}
            {presentacion} ml · {envasesHora} env/h. ¿Confirmar?
          </p>
        )}

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!valido || guardando} onClick={guardar}>
            {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {confirmarActivar ? "Sí, arrancar línea" : "Arrancar línea"}
          </Button>
          <Button size="sm" variant="ghost" onClick={cerrarEdicion}>
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
      <CardContent className="flex flex-col gap-3 px-2 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
            <Factory className="size-4 shrink-0 text-muted-foreground" />
            {nombreLinea}
          </p>
          <Badge
            variant={
              esperandoPt
                ? "warning"
                : !activa
                  ? badgeVariantCondicionLinea[condicionLinea]
                  : loteTerminado
                    ? "warning"
                    : pausada
                      ? "warning"
                      : "success"
            }
            className="shrink-0"
          >
            {esperandoPt
              ? "Esperando PT"
              : !activa
                ? nombreCondicionLinea[condicionLinea]
                : loteTerminado
                  ? "Terminó el Lote"
                  : pausada
                    ? "Parada"
                    : "Corriendo"}
          </Badge>
        </div>

        <LineaVisual numeroLinea={numeroLinea} estado={estadoVisual} color={colorSabor(lineaTurno?.saborNombre ?? null)} square />

        {activa && lineaTurno && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm [&>div]:min-w-0">
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
              <p className="font-medium break-words text-foreground">
                {lineaTurno.saborNombre ?? "—"}
                {lineaTurno.lote ? ` · ${lineaTurno.lote}` : ""}
              </p>
            </div>
          </div>
        )}

        {modo === "preparacion" &&
          (editando ? (
            renderFormularioEdicion()
          ) : mostrarParada ? (
            renderParadaOperacional()
          ) : confirmarDetener ? (
            renderDetenerLinea()
          ) : loteTerminado && lineaTurno ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-xs text-foreground">
                Se marcó que terminó el lote{lineaTurno.lote ? ` ${lineaTurno.lote}` : ""} de esta corrida — ¿sigue con el mismo
                lote, pasa al siguiente o se detiene la línea?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => accion(onSeguirMismoLote)} disabled={enviandoAccion}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                  Seguir con el mismo lote
                </Button>
                <Button size="sm" onClick={() => continuarSiguiente()} disabled={enviandoAccion}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Continuar al siguiente lote
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setObservacionBorrador("")
                    setConfirmarDetener(true)
                  }}
                  disabled={enviandoAccion}
                >
                  <Square className="size-3.5" />
                  Detener línea
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                "Seguir con el mismo lote" solo deshace el aviso — no toca el tanque ni los litros.
              </p>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
              {continuarEligeTanque && (
                <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
                  <p className="text-xs text-foreground">
                    No se detectó solo el tanque del siguiente lote. Elige cuál toma la línea:
                  </p>
                  {tanquesListos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ningún tanque está Listo todavía.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Select
                        value={tanqueContinuar === "" ? "" : String(tanqueContinuar)}
                        onValueChange={(v) => setTanqueContinuar(Number(v))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Tanque" />
                        </SelectTrigger>
                        <SelectContent>
                          {tanquesListos.map((t) => (
                            <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                              Tanque {t.numeroTanque} · {t.saborNombre ?? "Sin sabor"}
                              {t.lote ? ` · Lote ${t.lote}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={tanqueContinuar === "" || enviandoAccion}
                          onClick={() => continuarSiguiente(Number(tanqueContinuar))}
                        >
                          {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                          Continuar con ese tanque
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={enviandoAccion}
                          onClick={() => {
                            setContinuarEligeTanque(false)
                            setTanqueContinuar("")
                            setErrorAccion(null)
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : pausada && lineaTurno ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Parada Operacional.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => accion(onContinuar)} disabled={enviandoAccion}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Continuar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setObservacionBorrador("")
                    setConfirmarDetener(true)
                  }}
                  disabled={enviandoAccion}
                >
                  <Square className="size-3.5" />
                  Detener línea
                </Button>
              </div>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : activa && lineaTurno ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  setObservacionBorrador("")
                  setMostrarParada(true)
                }}
              >
                <PauseCircle className="size-3.5" />
                Parada Operacional
              </Button>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : corridaEsperandoPt ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-xs text-foreground">
                Corrida detenida{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""} — carga su Producto
                Terminado para cerrarla. Hasta entonces la línea no cambia de estado (Sin programación / Cambio de
                Presentación / CIP).
              </p>
              <Button variant="outline" size="sm" className="self-start" onClick={empezarEdicion}>
                <PlayCircle className="size-3.5" />
                Arrancar otra línea
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="self-start" onClick={empezarEdicion}>
                <PlayCircle className="size-3.5" />
                Arrancar línea
              </Button>
              {renderCondicionBotones()}
            </div>
          ))}

        {modo === "status" &&
          lineaTurno &&
          (editando ? (
            renderFormularioEdicion()
          ) : mostrarParada ? (
            renderParadaOperacional()
          ) : confirmarDetener ? (
            renderDetenerLinea()
          ) : !lineaTurno.confirmadoInicioEn ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-sm text-foreground">{nombreLinea}: así quedó del turno anterior — confirma o corrige.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={enviandoAccion} onClick={() => accion(onConfirmarEstadoLinea)}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Confirmar
                </Button>
                <Button size="sm" variant="outline" onClick={empezarEdicion}>
                  Corregir
                </Button>
              </div>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : pausada ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => accion(onContinuar)} disabled={enviandoAccion}>
                {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                Continuar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setObservacionBorrador("")
                  setConfirmarDetener(true)
                }}
              >
                <Square className="size-3.5" />
                Detener línea
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={empezarEdicion}>
                  <PenLine className="size-3.5" />
                  Corregir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setObservacionBorrador("")
                    setMostrarParada(true)
                  }}
                >
                  <PauseCircle className="size-3.5" />
                  Parada Operacional
                </Button>
              </div>
              {renderCondicionBotones({ bloqueadoPorCorrida: true })}
            </div>
          ))}

        {modo === "status" &&
          !activa &&
          (editando ? (
            renderFormularioEdicion()
          ) : corridaEsperandoPt ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-xs text-foreground">
                {nombreLinea} tiene una corrida detenida{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""} —
                falta cargar su Producto Terminado (en la página Producto Terminado) para cerrarla. Hasta entonces la línea
                no cambia de estado (Sin programación / Cambio de Presentación / CIP).
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="self-start" onClick={empezarEdicion}>
                <PlayCircle className="size-3.5" />
                Arrancar línea
              </Button>
              {renderCondicionBotones()}
            </div>
          ))}
      </CardContent>
    </Card>
  )
}
