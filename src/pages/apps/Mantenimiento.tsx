import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Check, Loader2, Wrench } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { EmptyState } from "@/components/EmptyState"
import { AnimacionLinea } from "@/components/lineas/AnimacionLinea"
import { aspectoLinea } from "@/components/lineas/estadoLinea"
import { MensajeError } from "@/components/MensajeError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import {
  clasificarFalla,
  duracionMin,
  fmtDuracion,
  listarParadas,
  nombreLineaParada,
  porClasificar,
  TIPO_FALLA_SIN_ESPECIFICAR,
  type Parada,
  type TipoParada,
} from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { paradasQueDetienenLineas } from "@/lib/produccion/ajustes"
import type { ParadaQueDetiene } from "@/lib/produccion/tipos"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { fechaPlanta, horaCortaPlanta, restarDias } from "@/lib/tiempoPlanta"
import type { TurnoActivo } from "@/lib/turno"
import { useAccion } from "@/lib/useAccion"

/*
 * Mantenimiento (dueña, 2026-10-26): su página en la app, en lugar del Sheet.
 *  - Las líneas en vivo, con su animación: cuál está parada, desde cuándo y por qué.
 *  - Fallas por clasificar: las que el supervisor paró con «No sé / es una
 *    falla» (Falla sin especificar). Mantenimiento pone qué hizo y el código
 *    del catálogo (clasificar_falla, migración 20261112590000). Los minutos
 *    no cambian: los puso la línea.
 *  - Sus propias paradas se siguen registrando en Registrar Paradas.
 */
const PAGINA = "Mantenimiento"
const REFRESCO_MS = 60_000

/** 'YYYY-MM-DDTHH:MM:SS' → '21/09 14:05'. */
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`

export default function Mantenimiento() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  const area = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"

  const [turno, setTurno] = useState<TurnoActivo | null | undefined>(undefined)
  const [detienen, setDetienen] = useState<ParadaQueDetiene[]>([])
  const [fallas, setFallas] = useState<Parada[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const prod = useProduccion(turno?.id ?? null)
  const { refrescar } = prod
  const { lineas } = useCatalogosLive()

  const cargar = useCallback(async () => {
    const t = await obtenerEstadoPlantaActual(area)
    setTurno(t)
    const hoy = fechaPlanta()
    const [lista, det] = await Promise.all([
      listarParadas({ desde: restarDias(hoy, 30), hasta: hoy, area }),
      t ? paradasQueDetienenLineas(t.id) : Promise.resolve([]),
    ])
    setFallas(lista.filter(porClasificar).sort((a, b) => a.inicio.localeCompare(b.inicio)))
    setDetienen(det)
    await refrescar()
  }, [area, refrescar])

  useEffect(() => {
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  const lineasArea = lineas.filter((l) => l.activo)

  return (
    <AppShell title="Mantenimiento" description="Líneas en vivo y fallas por clasificar" fullWidth>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {turno === undefined ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : turno === null ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No hay un turno abierto: las líneas no están corriendo.</p>
        ) : (
          <section aria-label="Líneas" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {lineasArea.map((l) => {
              const lineaTurno = prod.corridas.find((c) => c.linea === l.codigo && c.activa) ?? null
              const esperandoPt = lineaTurno === null && prod.corridas.some((c) => c.linea === l.codigo && c.esperandoCierre)
              const condicion = prod.lineasEstado.find((le) => le.linea === l.codigo)?.condicion ?? "DETENIDA"
              const aspecto = aspectoLinea(lineaTurno, condicion, esperandoPt)
              const det = detienen.find((p) => p.linea === l.codigo && p.fin === null)
              return (
                <div key={l.codigo} className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{l.nombre}</h2>
                    <Badge variant={aspecto.variante}>{aspecto.badge}</Badge>
                  </div>
                  <AnimacionLinea lineaCodigo={l.codigo} lineaTurno={lineaTurno} aspecto={aspecto} />
                  {lineaTurno?.pausadaEn && (
                    <div className="flex flex-col gap-0.5 text-xs">
                      <p className="text-muted-foreground">
                        Parada desde las {horaCortaPlanta(lineaTurno.pausadaEn, lineaTurno.pausadaEn)} ·{" "}
                        <span className="num">{fmtDuracion(duracionMin({ inicio: det?.inicio ?? lineaTurno.pausadaEn, fin: null }))}</span>
                        {det && (
                          <>
                            {" "}
                            · <span className="font-medium text-foreground">{det.tipoNombre}</span>
                          </>
                        )}
                      </p>
                      {det?.nota && <p className="text-foreground">{det.nota}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        <section aria-labelledby="fallas" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="fallas" className="text-base font-semibold">
              Fallas por clasificar
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/paradas">Registrar una parada</Link>
            </Button>
          </div>
          {fallas === null ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : fallas.length === 0 ? (
            <EmptyState icon={Wrench} title="Nada por clasificar" description="Cuando el supervisor pare una línea con «No sé / es una falla», aparece aquí." />
          ) : (
            <ul className="flex flex-col gap-3">
              {fallas.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold">{nombreLineaParada(p.lineaCodigo)}</span>
                    <span className="num text-xs text-muted-foreground">
                      {corta(p.inicio)} · {p.fin ? fmtDuracion(duracionMin(p)) : `en curso, ${fmtDuracion(duracionMin(p))}`}
                    </span>
                  </div>
                  {p.nota && <p className="text-sm text-foreground">{p.nota}</p>}
                  {p.supervisorNombre && <p className="text-xs text-muted-foreground">La reportó {p.supervisorNombre}</p>}
                  {p.solucion && <p className="text-xs text-muted-foreground">Del Sheet: {p.solucion}</p>}
                  {abierta === p.id ? (
                    <FormClasificar
                      parada={p}
                      area={area}
                      usuario={usuario}
                      onCerrar={() => setAbierta(null)}
                      onGuardado={async () => {
                        setAbierta(null)
                        await cargar()
                      }}
                    />
                  ) : (
                    <Button size="sm" className="self-start" onClick={() => setAbierta(p.id)}>
                      Clasificar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}

/** Código del catálogo + qué se hizo. La hora no se toca. */
function FormClasificar({
  parada,
  area,
  usuario,
  onCerrar,
  onGuardado,
}: {
  parada: Parada
  area: string
  usuario: string
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const equipos = useEquiposParadas()
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [solucion, setSolucion] = useState(parada.solucion ?? "")
  const { enviando, error, ejecutar } = useAccion()
  const listo = tipo !== null && solucion.trim() !== ""

  async function guardar() {
    if (!tipo || !listo) return
    if (await ejecutar(() => clasificarFalla(usuario, parada.id, tipo.codigo, solucion.trim(), PAGINA))) await onGuardado()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <BuscadorTipoParada
        lineaCodigo={parada.lineaCodigo}
        area={area}
        equipos={equipos}
        permitir={(t) => t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR}
        onElegir={setTipo}
      />
      <Textarea
        value={solucion}
        onChange={(e) => setSolucion(e.target.value.slice(0, 300))}
        maxLength={300}
        rows={2}
        placeholder="Qué se hizo para resolverla"
        className="text-sm"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={enviando || !listo}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
