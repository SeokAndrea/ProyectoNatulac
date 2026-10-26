import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { MensajeError } from "@/components/MensajeError"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VistaDiaria } from "@/components/programacion/VistaDiaria"
import { VistaSemanal } from "@/components/programacion/VistaSemanal"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { AREA_QUE_MIRA_EL_APOYO, AREAS, esAreaDeApoyo, nombrePorCodigo, type AreaCodigo } from "@/lib/catalogos"
import { eliminarItemSemana, fechaJornada, guardarItemSemana, leerSemana, programarItemDia } from "@/lib/programacion"
import { diasDeSemana, lunesDe, semanaCerrada, type ItemSemana, type Semana } from "@/lib/programacionSemanal"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { restarDias } from "@/lib/tiempoPlanta"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"

type Vista = "SEMANAL" | "DIARIO"

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
/** "Semana del 12 al 16 de octubre". */
function nombreSemana(lunes: string) {
  const viernes = restarDias(lunes, -4)
  const d = (f: string) => Number(f.slice(8, 10))
  const m = (f: string) => MESES[Number(f.slice(5, 7)) - 1]
  return m(lunes) === m(viernes) ? `Semana del ${d(lunes)} al ${d(viernes)} de ${m(viernes)}` : `Semana del ${d(lunes)} de ${m(lunes)} al ${d(viernes)} de ${m(viernes)}`
}

/*
 * Programación SEMANAL + DIARIA (prototipo aprobado, dueña 2026-10-14):
 * el plan de la semana por sabor + presentación y, cada día, qué entra y en
 * qué línea; lo pendiente pasa solo al día siguiente y el viernes cierra.
 * Cuentas en src/lib/programacionSemanal.ts; piezas en
 * src/components/programacion/. Edita quien tenga PROGRAMACION_EDITAR.
 */
export default function Programacion() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  const { presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const puedeEditar = puede(session ?? null, "PROGRAMACION_EDITAR")
  const hoy = fechaJornada()

  // Las áreas de apoyo (Calidad, Servicios Industriales, Mantenimiento) no tienen plan propio: ven el de Aséptico.
  const [area, setArea] = useState<AreaCodigo>(!session?.area || esAreaDeApoyo(session.area) ? AREA_QUE_MIRA_EL_APOYO : session.area)
  const [vista, setVista] = useState<Vista>("DIARIO")
  const [lunes, setLunes] = useState(() => lunesDe(hoy))
  const [dia, setDia] = useState(() => (diasDeSemana(lunesDe(hoy)).includes(hoy) ? hoy : lunesDe(hoy)))
  const [semana, setSemana] = useState<Semana | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [sabores, setSabores] = useState<Sabor[]>([])
  const accion = useAccion()

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  const cargar = useCallback(async () => {
    const r = await leerSemana(area, lunes)
    setErrorCarga("error" in r ? r.error : null)
    setSemana("error" in r ? null : r)
  }, [area, lunes])

  useEffect(() => {
    setSemana(null)
    void cargar()
  }, [cargar])

  function irASemana(n: number) {
    const nuevo = restarDias(lunes, -7 * n)
    setLunes(nuevo)
    const dias = diasDeSemana(nuevo)
    setDia(dias.includes(hoy) ? hoy : dias[0])
  }

  async function hacer(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    const ok = await accion.ejecutar(fn)
    if (ok) await cargar()
    return ok
  }

  const editable = puedeEditar && !semanaCerrada(lunes, hoy)
  // Solo las líneas del área elegida: Pruebas usa LINEA_T1…, Aséptico LINEA_1… (el catálogo puede traer las dos).
  const velocidadesDelArea = velocidades.filter((v) => (area === "PRUEBAS" ? /^LINEA_T/.test(v.linea) : /^LINEA_\d/.test(v.linea)))

  return (
    <AppShell title="Programación" description="Plan de la semana y de cada día, por línea" fullWidth>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <div role="group" aria-label="Vista" className="inline-flex rounded-full border bg-card p-0.5">
            {(["SEMANAL", "DIARIO"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={vista === v}
                onClick={() => setVista(v)}
                className={cn("rounded-sm px-3.5 py-1 text-xs font-semibold tracking-wide text-muted-foreground", vista === v && "bg-primary text-primary-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Semana" className="inline-flex items-center gap-1 rounded-sm border bg-card px-1 py-0.5">
            <button type="button" aria-label="Semana anterior" onClick={() => irASemana(-1)} className="grid size-7 place-items-center rounded-full hover:bg-muted">
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-1.5 text-sm font-semibold">{nombreSemana(lunes)}</span>
            <button type="button" aria-label="Semana siguiente" onClick={() => irASemana(1)} className="grid size-7 place-items-center rounded-full hover:bg-muted">
              <ChevronRight className="size-4" />
            </button>
          </div>
          {lunes !== lunesDe(hoy) && (
            <button type="button" onClick={() => irASemana((Date.parse(lunesDe(hoy)) - Date.parse(lunes)) / (7 * 86_400_000))} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
              Volver a esta semana
            </button>
          )}
          <div className="ml-auto">
            {puedeEditar ? (
              <Select value={area} onValueChange={(v) => setArea(v as AreaCodigo)}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => (
                    <SelectItem key={a.codigo} value={a.codigo}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">{nombrePorCodigo(AREAS, area)}</span>
            )}
          </div>
        </div>

        <MensajeError error={errorCarga ?? accion.error} />

        {!semana || cargandoCatalogos ? (
          !errorCarga && <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
        ) : vista === "SEMANAL" ? (
          <VistaSemanal
            key={`${area}-${lunes}`}
            semana={semana}
            hoy={hoy}
            editable={editable}
            sabores={sabores}
            presentaciones={presentaciones}
            onGuardarCajas={(it: ItemSemana, n) => void hacer(() => guardarItemSemana(usuario, area, lunes, it.saborId, it.presentacionId, n))}
            onEliminar={(it) => void hacer(() => eliminarItemSemana(usuario, it.id))}
            onAgregar={(saborId, presentacionId, cajas) => hacer(() => guardarItemSemana(usuario, area, lunes, saborId, presentacionId, cajas))}
          />
        ) : (
          <VistaDiaria
            semana={semana}
            hoy={hoy}
            dia={dia}
            onDia={setDia}
            puedeEditar={puedeEditar}
            velocidades={velocidadesDelArea}
            onProgramar={(it, linea) => void hacer(() => programarItemDia(usuario, it.id, dia, linea))}
          />
        )}
      </div>
    </AppShell>
  )
}
