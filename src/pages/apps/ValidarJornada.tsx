import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, LockOpen } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccionValidar } from "@/components/validar-jornada/AccionesFila"
import { SinReportarJornada } from "@/components/validar-jornada/SinReportarJornada"
import { TablaCajas, TablaEnvases, TablaLotes, TablaParadas } from "@/components/validar-jornada/TablasJornada"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { franjaDeHora, restarDias } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"
import {
  cargarEstadosJornada,
  cargarJornada,
  filasCajas,
  filasEnvases,
  filasLotes,
  filasParadas,
  reabrirJornada,
  revisada,
  validarCajas,
  validarContador,
  validarJornada,
  validarLote,
  validarParada,
  type DatosJornada,
  type EstadoJornada,
} from "@/lib/validarJornada"

/*
 * Validar jornada (maqueta aprobada 2026-10-12; por ahora solo en el Área
 * de Pruebas): la Analista revisa el día (7:00 a 7:00) en cuatro partes y
 * lo valida. Recién validada, la jornada cuenta en los KPIs. Datos y
 * cuentas en src/lib/validarJornada.ts; tablas en src/components/validar-jornada/.
 */

type Paso = "cajas" | "envases" | "lotes" | "paradas"

const PASOS: { clave: Paso; titulo: string; detalle: string }[] = [
  { clave: "cajas", titulo: "Cajas", detalle: "Por turno, sabor y presentación" },
  { clave: "envases", titulo: "Envases", detalle: "Contador contra PT por corrida" },
  { clave: "lotes", titulo: "Semielaborado", detalle: "Litros por lote" },
  { clave: "paradas", titulo: "Paradas", detalle: "Minutos y repetidas" },
]

const AYUDA: Record<Paso, string> = {
  cajas: "La misma corrección del mensaje de WhatsApp: lo corregido es el número oficial del turno.",
  envases: "Envases del PT = cajas × envases por caja. Se corrige el contador de la llenadora si se cargó mal (por ejemplo, la lectura acumulada).",
  lotes:
    "Consumo = inicio + entradas − salidas (transferencias, desvases, Vacío) − final. Se corrige el volumen final si el tanque se midió distinto. Los lotes de Vacío no cuentan.",
  paradas: "Se corrigen los minutos, o se marca «No cuenta» una parada repetida (supervisor y Mantenimiento cargaron la misma falla).",
}

const diaCorto = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })
const fechaHora = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" })

export default function ValidarJornada() {
  const { session } = useAuth()
  const { presentaciones } = useCatalogosLive()
  const area = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const usuario = session?.username ?? ""
  // Jornada en curso (7:00 a 7:00): por defecto se valida la de ayer, ya cerrada.
  const hoy = franjaDeHora().fecha
  const [fecha, setFecha] = useState(() => restarDias(hoy, 1))
  const [version, setVersion] = useState(0)
  const [cargado, setCargado] = useState<{ fecha: string; datos: DatosJornada | null; error: string | null } | null>(null)
  const [estados, setEstados] = useState<EstadoJornada[]>([])
  const [paso, setPaso] = useState<Paso>("cajas")
  const [reabriendo, setReabriendo] = useState(false)
  const [nota, setNota] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [errorJornada, setErrorJornada] = useState<string | null>(null)

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => restarDias(hoy, 6 - i)), [hoy])

  useEffect(() => {
    if (!usuario) return
    let vivo = true
    cargarJornada(usuario, area, fecha).then((r) => {
      if (vivo) setCargado({ fecha, datos: "error" in r ? null : r, error: "error" in r ? r.error : null })
    })
    cargarEstadosJornada(usuario, area, dias[0], hoy).then((e) => vivo && setEstados(e))
    return () => {
      vivo = false
    }
  }, [usuario, area, fecha, version, dias, hoy])

  const vigente = cargado?.fecha === fecha ? cargado : null
  const datos = vigente?.datos ?? null
  const estadoDia = estados.find((e) => e.fecha === fecha) ?? null
  const bloqueada = estadoDia?.estado === "VALIDADA"

  const filas = useMemo(
    () =>
      datos
        ? {
            cajas: filasCajas(datos),
            envases: filasEnvases(datos.turnos, presentaciones, datos.contadores),
            lotes: filasLotes(datos.turnos, presentaciones, datos.lotes),
            paradas: filasParadas(datos.paradas, datos.paradasValidadas, new Date(), datos.paradasAbiertas),
          }
        : null,
    [datos, presentaciones],
  )
  const faltan = filas ? PASOS.filter((p) => !revisada(filas[p.clave])) : PASOS
  const hayTurnoAbierto = datos?.turnos.some((t) => t.turno.estado === "ABIERTO") ?? false
  const sinDatos = datos !== null && datos.turnos.length === 0

  const recargar = () => setVersion((v) => v + 1)
  async function conRecarga(p: Promise<{ ok: true } | { ok: false; error: string }>) {
    const r = await p
    if (r.ok) recargar()
    return r
  }
  const valor = (a: AccionValidar) => (a.tipo === "CORREGIR" ? a.valor : null)

  async function validarDia() {
    setEnviando(true)
    setErrorJornada(null)
    const r = await validarJornada(usuario, area, fecha)
    setEnviando(false)
    if (!r.ok) return setErrorJornada(r.error)
    recargar()
  }

  async function reabrir() {
    setEnviando(true)
    setErrorJornada(null)
    const r = await reabrirJornada(usuario, area, fecha, nota)
    setEnviando(false)
    if (!r.ok) return setErrorJornada(r.error)
    setReabriendo(false)
    setNota("")
    recargar()
  }

  return (
    <AppShell title="Validar jornada" description={`${area === "PRUEBAS" ? "Área de Pruebas" : "Aséptico"} · de 7:00 a 7:00`} fullWidth>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-28">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Revisa el día en cuatro partes y valídalo: recién validada, la jornada cuenta en los KPIs. Lo del supervisor no se borra; lo
          corregido se guarda aparte.
        </p>

        {/* Días */}
        <div className="flex flex-wrap items-end gap-2">
          {dias.map((d) => {
            const e = estados.find((x) => x.fecha === d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => setFecha(d)}
                className={cn(
                  "flex min-w-[96px] flex-col gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-left text-sm",
                  d === fecha ? "border-2 border-primary" : "border-border",
                )}
              >
                <span className="font-semibold capitalize">{diaCorto.format(new Date(`${d}T00:00:00Z`))}</span>
                <Badge variant={e?.estado === "VALIDADA" ? "success" : e?.estado === "REABIERTA" ? "warning" : "muted"}>
                  {e?.estado === "VALIDADA" ? "Validada" : e?.estado === "REABIERTA" ? "Reabierta" : "Sin validar"}
                </Badge>
              </button>
            )
          })}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Otra fecha</span>
            <Input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} className="h-9 w-[160px]" />
          </label>
        </div>

        {vigente?.error && (
          <p className="text-sm text-destructive" role="alert">
            {vigente.error}
          </p>
        )}

        {!vigente ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : sinDatos ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay turnos en esta jornada.</p>
        ) : filas ? (
          <>
            {/* Avance de las cuatro revisiones */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PASOS.map((p) => {
                const lista = filas[p.clave]
                const hechas = lista.filter((f) => f.validacion !== null).length
                const completa = hechas === lista.length
                return (
                  <button
                    key={p.clave}
                    type="button"
                    onClick={() => setPaso(p.clave)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 text-left",
                      paso === p.clave ? "border-2 border-primary" : "border-border",
                    )}
                  >
                    <span className="font-semibold">{p.titulo}</span>
                    <span className="text-xs text-muted-foreground">{p.detalle}</span>
                    <Badge variant={completa ? "success" : "warning"} className="mt-1">
                      {completa ? "Revisado" : `${hechas} de ${lista.length} revisados`}
                    </Badge>
                  </button>
                )
              })}
            </div>

            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{AYUDA[paso]}</p>
              {paso === "cajas" && (
                <TablaCajas
                  filas={filas.cajas}
                  bloqueada={bloqueada}
                  onAccion={(f, a) => conRecarga(validarCajas(usuario, f.turnoId, f.saborNombre, f.volumenMl, valor(a)))}
                />
              )}
              {paso === "envases" && (
                <TablaEnvases filas={filas.envases} bloqueada={bloqueada} onAccion={(f, a) => conRecarga(validarContador(usuario, f.id, valor(a)))} />
              )}
              {paso === "lotes" && (
                <TablaLotes filas={filas.lotes} bloqueada={bloqueada} onAccion={(f, a) => conRecarga(validarLote(usuario, f.id, fecha, valor(a)))} />
              )}
              {paso === "paradas" && datos && <SinReportarJornada datos={datos} />}
              {paso === "paradas" && (
                <TablaParadas
                  filas={filas.paradas}
                  bloqueada={bloqueada}
                  onAccion={(f, a) =>
                    conRecarga(
                      validarParada(
                        usuario,
                        f.id,
                        a.tipo === "CONFIRMAR" ? "CONFIRMADO" : a.tipo === "NO_CUENTA" ? "EXCLUIDA" : "EDITADO",
                        valor(a),
                      ),
                    )
                  }
                />
              )}
            </section>
          </>
        ) : null}
      </div>

      {/* Barra: validar o reabrir la jornada */}
      {filas && !sinDatos && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            {bloqueada ? (
              reabriendo ? (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <Input
                    className="min-w-0 flex-1"
                    placeholder="Por qué se reabre la jornada"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    autoFocus
                  />
                  <Button size="sm" disabled={nota.trim() === "" || enviando} onClick={reabrir}>
                    {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <LockOpen className="size-3.5" />}
                    Reabrir
                  </Button>
                  <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setReabriendo(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-sm text-success-foreground">
                    <CheckCircle2 className="size-4" />
                    Jornada validada{estadoDia?.validadoPorNombre ? ` por ${estadoDia.validadoPorNombre}` : ""} el{" "}
                    {estadoDia ? fechaHora.format(new Date(estadoDia.validadoEn)) : ""}. Ya cuenta en los KPIs.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setReabriendo(true)}>
                    <LockOpen className="size-3.5" />
                    Reabrir
                  </Button>
                </>
              )
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {hayTurnoAbierto
                    ? "Todavía hay un turno abierto en esta jornada: se valida cuando cierren todos."
                    : faltan.length > 0
                      ? `Falta revisar: ${faltan.map((p) => p.titulo).join(", ")}.`
                      : estadoDia?.estado === "REABIERTA"
                        ? `Reabierta: ${estadoDia.nota ?? ""}. Todo revisado: se puede volver a validar.`
                        : "Todo revisado. Al validar, la jornada entra en los KPIs y ya no se cambia (se puede reabrir con una nota)."}
                </p>
                <Button size="sm" disabled={faltan.length > 0 || hayTurnoAbierto || enviando} onClick={validarDia}>
                  {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Validar la jornada
                </Button>
              </>
            )}
            {errorJornada && (
              <p className="w-full text-sm text-destructive" role="alert">
                {errorJornada}
              </p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
