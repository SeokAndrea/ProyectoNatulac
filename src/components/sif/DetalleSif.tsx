import { useCallback, useEffect, useState } from "react"
import { CircleCheck, Eye, FileText, Loader2 } from "lucide-react"
import { VisorActa } from "@/components/acta/VisorActa"
import { Button } from "@/components/ui/button"
import {
  codigoParadaSif,
  esInspeccion,
  fechaHoraSif,
  listarFallasSif,
  minutosEntre,
  pasosSif,
  textoDuracion,
  type EstadoSif,
  type FallaSif,
  type Sif,
} from "@/lib/sif"
import { cn } from "@/lib/utils"
import { AsignarResponsable, CerrarSif, CLASE_BOTON_ACCION, MarcarRevisada } from "./AccionesSif"
import { ErrorSif } from "./ErrorSif"
import { EstadoSifBadge } from "./ListaSif"

/** Lo que se confirma al ver que la solicitud cambió de estado (por una acción de esta pantalla o al actualizar). */
const MENSAJE_HECHO: Partial<Record<EstadoSif, string>> = {
  REVISADA: "Inspección marcada como revisada.",
  EN_REPARACION: "Reparación iniciada: quedó la hora de inicio.",
  CERRADA: "Solicitud cerrada. Imprime el acta y fírmala para entregar la línea.",
}

/** Columnas de los pasos en pantalla ancha (son de 2 a 5). */
const COLUMNAS_PASOS = ["", "", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-5"]

/**
 * Una SIF. Orden pensado para quien la gestiona desde el teléfono: qué es y en qué
 * estado está, dónde va (pasos), lo que toca hacer ahora, lo que ya se hizo y, al
 * final, el historial de fallas. Montar con key={sif.id}.
 */
export function DetalleSif({ sif, usuario, puedeGestionar, onCambio }: { sif: Sif; usuario: string; puedeGestionar: boolean; onCambio: () => void }) {
  const [fallas, setFallas] = useState<FallaSif[] | null>(null)
  const [errorFallas, setErrorFallas] = useState<string | null>(null)
  const [acta, setActa] = useState<Blob | null>(null)
  const [armandoActa, setArmandoActa] = useState(false)
  const [estadoVisto, setEstadoVisto] = useState(sif.estado)
  const [hecho, setHecho] = useState<string | null>(null)
  if (estadoVisto !== sif.estado) {
    setEstadoVisto(sif.estado)
    setHecho(MENSAJE_HECHO[sif.estado] ?? null)
  }

  const cargarFallas = useCallback(() => {
    let vivo = true
    setErrorFallas(null)
    listarFallasSif(usuario, sif.id).then((r) => {
      if (!vivo) return
      if (r.ok) setFallas(r.data)
      else setErrorFallas(r.error)
    })
    return () => {
      vivo = false
    }
  }, [usuario, sif.id])

  // sif.fallas y sif.estado: al sumarse una falla o cambiar de estado se vuelve a pedir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(cargarFallas, [cargarFallas, sif.fallas, sif.estado])

  async function verActa() {
    if (!fallas) return
    setArmandoActa(true)
    const { generarSifPdf } = await import("@/lib/sifPdf")
    setActa(generarSifPdf(sif, codigoParadaSif(sif), fallas))
    setArmandoActa(false)
  }

  const pasos = pasosSif(sif)
  // "Sistema · subsistema" repite el título en las fallas cargadas en la app (el tipo es la falla del equipo):
  // la columna solo aparece si alguna dice otra cosa (las del Sheet de Mantenimiento).
  const sistemaDelTipo = [sif.equipoNombre, sif.tipoNombre].filter(Boolean).join(" · ")
  const sistemaDe = (f: FallaSif) => [f.equipo, f.subsistema].filter(Boolean).join(" · ")
  const conSistema = fallas?.some((f) => sistemaDe(f) !== sistemaDelTipo) ?? false
  const conRegistro = fallas?.some((f) => f.registro) ?? false

  return (
    <article className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-1.5">
          <h2 className="text-lg font-semibold text-balance">
            {sif.lineaNombre} · {sif.tipoNombre}
          </h2>
          <EstadoSifBadge estado={sif.estado} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] sm:gap-x-5">
          <Dato etiqueta="Solicitud" valor={sif.codigo} num />
          <Dato etiqueta="Código de parada" valor={codigoParadaSif(sif)} num />
          <Dato etiqueta="Equipo" valor={sif.equipoNombre ?? "—"} />
          <Dato etiqueta="Área solicitante" valor={sif.areaNombre} />
          {!esInspeccion(sif.estado) && <Dato etiqueta="Responsable" valor={sif.responsable ?? "Sin asignar"} />}
          {sif.entregadaA && <Dato etiqueta="Entregada a" valor={sif.entregadaA} />}
          {sif.cierre && <Dato etiqueta="Tiempo de reparación" valor={textoDuracion(minutosEntre(sif.inicioReparacion, sif.cierre))} num />}
        </dl>
      </header>

      <ol className={cn("grid gap-1", COLUMNAS_PASOS[pasos.length])}>
        {pasos.map((p) => (
          <li
            key={p.titulo}
            aria-current={p.actual ? "step" : undefined}
            className={cn(
              "flex flex-col gap-0.5 border-l-[3px] px-3 py-2 sm:border-l-0 sm:border-t-[3px]",
              p.hecho ? "border-success" : p.actual ? "border-info" : "border-border",
            )}
          >
            <span className="text-xs font-semibold">
              {p.titulo}
              <span className="sr-only">{p.hecho ? " (hecho)" : p.actual ? " (paso actual)" : " (pendiente)"}</span>
            </span>
            <span className={cn("text-xs text-muted-foreground", p.hecho && "num")}>{p.valor}</span>
          </li>
        ))}
      </ol>

      {hecho && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2.5 text-sm text-success-foreground">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {hecho}
        </p>
      )}
      {sif.estado === "INSPECCION" && !puedeGestionar && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="size-4" />
          Solo lectura: Mantenimiento marca revisada la inspección.
        </p>
      )}
      {(sif.estado === "PENDIENTE" || sif.estado === "EN_REPARACION") && !puedeGestionar && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="size-4" />
          Solo lectura: Mantenimiento asigna el responsable y cierra la solicitud.
        </p>
      )}
      {puedeGestionar && sif.estado === "INSPECCION" && <MarcarRevisada sif={sif} usuario={usuario} onHecho={onCambio} />}
      {puedeGestionar && sif.estado === "PENDIENTE" && <AsignarResponsable sif={sif} usuario={usuario} onHecho={onCambio} />}
      {puedeGestionar && sif.estado === "EN_REPARACION" && <CerrarSif sif={sif} usuario={usuario} onHecho={onCambio} />}

      {sif.revisadaEn && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspección</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            Revisada{sif.revisadaPor ? ` por ${sif.revisadaPor}` : ""}
            {sif.revision ? `: ${sif.revision}` : "."}
          </p>
        </section>
      )}

      {sif.estado === "CERRADA" && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trabajo realizado</h3>
          <p className="whitespace-pre-wrap break-words text-sm">{sif.trabajoRealizado}</p>
        </section>
      )}

      {sif.estado === "CERRADA" &&
        (acta ? (
          <VisorActa fuente={acta} codigoTurno={sif.codigo} />
        ) : (
          <Button className={CLASE_BOTON_ACCION} onClick={verActa} disabled={!fallas || armandoActa}>
            {armandoActa ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Ver acta para imprimir
          </Button>
        ))}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Historial de fallas{fallas ? ` (${fallas.length})` : ""}
        </h3>
        {errorFallas && !fallas ? (
          <ErrorSif mensaje={`No se pudo cargar el historial. ${errorFallas}`} accion="Reintentar" onAccion={cargarFallas} />
        ) : fallas === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            {/* Teléfono: una línea por falla, sin tabla que se corte hacia el costado. */}
            <ul className="divide-y divide-border/60 sm:hidden">
              {fallas.map((f) => (
                <li key={f.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span>
                    <span className="num">{fechaHoraSif(f.inicio)}</span> · <span className="num">{textoDuracion(minutosEntre(f.inicio, f.fin))}</span> ·{" "}
                    <span className="text-muted-foreground">{f.origen}</span>
                  </span>
                  {(conSistema || conRegistro) && (
                    <span className="text-xs text-muted-foreground">
                      {[conSistema ? sistemaDe(f) : null, conRegistro ? f.registro : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Fecha y hora</th>
                    <th className="py-1.5 pr-3 font-medium">Duración</th>
                    <th className="py-1.5 pr-3 font-medium">Cargada por</th>
                    {conSistema && <th className="py-1.5 pr-3 font-medium">Sistema · subsistema</th>}
                    {conRegistro && <th className="py-1.5 font-medium">Registró</th>}
                  </tr>
                </thead>
                <tbody>
                  {fallas.map((f) => (
                    <tr key={f.id} className="border-b border-border/50 last:border-0">
                      <td className="num whitespace-nowrap py-2 pr-3">{fechaHoraSif(f.inicio)}</td>
                      <td className="num whitespace-nowrap py-2 pr-3">{textoDuracion(minutosEntre(f.inicio, f.fin))}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{f.origen}</span>
                      </td>
                      {conSistema && <td className="py-2 pr-3">{sistemaDe(f) || "—"}</td>}
                      {conRegistro && <td className="py-2">{f.registro ?? "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </article>
  )
}

function Dato({ etiqueta, valor, num }: { etiqueta: string; valor: string; num?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("mt-0.5", num && "num")}>{valor}</dd>
    </div>
  )
}
