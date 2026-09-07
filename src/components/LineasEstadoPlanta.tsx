import { useState } from "react"
import { Beaker, CheckCircle2, Factory, Loader2, PauseCircle, PenLine, PlayCircle, Square, TriangleAlert } from "lucide-react"
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
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import { useProduccion } from "@/lib/produccion/useProduccion"
import type { CondicionLinea, Corrida, DatosActivarLinea, DatosCambiarLinea, LineaEstado } from "@/lib/produccion/tipos"

type Resultado = { ok: true } | { ok: false; error: string }

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
    terminarSaborLinea,
    terminarLinea,
    detenerLineaPorFalla,
    continuarSiguienteLote,
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
            lineaEstado={lineasEstado.find((le) => le.linea === l.codigo) ?? null}
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
  lineaTurno: Corrida | null
  lineaEstado: LineaEstado | null
  tanquesListos: TanqueRecepcion[]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  onActivar: (datos: DatosActivarLinea) => Promise<Resultado>
  onPausar: (corridaId: string) => Promise<Resultado>
  onContinuar: (corridaId: string) => Promise<Resultado>
  onTerminarSabor: (corridaId: string) => Promise<Resultado>
  onTerminarLinea: (corridaId: string) => Promise<Resultado>
  onDetenerLineaPorFalla: (corridaId: string, motivo: string) => Promise<Resultado>
  onContinuarSiguienteLote: (corridaId: string) => Promise<Resultado>
  onConfirmarEstadoLinea: (corridaId: string) => Promise<Resultado>
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

  async function accion(fn: (corridaId: string) => Promise<Resultado>) {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await fn(lineaTurno.id)
    setEnviandoAccion(false)
    setDetener(false)
    if (!resultado.ok) setErrorAccion(resultado.error)
  }

  /** "Detener por falla": termina la corrida y anota el motivo en un solo paso — ver detenerLineaPorFalla en src/lib/produccion/ajustes.ts. */
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
            La línea se detiene y el tanque se conserva para cuando se retome. Anota que pasó (opcional).
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
      <CardContent className="flex flex-col gap-3 px-2 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
            <Factory className="size-4 shrink-0 text-muted-foreground" />
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
