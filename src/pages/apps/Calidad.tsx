import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, FlaskConical, Loader2, Pencil, Search, XCircle } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import {
  acidezEnRango,
  brixEnRango,
  guardarParametrosCalidad,
  listarAnalisisCalidad,
  textoRango,
  useAnalisisCalidad,
  useParametrosCalidad,
  type AnalisisCalidad,
  type ParametrosSabor,
  type RangoCalidad,
  type RegistroCalidad,
} from "@/lib/calidad"
import { TanqueVisual } from "@/components/TanqueVisual"
import { colorSabor } from "@/lib/coloresSabor"
import { puede } from "@/lib/permisos"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import type { CondicionTanque, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import { nombreSaborConFamilia } from "@/lib/sabores"
import { useSesionTurno } from "@/lib/sesionTurno"
import { diaMesPlanta, fechaPlanta, horaCortaPlanta, restarDias } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"

/*
 * Calidad: analiza los lotes que el supervisor dejó En Preparación y, si
 * son conformes, los libera (el tanque queda Listo y el supervisor lo toma
 * desde Líneas). El análisis es sensorial (conforme / no conforme), Brix y
 * acidez; el resultado es conforme solo si el sensorial lo es y el Brix y
 * la acidez están dentro del rango del sabor. Cada análisis queda guardado;
 * si no es conforme, el supervisor ajusta y Calidad vuelve a analizar.
 * Abajo, los registros y los rangos por sabor (los edita el Supervisor de
 * Calidad). Migraciones 20261086 y 20261088.
 */

/** Cada cuánto se vuelven a leer los tanques: el supervisor puede preparar uno con la página abierta. */
const REFRESCO_MS = 30 * 1000

/** Misma capacidad con la que se dibujan los tanques en Preparación y en el Panel. */
const CAPACIDAD_TANQUE = 20000

const NOMBRE_CONDICION: Record<CondicionTanque, string> = {
  EN_PREPARACION: "En preparación",
  LISTO: "Liberado",
  STANDBY: "Con restos",
  SUCIO: "Sucio",
  CIP: "En CIP",
  LIMPIO: "Limpio",
}

const numero = (texto: string) => Number(texto.trim().replace(",", "."))
const esNumero = (texto: string) => texto.trim() !== "" && Number.isFinite(numero(texto)) && numero(texto) >= 0

export default function Calidad() {
  const sesion = useSesionTurno()
  const { tanques, preparaciones, cargando, recargar, registrarAnalisisCalidad } = usePreparacion()
  const { parametros, recargar: recargarParametros } = useParametrosCalidad()
  const [versionRegistros, setVersionRegistros] = useState(0)

  useEffect(() => {
    const id = setInterval(() => recargar(), REFRESCO_MS)
    return () => clearInterval(id)
  }, [recargar])

  // Lotes abiertos cuyo tanque está En Preparación: los que esperan a Calidad.
  const pendientes = useMemo(
    () =>
      preparaciones.filter(
        (p) =>
          !p.liberadoEn &&
          !p.cerradoEn &&
          tanques.some((t) => t.numeroTanque === p.numeroTanque && t.condicion === "EN_PREPARACION"),
      ),
    [preparaciones, tanques],
  )
  const { porLote, refrescar } = useAnalisisCalidad(pendientes.map((p) => p.id))
  const rangoPorSabor = useMemo(() => new Map((parametros ?? []).map((p) => [p.saborId, p.rango])), [parametros])

  return (
    <AppShell title="Calidad" description="Análisis y liberación de lotes">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Por analizar{sesion.codigo ? ` · turno ${sesion.codigo}` : ""}
          </h2>
          {sesion.cargando || cargando || parametros === null ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !sesion.turnoId ? (
            <EmptyState icon={FlaskConical} title="No hay un turno en curso" description="Cuando el supervisor abra el turno, sus tanques aparecen acá." />
          ) : (
            <>
              <TanquesDelTurno tanques={tanques} pendientes={pendientes} porLote={porLote} />
              {pendientes.length === 0 ? (
                <EmptyState icon={FlaskConical} title="Nada por analizar" description="No hay lotes en preparación esperando análisis." />
              ) : (
                pendientes.map((lote) => (
              <LoteParaAnalizar
                key={lote.id}
                lote={lote}
                tanque={tanques.find((t) => t.numeroTanque === lote.numeroTanque) ?? null}
                rango={lote.saborId ? (rangoPorSabor.get(lote.saborId) ?? null) : null}
                analisis={porLote.get(lote.id) ?? []}
                onRegistrar={async (datos) => {
                  const r = await registrarAnalisisCalidad(lote.id, datos)
                  if (r.ok) {
                    refrescar()
                    setVersionRegistros((v) => v + 1)
                  }
                  return r
                }}
              />
                ))
              )}
            </>
          )}
        </section>

        <RegistrosCalidad version={versionRegistros} />

        <ParametrosPorSabor parametros={parametros} onGuardado={recargarParametros} />
      </div>
    </AppShell>
  )
}

type ResultadoAccion = { ok: true } | { ok: false; error: string }

/*
 * Los 3 tanques del turno, dibujados igual que en Preparación, con lo que
 * le toca a Calidad en cada uno. Los que esperan análisis llevan al
 * formulario de abajo.
 */
function TanquesDelTurno({
  tanques,
  pendientes,
  porLote,
}: {
  tanques: TanqueRecepcion[]
  pendientes: PreparacionRegistro[]
  porLote: Map<string, AnalisisCalidad[]>
}) {
  const ordenados = [...tanques].sort((a, b) => a.numeroTanque - b.numeroTanque)
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {ordenados.map((t) => {
        const lote = pendientes.find((p) => p.numeroTanque === t.numeroTanque) ?? null
        const ultimo = lote ? (porLote.get(lote.id)?.[0] ?? null) : null
        const estado = lote
          ? ultimo && !ultimo.conforme
            ? { texto: "No conforme", variante: "destructive" as const }
            : { texto: "Por analizar", variante: "warning" as const }
          : t.condicion === "LISTO"
            ? { texto: "Liberado", variante: "success" as const }
            : { texto: NOMBRE_CONDICION[t.condicion], variante: "secondary" as const }
        const contenido = (
          <>
            <TanqueVisual
              numeroTanque={t.numeroTanque}
              condicion={t.condicion}
              volumenL={t.volumenL}
              volumenInicialL={t.volumenInicialL}
              color={colorSabor(t.saborNombre)}
              capacidad={CAPACIDAD_TANQUE}
            />
            <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 px-2 py-2">
              <p className="text-sm font-semibold text-foreground">Tanque {t.numeroTanque}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t.saborNombre ?? "—"}
                {t.lote ? ` · ${t.lote}` : ""}
              </p>
              <Badge variant={estado.variante} className="self-start">
                {estado.texto}
              </Badge>
            </div>
          </>
        )
        return lote ? (
          <a
            key={t.numeroTanque}
            href={`#lote-${lote.id}`}
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border-2 border-warning/60 bg-card transition-colors hover:border-warning"
          >
            {contenido}
          </a>
        ) : (
          <div key={t.numeroTanque} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card opacity-80">
            {contenido}
          </div>
        )
      })}
    </div>
  )
}

function LoteParaAnalizar({
  lote,
  tanque,
  rango,
  analisis,
  onRegistrar,
}: {
  lote: PreparacionRegistro
  tanque: TanqueRecepcion | null
  /** Rango del sabor del lote. null = sin cargar: no se puede analizar. */
  rango: RangoCalidad | null
  analisis: AnalisisCalidad[]
  onRegistrar: (datos: { brix: number; acidez: number; sensorialConforme: boolean; observacion: string | null }) => Promise<ResultadoAccion>
}) {
  const [brix, setBrix] = useState("")
  const [acidez, setAcidez] = useState("")
  const [sensorial, setSensorial] = useState<boolean | null>(null)
  const [observacion, setObservacion] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const brixOk = rango && esNumero(brix) ? brixEnRango(numero(brix), rango) : null
  const acidezOk = rango && esNumero(acidez) ? acidezEnRango(numero(acidez), rango) : null
  const completo = esNumero(brix) && esNumero(acidez) && sensorial !== null
  // Mismo criterio que el servidor (registrar_analisis_calidad): sensorial conforme y los dos valores en rango.
  const conforme = completo && sensorial === true && brixOk === true && acidezOk === true
  const motivos = [
    sensorial === false ? "sensorial no conforme" : null,
    rango === null ? "el sabor no tiene rango cargado" : null,
    brixOk === false ? "Brix fuera de rango" : null,
    acidezOk === false ? "acidez fuera de rango" : null,
  ].filter(Boolean)
  // Siempre se puede guardar (queda con su hora); solo el sensorial no conforme pide observación.
  const pideObservacion = sensorial === false
  const valido = completo && (!pideObservacion || observacion.trim() !== "")

  async function guardar() {
    if (!valido || sensorial === null) return
    setGuardando(true)
    setError(null)
    const r = await onRegistrar({ brix: numero(brix), acidez: numero(acidez), sensorialConforme: sensorial, observacion: observacion.trim() || null })
    setGuardando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setBrix("")
    setAcidez("")
    setSensorial(null)
    setObservacion("")
  }

  return (
    <Card id={`lote-${lote.id}`} className="scroll-mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <TanqueVisual
            numeroTanque={lote.numeroTanque}
            condicion={tanque?.condicion ?? "EN_PREPARACION"}
            volumenL={tanque?.volumenL ?? null}
            volumenInicialL={tanque?.volumenInicialL ?? null}
            color={colorSabor(lote.saborNombre)}
            capacidad={CAPACIDAD_TANQUE}
            square
          />
          <CardTitle className="flex min-w-0 flex-col gap-1 text-base">
            Tanque {lote.numeroTanque}
            <span className="text-sm font-normal text-muted-foreground">
              {lote.saborNombre ?? "Sin sabor"}
              {lote.lote ? ` · Lote ${lote.lote}` : ""}
            </span>
            {lote.volumenActualL ? (
              <span className="num text-sm font-normal text-muted-foreground">{lote.volumenActualL.toLocaleString("es-CO")} L</span>
            ) : null}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {analisis.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {analisis.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <ResultadoBadge conforme={a.conforme} />
                <span className="num text-foreground">
                  Sensorial {a.sensorialConforme ? "conforme" : "no conforme"} · Brix {a.brix} · Acidez {a.acidez}
                </span>
                {a.observacion && <span className="text-muted-foreground">· {a.observacion}</span>}
                <span className="text-muted-foreground">
                  — {a.analistaNombre}, {horaCortaPlanta(a.creadoEn, a.creadoEn)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {rango === null && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
            {lote.saborId
              ? "Este sabor no tiene cargados los rangos de Brix y acidez: el análisis se guarda, pero no se puede liberar hasta que el Supervisor de Calidad los cargue (abajo, en Parámetros por sabor)."
              : "El lote no tiene sabor: el análisis se guarda, pero no se puede comparar con un rango ni liberar."}
          </p>
        )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(0,160px))_1fr]">
              <CampoMedicion
                id={`brix-${lote.id}`}
                etiqueta="Brix (°Bx)"
                valor={brix}
                onChange={setBrix}
                rango={rango ? textoRango(rango.brixMin, rango.brixMax) : null}
                enRango={brixOk}
              />
              <CampoMedicion
                id={`acidez-${lote.id}`}
                etiqueta="Acidez (%)"
                valor={acidez}
                onChange={setAcidez}
                rango={rango ? textoRango(rango.acidezMin, rango.acidezMax) : null}
                enRango={acidezOk}
              />
              <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                <Label>Análisis sensorial</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={sensorial === true ? "default" : "outline"} onClick={() => setSensorial(true)}>
                    <CheckCircle2 className="size-3.5" />
                    Conforme
                  </Button>
                  <Button type="button" size="sm" variant={sensorial === false ? "destructive" : "outline"} onClick={() => setSensorial(false)}>
                    <XCircle className="size-3.5" />
                    No conforme
                  </Button>
                </div>
              </div>
            </div>

            {completo && (
              <p className={cn("text-sm font-medium", conforme ? "text-success" : "text-destructive")}>
                {conforme ? "Resultado: conforme. Al guardar, el lote queda liberado." : `Resultado: no conforme (${motivos.join(", ")}). Se guarda con su hora, pero el lote no se libera.`}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`obs-${lote.id}`}>Observación{pideObservacion ? "" : " (opcional)"}</Label>
              <Textarea
                id={`obs-${lote.id}`}
                rows={2}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder={completo && !conforme ? "Qué hay que corregir" : ""}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button className="self-start" disabled={!valido || guardando} onClick={guardar}>
              {guardando && <Loader2 className="size-4 animate-spin" />}
              {completo && !conforme ? "Guardar análisis" : "Guardar y liberar"}
            </Button>
      </CardContent>
    </Card>
  )
}

function CampoMedicion({
  id,
  etiqueta,
  valor,
  onChange,
  rango,
  enRango,
}: {
  id: string
  etiqueta: string
  valor: string
  onChange: (v: string) => void
  /** null = el sabor no tiene rango cargado. */
  rango: string | null
  enRango: boolean | null
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={enRango === false}
        className={cn(enRango === false && "border-destructive")}
      />
      <span className={cn("text-xs", enRango === false ? "text-destructive" : enRango ? "text-success" : "text-muted-foreground")}>
        {rango === null ? "Sin rango cargado" : `Rango ${rango}`}
        {enRango === false ? " · fuera de rango" : enRango ? " · en rango" : ""}
      </span>
    </div>
  )
}

function ResultadoBadge({ conforme }: { conforme: boolean }) {
  return <Badge variant={conforme ? "success" : "destructive"}>{conforme ? "Conforme" : "No conforme"}</Badge>
}

/** Valor con color si quedó fuera del rango con el que se evaluó. */
function ValorEvaluado({ valor, min, max }: { valor: number; min: number | undefined; max: number | undefined }) {
  const fuera = min !== undefined && max !== undefined && (valor < min || valor > max)
  return (
    <span className={cn(fuera && "font-semibold text-destructive")} title={min !== undefined && max !== undefined ? `Rango ${textoRango(min, max)}` : undefined}>
      {valor}
    </span>
  )
}

type PeriodoRegistros = "HOY" | "7D" | "MES"
const PERIODOS: { codigo: PeriodoRegistros; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "7D", etiqueta: "Últimos 7 días" },
  { codigo: "MES", etiqueta: "Este mes" },
]

function RegistrosCalidad({ version }: { version: number }) {
  const { session } = useAuth()
  const [periodo, setPeriodo] = useState<PeriodoRegistros>("HOY")
  const [cargado, setCargado] = useState<{ clave: string; filas: RegistroCalidad[] } | null>(null)

  const hoy = fechaPlanta()
  const desde = periodo === "HOY" ? hoy : periodo === "7D" ? restarDias(hoy, 6) : `${hoy.slice(0, 8)}01`
  const clave = `${desde}|${hoy}|${version}`

  useEffect(() => {
    if (!session) return
    let vivo = true
    const c = `${desde}|${hoy}|${version}`
    // El área Calidad no tiene turnos propios: ve los registros de las áreas de producción (null = todas menos Pruebas).
    const area = session.area === "CALIDAD" ? null : (session.area ?? null)
    listarAnalisisCalidad(session.username, desde, hoy, area).then((filas) => vivo && setCargado({ clave: c, filas }))
    return () => {
      vivo = false
    }
  }, [session, desde, hoy, version])

  const filas = cargado?.clave === clave ? cargado.filas : null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Registros</h2>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <Button key={p.codigo} size="sm" variant={periodo === p.codigo ? "default" : "outline"} onClick={() => setPeriodo(p.codigo)}>
              {p.etiqueta}
            </Button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          {filas === null ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin análisis en el período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Fecha y hora</th>
                  <th className="py-1.5 pr-3 font-medium">Tanque · Lote</th>
                  <th className="py-1.5 pr-3 font-medium">Sabor</th>
                  <th className="py-1.5 pr-3 font-medium">Sensorial</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Brix</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Acidez</th>
                  <th className="py-1.5 pr-3 font-medium">Resultado</th>
                  <th className="py-1.5 font-medium">Analista</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 align-top last:border-b-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {diaMesPlanta(new Date(f.creadoEn))} {horaCortaPlanta(f.creadoEn, f.creadoEn)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      Tanque {f.numeroTanque}
                      {f.lote ? ` · ${f.lote}` : ""}
                    </td>
                    <td className="py-2 pr-3">{f.saborNombre ?? "—"}</td>
                    <td className={cn("py-2 pr-3", !f.sensorialConforme && "font-semibold text-destructive")}>
                      {f.sensorialConforme ? "Conforme" : "No conforme"}
                    </td>
                    <td className="num py-2 pr-3 text-right">
                      <ValorEvaluado valor={f.brix} min={f.rango?.brixMin} max={f.rango?.brixMax} />
                    </td>
                    <td className="num py-2 pr-3 text-right">
                      <ValorEvaluado valor={f.acidez} min={f.rango?.acidezMin} max={f.rango?.acidezMax} />
                    </td>
                    <td className="py-2 pr-3">
                      <ResultadoBadge conforme={f.conforme} />
                      {f.observacion && <p className="mt-1 text-xs text-muted-foreground">{f.observacion}</p>}
                    </td>
                    <td className="py-2 whitespace-nowrap">{f.analistaNombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

/*
 * Rangos de Brix y acidez por sabor. Todos los ven; solo el Supervisor de
 * Calidad (CALIDAD_PARAMETROS) los edita, por ejemplo cuando se reformula
 * un sabor. Cada cambio queda en Auditoría.
 */
function ParametrosPorSabor({ parametros, onGuardado }: { parametros: ParametrosSabor[] | null; onGuardado: () => void }) {
  const { session } = useAuth()
  const puedeEditar = puede(session, "CALIDAD_PARAMETROS")
  const [busqueda, setBusqueda] = useState("")
  const [editando, setEditando] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = parametros ?? []
    return q ? lista.filter((p) => nombreSaborConFamilia(p.saborNombre, p.familiaNombre).toLowerCase().includes(q)) : lista
  }, [parametros, busqueda])
  const sinCargar = (parametros ?? []).filter((p) => !p.rango).length

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Parámetros por sabor
          {sinCargar > 0 && <span className="ml-2 font-normal normal-case text-warning-foreground">· {sinCargar} sin cargar</span>}
        </h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar sabor" className="pl-8" aria-label="Buscar sabor" />
        </div>
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          {parametros === null ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ningún sabor coincide.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Sabor</th>
                  <th className="py-1.5 pr-3 font-medium">Brix (°Bx)</th>
                  <th className="py-1.5 pr-3 font-medium">Acidez (%)</th>
                  <th className="py-1.5 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) =>
                  editando === p.saborId ? (
                    <FilaEditarParametros
                      key={p.saborId}
                      parametro={p}
                      onCancelar={() => setEditando(null)}
                      onGuardado={() => {
                        setEditando(null)
                        onGuardado()
                      }}
                    />
                  ) : (
                    <tr key={p.saborId} className="border-b border-border/60 last:border-b-0">
                      <td className="py-2 pr-3">{nombreSaborConFamilia(p.saborNombre, p.familiaNombre)}</td>
                      <td className="num py-2 pr-3">{p.rango ? textoRango(p.rango.brixMin, p.rango.brixMax) : <SinCargar />}</td>
                      <td className="num py-2 pr-3">{p.rango ? textoRango(p.rango.acidezMin, p.rango.acidezMax) : <SinCargar />}</td>
                      <td className="py-1 text-right">
                        {puedeEditar && (
                          <Button size="sm" variant="ghost" onClick={() => setEditando(p.saborId)} aria-label={`Editar ${p.saborNombre}`}>
                            <Pencil className="size-3.5" />
                            {p.rango ? "Editar" : "Cargar"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function SinCargar() {
  return <span className="text-xs text-muted-foreground">Sin cargar</span>
}

function FilaEditarParametros({
  parametro,
  onCancelar,
  onGuardado,
}: {
  parametro: ParametrosSabor
  onCancelar: () => void
  onGuardado: () => void
}) {
  const { session } = useAuth()
  const r = parametro.rango
  const [brixMin, setBrixMin] = useState(r ? String(r.brixMin) : "")
  const [brixMax, setBrixMax] = useState(r ? String(r.brixMax) : "")
  const [acidezMin, setAcidezMin] = useState(r ? String(r.acidezMin) : "")
  const [acidezMax, setAcidezMax] = useState(r ? String(r.acidezMax) : "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completos = [brixMin, brixMax, acidezMin, acidezMax].every(esNumero)
  const ordenados = completos && numero(brixMin) <= numero(brixMax) && numero(acidezMin) <= numero(acidezMax)

  async function guardar() {
    if (!session || !ordenados) return
    setGuardando(true)
    setError(null)
    const res = await guardarParametrosCalidad(session.username, parametro.saborId, {
      brixMin: numero(brixMin),
      brixMax: numero(brixMax),
      acidezMin: numero(acidezMin),
      acidezMax: numero(acidezMax),
    })
    setGuardando(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onGuardado()
  }

  const campo = (valor: string, set: (v: string) => void, etiqueta: string) => (
    <Input inputMode="decimal" value={valor} onChange={(e) => set(e.target.value)} aria-label={etiqueta} className="h-8 w-20" />
  )

  return (
    <tr className="border-b border-border/60 bg-muted/30 align-top last:border-b-0">
      <td className="py-2 pr-3 font-medium">{nombreSaborConFamilia(parametro.saborNombre, parametro.familiaNombre)}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1">
          {campo(brixMin, setBrixMin, "Brix mínimo")}–{campo(brixMax, setBrixMax, "Brix máximo")}
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1">
          {campo(acidezMin, setAcidezMin, "Acidez mínima")}–{campo(acidezMax, setAcidezMax, "Acidez máxima")}
        </div>
      </td>
      <td className="py-2">
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <Button size="sm" disabled={!ordenados || guardando} onClick={guardar}>
              {guardando && <Loader2 className="size-3.5 animate-spin" />}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </Button>
          </div>
          {completos && !ordenados && <p className="text-xs text-destructive">El mínimo no puede ser mayor que el máximo.</p>}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
}
