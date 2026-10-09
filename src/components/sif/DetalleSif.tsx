import { useEffect, useState } from "react"
import { Eye, FileText, Loader2 } from "lucide-react"
import { VisorActa } from "@/components/acta/VisorActa"
import { Button } from "@/components/ui/button"
import { codigoParadaSif, fechaHoraSif, listarFallasSif, minutosEntre, textoDuracion, type FallaSif, type Sif } from "@/lib/sif"
import { cn } from "@/lib/utils"
import { AsignarResponsable, CerrarSif } from "./AccionesSif"
import { EstadoSifBadge } from "./ListaSif"

/** Una SIF: datos, pasos con sus horas, historial de fallas y lo que toca hacer según el estado. Montar con key={sif.id}. */
export function DetalleSif({ sif, usuario, puedeGestionar, onCambio }: { sif: Sif; usuario: string; puedeGestionar: boolean; onCambio: () => void }) {
  const [fallas, setFallas] = useState<FallaSif[] | null>(null)
  const [acta, setActa] = useState<Blob | null>(null)
  const [armandoActa, setArmandoActa] = useState(false)

  useEffect(() => {
    let vivo = true
    listarFallasSif(usuario, sif.id).then((f) => vivo && setFallas(f))
    return () => {
      vivo = false
    }
  }, [usuario, sif.id, sif.fallas, sif.estado])

  async function verActa() {
    if (!fallas) return
    setArmandoActa(true)
    const { generarSifPdf } = await import("@/lib/sifPdf")
    setActa(generarSifPdf(sif, codigoParadaSif(sif), fallas))
    setArmandoActa(false)
  }

  const pasos = [
    { titulo: "Generada", valor: fechaHoraSif(sif.generadaEn), hecho: true, actual: false },
    { titulo: "Inicio de reparación", valor: sif.inicioReparacion ? fechaHoraSif(sif.inicioReparacion) : "Al guardar el responsable", hecho: !!sif.inicioReparacion, actual: sif.estado === "PENDIENTE" },
    { titulo: "Cerrada", valor: sif.cierre ? fechaHoraSif(sif.cierre) : "Al cerrar la solicitud", hecho: !!sif.cierre, actual: sif.estado === "EN_REPARACION" },
  ]

  return (
    <article className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="num text-xs text-muted-foreground">{sif.codigo}</p>
          <h2 className="text-lg font-semibold text-balance">
            {sif.lineaNombre} · {sif.tipoNombre}
          </h2>
        </div>
        <EstadoSifBadge estado={sif.estado} />
      </div>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-3 text-sm">
        <Dato etiqueta="Área solicitante" valor={sif.areaNombre} />
        <Dato etiqueta="Código de parada" valor={codigoParadaSif(sif)} num />
        <Dato etiqueta="Equipo" valor={sif.equipoNombre ?? "—"} />
        <Dato etiqueta="Responsable" valor={sif.responsable ?? "Sin asignar"} />
        {sif.entregadaA && <Dato etiqueta="Entregada a" valor={sif.entregadaA} />}
        {sif.cierre && <Dato etiqueta="Tiempo de reparación" valor={textoDuracion(minutosEntre(sif.inicioReparacion, sif.cierre))} num />}
      </dl>

      <ol className="grid gap-0 sm:grid-cols-3">
        {pasos.map((p) => (
          <li
            key={p.titulo}
            className={cn(
              "flex flex-col gap-0.5 border-l-[3px] px-3 py-2 sm:border-l-0 sm:border-t-[3px]",
              p.hecho ? "border-success" : p.actual ? "border-info" : "border-border",
            )}
          >
            <span className="text-xs font-semibold">{p.titulo}</span>
            <span className="num text-xs text-muted-foreground">{p.valor}</span>
          </li>
        ))}
      </ol>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historial de fallas</h3>
        {fallas === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Fecha y hora</th>
                  <th className="py-1.5 pr-3 font-medium">Duración</th>
                  <th className="py-1.5 pr-3 font-medium">Cargada por</th>
                  <th className="py-1.5 pr-3 font-medium">Sistema · subsistema</th>
                  <th className="py-1.5 font-medium">Registró</th>
                </tr>
              </thead>
              <tbody>
                {fallas.map((f) => (
                  <tr key={f.id} className="border-b border-border/50 last:border-0">
                    <td className="num whitespace-nowrap py-2 pr-3">{fechaHoraSif(f.inicio)}</td>
                    <td className="num whitespace-nowrap py-2 pr-3">{textoDuracion(minutosEntre(f.inicio, f.fin))}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{f.origen}</span>
                    </td>
                    <td className="py-2 pr-3">{[f.equipo, f.subsistema].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2">{f.registro ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sif.estado === "CERRADA" && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trabajo realizado</h3>
          <p className="whitespace-pre-wrap text-sm">{sif.trabajoRealizado}</p>
        </section>
      )}

      {sif.estado !== "CERRADA" && !puedeGestionar && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="size-4" />
          Solo lectura: Mantenimiento asigna el responsable y cierra la solicitud.
        </p>
      )}
      {puedeGestionar && sif.estado === "PENDIENTE" && <AsignarResponsable sif={sif} usuario={usuario} onHecho={onCambio} />}
      {puedeGestionar && sif.estado === "EN_REPARACION" && <CerrarSif sif={sif} usuario={usuario} onHecho={onCambio} />}

      {sif.estado === "CERRADA" &&
        (acta ? (
          <VisorActa fuente={acta} codigoTurno={sif.codigo} />
        ) : (
          <Button className="self-start" onClick={verActa} disabled={!fallas || armandoActa}>
            {armandoActa ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Ver acta para imprimir
          </Button>
        ))}
    </article>
  )
}

function Dato({ etiqueta, valor, num }: { etiqueta: string; valor: string; num?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("mt-0.5", num && "num")}>{valor}</dd>
    </div>
  )
}
