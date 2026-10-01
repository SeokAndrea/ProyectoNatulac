import { useEffect, useMemo, useRef, useState } from "react"
import { Check, CheckCircle2, Copy, Loader2, PenLine } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { franjaDeHora, restarDias } from "@/lib/tiempoPlanta"
import { TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import {
  cajasOficiales,
  cajasSupervisor,
  cargarResumenDia,
  confirmarCorrida,
  corregirCajasCorrida,
  filasOficiales,
  mensajeResumenDia,
  nombrePresentacion,
  porSaborYPresentacion,
  totalPorLinea,
  type CorridaResumen,
} from "@/lib/resumenDia"

/*
 * Resumen del Día + Validar (permiso VALIDAR, Super Administrador o dueño):
 * la producción de la jornada de Aséptico (7:00 a 7:00: T1 + T2 + el T3 de
 * la madrugada siguiente, por turnos.fecha) — cajas por sabor +
 * presentación, total por línea y el mensaje para copiar y pegar (futuro
 * bot de Telegram). Debajo, Validar: cada corrida de un turno cerrado se
 * confirma o se corrigen sus cajas; el resumen usa las cajas oficiales
 * (la corrección si hay, si no lo del supervisor). Ver src/lib/resumenDia.ts.
 */
const AREA = "ASEPTICO"

export default function ResumenDia() {
  const { session } = useAuth()
  const { lineas } = useCatalogosLive()
  // Jornada operativa en curso (7:00 a 7:00): de madrugada, todavía es la del día anterior.
  const hoy = franjaDeHora().fecha
  const [fecha, setFecha] = useState(hoy)
  /** Resultado de la última consulta, con la fecha que se pidió: si no coincide con la elegida, está cargando. */
  const [resultado, setResultado] = useState<{ fecha: string; corridas: CorridaResumen[] | null; error: string | null } | null>(null)
  /** Sube con cada validación: vuelve a pedir el resumen sin cambiar la fecha. */
  const [version, setVersion] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!session || !fecha) return
    let vivo = true
    cargarResumenDia(session.username, AREA, fecha).then((r) => {
      if (!vivo) return
      setResultado("error" in r ? { fecha, corridas: null, error: r.error } : { fecha, corridas: r, error: null })
    })
    return () => {
      vivo = false
    }
  }, [session, fecha, version])
  const vigente = resultado?.fecha === fecha ? resultado : null
  const corridas = vigente?.corridas ?? null
  const filas = corridas ? filasOficiales(corridas) : null
  const validables = corridas?.filter((c) => c.turnoCerrado) ?? []
  const validadas = validables.filter((c) => c.estado !== "PENDIENTE").length
  const error = vigente?.error ?? null

  // Solo las líneas físicas (LINEA_1, LINEA_2...), sin las de Pruebas.
  const lineasPlanta = useMemo(() => lineas.filter((l) => /^LINEA_\d+$/.test(l.codigo)), [lineas])
  const items = filas ? porSaborYPresentacion(filas) : []
  const porLinea = filas ? totalPorLinea(filas, lineasPlanta) : []
  const total = items.reduce((a, i) => a + i.cajas, 0)
  const mensaje = filas ? mensajeResumenDia(fecha, filas) : ""

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
    } catch {
      // Sin permiso de portapapeles: se selecciona el texto para copiarlo a mano.
      textoRef.current?.select()
      document.execCommand("copy")
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <AppShell title="Resumen del Día" description="Producción de la jornada en Aséptico">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Fecha</span>
            <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="w-[170px]" />
          </label>
          <Button size="sm" variant={fecha === hoy ? "default" : "outline"} onClick={() => setFecha(hoy)}>
            Hoy
          </Button>
          <Button size="sm" variant={fecha === restarDias(hoy, 1) ? "default" : "outline"} onClick={() => setFecha(restarDias(hoy, 1))}>
            Ayer
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : filas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Cajas producidas</CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin producción registrada en esta jornada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-1.5 pr-3 font-medium">Sabor</th>
                          <th className="py-1.5 pr-3 font-medium">Presentación</th>
                          <th className="py-1.5 text-right font-medium">Cajas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={`${i.saborNombre}|${i.volumenMl}`} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 pr-3 text-foreground">{i.saborNombre}</td>
                            <td className="py-1.5 pr-3 text-muted-foreground">{nombrePresentacion(i.volumenMl)}</td>
                            <td className="num py-1.5 text-right font-semibold text-foreground">{i.cajas.toLocaleString("es-CO")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total por línea</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {porLinea.map((l) => (
                  <div key={l.codigo} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{l.nombre}</span>
                    <span className="num font-semibold text-foreground">{l.cajas.toLocaleString("es-CO")} cajas</span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="num font-bold text-foreground">{total.toLocaleString("es-CO")} cajas</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Mensaje</CardTitle>
                <Button size="sm" onClick={copiar}>
                  {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </CardHeader>
              <CardContent>
                <Textarea ref={textoRef} readOnly value={mensaje} rows={Math.min(16, mensaje.split("\n").length + 1)} className="font-mono text-sm" />
              </CardContent>
            </Card>

            {corridas && corridas.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle>Validar</CardTitle>
                  <Badge variant={validables.length > 0 && validadas === validables.length ? "default" : "outline"}>
                    {validadas} de {validables.length} validadas
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    Confirma las cajas de cada corrida o corrígelas. El resumen y el mensaje usan la corrección.
                  </p>
                  {corridas.map((c) => (
                    <CorridaValidar key={c.turnoLineaId} corrida={c} usuario={session?.username ?? ""} onCambio={() => setVersion((v) => v + 1)} />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

/** Una corrida en Validar: sus cajas, el estado y Confirmar / Corregir (paletas + cajas sueltas). */
function CorridaValidar({ corrida: c, usuario, onCambio }: { corrida: CorridaResumen; usuario: string; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [paletas, setPaletas] = useState(String(c.paletasValidadas ?? c.paletas))
  const [sueltas, setSueltas] = useState(String(c.cajasSueltasValidadas ?? c.cajasSueltas))
  const [nota, setNota] = useState(c.nota ?? "")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supervisor = cajasSupervisor(c)
  const oficial = cajasOficiales(c)
  const nPaletas = Number(paletas)
  const nSueltas = Number(sueltas)
  const valido = paletas !== "" && sueltas !== "" && Number.isInteger(nPaletas) && Number.isInteger(nSueltas) && nPaletas >= 0 && nSueltas >= 0
  const totalEditado = valido ? nPaletas * c.cajasXPaleta + nSueltas : null

  async function ejecutar(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setEnviando(true)
    setError(null)
    const r = await fn()
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEditando(false)
    onCambio()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {c.saborNombre} · {nombrePresentacion(c.volumenMl)}
          </p>
          <p className="text-xs text-muted-foreground">
            {nombrePorCodigo(TURNO_TIPOS, c.turnoTipo)} · {c.lineaNombre}
            {c.lote ? ` · Lote ${c.lote}` : ""}
          </p>
        </div>
        {!c.turnoCerrado ? (
          <Badge variant="outline">Turno en curso</Badge>
        ) : c.estado === "CONFIRMADO" ? (
          <Badge>Confirmada</Badge>
        ) : c.estado === "EDITADO" ? (
          <Badge variant="secondary">Corregida</Badge>
        ) : (
          <Badge variant="outline">Pendiente</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Supervisor: <span className="num font-semibold text-foreground">{supervisor.toLocaleString("es-CO")}</span> cajas ({c.paletas} paletas +{" "}
          {c.cajasSueltas} sueltas)
        </span>
        {c.estado === "EDITADO" && (
          <span className="text-muted-foreground">
            Oficial: <span className="num font-bold text-foreground">{oficial.toLocaleString("es-CO")}</span> cajas
          </span>
        )}
      </div>
      {c.estado !== "PENDIENTE" && c.validadoPorNombre && (
        <p className="text-xs text-muted-foreground">
          {c.estado === "EDITADO" ? "Corrigió" : "Confirmó"} {c.validadoPorNombre}
          {c.nota ? ` — ${c.nota}` : ""}
        </p>
      )}

      {c.turnoCerrado &&
        (editando ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Paletas</span>
                <Input type="number" inputMode="numeric" min={0} value={paletas} onChange={(e) => setPaletas(e.target.value)} className="h-8 w-24" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Cajas sueltas</span>
                <Input type="number" inputMode="numeric" min={0} value={sueltas} onChange={(e) => setSueltas(e.target.value)} className="h-8 w-24" />
              </label>
              <span className="pb-1.5 text-sm text-muted-foreground">
                = <span className="num font-semibold text-foreground">{totalEditado !== null ? totalEditado.toLocaleString("es-CO") : "—"}</span> cajas
              </span>
            </div>
            <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!valido || enviando} onClick={() => ejecutar(() => corregirCajasCorrida(usuario, c.turnoLineaId, nPaletas, nSueltas, nota))}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Guardar corrección
              </Button>
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {c.estado !== "CONFIRMADO" && (
              <Button size="sm" variant="outline" disabled={enviando} onClick={() => ejecutar(() => confirmarCorrida(usuario, c.turnoLineaId))}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                {c.estado === "EDITADO" ? "Volver a lo del supervisor" : "Confirmar"}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setEditando(true)}>
              <PenLine className="size-3.5" />
              Corregir cajas
            </Button>
          </div>
        ))}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
