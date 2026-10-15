import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MensajeError } from "@/components/MensajeError"
import { capital, conGeneralesDeLinea, generalesDeLinea, nombreMes, type PresentacionDeLinea } from "@/lib/indicadores/calculos"
import type { DatosMes, ModoMes } from "@/lib/indicadores/tipos"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { SECCIONES, SIEMPRE_A_MANO, type Seccion } from "@/components/indicadores/secciones"
import { EditorAusentismo } from "@/components/indicadores/editor/EditorAusentismo"
import { EditorIncidencias } from "@/components/indicadores/editor/EditorIncidencias"
import { EditorTotal } from "@/components/indicadores/editor/EditorTotal"
import { EditorLinea } from "@/components/indicadores/editor/EditorLinea"
import { EditorParadas, LISTA_CAUSAS } from "@/components/indicadores/editor/EditorParadas"
import { EditorSemielaborado } from "@/components/indicadores/editor/EditorSemielaborado"

type Resultado = { ok: true } | { ok: false; error: string }
type Auto = DatosMes | { error: string }

const pildora = "rounded-full border px-3 py-1 text-[12.5px] font-semibold"
const pildoraActiva = "border-primary bg-primary text-primary-foreground"

/*
 * Cargar a mano los datos de un mes (modo MANUAL): las 3 líneas y el
 * semielaborado, con las mismas pestañas que la pantalla. También los 2
 * meses anteriores de la ventana (dueña, 2026-10-14). Nada se guarda hasta
 * "Guardar", que guarda solo los meses tocados; "Traer lo automático" llena
 * con lo que calculó la app, para corregir encima.
 */
export function EditorManual({
  meses,
  seccionInicial,
  secciones,
  presentacionesDe,
  familias,
  inicialDe,
  obtenerAuto,
  onGuardar,
  onCerrar,
}: {
  /** Meses que se pueden cargar, el elegido primero, con su modo actual. */
  meses: { mes: string; modo: ModoMes }[]
  seccionInicial: Seccion
  /** Pestañas que se pueden cargar (en un mes automático, solo ausentismo e incidencias). */
  secciones: Seccion[]
  presentacionesDe: (linea: string) => PresentacionDeLinea[]
  familias: string[]
  /** Con qué arranca el borrador de cada mes. */
  inicialDe: (mes: string) => Promise<Auto>
  obtenerAuto: (mes: string) => Promise<Auto>
  onGuardar: (mes: string, d: DatosMes) => Promise<Resultado>
  onCerrar: () => void
}) {
  const [mes, setMes] = useState(meses[0].mes)
  const [borradores, setBorradores] = useState<Record<string, DatosMes>>({})
  const [tocados, setTocados] = useState<string[]>([])
  const [tab, setTab] = useState<Seccion>(seccionInicial)
  // Sube al traer lo automático: los campos se vuelven a montar con los valores nuevos.
  const [version, setVersion] = useState(0)
  const { enviando, error, setError, ejecutar } = useAccion()
  const causas = useTiposActivos().filter((t) => t.clase === "NO_PROGRAMADA")
  const borrador = borradores[mes]
  const modoDelMes = meses.find((m) => m.mes === mes)?.modo

  useEffect(() => {
    if (borradores[mes]) return
    let vivo = true
    inicialDe(mes).then((r) => {
      if (!vivo) return
      if ("error" in r) setError(r.error)
      else setBorradores((b) => (b[mes] ? b : { ...b, [mes]: structuredClone(r) }))
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  function cambiar(d: DatosMes) {
    setBorradores((b) => ({ ...b, [mes]: d }))
    setTocados((t) => (t.includes(mes) ? t : [...t, mes]))
  }

  async function traerAutomatico() {
    const r = await obtenerAuto(mes)
    if ("error" in r) return setError(r.error)
    // Ausentismo, incidencias, las paradas generales y el % total sin cajas no vienen de la app: se conservan.
    const b = borrador
    cambiar({
      ...structuredClone(r),
      ausentismo: b.ausentismo,
      incidencias: b.incidencias,
      tituloIncidencias: b.tituloIncidencias,
      diasSinIncidentes: b.diasSinIncidentes,
      totalAseptico: b.totalAseptico,
      paradasGenerales: b.paradasGenerales,
    })
    setVersion((v) => v + 1)
  }

  async function guardar() {
    const ok = await ejecutar(async (): Promise<Resultado> => {
      for (const m of tocados) {
        const r = await onGuardar(m, borradores[m])
        if (!r.ok) return { ok: false, error: `${capital(nombreMes(m))}: ${r.error}` }
      }
      return { ok: true }
    })
    if (ok) onCerrar()
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="flex h-[min(720px,100%)] max-w-[min(1180px,calc(100%-2rem))] flex-col gap-3 sm:max-w-[min(1180px,calc(100%-2rem))]">
        <DialogHeader className="flex-row flex-wrap items-center gap-3">
          <DialogTitle className="text-lg">Datos manuales</DialogTitle>
          {meses.length > 1 ? (
            <div role="group" aria-label="Mes" className="flex flex-wrap gap-1.5">
              {meses.map((m) => (
                <button key={m.mes} type="button" aria-pressed={mes === m.mes} onClick={() => setMes(m.mes)} className={cn(pildora, mes === m.mes && pildoraActiva)}>
                  {capital(nombreMes(m.mes))} {m.mes.slice(0, 4)}
                  {tocados.includes(m.mes) && " •"}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-lg font-semibold">
              · {capital(nombreMes(mes))} {mes.slice(0, 4)}
            </span>
          )}
          <div role="group" aria-label="Qué cargar" className="flex flex-wrap gap-1.5">
            {SECCIONES.filter((s) => secciones.includes(s.valor)).map((s) => (
              <button key={s.valor} type="button" aria-pressed={tab === s.valor} onClick={() => setTab(s.valor)} className={cn(pildora, "border-dashed", tab === s.valor && pildoraActiva)}>
                {s.texto}
              </button>
            ))}
          </div>
        </DialogHeader>

        <datalist id={LISTA_CAUSAS}>
          {causas.map((t) => (
            <option key={t.codigo} value={t.nombre} />
          ))}
        </datalist>

        {modoDelMes === "AUTO" && secciones.some((s) => !SIEMPRE_A_MANO.includes(s)) && (
          <p className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
            {capital(nombreMes(mes))} está en AUTOMÁTICO: arranca con lo que calculó la app y, si se guarda, pasa a MANUAL.
          </p>
        )}

        <div key={`${mes}-${tab}-${version}`} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!borrador ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando {nombreMes(mes)}…
            </p>
          ) : tab === "semi" ? (
            <EditorSemielaborado familias={familias} datos={borrador} onCambio={cambiar} />
          ) : tab === "aus" ? (
            <EditorAusentismo datos={borrador} onCambio={cambiar} />
          ) : tab === "inc" ? (
            <EditorIncidencias datos={borrador} onCambio={cambiar} />
          ) : (
            <div className="flex flex-col gap-3">
              <EditorTotal datos={borrador} onCambio={cambiar} />
              {/* Generales de esta línea: arriba de sus presentaciones (dueña, 2026-10-14). */}
              <div className="rounded-xl border border-dashed p-3">
                <EditorParadas
                  titulo={`Paradas generales de la Línea ${tab} · arriba de sus presentaciones`}
                  paradas={generalesDeLinea(borrador, tab)}
                  onCambio={(lista) => cambiar(conGeneralesDeLinea(borrador, tab, lista))}
                />
              </div>
              <EditorLinea linea={tab} presentaciones={presentacionesDe(tab)} datos={borrador} nombreMes={nombreMes(mes)} onCambio={cambiar} />
            </div>
          )}
        </div>

        <MensajeError error={error} />
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">Vacío = sin dato (se muestra "—"). Se guardan juntos los meses tocados (•).</span>
          {secciones.some((s) => !SIEMPRE_A_MANO.includes(s)) && (
            <Button variant="outline" size="sm" onClick={traerAutomatico} disabled={enviando || !borrador} title="Reemplaza lo escrito en este mes con lo que calculó la app">
              Traer lo automático
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={enviando || tocados.length === 0}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
