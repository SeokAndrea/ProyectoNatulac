import { useCallback, useEffect, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { AutocompleteTipo } from "@/components/RegistroParadas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import type { TurnoActivo } from "@/lib/turno"
import {
  cerrarParadaMantenimiento,
  duracionMin,
  eliminarParadaMantenimiento,
  fmtDuracion,
  LINEAS_PARADAS,
  listarParadas,
  nombreLineaParada,
  registraSupervisor,
  registrarParadaMantenimiento,
  type Parada,
  type TipoParada,
} from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { fechaPlanta, horaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * Paradas de Mantenimiento — el área de Mantenimiento registra sus paradas en la
 * app, con el MISMO catálogo y códigos que los supervisores (dueño, 2026-09-21),
 * pero con hora real de inicio y de fin: sin fin queda EN CURSO y se cierra
 * después; puede durar más de un turno. A cada turno le tocan los minutos que se
 * solapan con su horario (ver migración 20261070). Se registra en Aséptico.
 */
const PAGINA = "Paradas de Mantenimiento"

/** 'YYYY-MM-DDTHH:MM' del reloj de planta, para los campos de fecha y hora. */
const ahoraPlanta = () => `${fechaPlanta()}T${horaPlanta().slice(0, 5)}`
/** 'YYYY-MM-DDTHH:MM' (campo) → 'YYYY-MM-DDTHH:MM:SS' (servidor). */
const conSegundos = (v: string) => (v.length === 16 ? `${v}:00` : v)
/** 'YYYY-MM-DDTHH:MM:SS' → '21/09 14:05'. */
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`

export default function ParadasMantenimiento() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  // El Área de Pruebas registra en Pruebas; el resto, en Aséptico.
  const areaParadas = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const equipos = useEquiposParadas()

  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const prod = useProduccion(turno?.id ?? null)
  const [lista, setLista] = useState<Parada[] | null>(null)
  const [, setTick] = useState(0)

  const [linea, setLinea] = useState<string>(LINEAS_PARADAS[0].codigo)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [inicio, setInicio] = useState(ahoraPlanta)
  const [fin, setFin] = useState("")
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0) // cambia para vaciar el buscador de tipos tras guardar

  const cargar = useCallback(async () => {
    const hoy = fechaPlanta()
    const filas = await listarParadas({ desde: restarDias(hoy, 30), hasta: hoy, area: areaParadas })
    setLista(filas.filter((p) => p.origen === "MANTENIMIENTO"))
  }, [areaParadas])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Turno del área y refresco: para saber qué presentación corre en cada línea y mantener al día las duraciones.
  useEffect(() => {
    let vivo = true
    const resolver = () => obtenerEstadoPlantaActual(areaParadas).then((t) => vivo && setTurno(t))
    void resolver()
    const id = setInterval(() => {
      void resolver()
      setTick((n) => n + 1)
    }, 60_000)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [areaParadas])

  // Presentación (ml) de la corrida activa de la línea elegida; sin corrida no se filtra por presentación.
  const numero = linea.replace(/^LINEA_/, "")
  const corridaActiva = prod.corridas.find((c) => c.activa && c.linea.replace(/^LINEA_T?/, "") === numero)
  const presentacionMl = corridaActiva ? Number(corridaActiva.presentacion) || null : null

  async function guardar() {
    if (!tipo) return
    setGuardando(true)
    setError(null)
    const r = await registrarParadaMantenimiento(
      usuario,
      {
        lineaCodigo: linea,
        tipoCodigo: tipo.codigo,
        inicio: conSegundos(inicio),
        fin: fin ? conSegundos(fin) : null,
        nota: nota.trim() || null,
      },
      PAGINA,
    )
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    setTipo(null)
    setFin("")
    setNota("")
    setInicio(ahoraPlanta())
    setReinicio((n) => n + 1)
    await cargar()
  }

  async function terminar(id: string) {
    setError(null)
    const r = await cerrarParadaMantenimiento(usuario, id, PAGINA)
    if (!r.ok) return setError(r.error)
    await cargar()
  }

  async function eliminar(id: string) {
    setError(null)
    setConfirmarEliminar(null)
    const r = await eliminarParadaMantenimiento(usuario, id, PAGINA)
    if (!r.ok) return setError(r.error)
    await cargar()
  }

  const enCurso = (lista ?? []).filter((p) => p.fin === null)
  const cerradas = (lista ?? []).filter((p) => p.fin !== null).slice(0, 30)
  const valido = tipo !== null && inicio !== ""

  return (
    <AppShell title="Paradas de Mantenimiento" description="Registrar las paradas de Aséptico, con el catálogo de siempre">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {/* ---- Nueva parada ---- */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Nueva parada</p>

          <div className="grid grid-cols-3 gap-2">
            {LINEAS_PARADAS.map((l) => (
              <button
                key={l.codigo}
                type="button"
                onClick={() => {
                  setLinea(l.codigo)
                  setTipo(null)
                  setReinicio((n) => n + 1)
                }}
                className={
                  "rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors " +
                  (linea === l.codigo ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary")
                }
              >
                {l.nombre}
              </button>
            ))}
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            {presentacionMl ? `Corriendo ahora: ${presentacionMl} ml (solo se ofrece lo que existe con esa presentación).` : "Sin corrida activa en esta línea: se ofrece todo lo de la línea."}
          </p>

          <AutocompleteTipo
            key={linea + reinicio}
            lineaCodigo={linea}
            area={areaParadas}
            equipos={equipos}
            presentacionMl={presentacionMl}
            permitir={(t) => !registraSupervisor(t)}
            onElegir={setTipo}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Inicio
              <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Fin (vacío = en curso)
              <Input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
            </label>
          </div>
          <Input placeholder="Detalle (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-9" />

          {error && <p className="text-sm text-danger-foreground">{error}</p>}
          <div>
            <Button onClick={guardar} disabled={!valido || guardando}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
              {fin ? "Guardar parada" : "Iniciar parada (en curso)"}
            </Button>
          </div>
        </div>

        {lista === null ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* ---- En curso ---- */}
            <section className="flex flex-col gap-1.5">
              <h2 className="text-sm font-semibold text-foreground">En curso ({enCurso.length})</h2>
              {enCurso.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay paradas de Mantenimiento en curso.</p>
              ) : (
                enCurso.map((p) => (
                  <FilaParada
                    key={p.id}
                    p={p}
                    acciones={
                      <Button size="sm" onClick={() => terminar(p.id)}>
                        Terminar ahora
                      </Button>
                    }
                    confirmarEliminar={confirmarEliminar}
                    setConfirmarEliminar={setConfirmarEliminar}
                    onEliminar={eliminar}
                  />
                ))
              )}
            </section>

            {/* ---- Últimas cerradas ---- */}
            <section className="flex flex-col gap-1.5">
              <h2 className="text-sm font-semibold text-foreground">Últimos 30 días</h2>
              {cerradas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay paradas cerradas.</p>
              ) : (
                cerradas.map((p) => (
                  <FilaParada
                    key={p.id}
                    p={p}
                    confirmarEliminar={confirmarEliminar}
                    setConfirmarEliminar={setConfirmarEliminar}
                    onEliminar={eliminar}
                  />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}

function FilaParada({
  p,
  acciones,
  confirmarEliminar,
  setConfirmarEliminar,
  onEliminar,
}: {
  p: Parada
  acciones?: React.ReactNode
  confirmarEliminar: string | null
  setConfirmarEliminar: (id: string | null) => void
  onEliminar: (id: string) => void
}) {
  const min = duracionMin(p)
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {nombreLineaParada(p.lineaCodigo)} · {p.tipoNombre}
          </p>
          <p className="text-xs text-muted-foreground">
            {corta(p.inicio)} → {p.fin ? corta(p.fin) : "en curso"} · {fmtDuracion(min)}
          </p>
          {p.nota && <p className="mt-0.5 text-xs text-muted-foreground">{p.nota}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {acciones}
          {confirmarEliminar === p.id ? (
            <>
              <span className="text-xs text-muted-foreground">¿Eliminar?</span>
              <Button size="sm" variant="destructive" onClick={() => onEliminar(p.id)}>
                Sí
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmarEliminar(null)}>
                No
              </Button>
            </>
          ) : (
            <Button size="icon-sm" variant="ghost" onClick={() => setConfirmarEliminar(p.id)} aria-label="Eliminar parada">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
