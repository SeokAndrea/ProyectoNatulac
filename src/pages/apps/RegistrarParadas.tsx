import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { ahoraPlanta, CampoFin, conSegundos, FormCompletarParada } from "@/components/paradas/FormCompletarParada"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import type { TurnoActivo } from "@/lib/turno"
import {
  anotarParada,
  cerrarParadaMantenimiento,
  duracionMin,
  eliminarParada,
  fmtDuracion,
  LINEAS_PARADAS,
  listarParadas,
  nombreLineaParada,
  type Parada,
  type TipoParada,
} from "@/lib/paradas"
import { useEquiposParadas, type EquipoParada } from "@/lib/paradasEquipos"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * Registrar Paradas — una sola pantalla para todos (plan-lineas-pt-paradas.md,
 * sección P). Es la que era "Paradas de Mantenimiento", abierta a quien
 * registre paradas y con todos los tipos (migración 20261090).
 *
 *  - Arriba, lo PENDIENTE: cada parada entra como +1 sin minutos (desde aquí,
 *    o sola desde Líneas / Producto Terminado) y alguien pone después cuánto
 *    duró. Una fila por parada; el formulario se abre solo en la que se elige
 *    ("?parada=<id>" la abre de entrada).
 *  - Las que tienen hora de inicio sin fin: en curso, se terminan aquí.
 *  - "Anotar otra parada" (plegado): +1, o con horas reales si se conocen.
 *    Si ya hay un +1 igual pendiente en esa línea, primero se pide cuánto
 *    tardó el anterior, o "Es un error" y no se guarda el nuevo.
 *  - Últimos 30 días (plegado).
 */
const PAGINA = "Registrar Paradas"

/** 'YYYY-MM-DDTHH:MM:SS' → '21/09 14:05'. */
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`

export default function RegistrarParadas() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  // El Área de Pruebas registra en Pruebas; el resto, en Aséptico.
  const areaParadas = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const equipos = useEquiposParadas()
  const [params, setParams] = useSearchParams()

  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const prod = useProduccion(turno?.id ?? null)
  const [lista, setLista] = useState<Parada[] | null>(null)
  const [, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(params.get("parada"))
  const [anotando, setAnotando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const hoy = fechaPlanta()
    setLista(await listarParadas({ desde: restarDias(hoy, 30), hasta: hoy, area: areaParadas }))
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

  /** Presentación (ml) de la corrida activa de la línea; sin corrida no se filtra por presentación. */
  function presentacionDe(lineaCodigo: string): number | null {
    const numero = lineaCodigo.replace(/^LINEA_/, "")
    const corrida = prod.corridas.find((c) => c.activa && c.linea.replace(/^LINEA_T?/, "") === numero)
    return corrida ? Number(corrida.presentacion) || null : null
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
    const r = await eliminarParada(usuario, id, PAGINA)
    if (!r.ok) return setError(r.error)
    await cargar()
  }

  function abrir(id: string | null) {
    setAbierta(id)
    if (params.get("parada")) {
      params.delete("parada")
      setParams(params, { replace: true })
    }
  }

  const pendientes = (lista ?? []).filter((p) => p.pendiente).sort((a, b) => a.inicio.localeCompare(b.inicio))
  const enCurso = (lista ?? []).filter((p) => !p.pendiente && p.fin === null)
  const completas = (lista ?? []).filter((p) => !p.pendiente && p.fin !== null).slice(0, 30)

  const propsEliminar = { confirmarEliminar, setConfirmarEliminar, onEliminar: eliminar }

  return (
    <AppShell title="Registrar Paradas" description="Paradas de las líneas: se suman como +1 y después se pone cuánto duraron">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {error && (
          <p className="text-sm text-danger-foreground" role="alert">
            {error}
          </p>
        )}

        {lista === null ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* ---- Pendientes ---- */}
            <section className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Pendientes
                {pendientes.length > 0 && <Badge variant="warning">{pendientes.length}</Badge>}
              </h2>
              {pendientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay paradas sin completar.</p>
              ) : (
                pendientes.map((p) => (
                  <div key={p.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {nombreLineaParada(p.lineaCodigo)} · {p.nota || p.tipoNombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.nota ? `${p.tipoNombre} · ` : ""}+1 a las {p.inicio.slice(11, 16)}
                          {p.supervisorNombre ? ` · ${p.supervisorNombre}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {abierta === p.id ? (
                          <Button size="sm" variant="ghost" onClick={() => abrir(null)}>
                            Cerrar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => abrir(p.id)}>
                            Completar
                          </Button>
                        )}
                        <BotonEliminar id={p.id} {...propsEliminar} />
                      </div>
                    </div>
                    {abierta === p.id && (
                      <FormCompletarParada pagina={PAGINA}
                        parada={p}
                        usuario={usuario}
                        area={areaParadas}
                        equipos={equipos}
                        presentacionMl={presentacionDe(p.lineaCodigo)}
                        textoBoton="Guardar parada"
                        onListo={async () => {
                          abrir(null)
                          await cargar()
                        }}
                      />
                    )}
                  </div>
                ))
              )}
            </section>

            {/* ---- En curso (con hora de inicio, sin fin) ---- */}
            {enCurso.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-foreground">En curso ({enCurso.length})</h2>
                {enCurso.map((p) => (
                  <FilaParada
                    key={p.id}
                    p={p}
                    acciones={
                      <Button size="sm" onClick={() => terminar(p.id)}>
                        Terminar ahora
                      </Button>
                    }
                    {...propsEliminar}
                  />
                ))}
              </section>
            )}

            {/* ---- Anotar otra parada ---- */}
            <section className="flex flex-col gap-2">
              {anotando ? (
                <FormNuevaParada
                  usuario={usuario}
                  area={areaParadas}
                  equipos={equipos}
                  pendientes={pendientes}
                  presentacionDe={presentacionDe}
                  onCancelar={() => setAnotando(false)}
                  onGuardada={async () => {
                    setAnotando(false)
                    await cargar()
                  }}
                  onCompletadaPrevia={cargar}
                />
              ) : (
                <Button variant="outline" className="self-start" onClick={() => setAnotando(true)}>
                  <Plus className="size-4" />
                  Anotar otra parada
                </Button>
              )}
            </section>

            {/* ---- Historial ---- */}
            <section className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setVerHistorial((v) => !v)}
                className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={`size-4 transition-transform ${verHistorial ? "rotate-180" : ""}`} />
                Últimos 30 días ({completas.length})
              </button>
              {verHistorial &&
                (completas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay paradas completas.</p>
                ) : (
                  completas.map((p) => <FilaParada key={p.id} p={p} {...propsEliminar} />)
                ))}
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}


// ------------------------------------------------------------
// Anotar otra parada: +1, o con horas reales. Control de repetidas.
// ------------------------------------------------------------
function FormNuevaParada({
  usuario,
  area,
  equipos,
  pendientes,
  presentacionDe,
  onCancelar,
  onGuardada,
  onCompletadaPrevia,
}: {
  usuario: string
  area: string
  equipos: EquipoParada[]
  pendientes: Parada[]
  presentacionDe: (lineaCodigo: string) => number | null
  onCancelar: () => void
  onGuardada: () => void | Promise<void>
  onCompletadaPrevia: () => void | Promise<void>
}) {
  const [linea, setLinea] = useState<string>(LINEAS_PARADAS[0].codigo)
  /** Tiempo ocioso: texto libre, sin tipo del catálogo (el catálogo no tiene tipos de ocioso). */
  const [ocioso, setOcioso] = useState(false)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [nota, setNota] = useState("")
  const [conHoras, setConHoras] = useState(false)
  const [inicio, setInicio] = useState(ahoraPlanta)
  const [fin, setFin] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0) // cambia para vaciar el buscador al cambiar de línea
  /** +1 igual pendiente en la línea: antes de sumar otro se pide cuánto tardó. */
  const [previa, setPrevia] = useState<Parada | null>(null)

  const esOcioso = ocioso || tipo?.clase === "OCIOSO"
  const faltan: string[] = []
  if (!ocioso && !tipo) faltan.push("Tipo de parada")
  if (esOcioso && nota.trim() === "") faltan.push("Motivo del tiempo ocioso")
  if (conHoras && inicio === "") faltan.push("Hora de inicio")

  async function guardar() {
    if (faltan.length > 0) return
    if (!conHoras) {
      const codigo = ocioso ? null : (tipo?.codigo ?? null)
      const igual = pendientes.find(
        (p) => p.lineaCodigo === linea && p.tipoCodigo === codigo && (codigo !== null || p.clase === "OCIOSO"),
      )
      if (igual) return setPrevia(igual)
    }
    await enviar()
  }

  async function enviar() {
    if (!ocioso && !tipo) return
    setGuardando(true)
    setError(null)
    const r = await anotarParada(
      usuario,
      {
        lineaCodigo: linea,
        tipoCodigo: ocioso ? null : (tipo?.codigo ?? null),
        inicio: conHoras ? conSegundos(inicio) : null,
        fin: conHoras && fin ? conSegundos(fin) : null,
        nota: nota.trim() || null,
      },
      PAGINA,
    )
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    await onGuardada()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">Anotar otra parada</p>
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

      <div className="flex flex-wrap gap-2">
        {[
          { valor: false, texto: "Parada del catálogo" },
          { valor: true, texto: "Tiempo ocioso" },
        ].map((o) => (
          <Button
            key={o.texto}
            type="button"
            size="sm"
            variant={ocioso === o.valor ? "default" : "outline"}
            onClick={() => {
              setOcioso(o.valor)
              setTipo(null)
              setReinicio((n) => n + 1)
            }}
          >
            {o.texto}
          </Button>
        ))}
      </div>
      {!ocioso && (
        <BuscadorTipoParada
          key={linea + reinicio}
          lineaCodigo={linea}
          area={area}
          equipos={equipos}
          presentacionMl={presentacionDe(linea)}
          onElegir={setTipo}
        />
      )}
      <Input
        placeholder={esOcioso ? "Motivo del tiempo ocioso (obligatorio)" : "Detalle (opcional)"}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        className="h-9"
      />

      {conHoras && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Inicio
            <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
          </label>
          <CampoFin etiqueta="Fin (vacío = en curso)" inicio={inicio} fin={fin} onFin={setFin} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setConHoras((v) => !v)}
        className="self-start text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        {conHoras ? "Quitar horas (sumar +1 y poner los minutos después)" : "Ya sé la hora de inicio"}
      </button>

      {faltan.length > 0 && (tipo || ocioso) && (
        <ul className="list-disc pl-4 text-xs text-danger-foreground">
          {faltan.map((f) => (
            <li key={f}>Falta: {f}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-sm text-danger-foreground" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={guardar} disabled={faltan.length > 0 || guardando}>
          {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
          {!conHoras ? "+1" : fin ? "Guardar parada" : "Iniciar parada (en curso)"}
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
      </div>

      <Dialog open={previa !== null} onOpenChange={(abierto) => !abierto && setPrevia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ya hay un «{previa?.tipoNombre}» sin completar</DialogTitle>
            <DialogDescription>
              En {previa ? nombreLineaParada(previa.lineaCodigo) : ""} se sumó uno a las {previa?.inicio.slice(11, 16)}. Antes
              de sumar otro, ¿cuánto tardó ese?
            </DialogDescription>
          </DialogHeader>
          {previa && (
            <FormCompletarParada pagina={PAGINA}
              parada={previa}
              usuario={usuario}
              area={area}
              equipos={equipos}
              presentacionMl={presentacionDe(previa.lineaCodigo)}
              textoBoton="Guardar y sumar el nuevo"
              onListo={async () => {
                setPrevia(null)
                await onCompletadaPrevia()
                await enviar()
              }}
              accionesExtra={
                <Button size="sm" variant="outline" className="border-danger/40 text-danger-foreground" onClick={() => setPrevia(null)}>
                  Es un error (no guardar el nuevo)
                </Button>
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ------------------------------------------------------------
// Filas de solo lectura (en curso e historial)
// ------------------------------------------------------------
function BotonEliminar({
  id,
  confirmarEliminar,
  setConfirmarEliminar,
  onEliminar,
}: {
  id: string
  confirmarEliminar: string | null
  setConfirmarEliminar: (id: string | null) => void
  onEliminar: (id: string) => void
}) {
  return confirmarEliminar === id ? (
    <>
      <span className="text-xs text-muted-foreground">¿Eliminar?</span>
      <Button size="sm" variant="destructive" onClick={() => onEliminar(id)}>
        Sí
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirmarEliminar(null)}>
        No
      </Button>
    </>
  ) : (
    <Button size="icon-sm" variant="ghost" onClick={() => setConfirmarEliminar(id)} aria-label="Eliminar parada">
      <Trash2 className="size-3.5" />
    </Button>
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
            {p.supervisorNombre ? ` · ${p.supervisorNombre}` : ""}
          </p>
          {p.nota && <p className="mt-0.5 text-xs text-muted-foreground">{p.nota}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {acciones}
          <BotonEliminar
            id={p.id}
            confirmarEliminar={confirmarEliminar}
            setConfirmarEliminar={setConfirmarEliminar}
            onEliminar={onEliminar}
          />
        </div>
      </div>
    </div>
  )
}
