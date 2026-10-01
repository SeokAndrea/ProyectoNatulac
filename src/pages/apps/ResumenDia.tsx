import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"
import {
  cargarResumenDia,
  mensajeResumenDia,
  nombrePresentacion,
  porSaborYPresentacion,
  totalPorLinea,
  type FilaResumenDia,
} from "@/lib/resumenDia"

/*
 * Resumen del Día (Super Administrador): la producción de la jornada de
 * Aséptico — cajas por sabor + presentación, total por línea y el mensaje
 * listo para copiar y pegar (futuro bot de Telegram). Ver src/lib/resumenDia.ts.
 */
const AREA = "ASEPTICO"

export default function ResumenDia() {
  const { session } = useAuth()
  const { lineas } = useCatalogosLive()
  const hoy = fechaPlanta()
  const [fecha, setFecha] = useState(hoy)
  /** Resultado de la última consulta, con la fecha que se pidió: si no coincide con la elegida, está cargando. */
  const [resultado, setResultado] = useState<{ fecha: string; filas: FilaResumenDia[] | null; error: string | null } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!session || !fecha) return
    let vivo = true
    cargarResumenDia(session.username, AREA, fecha).then((r) => {
      if (!vivo) return
      setResultado("error" in r ? { fecha, filas: null, error: r.error } : { fecha, filas: r, error: null })
    })
    return () => {
      vivo = false
    }
  }, [session, fecha])
  const vigente = resultado?.fecha === fecha ? resultado : null
  const filas = vigente?.filas ?? null
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
          </>
        )}
      </div>
    </AppShell>
  )
}
