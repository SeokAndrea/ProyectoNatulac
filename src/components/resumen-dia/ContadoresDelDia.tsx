import { useEffect, useState } from "react"
import { Desplegable } from "@/components/Desplegable"
import { FilaParada } from "@/components/paradas/ParadasPorTurno"
import { ObservacionCorrida } from "@/components/resumen-dia/ObservacionCorrida"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { guardarObservacionCorrida, listarObservacionesCorrida } from "@/lib/observacionesCorrida"
import type { Parada } from "@/lib/paradas"
import { LIMITE_MERMA } from "@/lib/turno"
import type { ContadorDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/*
 * Solo la analista: por turno, cada lote con su Contador 1 (llenadora), su
 * Contador 2 (envases buenos), sus cajas y su merma. Cada lote abre las
 * paradas de su línea en ese turno (con cualquier merma, dueña 2026-10-20),
 * la justificación del supervisor si la merma pasó el límite, y una
 * observación que después se ve en Indicadores.
 */
export function ContadoresDelDia({
  filas,
  nombreLinea,
  supervisorDe,
  paradasDe,
  usuario,
  area,
  fecha,
}: {
  filas: ContadorDelDia[]
  nombreLinea: (codigo: string) => string
  /** "Javier Bello" para la etiqueta del turno ("T1"). */
  supervisorDe: (turno: string) => string | null
  paradasDe: (turnoId: string, lineaCodigo: string) => Parada[]
  usuario: string
  area: string
  fecha: string
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [observaciones, setObservaciones] = useState<Record<string, string>>({})
  useEffect(() => {
    let vivo = true
    listarObservacionesCorrida(usuario, area, fecha, fecha).then((r) => {
      if (vivo && !("error" in r)) setObservaciones(Object.fromEntries(r.map((o) => [o.corridaId, o.texto])))
    })
    return () => {
      vivo = false
    }
  }, [usuario, area, fecha])
  if (filas.length === 0) return null
  const turnos = [...new Set(filas.map((f) => f.turno))]
  const altas = filas.filter((f) => f.mermaPct !== null && f.mermaPct > LIMITE_PCT).length

  async function guardar(corridaId: string, texto: string) {
    const r = await guardarObservacionCorrida(usuario, corridaId, texto)
    if (r.ok)
      setObservaciones((o) => {
        const nuevas = { ...o }
        if (texto.trim()) nuevas[corridaId] = texto.trim()
        else delete nuevas[corridaId]
        return nuevas
      })
    return r
  }

  return (
    <Desplegable
      titulo="Contadores y merma"
      resumen={altas > 0 ? <span className="font-semibold text-destructive">{altas} sobre el límite</span> : `Límite ${LIMITE_PCT} %`}
    >
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
                  const abiertaEsta = abierta === f.corridaId
                  const paradas = paradasDe(f.turnoId, f.lineaCodigo)
                  return [
                    <TableRow key={f.corridaId} className={abiertaEsta ? "border-b-0" : ""}>
                      <TableCell className="whitespace-normal">
                        <span className="font-medium">{nombreLinea(f.lineaCodigo)}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {f.sabor}
                          {f.lote ? ` ${f.lote}` : ""} · {f.volumenMl} ml
                        </span>
                        {observaciones[f.corridaId] && <span className="ml-1.5 text-xs text-primary">· con observación</span>}
                      </TableCell>
                      <TableCell className="num text-right">{f.llenadora > 0 ? miles(f.llenadora) : "--"}</TableCell>
                      <TableCell className="num text-right">{f.buenos != null ? miles(f.buenos) : "--"}</TableCell>
                      <TableCell className="num text-right">{miles(f.cajas)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`num ${alta ? "font-semibold text-destructive" : ""}`}>
                          {f.mermaPct !== null ? `${String(f.mermaPct).replace(".", ",")} %` : "--"}
                        </span>
                        <button
                          type="button"
                          className="block w-full text-right text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
                          onClick={() => setAbierta((a) => (a === f.corridaId ? null : f.corridaId))}
                          aria-expanded={abiertaEsta}
                        >
                          {abiertaEsta ? "Ocultar" : alta && f.justificacion ? "Ver por qué y paradas" : `Ver paradas (${paradas.length})`}
                        </button>
                      </TableCell>
                    </TableRow>,
                    abiertaEsta ? (
                      <TableRow key={`${f.corridaId}-detalle`}>
                        <TableCell colSpan={5} className="whitespace-normal pt-0">
                          <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2.5">
                            {f.justificacion && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Justificación del supervisor:</span> {f.justificacion}
                              </p>
                            )}
                            <p className="text-xs font-semibold text-muted-foreground uppercase">
                              Paradas de {nombreLinea(f.lineaCodigo)} en {turno}
                            </p>
                            {paradas.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Sin paradas registradas en esta línea en el turno.</p>
                            ) : (
                              paradas.map((p) => <FilaParada key={p.id} parada={p} />)
                            )}
                            <ObservacionCorrida key={f.corridaId} guardada={observaciones[f.corridaId]} onGuardar={(texto) => guardar(f.corridaId, texto)} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null,
                  ]
                })}
            </TableBody>
          </Table>
        </section>
      ))}
    </Desplegable>
  )
}
