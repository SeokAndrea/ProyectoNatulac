import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LIMITE_MERMA } from "@/lib/turno"
import type { LineaDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/** Por línea: cajas del día, merma de envase del día (todos los lotes juntos) y minutos de parada. */
export function LineasDelDia({ lineas }: { lineas: LineaDelDia[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Por línea</CardTitle>
        <span className="text-xs text-muted-foreground">Merma de envase del día · límite {LIMITE_PCT} %</span>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Línea</TableHead>
              <TableHead className="text-right">Cajas</TableHead>
              <TableHead className="text-right">Merma</TableHead>
              <TableHead className="text-right">Paradas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((l) => (
              <TableRow key={l.codigo}>
                <TableCell>{l.nombre}</TableCell>
                <TableCell className="num text-right">{l.cajas > 0 ? miles(l.cajas) : "--"}</TableCell>
                <TableCell className={`num text-right ${l.mermaPct !== null && l.mermaPct > LIMITE_PCT ? "font-semibold text-destructive" : ""}`}>
                  {l.mermaPct !== null ? `${String(l.mermaPct).replace(".", ",")} %` : "--"}
                </TableCell>
                <TableCell className="num text-right">{l.paradasMin > 0 ? `${l.paradasMin} min` : "--"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
