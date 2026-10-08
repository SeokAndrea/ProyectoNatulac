import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { mermaPromedioLinea } from "@/lib/actaPdf"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { EficienciaTurno } from "@/lib/eficiencia"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { LIMITE_MERMA } from "@/lib/turno"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/** Lo que sale en el acta (1.9 y 2.1): por línea eficiencia, merma y cajas contra la meta; cajas por presentación; litros. */
export function ProduccionDelTurno({
  lineas,
  eficiencia,
  corridas,
  contadores,
  productoTerminado,
  presentaciones,
}: {
  lineas: LineaLive[]
  eficiencia: EficienciaTurno
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  presentaciones: PresentacionLive[]
}) {
  const cajasPorPresentacion = lineas.flatMap((l) =>
    presentaciones
      .map((pres) => ({
        presentacion: pres.nombre,
        linea: l.nombre,
        cajas: productoTerminado
          .filter((p) => p.linea === l.codigo && p.presentacion === pres.codigo)
          .reduce((a, p) => a + p.paletas * pres.cajasXPaleta + p.cajasSueltas, 0),
        hay: productoTerminado.some((p) => p.linea === l.codigo && p.presentacion === pres.codigo),
      }))
      .filter((f) => f.hay),
  )
  const litros = productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0)

  return (
    <Card id="seccion-produccion" className="scroll-mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Producción del turno</CardTitle>
        <p className="text-sm text-muted-foreground">Lo que sale en el acta.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Línea</TableHead>
              <TableHead className="text-right">Eficiencia</TableHead>
              <TableHead className="text-right">Merma envase</TableHead>
              <TableHead className="text-right">Cajas / meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((l) => {
              const e = eficiencia.porLinea.get(l.codigo)
              const merma = mermaPromedioLinea(corridas, contadores, productoTerminado, presentaciones, l.codigo)
              return (
                <TableRow key={l.codigo}>
                  <TableCell>{l.nombre}</TableCell>
                  <TableCell className="num text-right">{e?.eficienciaPct != null ? `${e.eficienciaPct} %` : "--"}</TableCell>
                  <TableCell className={`num text-right ${merma !== null && merma > LIMITE_PCT ? "font-semibold text-destructive" : ""}`}>
                    {merma !== null ? `${String(merma).replace(".", ",")} %` : "--"}
                  </TableCell>
                  <TableCell className="num text-right">
                    {e?.realCajas != null || e?.metaCajas != null
                      ? `${e?.realCajas != null ? miles(e.realCajas) : "--"} / ${e?.metaCajas != null ? miles(e.metaCajas) : "--"}`
                      : "--"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {cajasPorPresentacion.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se cargó Producto Terminado en este turno.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Presentación</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Cajas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cajasPorPresentacion.map((f) => (
                <TableRow key={`${f.presentacion}|${f.linea}`}>
                  <TableCell>{f.presentacion}</TableCell>
                  <TableCell>{f.linea}</TableCell>
                  <TableCell className="num text-right">{miles(f.cajas)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="num text-right">{miles(cajasPorPresentacion.reduce((a, f) => a + f.cajas, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Litros envasados</span>
          <span className="num text-lg font-bold text-foreground">{miles(litros)} L</span>
        </div>
      </CardContent>
    </Card>
  )
}
