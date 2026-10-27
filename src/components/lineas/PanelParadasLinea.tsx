import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { ahoraPlanta, conSegundos, FormCompletarParada } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import type { TramoHora } from "@/lib/cubrirTurno"
import { anotarParada, fmtDuracion, type Parada, type TipoParada } from "@/lib/paradas"
import { esLineaNoProgramada } from "@/lib/paradasTurnoCompleto"
import { restarDias } from "@/lib/tiempoPlanta"

const PAGINA = "Líneas"
/** Los tipos que más se anotan a mano, como botones directos (dueña, 2026-10-25). LNP abre el buscador con su familia. */
const COMUNES: { codigo: string; texto: string }[] = [
  { codigo: "CAMBIO_LOTE", texto: "Cambio de lote" },
  { codigo: "MANTENIMIENTO_PROGRAMADO", texto: "Cambio de presentación" },
]
const MAX_PENDIENTES_VISIBLES = 3

/** "HH:MM" ± minutos, dando la vuelta a la medianoche. */
function moverHora(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}
/** Minutos de "inicio" a "fin" (si el inicio es mayor, cruzó la medianoche). */
function minutosEntreHoras(ini: string, fin: string): number {
  const a = ini.split(":").map(Number)
  const b = fin.split(":").map(Number)
  const d = b[0] * 60 + b[1] - (a[0] * 60 + a[1])
  return d < 0 ? d + 1440 : d
}
const esHora = (v: string) => /^\d{2}:\d{2}$/.test(v)

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
  ubicar,
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
  /**
   * Anotar en el Modo Paradas: los minutos van a tramos libres del turno (la más reciente primero),
   * no a «terminó ahora», que choca con una parada ya cargada en esa hora.
   */
  ubicar?: (minutos: number) => TramoHora[]
}) {
  const tipos = useTiposActivos()
  const equipos = useEquiposParadas()
  const [completando, setCompletando] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [buscando, setBuscando] = useState<"LNP" | "OTRA" | null>(null)
  /** Lo principal: cuántos minutos. Inicio y fin, abajo y chico, se calculan solos y se pueden corregir. */
  const [minutos, setMinutos] = useState("")
  /** Hora de cuando se eligió el tipo ("terminó recién"). */
  const [ahoraHora, setAhoraHora] = useState("")
  /** Inicio y fin escritos a mano; null = se calculan solos. */
  const [horas, setHoras] = useState<{ ini: string; fin: string } | null>(null)
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
    setMinutos(cubrir && cubrir.faltaMin > 0 ? String(cubrir.faltaMin) : "")
    setAhoraHora(ahoraPlanta().slice(11, 16))
    setHoras(null)
  }

  const min = Number(minutos)
  const minValido = Number.isInteger(min) && min > 0 && min <= 24 * 60
  // Cubrir o anotar sin tocar las horas: donde iría (tramos libres del turno). Si no, terminó recién.
  const colocar = cubrir?.ubicar ?? ubicar
  const ubicacion = colocar && minValido && !horas ? colocar(min) : []
  const ini = horas?.ini ?? (ubicacion.length ? ubicacion[0].inicio.slice(11, 16) : minValido ? moverHora(ahoraHora, -min) : "")
  const fin = horas?.fin ?? (ubicacion.length ? ubicacion[ubicacion.length - 1].fin.slice(11, 16) : ahoraHora)

  function cambiarMinutos(v: string) {
    const limpio = v.replace(/\D/g, "")
    setMinutos(limpio)
    // Con las horas escritas, se mueve el inicio y el fin queda.
    if (horas && Number(limpio) > 0) setHoras({ ini: moverHora(horas.fin, -Number(limpio)), fin: horas.fin })
  }
  function cambiarInicio(v: string) {
    if (!esHora(v)) return
    setHoras({ ini: v, fin })
    setMinutos(String(minutosEntreHoras(v, fin)))
  }
  function cambiarFin(v: string) {
    if (!esHora(v)) return
    setHoras({ ini: minValido ? moverHora(v, -min) : ini, fin: v })
  }

  /** Hora del día → 'YYYY-MM-DDTHH:MM:SS' de hoy (el inicio, de ayer si cruzó la medianoche). */
  function conFecha(hhmm: string, esInicio: boolean): string {
    const hoy = ahoraPlanta().slice(0, 10)
    const dia = esInicio && minutosEntreHoras(hhmm, fin) > 0 && hhmm > fin ? restarDias(hoy, 1) : hoy
    return conSegundos(`${dia}T${hhmm}`)
  }

  function guardar() {
    if (!minValido) return
    if (colocar && !horas) return void cubrirMinutos(min, colocar)
    void anotar(min)
  }

  /** minutos = null → +1 pendiente (se completa después). */
  async function anotar(minutos: number | null) {
    if (!tipo) return
    setEnviando(true)
    setError(null)
    const r = await anotarParada(
      usuario,
      {
        lineaCodigo,
        tipoCodigo: tipo.codigo,
        // Ya pasó: de la hora de inicio a la de fin (por defecto, terminó recién).
        inicio: minutos === null ? null : conFecha(ini, true),
        fin: minutos === null ? null : conFecha(fin, false),
        nota: null,
      },
      PAGINA,
    )
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setHecho(minutos === null ? `Anotada como +1: ${tipo.nombre}. Pon los minutos cuando los sepas.` : `Anotada: ${tipo.nombre} · ${minutos} min.`)
    setTipo(null)
    await onCambio()
  }

  /** Cubrir o anotar en el Modo Paradas: una parada por tramo libre (casi siempre uno solo). */
  async function cubrirMinutos(minutos: number, ubicarEn: (minutos: number) => TramoHora[]) {
    if (!tipo) return
    const tramos = ubicarEn(minutos)
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
    setHecho(`${cubrir ? "Cubierto" : "Anotada"}: ${tipo.nombre} · ${fmtDuracion(minutos)}.`)
    setTipo(null)
    await onCambio()
  }

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
          {cubrir ? (cubrir.faltaMin > 0 ? `¿Qué pasó en ese tiempo? Falta cubrir ${fmtDuracion(cubrir.faltaMin)}` : "Todo el turno está cubierto") : "Anotar una que ya pasó"}
        </p>
        {tipo ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{tipo.nombre}</span>
              <Button variant="ghost" size="sm" onClick={() => elegir(null)} disabled={enviando}>
                Cambiar
              </Button>
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Minutos
                <Input
                  inputMode="numeric"
                  value={minutos}
                  onChange={(e) => cambiarMinutos(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardar()}
                  placeholder="Ej. 10"
                  className="num w-24 text-base"
                  autoFocus
                />
              </label>
              <Button disabled={!minValido || enviando} onClick={guardar}>
                {enviando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Guardar
              </Button>
            </div>
            {/* Abajo y chico: de qué hora a qué hora. Se calculan solas; si las corrigen, mandan esas. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                Inicio
                <Input type="time" value={ini} onChange={(e) => cambiarInicio(e.target.value)} className="num h-7 w-32 px-1.5 text-xs" aria-label="Hora de inicio" />
              </label>
              <label className="flex items-center gap-1.5">
                Fin
                <Input type="time" value={fin} onChange={(e) => cambiarFin(e.target.value)} className="num h-7 w-32 px-1.5 text-xs" aria-label="Hora de fin" />
              </label>
              {!horas && (colocar ? (ubicacion.length > 1 ? <span>(en {ubicacion.length} tramos libres)</span> : <span>(tramo libre del turno)</span>) : <span>(terminó recién)</span>)}
            </div>
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
