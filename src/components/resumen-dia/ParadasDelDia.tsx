import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ParadaDelDia } from "@/lib/resumenDiario"

/** Las paradas que más minutos quitaron en el día. */
export function ParadasDelDia({ paradas, nombreLinea }: { paradas: ParadaDelDia[]; nombreLinea: (codigo: string) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paradas que más tiempo quitaron</CardTitle>
      </CardHeader>
      <CardContent>
        {paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin paradas registradas en esta jornada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parada</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Veces</TableHead>
                <TableHead className="text-right">Min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paradas.map((p) => (
                <TableRow key={`${p.codigo ?? p.nombre}|${p.lineaCodigo}`}>
                  <TableCell className="whitespace-normal">
                    {p.nombre}
                    {p.codigo && <span className="text-muted-foreground"> ({p.codigo})</span>}
                  </TableCell>
                  <TableCell>{nombreLinea(p.lineaCodigo)}</TableCell>
                  <TableCell className="num text-right">{p.veces}</TableCell>
                  <TableCell className="num text-right">{p.minutos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
