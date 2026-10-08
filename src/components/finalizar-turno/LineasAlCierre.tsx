import { useState } from "react"
import { Link } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"

type Resultado = { ok: true } | { ok: false; error: string }
const miles = (n: number) => n.toLocaleString("es-CO")

/** Corrida que todavía no deja cerrar: sigue activa sin entregar, o terminó y espera su PT. */
export function corridaSinResolver(c: Corrida): boolean {
  return (c.activa && c.entregadaEn === null) || c.esperandoCierre
}

/*
 * Cada línea al cierre. Una corrida activa con su PT del tramo ya cargado se
 * entrega aquí mismo al turno siguiente (sigue corriendo en la planta); para
 * terminarla, o si falta el PT, se va a Producto Terminado.
 */
export function LineasAlCierre({
  lineas,
  corridas,
  productoTerminado,
  presentaciones,
  entregar,
}: {
  lineas: LineaLive[]
  corridas: Corrida[]
  productoTerminado: ProductoTerminadoRegistro[]
  presentaciones: PresentacionLive[]
  entregar: (corridaId: string) => Promise<Resultado>
}) {
  const [entregando, setEntregando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cajasDe = (corridaId: string) =>
    productoTerminado
      .filter((p) => p.corridaId === corridaId)
      .reduce((a, p) => a + p.paletas * (presentaciones.find((pr) => pr.codigo === p.presentacion)?.cajasXPaleta ?? 0) + p.cajasSueltas, 0)
  const tienePt = (corridaId: string) => productoTerminado.some((p) => p.corridaId === corridaId)

  async function entregarCorrida(id: string) {
    setEntregando(id)
    setError(null)
    const r = await entregar(id)
    setEntregando(null)
    if (!r.ok) setError(r.error)
  }

  return (
    <Card id="seccion-lineas" className="scroll-mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Líneas</CardTitle>
        <p className="text-sm text-muted-foreground">Cada línea que sigue corriendo se termina o se entrega al turno siguiente.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {lineas.map((l) => {
            const pendientes = corridas.filter((c) => c.linea === l.codigo && corridaSinResolver(c))
            const entregada = corridas.find((c) => c.linea === l.codigo && c.activa && c.entregadaEn !== null)
            const descripcion = (c: Corrida) => `${c.saborNombre ?? "Sin sabor"}${c.lote ? ` · Lote ${c.lote}` : ""} · ${c.presentacion} ml`
            return (
              <div key={l.codigo} className={`flex flex-col gap-2 rounded-lg border p-3 ${pendientes.length > 0 ? "border-destructive/60" : "border-border"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{l.nombre}</span>
                  {pendientes.length > 0 ? (
                    <Badge variant="danger">{pendientes.some((c) => c.esperandoCierre) ? "Esperando PT" : "Corriendo"}</Badge>
                  ) : entregada ? (
                    <Badge variant="success">Entregada</Badge>
                  ) : (
                    <Badge variant="muted">Sin corrida</Badge>
                  )}
                </div>
                {pendientes.map((c) => (
                  <div key={c.id} className="flex flex-col gap-2">
                    <span className="text-sm text-foreground">{descripcion(c)}</span>
                    {c.activa && tienePt(c.id) ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          PT del tramo: <span className="num">{miles(cajasDe(c.id))}</span> cajas cargadas
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => entregarCorrida(c.id)} disabled={entregando !== null}>
                            {entregando === c.id && <Loader2 className="size-3.5 animate-spin" />}
                            Entregar al siguiente turno
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link to="/producto-terminado">Terminar</Link>
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-danger-foreground">
                          {c.esperandoCierre ? "Terminó: falta cargar su PT." : "Falta cargar el PT del tramo (0 si no produjo)."}
                        </span>
                        <Button size="sm" variant="outline" className="self-start" asChild>
                          <Link to="/producto-terminado">Ir a Producto Terminado</Link>
                        </Button>
                      </>
                    )}
                  </div>
                ))}
                {pendientes.length === 0 && entregada && (
                  <span className="text-sm text-muted-foreground">{descripcion(entregada)} · sigue en el turno siguiente.</span>
                )}
              </div>
            )
          })}
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
