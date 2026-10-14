import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MensajeError } from "@/components/MensajeError"
import { capital, nombreMes, type PresentacionDeLinea } from "@/lib/indicadores/calculos"
import type { DatosMes } from "@/lib/indicadores/tipos"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { SECCIONES, SIEMPRE_A_MANO, type Seccion } from "@/components/indicadores/secciones"
import { EditorAusentismo } from "@/components/indicadores/editor/EditorAusentismo"
import { EditorIncidencias } from "@/components/indicadores/editor/EditorIncidencias"
import { EditorLinea } from "@/components/indicadores/editor/EditorLinea"
import { LISTA_CAUSAS } from "@/components/indicadores/editor/EditorParadas"
import { EditorSemielaborado } from "@/components/indicadores/editor/EditorSemielaborado"

type Resultado = { ok: true } | { ok: false; error: string }

/*
 * Cargar a mano los datos de un mes (modo MANUAL): las 3 líneas y el
 * semielaborado, con las mismas pestañas que la pantalla. Nada se guarda
 * hasta "Guardar"; "Traer lo automático" llena con lo que calculó la app,
 * para corregir encima.
 */
export function EditorManual({
  mes,
  inicial,
  seccionInicial,
  secciones,
  presentacionesDe,
  familias,
  obtenerAuto,
  onGuardar,
  onCerrar,
}: {
  mes: string
  inicial: DatosMes
  seccionInicial: Seccion
  /** Pestañas que se pueden cargar (en un mes automático, solo ausentismo e incidencias). */
  secciones: Seccion[]
  presentacionesDe: (linea: string) => PresentacionDeLinea[]
  familias: string[]
  obtenerAuto: () => Promise<DatosMes | { error: string }>
  onGuardar: (d: DatosMes) => Promise<Resultado>
  onCerrar: () => void
}) {
  const [borrador, setBorrador] = useState<DatosMes>(() => structuredClone(inicial))
  const [tab, setTab] = useState<Seccion>(seccionInicial)
  // Sube al traer lo automático: los campos se vuelven a montar con los valores nuevos.
  const [version, setVersion] = useState(0)
  const { enviando, error, setError, ejecutar } = useAccion()
  const causas = useTiposActivos().filter((t) => t.clase === "NO_PROGRAMADA")

  async function traerAutomatico() {
    const r = await obtenerAuto()
    if ("error" in r) return setError(r.error)
    // Ausentismo e incidencias no vienen de la app: se conservan.
    setBorrador((b) => ({ ...structuredClone(r), ausentismo: b.ausentismo, incidencias: b.incidencias }))
    setVersion((v) => v + 1)
  }

  async function guardar() {
    if (await ejecutar(() => onGuardar(borrador))) onCerrar()
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="flex h-[min(720px,100%)] max-w-[min(1180px,calc(100%-2rem))] flex-col gap-3 sm:max-w-[min(1180px,calc(100%-2rem))]">
        <DialogHeader className="flex-row flex-wrap items-center gap-3">
          <DialogTitle className="text-lg">Datos manuales · {capital(nombreMes(mes))} {mes.slice(0, 4)}</DialogTitle>
          <div role="group" aria-label="Qué cargar" className="flex flex-wrap gap-1.5">
            {SECCIONES.filter((s) => secciones.includes(s.valor)).map((s) => (
              <button
                key={s.valor}
                type="button"
                aria-pressed={tab === s.valor}
                onClick={() => setTab(s.valor)}
                className={cn("rounded-full border px-3 py-1 text-[12.5px] font-semibold", tab === s.valor && "border-primary bg-primary text-primary-foreground")}
              >
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

        <div key={`${tab}-${version}`} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === "semi" ? (
            <EditorSemielaborado familias={familias} datos={borrador} onCambio={setBorrador} />
          ) : tab === "aus" ? (
            <EditorAusentismo datos={borrador} onCambio={setBorrador} />
          ) : tab === "inc" ? (
            <EditorIncidencias datos={borrador} onCambio={setBorrador} />
          ) : (
            <EditorLinea linea={tab} presentaciones={presentacionesDe(tab)} datos={borrador} nombreMes={nombreMes(mes)} onCambio={setBorrador} />
          )}
        </div>

        <MensajeError error={error} />
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">Vacío = sin dato (se muestra "—"). Se guarda todo el mes junto.</span>
          {secciones.some((s) => !SIEMPRE_A_MANO.includes(s)) && (
            <Button variant="outline" size="sm" onClick={traerAutomatico} disabled={enviando} title="Reemplaza lo escrito con lo que calculó la app">
              Traer lo automático
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={enviando}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
