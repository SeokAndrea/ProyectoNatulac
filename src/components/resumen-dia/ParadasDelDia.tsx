import { Desplegable } from "@/components/Desplegable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ParadaDelDia } from "@/lib/resumenDiario"

/**
 * Las paradas que más minutos quitaron en el día. El detalle de cada línea
 * se ve en "Contadores y merma", junto a la merma de cada lote (dueña,
 * 2026-10-20: ver todas juntas no ayudaba).
 */
export function ParadasDelDia({ paradas, nombreLinea }: { paradas: ParadaDelDia[]; nombreLinea: (codigo: string) => string }) {
  const minutos = paradas.reduce((a, p) => a + p.minutos, 0)
  return (
    <Desplegable titulo="Paradas que más tiempo quitaron" resumen={minutos > 0 ? <span className="num">{minutos} min</span> : undefined}>
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
    </Desplegable>
  )
}
