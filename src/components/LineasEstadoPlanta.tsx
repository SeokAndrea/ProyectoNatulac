import { useCallback, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import { LineaCard } from "@/components/lineas/LineaCard"
import { ModoParadas } from "@/components/lineas/ModoParadas"
import type { AccionesLinea } from "@/components/lineas/tipos"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarParadas, type Parada } from "@/lib/paradas"
import { puede } from "@/lib/permisos"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { aplicarParadasALineas, paradasQueDetienenLineas } from "@/lib/produccion/ajustes"
import { sincronizarSheetSiHaceFalta } from "@/lib/paradasEnVivo"
import { useSesionTurno } from "@/lib/sesionTurno"
import { cn } from "@/lib/utils"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"
import type { ParadaQueDetiene, Resultado } from "@/lib/produccion/tipos"

/*
 * Líneas: el estado CONTINUO de las 3 líneas — antes vivía como pestaña
 * compartida adentro de EstadoPlantaTabs.tsx, ahora es su propia pieza y
 * su propia página (src/pages/apps/Lineas.tsx), más una sección
 * embebida en Status (revisión de INICIO) — ver
 * docs/plan-rework-3-modulos-y-merma.md, Fase 1: "la página de líneas debe
 * ser su propia página como tal". Mismo prop "modo" que Tanques
 * (EstadoPlantaTabs.tsx) — ver el comentario ahí para el detalle
 * status/preparación.
 *
 * Costura #1 del plan: activar una corrida necesita leer, de solo
 * lectura, qué tanques están Listos — por eso llama a usePreparacion()
 * acá adentro además de useProduccion(), sin usar ninguna mutación de
 * Preparación.
 *
 * La tarjeta de cada línea y sus paneles viven en src/components/lineas/.
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
  const produccion = useProduccion(turnoId)
  const { corridas, lineasEstado, cargando: cargandoProduccion } = produccion

  // Qué parada tiene detenida a cada línea: la abierta de una Parada, o el +1 del CIP (hasta completarlo no se termina el CIP).
  const sesion = useSesionTurno()
  const idTurno = turnoId === undefined ? sesion.turnoId : turnoId
  const [paradasDetienen, setParadasDetienen] = useState<ParadaQueDetiene[]>([])
  const recargarParadas = useCallback(async () => {
    setParadasDetienen(idTurno ? await paradasQueDetienenLineas(idTurno) : [])
  }, [idTurno])
  useEffect(() => {
    void recargarParadas()
  }, [recargarParadas])

  // Una parada abierta de 15 min o más (Registrar Paradas, Mantenimiento, Sheet) pone la línea en Parada sola: cada minuto se aplica y, si cambió algo, se relee.
  const areaParadas = session?.area === "PRUEBAS" ? "PRUEBAS" : session?.area ? "ASEPTICO" : null
  const { refrescar } = produccion
  // Y el Sheet de Mantenimiento entra solo (cada 5 min, si nadie lo trajo): sus paradas llegan sin apretar el botón.
  const usuarioSheet = areaParadas === "ASEPTICO" && (puede(session, "PARADAS_REGISTRAR") || session?.area === "MANTENIMIENTO") ? (session?.username ?? null) : null
  useEffect(() => {
    let vivo = true
    async function aplicar() {
      const delSheet = await sincronizarSheetSiHaceFalta(usuarioSheet)
      if (((await aplicarParadasALineas(areaParadas)) > 0 || delSheet) && vivo) {
        await Promise.all([refrescar(), recargarParadas()])
      }
    }
    void aplicar()
    const id = setInterval(() => void aplicar(), 60_000)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [areaParadas, usuarioSheet, refrescar, recargarParadas])

  // Los +1 sin minutos del área, para el botón «Paradas · N» de cada tarjeta (mismo rango que Registrar Paradas).
  const anotaParadas = puede(session, "PARADAS_REGISTRAR")
  const [pendientesParadas, setPendientesParadas] = useState<Parada[]>([])
  const recargarPendientes = useCallback(async () => {
    if (!anotaParadas || !areaParadas) return
    const hoy = fechaPlanta()
    const lista = await listarParadas({ desde: restarDias(hoy, 30), hasta: hoy, area: areaParadas })
    setPendientesParadas(lista.filter((p) => p.pendiente).sort((a, b) => a.inicio.localeCompare(b.inicio)))
  }, [anotaParadas, areaParadas])
  useEffect(() => {
    void recargarPendientes()
  }, [recargarPendientes])
  /** Se anotó o completó una parada: pendientes, qué detiene a cada línea y las corridas (una larga pausa la línea sola). */
  const paradasCambiaron = useCallback(async () => {
    await Promise.all([recargarPendientes(), recargarParadas(), refrescar()])
  }, [recargarPendientes, recargarParadas, refrescar])

  /** Después de un CIP o de terminarlo, se vuelve a leer qué parada detiene a cada línea. */
  function yRecargarParadas<A extends unknown[]>(fn: (...args: A) => Promise<Resultado>) {
    return async (...args: A) => {
      const resultado = await fn(...args)
      if (resultado.ok) await recargarParadas()
      return resultado
    }
  }

  // Modo Paradas (como el Modo Vacío de Preparación): solo en Líneas, con el turno en vivo y quien registra paradas.
  const [params, setParams] = useSearchParams()
  const conModoParadas = modo === "preparacion" && anotaParadas && (turnoId === undefined || turnoId === sesion.turnoId)
  const modoParadas = conModoParadas && params.get("paradas") === "1"
  function cambiarModoParadas() {
    const p = new URLSearchParams(params)
    if (modoParadas) p.delete("paradas")
    else p.set("paradas", "1")
    setParams(p, { replace: true })
  }
  // Status (revisión de inicio): confirmada la línea, parar y continuar también se hacen en el Modo Paradas de Líneas.
  const navigate = useNavigate()
  const irAModoParadas = modo === "status" && anotaParadas ? () => navigate("/lineas?paradas=1") : undefined

  if (cargandoCatalogos || cargandoPreparacion || cargandoProduccion) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const acciones: AccionesLinea = {
    activar: produccion.activarLinea,
    pausar: yRecargarParadas(produccion.pausarLinea),
    continuar: yRecargarParadas(produccion.continuarLinea),
    detener: produccion.detenerLineaPorFalla,
    continuarSiguienteLote: produccion.continuarSiguienteLote,
    seguirMismoLote: produccion.seguirMismoLote,
    confirmarEstado: produccion.confirmarEstadoLinea,
    cambiarCondicion: produccion.cambiarCondicionLinea,
    ponerEnCip: yRecargarParadas(produccion.ponerLineaEnCip),
    terminarCip: yRecargarParadas(produccion.terminarCip),
    continuarCorridaDetenida: produccion.continuarCorridaDetenida,
    terminarLinea: produccion.terminarLinea,
  }
  // Un tanque de Vacío no lo toma ninguna línea (el servidor también lo frena).
  const tanquesListos = tanques.filter((t) => t.condicion === "LISTO" && !t.paraVacio)

  const interruptor = conModoParadas && (
    <div className="mx-auto mb-3 flex max-w-6xl flex-wrap items-center justify-end gap-2">
      {modoParadas && <p className="mr-auto text-xs font-medium text-info-foreground">Modo Paradas: la cuenta del turno de cada línea y lo que falta cubrir.</p>}
      <button
        type="button"
        role="switch"
        aria-checked={modoParadas}
        onClick={cambiarModoParadas}
        className={cn(
          "flex items-center gap-2 rounded-sm border-2 bg-card py-1 pl-1.5 pr-3 text-xs font-bold tracking-wide transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info",
          modoParadas ? "border-info text-info-foreground" : "border-border text-muted-foreground",
        )}
      >
        <span className={cn("relative h-5 w-9 rounded-full transition-colors", modoParadas ? "bg-info" : "bg-border")}>
          <span className={cn("absolute left-0.5 top-0.5 size-4 rounded-full bg-card transition-transform", modoParadas && "translate-x-4")} />
        </span>
        MODO PARADAS
        {/* Las tarjetas ya no tienen el botón de Paradas: sus +1 pendientes se ven aquí. */}
        {!modoParadas && pendientesParadas.length > 0 && (
          <span className="num rounded-sm bg-warning-soft px-1.5 font-semibold text-warning-foreground" aria-label={`${pendientesParadas.length} pendientes`}>
            {pendientesParadas.length}
          </span>
        )}
      </button>
    </div>
  )

  if (modoParadas && session) {
    return (
      <div className="rounded-xl bg-info-soft/60 p-2">
        {interruptor}
        <ModoParadas
          lineas={lineas.filter((l) => l.activo).map((l) => ({ codigo: l.codigo, nombre: l.nombre }))}
          corridas={corridas}
          lineasEstado={lineasEstado}
          usuario={session.username}
          areaCodigo={session.area ?? null}
          pendientes={pendientesParadas}
          onCambio={paradasCambiaron}
          acciones={acciones}
          paradasDetienen={paradasDetienen}
        />
      </div>
    )
  }

  return (
    <>
    {interruptor}
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-3">
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
            paradaQueDetiene={paradasDetienen.find((p) => p.linea === l.codigo && p.pendiente) ?? null}
            paradaDeLinea={paradasDetienen.find((p) => p.linea === l.codigo) ?? null}
            acciones={acciones}
            paradas={
              anotaParadas && session
                ? { usuario: session.username, pendientes: pendientesParadas.filter((p) => p.lineaCodigo === l.codigo), onCambio: paradasCambiaron }
                : undefined
            }
            aModoParadas={conModoParadas ? cambiarModoParadas : irAModoParadas}
          />
        ))}
    </div>
    </>
  )
}
