import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { mermaCorrida } from "@/lib/reportes"
import { LIMITE_MERMA } from "@/lib/turno"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/** Contadores y merma de cada lote por línea (2.2 del acta), con la justificación de las mermas altas. */
export function MermasPorLote({
  lineas,
  corridas,
  contadores,
  productoTerminado,
  presentaciones,
}: {
  lineas: LineaLive[]
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  presentaciones: PresentacionLive[]
}) {
  const filas = corridas
    .map((c) => {
      const propios = contadores.filter((x) => x.corridaId === c.id)
      const pts = productoTerminado.filter((p) => p.corridaId === c.id)
      if (propios.length === 0 && pts.length === 0) return null
      const pres = presentaciones.find((p) => p.codigo === c.presentacion)
      return {
        id: c.id,
        lote: `${c.saborNombre ?? "Sin sabor"}${c.lote ? ` ${c.lote}` : ""}`,
        linea: lineas.find((l) => l.codigo === c.linea)?.nombre ?? c.linea,
        llenadora: propios.reduce((a, x) => a + x.envasesLlenadora, 0),
        buenos: propios.some((x) => x.envasesBuenos != null) ? propios.reduce((a, x) => a + (x.envasesBuenos ?? 0), 0) : null,
        merma: mermaCorrida(c.id, contadores, productoTerminado, presentaciones)?.pct ?? null,
        cajas: pts.reduce((a, p) => a + p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas, 0),
        justificacion: propios.map((x) => x.justificacion?.trim()).filter(Boolean).join(" · ") || null,
      }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  return (
    <Card id="seccion-mermas" className="scroll-mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Contadores y mermas por lote</CardTitle>
        <p className="text-sm text-muted-foreground">Límite {LIMITE_PCT} %. Las mermas altas llevan justificación.</p>
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay contadores cargados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Llenadora</TableHead>
                <TableHead className="text-right">Buenos</TableHead>
                <TableHead className="text-right">Merma</TableHead>
                <TableHead className="text-right">Cajas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.flatMap((f) => [
                <TableRow key={f.id} className={f.justificacion ? "border-b-0" : ""}>
                  <TableCell>{f.lote}</TableCell>
                  <TableCell>{f.linea}</TableCell>
                  <TableCell className="num text-right">{f.llenadora > 0 ? miles(f.llenadora) : "--"}</TableCell>
                  <TableCell className="num text-right">{f.buenos != null ? miles(f.buenos) : "--"}</TableCell>
                  <TableCell className={`num text-right ${f.merma !== null && f.merma > LIMITE_PCT ? "font-semibold text-destructive" : ""}`}>
                    {f.merma !== null ? `${String(f.merma).replace(".", ",")} %` : "--"}
                  </TableCell>
                  <TableCell className="num text-right">{miles(f.cajas)}</TableCell>
                </TableRow>,
                f.justificacion ? (
                  <TableRow key={`${f.id}-j`}>
                    <TableCell colSpan={6} className="whitespace-normal pt-0 text-xs text-muted-foreground">
                      Justificación: {f.justificacion}
                    </TableCell>
                  </TableRow>
                ) : null,
              ])}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
