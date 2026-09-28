import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { listarAnalisisCalidad, useAnalisisCalidad, type AnalisisCalidad, type RegistroCalidad } from "@/lib/calidad"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
import { useSesionTurno } from "@/lib/sesionTurno"
import { diaMesPlanta, fechaPlanta, horaCortaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * Calidad: analiza los lotes que el supervisor dejó En Preparación y, si
 * son conformes, los libera (el tanque queda Listo y el supervisor lo toma
 * desde Líneas). Cada análisis queda guardado; si no es conforme, el
 * supervisor ajusta y Calidad vuelve a analizar. Abajo, los registros.
 * Migración 20261086. Los rangos de Brix y acidez por sabor, pendientes.
 */

/** Cada cuánto se vuelven a leer los tanques: el supervisor puede preparar uno con la página abierta. */
const REFRESCO_MS = 30 * 1000

export default function Calidad() {
  const sesion = useSesionTurno()
  const { tanques, preparaciones, cargando, recargar, registrarAnalisisCalidad } = usePreparacion()
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

  return (
    <AppShell title="Calidad" description="Análisis y liberación de lotes">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Por analizar{sesion.codigo ? ` · turno ${sesion.codigo}` : ""}
          </h2>
          {sesion.cargando || cargando ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !sesion.turnoId ? (
            <EmptyState icon={FlaskConical} title="No hay un turno en curso" description="Cuando el supervisor abra el turno, sus tanques aparecen acá." />
          ) : pendientes.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Nada por analizar" description="No hay lotes en preparación esperando análisis." />
          ) : (
            pendientes.map((lote) => (
              <LoteParaAnalizar
                key={lote.id}
                lote={lote}
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
        </section>

        <RegistrosCalidad version={versionRegistros} />
      </div>
    </AppShell>
  )
}

type ResultadoAccion = { ok: true } | { ok: false; error: string }

function LoteParaAnalizar({
  lote,
  analisis,
  onRegistrar,
}: {
  lote: PreparacionRegistro
  analisis: AnalisisCalidad[]
  onRegistrar: (datos: { brix: number; acidez: number; conforme: boolean; observacion: string | null }) => Promise<ResultadoAccion>
}) {
  const [brix, setBrix] = useState("")
  const [acidez, setAcidez] = useState("")
  const [conforme, setConforme] = useState<boolean | null>(null)
  const [observacion, setObservacion] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const brixNum = Number(brix.replace(",", "."))
  const acidezNum = Number(acidez.replace(",", "."))
  const valido =
    brix.trim() !== "" &&
    acidez.trim() !== "" &&
    Number.isFinite(brixNum) &&
    Number.isFinite(acidezNum) &&
    brixNum >= 0 &&
    acidezNum >= 0 &&
    conforme !== null &&
    (conforme || observacion.trim() !== "")

  async function guardar() {
    if (!valido || conforme === null) return
    setGuardando(true)
    setError(null)
    const r = await onRegistrar({ brix: brixNum, acidez: acidezNum, conforme, observacion: observacion.trim() || null })
    setGuardando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setBrix("")
    setAcidez("")
    setConforme(null)
    setObservacion("")
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Tanque {lote.numeroTanque}
          <span className="font-normal text-muted-foreground">
            · {lote.saborNombre ?? "Sin sabor"}
            {lote.lote ? ` · Lote ${lote.lote}` : ""}
            {lote.volumenActualL ? ` · ${lote.volumenActualL.toLocaleString("es-CO")} L` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {analisis.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {analisis.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <ResultadoBadge conforme={a.conforme} />
                <span className="num text-foreground">
                  Brix {a.brix} · Acidez {a.acidez}
                </span>
                {a.observacion && <span className="text-muted-foreground">· {a.observacion}</span>}
                <span className="text-muted-foreground">
                  — {a.analistaNombre}, {horaCortaPlanta(a.creadoEn, a.creadoEn)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(0,140px))_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`brix-${lote.id}`}>Brix (°Bx)</Label>
            <Input id={`brix-${lote.id}`} inputMode="decimal" value={brix} onChange={(e) => setBrix(e.target.value)} placeholder="Ej. 12,5" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`acidez-${lote.id}`}>Acidez (%)</Label>
            <Input id={`acidez-${lote.id}`} inputMode="decimal" value={acidez} onChange={(e) => setAcidez(e.target.value)} placeholder="Ej. 0,35" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <Label>Conformidad</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={conforme === true ? "default" : "outline"} onClick={() => setConforme(true)}>
                <CheckCircle2 className="size-3.5" />
                Conforme
              </Button>
              <Button
                type="button"
                size="sm"
                variant={conforme === false ? "destructive" : "outline"}
                onClick={() => setConforme(false)}
              >
                <XCircle className="size-3.5" />
                No conforme
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`obs-${lote.id}`}>Observación{conforme === false ? "" : " (opcional)"}</Label>
          <Textarea
            id={`obs-${lote.id}`}
            rows={2}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder={conforme === false ? "Qué hay que corregir" : ""}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button className="self-start" disabled={!valido || guardando} onClick={guardar}>
          {guardando && <Loader2 className="size-4 animate-spin" />}
          {conforme === false ? "Guardar análisis" : "Guardar y liberar"}
        </Button>
      </CardContent>
    </Card>
  )
}

function ResultadoBadge({ conforme }: { conforme: boolean }) {
  return <Badge variant={conforme ? "success" : "destructive"}>{conforme ? "Conforme" : "No conforme"}</Badge>
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
    listarAnalisisCalidad(session.username, desde, hoy, session.area ?? null).then((filas) => vivo && setCargado({ clave: c, filas }))
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
                  <th className="py-1.5 pr-3 font-medium">Fecha</th>
                  <th className="py-1.5 pr-3 font-medium">Tanque · Lote</th>
                  <th className="py-1.5 pr-3 font-medium">Sabor</th>
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
                      T{f.numeroTanque}
                      {f.lote ? ` · ${f.lote}` : ""}
                    </td>
                    <td className="py-2 pr-3">{f.saborNombre ?? "—"}</td>
                    <td className="num py-2 pr-3 text-right">{f.brix}</td>
                    <td className="num py-2 pr-3 text-right">{f.acidez}</td>
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
