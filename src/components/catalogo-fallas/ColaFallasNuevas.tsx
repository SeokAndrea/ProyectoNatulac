import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MensajeError } from "@/components/MensajeError"
import { agruparFallasNuevas, descartarFallasNuevas, identificarFallaNueva, listarFallasNuevas, type FallaNuevaPendiente } from "@/lib/catalogoFallas/fallaNueva"
import type { OpcionFalla } from "@/lib/catalogoFallas/paradas"
import { ElegirFallaMtto } from "./ElegirFallaMtto"
import { fmtDuracion } from "@/lib/paradas"
import { useAccion } from "@/lib/useAccion"

/** 'YYYY-MM-DDTHH:MM:SS…' del servidor → '02/11 14:05' (hora de planta). */
function corta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  return d.toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Caracas" })
}

/** Cuántas paradas hay por revisar (para el contador de la pestaña). null = no se pudo saber. */
export function useConteoFallasNuevas(usuario: string, version = 0): number | null {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    let vigente = true
    if (!usuario) return
    void listarFallasNuevas(usuario).then((r) => {
      if (vigente) setN(r.ok ? r.valor.length : null)
    })
    return () => {
      vigente = false
    }
  }, [usuario, version])
  return n
}

/**
 * Cola «Fallas nuevas» del Catálogo de Paradas (migración 20261114890000): las
 * paradas hechas con la «Falla nueva» de un equipo o con una «Parada nueva» que
 * nadie ha revisado. Quien crea las fallas del catálogo lee las observaciones
 * (la de Producción y la de Mantenimiento) y la identifica: elige la falla real
 * o la crea ahí mismo (el código lo arma el catálogo); la parada pasa a esa falla
 * y su Solicitud de intervención cambia de nombre (migración 20261115790000).
 * Descartar solo la saca de la cola, sin cambiar la parada.
 */
export function ColaFallasNuevas({ usuario, editable, onCambio }: { usuario: string; editable: boolean; onCambio?: () => void }) {
  const [items, setItems] = useState<FallaNuevaPendiente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { enviando, error: errorAccion, ejecutar } = useAccion()
  /** La parada que se está identificando (una a la vez). */
  const [identificando, setIdentificando] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await listarFallasNuevas(usuario)
    if (r.ok) {
      setItems(r.valor)
      setError(null)
    } else {
      setItems([])
      setError(r.error)
    }
  }, [usuario])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function descartar(ids: string[]) {
    const ok = await ejecutar(async () => {
      const r = await descartarFallasNuevas(usuario, ids)
      return r.ok ? { ok: true as const } : r
    })
    if (ok) {
      await cargar()
      onCambio?.()
    }
  }

  async function identificada(texto: string) {
    setIdentificando(null)
    setHecho(texto)
    await cargar()
    onCambio?.()
  }

  if (items === null) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const grupos = agruparFallasNuevas(items)

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">
        Paradas hechas con «Falla nueva» o «Parada nueva» porque no estaba en la lista. Lee lo que escribieron e identifícala: elige la falla real o créala, y la parada (y su
        solicitud de intervención) pasa a esa falla. Descartar solo la saca de esta cola, sin cambiar la parada.
      </p>
      <MensajeError error={error ?? errorAccion} />
      {hecho && (
        <p role="status" className="rounded-md border border-success/40 bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {hecho}
        </p>
      )}

      {grupos.length === 0 ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">No hay fallas nuevas por revisar.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.origen} aria-label={g.origen} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
              <h3 className="min-w-0 flex-1 font-semibold text-foreground">
                {g.origen}{" "}
                <span className="num text-xs font-normal text-muted-foreground">
                  · {g.items.length} {g.items.length === 1 ? "parada" : "paradas"} · {fmtDuracion(g.minutos)}
                </span>
              </h3>
              {editable && g.items.length > 1 && (
                <Button size="sm" variant="outline" disabled={enviando} onClick={() => void descartar(g.items.map((i) => i.paradaId))}>
                  Descartar las {g.items.length}
                </Button>
              )}
            </div>
            <ul className="divide-y divide-border/60">
              {g.items.map((f) => (
                <li key={f.paradaId} className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="font-medium text-foreground">
                      {f.lineaNombre} <span className="num text-xs font-normal text-muted-foreground">· {corta(f.inicio)}</span>
                    </p>
                    <p className="num text-xs text-muted-foreground">
                      {fmtDuracion(f.minutos)}
                      {f.creadaPor ? ` · ${f.creadaPor}` : ""}
                    </p>
                  </div>
                  <Observacion titulo="Producción · qué pasó" texto={f.nota} vacio="Sin observación." />
                  {f.terminada ? (
                    <Observacion titulo="Mantenimiento · qué se realizó" texto={f.solucion} vacio="Sin observación de Mantenimiento." />
                  ) : (
                    <p className="text-xs text-warning-foreground">Mantenimiento aún no la cierra: falta su observación.</p>
                  )}
                  {f.sifCodigo && (
                    <p className="text-xs text-muted-foreground">
                      En la solicitud <span className="num">{f.sifCodigo}</span>
                      {f.sifParadas ? ` (${f.sifParadas} ${f.sifParadas === 1 ? "parada" : "paradas"})` : ""}.
                    </p>
                  )}
                  {editable && identificando === f.paradaId ? (
                    <IdentificarFalla falla={f} usuario={usuario} onListo={identificada} onCancelar={() => setIdentificando(null)} />
                  ) : (
                    editable && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {f.fallaId && (
                          <Button size="sm" variant="outline" disabled={enviando} onClick={() => { setHecho(null); setIdentificando(f.paradaId) }}>
                            Identificar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={enviando} onClick={() => void descartar([f.paradaId])}>
                          Descartar
                        </Button>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/**
 * Elegir la falla real (o crearla en su subsistema: el código sale solo) y pasarle la parada. Si está en
 * una solicitud de intervención, se identifican juntas todas las paradas de esa solicitud.
 */
function IdentificarFalla({
  falla,
  usuario,
  onListo,
  onCancelar,
}: {
  falla: FallaNuevaPendiente
  usuario: string
  onListo: (texto: string) => Promise<void>
  onCancelar: () => void
}) {
  const [elegida, setElegida] = useState<OpcionFalla | null>(null)
  const { enviando, error, ejecutar } = useAccion()
  const valida = elegida !== null && !elegida.falla.reservada

  async function guardar() {
    if (!elegida || !valida) return
    let texto = ""
    const ok = await ejecutar(async () => {
      const r = await identificarFallaNueva(usuario, falla.paradaId, elegida.falla.id)
      if (!r.ok) return r
      const que = `${elegida.falla.nombre} (${elegida.falla.codigo})`
      texto =
        r.valor.paradas > 1 ? `${r.valor.paradas} paradas identificadas como ${que}.` : `Parada identificada como ${que}.`
      if (r.valor.sif) texto += r.valor.unida ? ` Su solicitud se unió a ${r.valor.sif}.` : ` Solicitud ${r.valor.sif} con el nuevo nombre.`
      return { ok: true as const }
    })
    if (ok) await onListo(texto)
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
      <ElegirFallaMtto lineaCodigo={falla.lineaCodigo} fallaProduccionId={falla.fallaId} usuario={usuario} puedeCrear identificar onCambiar={setElegida} />
      {falla.sifCodigo && (
        <p className="text-xs text-muted-foreground">
          Está en la solicitud <span className="num">{falla.sifCodigo}</span>: se identifican juntas sus paradas de «Falla nueva» y la solicitud toma el nombre de la falla
          (si ya había otra abierta de esa falla en la línea, se unen).
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => void guardar()} disabled={enviando || !valida}>
          {enviando && <Loader2 className="size-3.5 animate-spin" />}
          Identificar
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}

function Observacion({ titulo, texto, vacio }: { titulo: string; texto: string | null; vacio: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{titulo}</p>
      <p className={texto ? "whitespace-pre-wrap text-foreground" : "text-muted-foreground"}>{texto || vacio}</p>
    </div>
  )
}
