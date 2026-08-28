import { useEffect, useMemo, useState } from "react"
import { CalendarRange, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { AREAS, nombrePorCodigo, type AreaCodigo } from "@/lib/catalogos"
import {
  fechaJornada,
  guardarProgramacionDia,
  obtenerProgramacionDia,
  type ProgramacionItem,
} from "@/lib/programacion"
import { listarSabores, nombreSaborConFamilia, type Sabor } from "@/lib/sabores"
import { cn } from "@/lib/utils"

/*
 * Programación (versión mínima): sabor + presentación + cajas para la
 * jornada de hoy. El sabor se escribe con autocompletado (datalist). La
 * edita solo el SUPERADMINISTRADOR; el resto la ve de solo lectura.
 * Ver src/lib/programacion.ts y las migraciones 20260970..20260973.
 */
type Fila = { key: string; saborTexto: string; presentacionId: string; cajas: string }

const SABORES_LIST_ID = "programacion-sabores"

export default function Programacion() {
  const { session } = useAuth()
  const { presentaciones, cargando: cargandoCatalogos } = useCatalogosLive()
  const editable = session?.rol === "SUPERADMINISTRADOR"
  const fecha = fechaJornada()

  const [area, setArea] = useState<AreaCodigo>(session?.area ?? "ASEPTICO")
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [plan, setPlan] = useState<ProgramacionItem[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState(false)

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  /** Nombre para mostrar (con familia si corresponde) ↔ sabor. Para resolver lo que se escribe en el autocompletado. */
  const saborPorNombre = useMemo(() => {
    const m = new Map<string, Sabor>()
    for (const s of sabores) m.set(nombreSaborConFamilia(s.nombre, s.familiaNombre), s)
    return m
  }, [sabores])
  const nombrePorSaborId = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sabores) m.set(s.id, nombreSaborConFamilia(s.nombre, s.familiaNombre))
    return m
  }, [sabores])

  const saborIdDe = (texto: string) => saborPorNombre.get(texto.trim())?.id ?? ""
  const filaDesdeItem = (i: ProgramacionItem, idx: number): Fila => ({
    key: `${i.saborId}-${i.presentacionId}-${idx}`,
    saborTexto: nombrePorSaborId.get(i.saborId) ?? i.saborNombre,
    presentacionId: i.presentacionId,
    cajas: String(i.cajasPlan),
  })

  useEffect(() => {
    let vivo = true
    setCargando(true)
    obtenerProgramacionDia(area, fecha).then((items) => {
      if (!vivo) return
      setPlan(items)
      setFilas(items.map(filaDesdeItem))
      setCargando(false)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, fecha, nombrePorSaborId])

  const claves = filas.map((f) => (saborIdDe(f.saborTexto) && f.presentacionId ? `${saborIdDe(f.saborTexto)}|${f.presentacionId}` : ""))
  const clavesLlenas = claves.filter(Boolean)
  const hayDuplicados = new Set(clavesLlenas).size !== clavesLlenas.length
  const validas = filas.filter((f) => saborIdDe(f.saborTexto) && f.presentacionId && f.cajas !== "" && Number(f.cajas) >= 0)
  const puedeGuardar = editable && !guardando && !hayDuplicados && validas.length === filas.length

  async function guardar() {
    if (!session || !puedeGuardar) return
    setGuardando(true)
    setError(null)
    const resultado = await guardarProgramacionDia(
      session.username,
      area,
      fecha,
      validas.map((f) => ({ saborId: saborIdDe(f.saborTexto), presentacionId: f.presentacionId, cajasPlan: Number(f.cajas) })),
    )
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setPlan(resultado.items)
    setFilas(resultado.items.map(filaDesdeItem))
    setOkMsg(true)
  }

  function agregarFila() {
    setFilas((f) => [...f, { key: `nueva-${Date.now()}-${f.length}`, saborTexto: "", presentacionId: "", cajas: "" }])
    setOkMsg(false)
  }
  function actualizarFila(key: string, campo: keyof Omit<Fila, "key">, valor: string) {
    setFilas((f) => f.map((fila) => (fila.key === key ? { ...fila, [campo]: valor } : fila)))
    setOkMsg(false)
  }
  function quitarFila(key: string) {
    setFilas((f) => f.filter((fila) => fila.key !== key))
    setOkMsg(false)
  }

  const totalCajas = (editable ? validas.map((f) => Number(f.cajas)) : plan.map((p) => p.cajasPlan)).reduce((a, n) => a + n, 0)

  return (
    <AppShell title="Programación" description="Qué se planificó producir en la jornada">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-primary" />
                  Jornada del {fecha}
                </CardTitle>
                <CardDescription className="mt-1">
                  {editable
                    ? "Escribe el sabor, elige la presentación y la cantidad de cajas."
                    : "Plan de hoy — solo lectura."}
                </CardDescription>
              </div>
              {editable ? (
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
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            {cargando || cargandoCatalogos ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : editable ? (
              <>
                <datalist id={SABORES_LIST_ID}>
                  {[...saborPorNombre.keys()].map((nombre) => (
                    <option key={nombre} value={nombre} />
                  ))}
                </datalist>

                {filas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Todavía no hay renglones cargados para hoy.</p>
                )}

                {filas.map((fila, idx) => {
                  const saborNoValido = fila.saborTexto.trim() !== "" && !saborIdDe(fila.saborTexto)
                  const repetida = claves[idx] !== "" && claves.indexOf(claves[idx]) !== idx
                  return (
                    <div key={fila.key} className="flex items-center gap-2">
                      <Input
                        list={SABORES_LIST_ID}
                        placeholder="Sabor"
                        value={fila.saborTexto}
                        onChange={(e) => actualizarFila(fila.key, "saborTexto", e.target.value)}
                        className={cn((saborNoValido || repetida) && "border-destructive focus-visible:ring-destructive/30")}
                      />
                      <Select value={fila.presentacionId} onValueChange={(v) => actualizarFila(fila.key, "presentacionId", v)}>
                        <SelectTrigger className="w-[118px] shrink-0">
                          <SelectValue placeholder="Present." />
                        </SelectTrigger>
                        <SelectContent>
                          {presentaciones.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="Cajas"
                        value={fila.cajas}
                        onChange={(e) => actualizarFila(fila.key, "cajas", e.target.value)}
                        className="w-24 shrink-0"
                      />
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => quitarFila(fila.key)} aria-label="Quitar">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )
                })}

                <Button variant="outline" size="sm" className="self-start" onClick={agregarFila}>
                  <Plus className="size-4" />
                  Agregar renglón
                </Button>

                {hayDuplicados && <p className="text-xs text-destructive">Hay un sabor + presentación repetido.</p>}
                {error && (
                  <p className="text-xs text-destructive" role="alert">
                    {error}
                  </p>
                )}
                {okMsg && <p className="text-xs text-success-foreground">Programación guardada.</p>}

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">
                    Total: <span className="num font-semibold text-foreground">{totalCajas.toLocaleString("es-CO")}</span> cajas
                  </span>
                  <Button size="sm" disabled={!puedeGuardar} onClick={guardar}>
                    {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Guardar
                  </Button>
                </div>
              </>
            ) : plan.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="Sin programación para hoy"
                description="El Super Administrador todavía no cargó el plan de la jornada."
              />
            ) : (
              <>
                {plan.map((p) => (
                  <div
                    key={`${p.saborId}-${p.presentacionId}`}
                    className="flex items-center justify-between border-b border-border/60 py-2 last:border-b-0"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {nombrePorSaborId.get(p.saborId) ?? p.saborNombre}
                      <span className="text-muted-foreground"> · {p.presentacionMl} ml</span>
                    </span>
                    <span className="num font-semibold text-foreground">{p.cajasPlan.toLocaleString("es-CO")} cajas</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
                  Total
                  <span className="num font-semibold text-foreground">{totalCajas.toLocaleString("es-CO")} cajas</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
