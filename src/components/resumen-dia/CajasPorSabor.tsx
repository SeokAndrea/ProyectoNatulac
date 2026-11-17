import { Desplegable } from "@/components/Desplegable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { FilaCajasDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const celda = (n: number) => (n > 0 ? miles(n) : "--")

/**
 * Cajas por sabor y presentación: una columna por turno y el número oficial del día (con las correcciones de la analista).
 * En la vista Semana, una columna por día y el total de la semana.
 */
export function CajasPorSabor({ filas, etiquetas, semana = false }: { filas: FilaCajasDia[]; etiquetas: string[]; semana?: boolean }) {
  const total_ = semana ? "Semana" : "Día"
  const corregidas = filas.filter((f) => f.corregida).length
  const total = filas.reduce((a, f) => a + f.oficial, 0)
  return (
    <Desplegable titulo="Cajas por sabor y presentación" resumen={total > 0 ? <span className="num">{miles(total)} cajas</span> : undefined}>
      {corregidas > 0 && (
        <span className="text-xs text-muted-foreground">
          {total_} = número oficial ({corregidas} {corregidas === 1 ? "corrección" : "correcciones"} de la analista)
        </span>
      )}
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin producción registrada en {semana ? "esta semana" : "esta jornada"}.</p>
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
              <TableHead className="text-right">{total_}</TableHead>
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
              <TableCell className="num text-right">{miles(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </Desplegable>
  )
}
