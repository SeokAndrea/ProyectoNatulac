import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GrupoDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")

/** Solo la analista: cajas de cada grupo (el grupo es el del turno). */
export function CajasPorGrupo({ grupos }: { grupos: GrupoDelDia[] }) {
  if (grupos.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cajas por grupo</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Supervisor</TableHead>
              <TableHead className="text-right">Cajas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.map((g) => (
              <TableRow key={g.grupo}>
                <TableCell className="font-semibold">{g.nombre}</TableCell>
                <TableCell>{g.turnos.join(", ")}</TableCell>
                <TableCell className="whitespace-normal">{g.supervisores.join(", ")}</TableCell>
                <TableCell className="num text-right">{miles(g.cajas)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="num text-right">{miles(grupos.reduce((a, g) => a + g.cajas, 0))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
