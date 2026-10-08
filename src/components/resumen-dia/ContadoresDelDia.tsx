import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LIMITE_MERMA } from "@/lib/turno"
import type { ContadorDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/*
 * Solo la analista: por turno, cada lote con su Contador 1 (llenadora), su
 * Contador 2 (envases buenos), sus cajas y su merma. Lo justo para leerlo de un vistazo; la justificación de
 * una merma alta se abre con "Ver por qué".
 */
export function ContadoresDelDia({
  filas,
  nombreLinea,
  supervisorDe,
}: {
  filas: ContadorDelDia[]
  nombreLinea: (codigo: string) => string
  /** "Javier Bello" para la etiqueta del turno ("T1"). */
  supervisorDe: (turno: string) => string | null
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  if (filas.length === 0) return null
  const turnos = [...new Set(filas.map((f) => f.turno))]

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Contadores y merma</CardTitle>
        <span className="text-xs text-muted-foreground">Límite de merma {LIMITE_PCT} %</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {turnos.map((turno) => (
          <section key={turno} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">
              {turno}
              {supervisorDe(turno) && <span className="font-normal text-muted-foreground"> · {supervisorDe(turno)}</span>}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Línea · lote</TableHead>
                  <TableHead className="text-right">Contador 1</TableHead>
                  <TableHead className="text-right">Contador 2</TableHead>
                  <TableHead className="text-right">Cajas</TableHead>
                  <TableHead className="text-right">Merma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas
                  .filter((f) => f.turno === turno)
                  .map((f) => {
                    const alta = f.mermaPct !== null && f.mermaPct > LIMITE_PCT
                    return [
                      <TableRow key={f.corridaId} className={abierta === f.corridaId ? "border-b-0" : ""}>
                        <TableCell className="whitespace-normal">
                          <span className="font-medium">{nombreLinea(f.lineaCodigo)}</span>
                          <span className="text-muted-foreground">
                            {" · "}
                            {f.sabor}
                            {f.lote ? ` ${f.lote}` : ""} · {f.volumenMl} ml
                          </span>
                        </TableCell>
                        <TableCell className="num text-right">{f.llenadora > 0 ? miles(f.llenadora) : "--"}</TableCell>
                        <TableCell className="num text-right">{f.buenos != null ? miles(f.buenos) : "--"}</TableCell>
                        <TableCell className="num text-right">{miles(f.cajas)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`num ${alta ? "font-semibold text-destructive" : ""}`}>
                            {f.mermaPct !== null ? `${String(f.mermaPct).replace(".", ",")} %` : "--"}
                          </span>
                          {alta && f.justificacion && (
                            <button
                              type="button"
                              className="block w-full text-right text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
                              onClick={() => setAbierta((a) => (a === f.corridaId ? null : f.corridaId))}
                              aria-expanded={abierta === f.corridaId}
                            >
                              {abierta === f.corridaId ? "Ocultar" : "Ver por qué"}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>,
                      abierta === f.corridaId && f.justificacion ? (
                        <TableRow key={`${f.corridaId}-j`}>
                          <TableCell colSpan={5} className="whitespace-normal pt-0 text-sm text-muted-foreground">
                            {f.justificacion}
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ]
                  })}
              </TableBody>
            </Table>
          </section>
        ))}
      </CardContent>
    </Card>
  )
}
