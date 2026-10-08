import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { FilaCajasDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const celda = (n: number) => (n > 0 ? miles(n) : "--")

/** Cajas por sabor y presentación: una columna por turno (lo de los supervisores) y el número oficial del día. */
export function CajasPorSabor({ filas, etiquetas }: { filas: FilaCajasDia[]; etiquetas: string[] }) {
  const corregidas = filas.filter((f) => f.corregida).length
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Cajas por sabor y presentación</CardTitle>
        {corregidas > 0 && (
          <span className="text-xs text-muted-foreground">
            Día = número oficial ({corregidas} {corregidas === 1 ? "corrección" : "correcciones"} de la analista)
          </span>
        )}
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin producción registrada en esta jornada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sabor</TableHead>
                <TableHead>Presentación</TableHead>
                {etiquetas.map((e) => (
                  <TableHead key={e} className="text-right">
                    {e}
                  </TableHead>
                ))}
                <TableHead className="text-right">Día</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={`${f.saborNombre}|${f.volumenMl}`}>
                  <TableCell>{f.saborNombre}</TableCell>
                  <TableCell>{f.volumenMl} ml</TableCell>
                  {f.porTurno.map((c, i) => (
                    <TableCell key={etiquetas[i]} className="num text-right">
                      {celda(c)}
                    </TableCell>
                  ))}
                  <TableCell className="num text-right font-semibold">
                    {miles(f.oficial)}
                    {f.corregida && <div className="text-xs font-normal text-muted-foreground">corregido · supervisores {miles(f.supervisores)}</div>}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                {etiquetas.map((e, i) => (
                  <TableCell key={e} className="num text-right">
                    {celda(filas.reduce((a, f) => a + f.porTurno[i], 0))}
                  </TableCell>
                ))}
                <TableCell className="num text-right">{miles(filas.reduce((a, f) => a + f.oficial, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
