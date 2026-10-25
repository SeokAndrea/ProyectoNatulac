import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { ahoraPlanta, conSegundos, FormCompletarParada, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import type { TramoHora } from "@/lib/cubrirTurno"
import { anotarParada, fmtDuracion, type Parada, type TipoParada } from "@/lib/paradas"
import { esLineaNoProgramada } from "@/lib/paradasTurnoCompleto"

const PAGINA = "Líneas"
/** Los tipos que más se anotan a mano, como botones directos (dueña, 2026-10-25). LNP abre el buscador con su familia. */
const COMUNES: { codigo: string; texto: string }[] = [
  { codigo: "CAMBIO_LOTE", texto: "Cambio de lote" },
  { codigo: "MANTENIMIENTO_PROGRAMADO", texto: "Cambio de presentación" },
]
const MINUTOS = [2, 5, 10, 15, 30]
const MAX_PENDIENTES_VISIBLES = 3

/**
 * Paradas de una línea, desde su tarjeta en Líneas (dueña, 2026-10-25): sus +1
 * pendientes para poner los minutos ahí mismo, y anotar una parada corta que
 * ya pasó con la línea ya elegida (casi siempre se sabe cuánto duró, no la
 * hora). Parar o hacer seguir la línea sigue siendo Parada / Continuar.
 * Mismas funciones que Registrar Paradas: anotar_parada y completar_parada.
 */
export function PanelParadasLinea({
  lineaCodigo,
  nombreLinea,
  areaCodigo,
  usuario,
  presentacionMl,
  pendientes,
  onCambio,
  onCerrar,
  cubrir,
}: {
  lineaCodigo: string
  nombreLinea: string
  areaCodigo: string | null
  usuario: string
  presentacionMl: number | null
  /** Los +1 sin minutos de esta línea, del más viejo al más nuevo. */
  pendientes: Parada[]
  /** Se anotó o completó una: volver a leer. */
  onCambio: () => Promise<void>
  onCerrar: () => void
  /**
   * Modo Paradas: cubrir lo sin reportar (cubrirTurno.ts). La parada va a
   * tramos libres del turno, no a «terminó ahora», para que el tiempo sume.
   */
  cubrir?: { faltaMin: number; ubicar: (minutos: number) => TramoHora[] }
}) {
  const tipos = useTiposActivos()
  const equipos = useEquiposParadas()
  const [completando, setCompletando] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [buscando, setBuscando] = useState<"LNP" | "OTRA" | null>(null)
  const [otroMin, setOtroMin] = useState("")
  /** "HH:MM" si terminó antes de ahora; null = terminó recién. */
  const [finHora, setFinHora] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  // Como en Registrar Paradas: el Área de Pruebas registra en Pruebas; el resto, en Aséptico.
  const areaParadas = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const visibles = verTodos ? pendientes : pendientes.slice(0, MAX_PENDIENTES_VISIBLES)
  const repetido = tipo ? pendientes.find((p) => p.tipoCodigo === tipo.codigo) : undefined

  function elegir(t: TipoParada | null) {
    setTipo(t)
    setBuscando(null)
    setError(null)
    setHecho(null)
  }

  /** minutos = null → +1 pendiente (se completa después). */
  async function anotar(minutos: number | null) {
    if (!tipo) return
    if (cubrir && minutos !== null) return cubrirMinutos(minutos)
    setEnviando(true)
    setError(null)
    const ahora = ahoraPlanta()
    const fin = finHora ? `${ahora.slice(0, 11)}${finHora}` : ahora
    const r = await anotarParada(
      usuario,
      {
        lineaCodigo,
        tipoCodigo: tipo.codigo,
        // Ya pasó: terminó ahora (o a la hora elegida) y empezó esos minutos antes.
        inicio: minutos === null ? null : conSegundos(sumarMinutos(fin, -minutos)),
        fin: minutos === null ? null : conSegundos(fin),
        nota: null,
      },
      PAGINA,
    )
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setHecho(minutos === null ? `Anotada como +1: ${tipo.nombre}. Pon los minutos cuando los sepas.` : `Anotada: ${tipo.nombre} · ${minutos} min.`)
    setTipo(null)
    setOtroMin("")
    setFinHora(null)
    await onCambio()
  }

  /** Cubrir: una parada por tramo libre (casi siempre uno solo). */
  async function cubrirMinutos(minutos: number) {
    if (!tipo || !cubrir) return
    const tramos = cubrir.ubicar(minutos)
    if (tramos.length === 0) {
      return setError(`No queda tiempo libre en el turno para ${fmtDuracion(minutos)}: revisa las paradas ya cargadas en esta línea.`)
    }
    setEnviando(true)
    setError(null)
    for (const t of tramos) {
      const r = await anotarParada(usuario, { lineaCodigo, tipoCodigo: tipo.codigo, inicio: t.inicio, fin: t.fin, nota: null }, PAGINA)
      if (!r.ok) {
        setEnviando(false)
        await onCambio()
        return setError(r.error)
      }
    }
    setEnviando(false)
    setHecho(`Cubierto: ${tipo.nombre} · ${fmtDuracion(minutos)}.`)
    setTipo(null)
    setOtroMin("")
    await onCambio()
  }

  const otro = Number(otroMin)
  const otroValido = Number.isInteger(otro) && otro > 0 && otro <= 24 * 60

  return (
    <section aria-label={`Paradas de ${nombreLinea}`} className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{cubrir ? `Cubrir lo sin reportar de ${nombreLinea}` : `Paradas de ${nombreLinea}`}</h3>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar paradas" onClick={onCerrar}>
          <X className="size-4" />
        </Button>
      </div>

      {hecho && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-success/40 bg-success-soft px-3 py-2 text-sm text-success-foreground">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
          {hecho}
        </p>
      )}

      {pendientes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendientes ({pendientes.length})</p>
          <ul className="flex flex-col gap-2">
            {visibles.map((p) =>
              completando === p.id ? (
                <li key={p.id} className="rounded-md border border-border bg-card p-3">
                  <FormCompletarParada
                    parada={p}
                    usuario={usuario}
                    area={areaParadas}
                    equipos={equipos}
                    presentacionMl={presentacionMl}
                    textoBoton="Guardar"
                    pagina={PAGINA}
                    onListo={async () => {
                      setCompletando(null)
                      setHecho(`Completada: ${p.tipoNombre}.`)
                      await onCambio()
                    }}
                    accionesExtra={
                      <Button variant="ghost" size="sm" onClick={() => setCompletando(null)}>
                        Cancelar
                      </Button>
                    }
                  />
                </li>
              ) : (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{p.tipoNombre}</span>
                    <span className="text-xs text-muted-foreground">+1 a las <span className="num">{p.inicio.slice(11, 16)}</span></span>
                  </span>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCompletando(p.id)}>
                    Poner minutos
                  </Button>
                </li>
              ),
            )}
          </ul>
          {pendientes.length > MAX_PENDIENTES_VISIBLES && !verTodos && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setVerTodos(true)}>
              Ver los {pendientes.length}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {cubrir ? `¿Qué pasó en ese tiempo? Falta cubrir ${fmtDuracion(cubrir.faltaMin)}` : "Anotar una que ya pasó"}
        </p>
        {tipo ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{tipo.nombre}</span>
              <Button variant="ghost" size="sm" onClick={() => elegir(null)} disabled={enviando}>
                Cambiar
              </Button>
            </p>
            <p className="text-xs text-muted-foreground">
              {cubrir
                ? "¿Cuántos minutos? Se guarda en un tramo del turno sin otras paradas."
                : `¿Cuánto duró? ${finHora ? `Terminó a las ${finHora}.` : "Queda que terminó recién."}`}
            </p>
            {cubrir && cubrir.faltaMin > 0 && (
              <Button size="sm" className="self-start" disabled={enviando} onClick={() => void anotar(cubrir.faltaMin)}>
                Todo lo que falta · <span className="num">{fmtDuracion(cubrir.faltaMin)}</span>
              </Button>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {MINUTOS.map((m) => (
                <Button key={m} variant="outline" size="sm" disabled={enviando} onClick={() => void anotar(m)}>
                  <span className="num">{m}</span> min
                </Button>
              ))}
              <Input
                aria-label="Otros minutos"
                inputMode="numeric"
                placeholder="Otro"
                value={otroMin}
                onChange={(e) => setOtroMin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && otroValido && void anotar(otro)}
                className="h-7 text-center"
              />
            </div>
            {otroMin !== "" && (
              <Button size="sm" className="self-start" disabled={!otroValido || enviando} onClick={() => void anotar(otro)}>
                Guardar {otroValido ? `${otro} min` : ""}
              </Button>
            )}
            {cubrir ? null : finHora === null ? (
              <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setFinHora(ahoraPlanta().slice(11, 16))}>
                Terminó antes: elegir hora
              </Button>
            ) : (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Terminó a las
                <Input type="time" value={finHora} onChange={(e) => setFinHora(e.target.value || null)} className="h-7 w-28" />
              </label>
            )}
            {cubrir ? null : repetido ? (
              <p className="text-xs text-warning-foreground">Ya hay un +1 de este tipo pendiente arriba: ponle los minutos a ese.</p>
            ) : (
              <Button variant="ghost" size="sm" className="self-start text-muted-foreground" disabled={enviando} onClick={() => void anotar(null)}>
                Todavía no sé (queda como +1)
              </Button>
            )}
            {enviando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        ) : buscando === "LNP" ? (
          // Son pocos: los motivos de Línea No Programada van directo, de un toque.
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {tipos.filter(esLineaNoProgramada).map((t) => (
                <Button key={t.codigo} variant="outline" size="sm" onClick={() => elegir(t)}>
                  {t.nombre}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setBuscando(null)}>
              Volver
            </Button>
          </div>
        ) : buscando ? (
          <div className="flex flex-col gap-2">
            <BuscadorTipoParada
              lineaCodigo={lineaCodigo}
              area={areaParadas}
              equipos={equipos}
              presentacionMl={presentacionMl}
              onElegir={elegir}
            />
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setBuscando(null)}>
              Volver
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {COMUNES.map((c) => {
              const t = tipos.find((x) => x.codigo === c.codigo)
              return (
                t && (
                  <Button key={c.codigo} variant="outline" size="sm" onClick={() => elegir(t)}>
                    {c.texto}
                  </Button>
                )
              )
            })}
            <Button variant="outline" size="sm" onClick={() => setBuscando("LNP")}>
              LNP…
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBuscando("OTRA")}>
              Otra…
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-danger-foreground">{error}</p>}
      </div>
    </section>
  )
}
