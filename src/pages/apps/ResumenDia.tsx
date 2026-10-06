import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ItemValidar } from "@/components/resumen-dia/ItemValidar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { franjaDeHora, restarDias } from "@/lib/tiempoPlanta"
import {
  cargarResumenDia,
  itemsDelDia,
  mensajeResumenDia,
  pasosCambioPresentacion,
  totalPorLinea,
  validarDia,
  type FilaResumenDia,
  type ValidacionDia,
} from "@/lib/resumenDia"

/*
 * Resumen del Día + Validar (permiso VALIDAR, Super Administrador o dueño):
 * la producción de la jornada de Aséptico (7:00 a 7:00: T1 + T2 + el T3 de
 * la madrugada siguiente, por turnos.fecha). Lo primero son las cajas por
 * sabor + presentación con lo que cargaron los supervisores; cada fila se
 * confirma o se corrige su total — ese es el número oficial del día, el que
 * va al mensaje para copiar y pegar (futuro bot de Telegram). El total por
 * línea es lo de los supervisores. Ver src/lib/resumenDia.ts.
 */
const AREA = "ASEPTICO"
const miles = (n: number) => n.toLocaleString("es-CO")

export default function ResumenDia() {
  const { session } = useAuth()
  const { lineas, presentaciones } = useCatalogosLive()
  // Jornada operativa en curso (7:00 a 7:00): de madrugada, todavía es la del día anterior.
  const hoy = franjaDeHora().fecha
  const [fecha, setFecha] = useState(() => restarDias(hoy, 1))
  /** Resultado de la última consulta, con la fecha que se pidió: si no coincide con la elegida, está cargando. */
  const [resultado, setResultado] = useState<{
    fecha: string
    datos: { filas: FilaResumenDia[]; validaciones: ValidacionDia[] } | null
    error: string | null
  } | null>(null)
  /** Sube con cada validación: vuelve a pedir el resumen sin cambiar la fecha. */
  const [version, setVersion] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!session || !fecha) return
    let vivo = true
    cargarResumenDia(session.username, AREA, fecha).then((r) => {
      if (!vivo) return
      setResultado("error" in r ? { fecha, datos: null, error: r.error } : { fecha, datos: r, error: null })
    })
    return () => {
      vivo = false
    }
  }, [session, fecha, version])
  const vigente = resultado?.fecha === fecha ? resultado : null
  const datos = vigente?.datos ?? null
  const error = vigente?.error ?? null

  // Solo las líneas físicas (LINEA_1, LINEA_2...), sin las de Pruebas.
  const lineasPlanta = useMemo(() => lineas.filter((l) => /^LINEA_\d+$/.test(l.codigo)), [lineas])
  const items = datos ? itemsDelDia(datos.filas, datos.validaciones) : []
  const porLinea = datos ? totalPorLinea(datos.filas, lineasPlanta) : []
  const totalOficial = items.reduce((a, i) => a + i.cajasOficiales, 0)
  const validadas = items.filter((i) => i.estado !== "PENDIENTE").length
  const mensaje = datos ? mensajeResumenDia(fecha, items) : ""
  const volumenes = presentaciones.filter((p) => p.activo).map((p) => p.volumenMl)
  const validar = (saborNombre: string, volumenMl: number, cajas: number | null, nota: string) =>
    validarDia(session?.username ?? "", AREA, fecha, saborNombre, volumenMl, cajas, nota)

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
    <AppShell title="Resumen del Día" description="Producción de la jornada en Aséptico (7:00 a 7:00)">
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
        ) : datos === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Cajas producidas</CardTitle>
                {items.length > 0 && (
                  <Badge variant={validadas === items.length ? "default" : "outline"}>
                    {validadas} de {items.length} validadas
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin producción registrada en esta jornada.</p>
                ) : (
                  <>
                    {items.map((i) => (
                      <ItemValidar
                        key={`${i.saborNombre}|${i.volumenMl}`}
                        item={i}
                        volumenes={volumenes}
                        guardar={(cajas, nota) => validar(i.saborNombre, i.volumenMl, cajas, nota)}
                        moverA={async (volumenMl, cajas, nota) => {
                          // Se cargó en una presentación y era otra: esta fila queda en 0 y el destino suma las cajas.
                          for (const paso of pasosCambioPresentacion(items, i, volumenMl, cajas, nota)) {
                            const r = await validar(i.saborNombre, paso.volumenMl, paso.cajas, paso.nota)
                            if (!r.ok) return r
                          }
                          return { ok: true }
                        }}
                        onCambio={() => setVersion((v) => v + 1)}
                      />
                    ))}
                    <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm">
                      <span className="font-semibold text-foreground">Total del día</span>
                      <span className="num font-bold text-foreground">{miles(totalOficial)} cajas</span>
                    </div>
                  </>
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
                    <span className="num font-semibold text-foreground">{miles(l.cajas)} cajas</span>
                  </div>
                ))}
                <p className="mt-1 text-xs text-muted-foreground">Según lo que cargaron los supervisores (sin las correcciones).</p>
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
