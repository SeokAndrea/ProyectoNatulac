import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRightLeft, Beaker, CheckCircle2, Factory, Loader2, PauseCircle, PenLine, PlayCircle, Square, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineaVisual, type EstadoVisualLinea } from "@/components/LineaVisual"
import { CintaEstadoLinea, type EstadoCinta } from "@/components/CintaEstadoLinea"
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
import { paradasQueDetienenLineas } from "@/lib/produccion/ajustes"
import { useSesionTurno } from "@/lib/sesionTurno"
import {
  MOTIVOS_CIP,
  type CondicionLinea,
  type Corrida,
  type DatosActivarLinea,
  type DatosCambiarLinea,
  type DatosCipLinea,
  type LineaEstado,
  type MotivoCip,
  type ParadaQueDetiene,
} from "@/lib/produccion/tipos"

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
export function LineasEstadoPlanta({
  modo,
  turnoId,
}: {
  modo: ModoEstadoPlanta
  /** Turno a mostrar/editar — omitido usa el turno en vivo (ver usePreparacion). Superadmin en modo corrección lo pisa. */
  turnoId?: string | null
}) {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const { tanques, cargando: cargandoPreparacion } = usePreparacion(turnoId)
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
    ponerLineaEnCip,
    terminarCip,
    continuarCorridaDetenida,
    terminarLinea,
  } = useProduccion(turnoId)

  // Qué parada (+1) tiene detenida a cada línea: hasta completarla no se termina el CIP.
  const sesion = useSesionTurno()
  const idTurno = turnoId === undefined ? sesion.turnoId : turnoId
  const [paradasDetienen, setParadasDetienen] = useState<ParadaQueDetiene[]>([])
  const recargarParadas = useCallback(async () => {
    setParadasDetienen(idTurno ? await paradasQueDetienenLineas(idTurno) : [])
  }, [idTurno])
  useEffect(() => {
    void recargarParadas()
  }, [recargarParadas])

  /** Después de un CIP o de terminarlo, se vuelve a leer qué parada detiene a cada línea. */
  function yRecargarParadas<A extends unknown[]>(fn: (...args: A) => Promise<Resultado>) {
    return async (...args: A) => {
      const resultado = await fn(...args)
      if (resultado.ok) await recargarParadas()
      return resultado
    }
  }

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
            onPausar={yRecargarParadas(pausarLinea)}
            onContinuar={yRecargarParadas(continuarLinea)}
            onDetenerLineaPorFalla={detenerLineaPorFalla}
            onContinuarSiguienteLote={continuarSiguienteLote}
            onSeguirMismoLote={seguirMismoLote}
            onConfirmarEstadoLinea={confirmarEstadoLinea}
            onCambiarCondicionLinea={cambiarCondicionLinea}
            paradaQueDetiene={paradasDetienen.find((p) => p.linea === l.codigo && p.pendiente) ?? null}
            onPonerEnCip={yRecargarParadas(ponerLineaEnCip)}
            onTerminarCip={yRecargarParadas(terminarCip)}
            onContinuarCorridaDetenida={continuarCorridaDetenida}
            onTerminarLinea={terminarLinea}
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
  paradaQueDetiene,
  onPonerEnCip,
  onTerminarCip,
  onContinuarCorridaDetenida,
  onTerminarLinea,
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
  /** Parada (+1) sin completar que tiene detenida a esta línea (la del CIP). */
  paradaQueDetiene: ParadaQueDetiene | null
  onPonerEnCip: (datos: DatosCipLinea) => Promise<Resultado>
  onTerminarCip: (linea: string) => Promise<Resultado>
  onContinuarCorridaDetenida: (corridaId: string) => Promise<Resultado>
  onTerminarLinea: (corridaId: string) => Promise<Resultado>
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
  /** "Parada": muestra el textarea de la descripción (obligatoria) antes de pausar. Suma el +1 en Registrar Paradas. */
  const [mostrarParada, setMostrarParada] = useState(false)
  /** "Detener línea": 2ª confirmación — deja la corrida esperando el PT. */
  const [confirmarDetener, setConfirmarDetener] = useState(false)
  const [enviandoEstadoLinea, setEnviandoEstadoLinea] = useState(false)
  /**
   * Formulario de CIP, paso a paso (plan-lineas-pt-paradas.md, sección C):
   * motivo → (con corrida) ¿el lote sigue? → descripción opcional →
   * confirmar dos veces. Cada respuesta reemplaza a su pregunta; Cancelar
   * borra todo.
   */
  const [cip, setCip] = useState<{
    conCorrida: boolean
    motivo: MotivoCip | null
    loteSigue: boolean | null
    descripcion: string
    confirmar: boolean
  } | null>(null)
  /** "El lote ya no sigue" (CIP con el lote en pausa): segunda confirmación. */
  const [confirmarLoteNoSigue, setConfirmarLoteNoSigue] = useState(false)
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
  /** "Cambiar de lote" con la corrida en marcha: confirmación antes de pasar al tanque del lote siguiente. */
  const [confirmarCambioLote, setConfirmarCambioLote] = useState(false)

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
    setConfirmarCambioLote(false)
  }

  /** Selector de tanque a mano cuando "Continuar al siguiente lote" / "Cambiar de lote" no detectó solo el siguiente. */
  function renderElegirTanqueSiguiente() {
    return (
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
                  setConfirmarCambioLote(false)
                  setErrorAccion(null)
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /** "Parada": pausa la corrida con una descripción obligatoria y suma el +1 en Registrar Paradas. Sigue activa: se continúa (con la parada completa) o se detiene. */
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

  function abrirCip(conCorrida: boolean) {
    setErrorAccion(null)
    setCip({ conCorrida, motivo: null, loteSigue: null, descripcion: "", confirmar: false })
  }

  async function enviarCip() {
    if (!cip || !cip.motivo) return
    if (!cip.confirmar) {
      setCip({ ...cip, confirmar: true })
      return
    }
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onPonerEnCip({
      linea: lineaCodigo,
      motivo: cip.motivo,
      descripcion: cip.descripcion,
      corridaId: cip.conCorrida ? (lineaTurno?.id ?? null) : null,
      loteSigue: cip.conCorrida ? cip.loteSigue : null,
    })
    setEnviandoAccion(false)
    if (!resultado.ok) {
      setErrorAccion(resultado.error)
      return
    }
    setCip(null)
  }

  async function terminarElCip() {
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onTerminarCip(lineaCodigo)
    setEnviandoAccion(false)
    if (!resultado.ok) setErrorAccion(resultado.error)
  }

  async function continuarLoteDetenido() {
    if (!corridaEsperandoPt) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onContinuarCorridaDetenida(corridaEsperandoPt.id)
    setEnviandoAccion(false)
    if (!resultado.ok) setErrorAccion(resultado.error)
  }

  async function loteNoSigue() {
    if (!lineaTurno) return
    setEnviandoAccion(true)
    setErrorAccion(null)
    const resultado = await onTerminarLinea(lineaTurno.id)
    setEnviandoAccion(false)
    if (!resultado.ok) {
      setErrorAccion(resultado.error)
      return
    }
    setConfirmarLoteNoSigue(false)
  }

  const nombreMotivo = (m: MotivoCip) => MOTIVOS_CIP.find((x) => x.codigo === m)?.nombre ?? m

  /** Formulario de CIP paso a paso: una pregunta a la vez; lo respondido queda en una línea. */
  function renderFormCip() {
    if (!cip) return null
    const listo = cip.motivo !== null && (!cip.conCorrida || cip.loteSigue !== null)
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-semibold text-foreground">Poner en CIP</p>
        {cip.motivo === null ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Motivo del CIP</p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_CIP.map((m) => (
                <Button key={m.codigo} size="sm" variant="outline" onClick={() => setCip({ ...cip, motivo: m.codigo })}>
                  {m.nombre}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Motivo: <span className="font-medium text-foreground">{nombreMotivo(cip.motivo)}</span>
          </p>
        )}

        {cip.conCorrida && cip.motivo !== null && lineaTurno && (
          cip.loteSigue === null ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">¿El Lote {lineaTurno.lote ?? ""} sigue después del CIP?</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setCip({ ...cip, loteSigue: true })}>
                  Sí, sigue
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCip({ ...cip, loteSigue: false })}>
                  No, termina aquí
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Lote {lineaTurno.lote ?? ""}:{" "}
              <span className="font-medium text-foreground">{cip.loteSigue ? "sigue después del CIP" : "termina aquí"}</span>
            </p>
          )
        )}

        {listo && (
          <>
            <Textarea
              value={cip.descripcion}
              onChange={(e) => setCip({ ...cip, descripcion: e.target.value.slice(0, 140), confirmar: false })}
              maxLength={140}
              rows={2}
              placeholder="Descripción breve (opcional: ya está el motivo)"
              className="text-sm"
            />
            {cip.confirmar && (
              <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
                {cip.conCorrida && lineaTurno
                  ? cip.loteSigue
                    ? `La línea para y queda en CIP. El Lote ${lineaTurno.lote ?? ""} continúa al terminar el CIP.`
                    : `La corrida del Lote ${lineaTurno.lote ?? ""} se detiene y queda esperando su Producto Terminado.`
                  : "La línea queda en CIP."}{" "}
                Se suma un +1 en Registrar Paradas. ¿Confirmas?
              </p>
            )}
          </>
        )}

        {errorAccion && (
          <p className="text-xs text-destructive" role="alert">
            {errorAccion}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {listo && (
            <Button size="sm" variant={cip.confirmar ? "destructive" : "default"} onClick={enviarCip} disabled={enviandoAccion}>
              {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
              {cip.confirmar ? "Sí, poner en CIP" : "Poner en CIP"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setCip(null)} disabled={enviandoAccion}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  /** Aviso cuando la parada del CIP (el +1) todavía no tiene tipo o minutos: hasta completarla no se termina el CIP. */
  function renderParadaPendiente(accion = "terminar el CIP") {
    if (!paradaQueDetiene) return null
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-warning/40 bg-warning-soft/40 p-2">
        <p className="text-xs text-foreground">
          Para {accion}, completa la parada («{paradaQueDetiene.tipoNombre}») en Registrar Paradas: tipo y minutos.
        </p>
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link to={`/paradas?parada=${paradaQueDetiene.paradaId}`}>Ir a Registrar Paradas</Link>
        </Button>
      </div>
    )
  }

  /** Línea en CIP sin corrida en pausa: motivo, desde cuándo y Terminó CIP (bloqueado mientras falte la parada). */
  function renderEstadoCip() {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {lineaEstado?.observacion ? <span className="font-medium text-foreground">{lineaEstado.observacion}. </span> : null}
          En CIP{lineaEstado?.cipIniciadoEn ? ` desde las ${horaCortaPlanta(lineaEstado.cipIniciadoEn, lineaEstado.cipIniciadoEn)}` : ""}.
        </p>
        {renderParadaPendiente()}
        <Button size="sm" className="self-start" disabled={enviandoAccion || paradaQueDetiene !== null} onClick={terminarElCip}>
          {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Terminó CIP
        </Button>
        {errorAccion && (
          <p className="text-xs text-destructive" role="alert">
            {errorAccion}
          </p>
        )}
      </div>
    )
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
    if (cip && !cip.conCorrida) return renderFormCip()
    return (
      <div className="flex flex-col gap-2">
        {condicionLinea === "CIP" && !bloqueadoPorCorrida ? (
          renderEstadoCip()
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
            <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => abrirCip(false)}>
              <Beaker className="size-3.5" />
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

  /** "Parada": pausa la corrida con una descripción OBLIGATORIA. */
  function renderParadaOperacional() {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs text-foreground">
          Parada: la corrida se pausa y se suma un +1 en Registrar Paradas. Escribe qué pasó; el tipo y los minutos se ponen allá.
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

  /** CIP con el lote en pausa (sigue después), o CIP con una corrida esperando su PT: se muestra "En CIP". */
  const enCip = condicionLinea === "CIP"
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
        ? enCip
          ? "cip"
          : "parada"
        : "corriendo"
  // Corriendo, en pausa, CIP y detenida: la cinta animada (misma que el Panel
  // de Producción). El resto de los estados sigue con su ícono.
  const estadoCinta: EstadoCinta | null = activa
    ? loteTerminado
      ? null
      : pausada
        ? enCip
          ? "cip"
          : "parada"
        : "corriendo"
    : condicionLinea === "CIP"
      ? "cip"
      : condicionLinea === "DETENIDA"
        ? "detenida"
        : null

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
              ? enCip
                ? "En CIP"
                : "Esperando PT"
              : !activa
                ? nombreCondicionLinea[condicionLinea]
                : loteTerminado
                  ? "Terminó el Lote"
                  : pausada
                    ? enCip
                      ? "En CIP"
                      : "Parada"
                    : "Corriendo"}
          </Badge>
        </div>

        {estadoCinta ? (
          <CintaEstadoLinea
            estado={estadoCinta}
            saborNombre={lineaTurno?.saborNombre}
            presentacion={lineaTurno?.presentacion}
            escala={1.8}
            className="w-full"
          />
        ) : (
          <LineaVisual
            numeroLinea={numeroLinea}
            estado={estadoVisual}
            color={colorSabor(lineaTurno?.saborNombre ?? null)}
            square
            saborNombre={lineaTurno?.saborNombre ?? null}
            presentacion={lineaTurno?.presentacion ?? null}
          />
        )}

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

        {/* Tras "Continuar al siguiente lote" la corrida vieja queda esperando su PT
            aunque la línea ya corra con otra: sin este aviso, Finalizar Turno la
            rechaza y el supervisor no ve por qué. */}
        {activa && corridaEsperandoPt && (
          <p className="rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-xs text-foreground">
            La corrida anterior{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""} espera su Producto
            Terminado. Cárgalo en Producto Terminado.
          </p>
        )}

        {/* Status (revisión de inicio): una línea heredada corriendo que
            todavía no se revisó solo ofrece Confirmar / Corregir — la base
            no deja cargar contador ni PT de una línea sin confirmar, así que
            detenerla antes de confirmar la dejaría trabada esperando PT.
            Confirmada, tiene las MISMAS opciones que en Preparación. */}
        {modo === "status" && lineaTurno && !lineaTurno.confirmadoInicioEn && !editando ? (
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
        ) : (
          editando ? (
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
              {continuarEligeTanque && renderElegirTanqueSiguiente()}
            </div>
          ) : cip && cip.conCorrida && lineaTurno ? (
            renderFormCip()
          ) : pausada && enCip && lineaTurno ? (
            // CIP con el lote en pausa: al terminar el CIP la misma corrida sigue.
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {lineaEstado?.observacion ? <span className="font-medium text-foreground">{lineaEstado.observacion}. </span> : null}
                En CIP{lineaEstado?.cipIniciadoEn ? ` desde las ${horaCortaPlanta(lineaEstado.cipIniciadoEn, lineaEstado.cipIniciadoEn)}` : ""}. El
                Lote {lineaTurno.lote ?? ""} sigue después del CIP.
              </p>
              {renderParadaPendiente()}
              {confirmarLoteNoSigue ? (
                <div className="flex flex-col gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-2">
                  <p className="text-xs text-foreground">
                    La corrida del Lote {lineaTurno.lote ?? ""} se detiene y queda esperando su Producto Terminado. La línea sigue
                    en CIP. ¿Confirmas?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="destructive" onClick={loteNoSigue} disabled={enviandoAccion}>
                      Sí, el lote no sigue
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmarLoteNoSigue(false)} disabled={enviandoAccion}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={terminarElCip} disabled={enviandoAccion || paradaQueDetiene !== null}>
                    {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                    Terminó CIP: continuar el Lote {lineaTurno.lote ?? ""}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmarLoteNoSigue(true)} disabled={enviandoAccion}>
                    El lote ya no sigue
                  </Button>
                </div>
              )}
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : pausada && lineaTurno ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Parada.</p>
              {renderParadaPendiente("continuar")}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => accion(onContinuar)} disabled={enviandoAccion || paradaQueDetiene !== null}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Continuar
                </Button>
                <Button size="sm" variant="outline" onClick={() => abrirCip(true)} disabled={enviandoAccion}>
                  <Beaker className="size-3.5" />
                  Pasar a CIP
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
          ) : activa && lineaTurno && confirmarCambioLote ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs text-foreground">
                {nombreLinea} pasa al tanque del lote siguiente. La corrida del Lote {lineaTurno.lote ?? ""} queda esperando su
                Producto Terminado, y su tanque queda Con Restos hasta que Preparación lo resuelva. ¿Confirmas?
              </p>
              {!continuarEligeTanque && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => continuarSiguiente()} disabled={enviandoAccion}>
                    {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                    Sí, cambiar de lote
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setConfirmarCambioLote(false)
                      setErrorAccion(null)
                    }}
                    disabled={enviandoAccion}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
              {continuarEligeTanque && renderElegirTanqueSiguiente()}
            </div>
          ) : activa && lineaTurno ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {modo === "status" && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={empezarEdicion}>
                    <PenLine className="size-3.5" />
                    Corregir
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setObservacionBorrador("")
                    setMostrarParada(true)
                  }}
                >
                  <PauseCircle className="size-3.5" />
                  Parada
                </Button>
                <Button variant="outline" size="sm" onClick={() => abrirCip(true)}>
                  <Beaker className="size-3.5" />
                  CIP
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setErrorAccion(null)
                    setContinuarEligeTanque(false)
                    setTanqueContinuar("")
                    setConfirmarCambioLote(true)
                  }}
                >
                  <ArrowRightLeft className="size-3.5" />
                  Cambiar de lote
                </Button>
              </div>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : corridaEsperandoPt && enCip ? (
            // CIP en el que el lote terminó: falta su PT y terminar el CIP (en cualquier orden).
            <div className="flex flex-col gap-2">
              <p className="rounded-lg border border-warning/40 bg-warning-soft/40 p-2 text-xs text-foreground">
                La corrida{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""} espera su Producto Terminado.
              </p>
              {renderEstadoCip()}
            </div>
          ) : corridaEsperandoPt ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-xs text-foreground">
                Corrida detenida{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""}. Si el lote sigue,
                continúalo sin cargar Producto Terminado. Si no, carga su PT para cerrarla.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={continuarLoteDetenido} disabled={enviandoAccion}>
                  {enviandoAccion ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Continuar el Lote {corridaEsperandoPt.lote ?? ""}
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/producto-terminado">Cargar su PT</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={empezarEdicion}>
                  Arrancar con otro tanque
                </Button>
              </div>
              {errorAccion && (
                <p className="text-xs text-destructive" role="alert">
                  {errorAccion}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="self-start" onClick={empezarEdicion}>
                <PlayCircle className="size-3.5" />
                Arrancar línea
              </Button>
              {renderCondicionBotones()}
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
