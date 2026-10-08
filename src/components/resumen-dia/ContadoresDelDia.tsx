import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LIMITE_MERMA } from "@/lib/turno"
import type { ContadorDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/** Solo la analista: contadores y merma de envase de cada corrida del día, con la justificación de las mermas altas. */
export function ContadoresDelDia({ filas, nombreLinea }: { filas: ContadorDelDia[]; nombreLinea: (codigo: string) => string }) {
  if (filas.length === 0) return null
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Contadores y merma</CardTitle>
        <span className="text-xs text-muted-foreground">Merma = 1 − envases de las cajas ÷ contador de llenadora · límite {LIMITE_PCT} %</span>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turno</TableHead>
              <TableHead>Línea</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Llenadora</TableHead>
              <TableHead className="text-right">Buenos</TableHead>
              <TableHead className="text-right">Cajas</TableHead>
              <TableHead className="text-right">Envases cajas</TableHead>
              <TableHead className="text-right">Merma</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.flatMap((f) => [
              <TableRow key={f.corridaId} className={f.justificacion ? "border-b-0" : ""}>
                <TableCell>{f.turno}</TableCell>
                <TableCell>{nombreLinea(f.lineaCodigo)}</TableCell>
                <TableCell className="whitespace-normal">
                  {f.sabor}
                  {f.lote ? ` ${f.lote}` : ""} · {f.volumenMl} ml
                </TableCell>
                <TableCell className="num text-right">{f.llenadora > 0 ? miles(f.llenadora) : "--"}</TableCell>
                <TableCell className="num text-right">{f.buenos != null ? miles(f.buenos) : "--"}</TableCell>
                <TableCell className="num text-right">{miles(f.cajas)}</TableCell>
                <TableCell className="num text-right">{f.empacados > 0 ? miles(f.empacados) : "--"}</TableCell>
                <TableCell className={`num text-right ${f.mermaPct !== null && f.mermaPct > LIMITE_PCT ? "font-semibold text-destructive" : ""}`}>
                  {f.mermaPct !== null ? `${String(f.mermaPct).replace(".", ",")} %` : "--"}
                </TableCell>
              </TableRow>,
              f.justificacion ? (
                <TableRow key={`${f.corridaId}-j`}>
                  <TableCell colSpan={8} className="whitespace-normal pt-0 text-xs text-muted-foreground">
                    Justificación: {f.justificacion}
                  </TableCell>
                </TableRow>
              ) : null,
            ])}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
