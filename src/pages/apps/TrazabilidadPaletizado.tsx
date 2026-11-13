import { useEffect, useMemo, useState } from "react"
import { FileDown, Loader2, PackageSearch } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { MensajeError } from "@/components/MensajeError"
import { CamposConformidad } from "@/components/robot-tavil/CamposConformidad"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { descargarArchivo } from "@/lib/descargarArchivo"
import { puede } from "@/lib/permisos"
import { fechaJornadaPlanta, fechaPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"
import {
  TURNOS,
  armarHojas,
  codigoSabor,
  corregirConformidad,
  errorConformidad,
  fechaHoja,
  listarTrazabilidad,
  numeroTurno,
  textoObservacionLargo,
  type DatosConformidad,
  type LineaFiltro,
  type Paleta,
  type SaborLeyenda,
  type TurnoTipo,
} from "@/lib/trazabilidadPaletizado"
import { cn } from "@/lib/utils"

/*
 * Tarjeta «Trazabilidad del paletizado»: las hojas 1-PR-F-040 del día, con
 * filtros de turno y de línea (por defecto, todos), y el PDF con el formato
 * de la hoja. TRAZABILIDAD_VER ve y exporta; TRAZABILIDAD_EDITAR además
 * corrige la conformidad y la observación (opcional). Migración 20261115290000.
 */
export default function TrazabilidadPaletizado() {
  const { session } = useAuth()
  const usuario = session?.username ?? null
  const puedeCorregir = !!session?.esDueno || puede(session, "TRAZABILIDAD_EDITAR")

  const [fecha, setFecha] = useState(() => fechaJornadaPlanta())
  const [turnos, setTurnos] = useState<TurnoTipo[]>(TURNOS.map((t) => t.codigo))
  const [lineasSel, setLineasSel] = useState<string[] | null>(null)
  const [lineas, setLineas] = useState<LineaFiltro[]>([])
  const [paletas, setPaletas] = useState<Paleta[]>([])
  const [sabores, setSabores] = useState<SaborLeyenda[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<Paleta | null>(null)
  const [exportando, setExportando] = useState(false)

  // Se leen todas las paletas del día; turno y línea se filtran aquí (así el
  // filtro responde al instante y las líneas del área llegan aunque no haya paletas).
  // «Cargando» lo enciende quien cambia el día (onChange), no el efecto.
  useEffect(() => {
    if (!usuario || !fecha) return
    let vivo = true
    async function cargar() {
      const r = await listarTrazabilidad(usuario!, fecha, null, null)
      if (!vivo) return
      setCargando(false)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(null)
      setLineas(r.data.lineas)
      setPaletas(r.data.paletas)
      setSabores(r.data.sabores)
    }
    void cargar()
    return () => {
      vivo = false
    }
  }, [usuario, fecha])

  const lineasActivas = lineasSel ?? lineas.map((l) => l.codigo)
  const filtradas = useMemo(
    () => paletas.filter((p) => (p.turnoTipo ? turnos.includes(p.turnoTipo) : true) && lineasActivas.includes(p.lineaCodigo)),
    [paletas, turnos, lineasActivas],
  )
  const hojas = useMemo(() => armarHojas(filtradas), [filtradas])

  const alternar = <T,>(lista: T[], v: T): T[] => (lista.includes(v) ? (lista.length === 1 ? lista : lista.filter((x) => x !== v)) : [...lista, v])

  async function exportar() {
    setExportando(true)
    try {
      const { cargarRecursosTrazabilidad, generarTrazabilidadPdf, nombreArchivoTrazabilidad } = await import("@/lib/trazabilidadPaletizadoPdf")
      const recursos = await cargarRecursosTrazabilidad()
      const todas = lineasActivas.length === lineas.length
      descargarArchivo(generarTrazabilidadPdf(hojas, { sabores, recursos }), nombreArchivoTrazabilidad(fecha, todas ? null : lineasActivas))
    } catch {
      setError("No se pudo armar el PDF. Revisa la conexión e intenta de nuevo.")
    } finally {
      setExportando(false)
    }
  }

  const todosTurnos = turnos.length === TURNOS.length
  const todasLineas = lineasActivas.length === lineas.length

  return (
    <AppShell title="Trazabilidad del paletizado" description="Hoja 1-PR-F-040 de las paletas del Robot Tavil">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="traza-fecha">Día</Label>
            <Input
              id="traza-fecha"
              type="date"
              className="w-44"
              value={fecha}
              max={fechaPlanta()}
              onChange={(e) => {
                if (!e.target.value || e.target.value === fecha) return
                setCargando(true)
                setFecha(e.target.value)
              }}
            />
          </div>
          <Filtro
            titulo="Turno"
            opciones={TURNOS.map((t) => ({ valor: t.codigo, texto: t.nombre }))}
            elegidos={turnos}
            alTocar={(v) => setTurnos((t) => alternar(t, v as TurnoTipo))}
            pista={todosTurnos ? "Los 3 turnos del día (por defecto)" : `Solo: ${turnos.map((t) => `T${numeroTurno(t)}`).sort().join(", ")}`}
          />
          {lineas.length > 0 && (
            <Filtro
              titulo="Línea"
              opciones={lineas.map((l) => ({ valor: l.codigo, texto: l.nombre }))}
              elegidos={lineasActivas}
              alTocar={(v) => setLineasSel(alternar(lineasActivas, v))}
              pista={
                todasLineas
                  ? `Las ${lineas.length} líneas (por defecto)`
                  : `Solo: ${lineas.filter((l) => lineasActivas.includes(l.codigo)).map((l) => l.nombre).join(", ")}`
              }
            />
          )}
          <span className="flex-1" />
          <Button onClick={() => void exportar()} disabled={exportando || cargando || hojas.length === 0}>
            {exportando ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            Exportar PDF
          </Button>
        </div>

        <MensajeError error={error} />

        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Mostrando <b className="text-foreground">{fechaHoja(fecha)}</b> · {todosTurnos ? "los 3 turnos" : turnos.map((t) => `Turno ${numeroTurno(t)}`).join(", ")}{" "}
              · <b className="text-foreground">{filtradas.length} paletas</b> en {hojas.length} {hojas.length === 1 ? "hoja" : "hojas"}.
            </p>
            {hojas.length === 0 ? (
              <EmptyState icon={PackageSearch} title="No hay paletas con estos filtros" description="Prueba con otro día, turno o línea." />
            ) : (
              hojas.map((h) => (
                <Card key={h.clave} className="gap-0 py-0">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-3">
                    <Dato etiqueta="1.1 Fecha" valor={fechaHoja(h.fecha)} />
                    <Dato etiqueta="1.2 Tipo de paletizado" valor={h.tipoPaletizado === "MANUAL" ? "Manual" : "Automático"} />
                    <Dato etiqueta="1.3 Presentación" valor={h.presentacionCodigo} />
                    <Dato
                      etiqueta={h.lineaNombre}
                      valor={`${h.paletas.length} ${h.paletas.length === 1 ? "paleta" : "paletas"} · ${h.paletas.reduce((a, p) => a + (p.cajas ?? 0), 0)} cajas`}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          {["Nº de paleta", "Sabor", "Lote", "Nº de ticket", "Nº de cajas", "Turno", "Conformidad", "Observación / desviación", "Acción de corrección"].map(
                            (t, i) => (
                              <th key={t} className="px-3 py-2 align-bottom font-semibold">
                                {t}
                                <span className="num block font-normal">1.3.{i + 1}</span>
                              </th>
                            ),
                          )}
                          {puedeCorregir && <th className="px-3 py-2" />}
                        </tr>
                      </thead>
                      <tbody>
                        {h.paletas.map((p) => (
                          <tr key={p.id} className="border-b border-border align-top last:border-b-0">
                            <td className="num px-3 py-2 text-base font-semibold">{p.numero ?? "—"}</td>
                            <td className="px-3 py-2">
                              <b>{codigoSabor(p)}</b>
                              {p.saborCodigo && <span className="block text-xs text-muted-foreground">{p.saborNombre}</span>}
                            </td>
                            <td className="num px-3 py-2">{p.lote ?? "—"}</td>
                            <td className="num px-3 py-2">{p.ticket ?? "—"}</td>
                            <td className="num px-3 py-2">{p.cajas ?? "—"}</td>
                            <td className="px-3 py-2">
                              Turno {numeroTurno(p.turnoTipo)}
                              <span className="num block text-xs text-muted-foreground">{horaCortaPlanta(p.creadaEn, h.fecha)}</span>
                            </td>
                            <td className="px-3 py-2">
                              {p.conforme ? <Badge variant="success">C</Badge> : <Badge variant="danger">NC</Badge>}
                              {p.editadaEn && <span className="block text-xs text-muted-foreground">Corregida</span>}
                            </td>
                            <td className="px-3 py-2">{p.observacionCodigos.length ? textoObservacionLargo(p) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2">{p.accionCorreccion || <span className="text-muted-foreground">—</span>}</td>
                            {puedeCorregir && (
                              <td className="px-3 py-2">
                                <Button size="sm" variant="outline" onClick={() => setCorrigiendo(p)}>
                                  Corregir
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Las paletas anuladas no salen aquí ni en el PDF. Si en un mismo día hubo paletas automáticas y manuales, cada tipo va en su propia hoja.
              {puedeCorregir && " Cada corrección queda en Auditoría con antes y después."}
            </p>
          </>
        )}
      </div>

      <DialogoCorregir
        paleta={corrigiendo}
        usuario={usuario}
        onCerrar={() => setCorrigiendo(null)}
        onGuardada={(p) => setPaletas((ps) => ps.map((x) => (x.id === p.id ? p : x)))}
      />
    </AppShell>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <b>{valor}</b>
    </div>
  )
}

/** Botones de selección múltiple (como los de turno): siempre queda al menos uno marcado. */
function Filtro({
  titulo,
  opciones,
  elegidos,
  alTocar,
  pista,
}: {
  titulo: string
  opciones: { valor: string; texto: string }[]
  elegidos: string[]
  alTocar: (v: string) => void
  pista: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{titulo}</span>
      <div role="group" aria-label={`${titulo}s a mostrar`} className="inline-flex overflow-hidden rounded-lg border border-border">
        {opciones.map((o) => {
          const on = elegidos.includes(o.valor)
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={on}
              onClick={() => alTocar(o.valor)}
              className={cn(
                "min-h-9 border-l border-border px-3 text-sm first:border-l-0",
                on ? "bg-primary font-semibold text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {o.texto}
            </button>
          )
        })}
      </div>
      <span className="text-xs text-muted-foreground">{pista}</span>
    </div>
  )
}

function DialogoCorregir({
  paleta,
  usuario,
  onCerrar,
  onGuardada,
}: {
  paleta: Paleta | null
  usuario: string | null
  onCerrar: () => void
  onGuardada: (p: Paleta) => void
}) {
  return (
    <Dialog open={!!paleta} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        {paleta && usuario && <CuerpoCorregir key={paleta.id} paleta={paleta} usuario={usuario} onCerrar={onCerrar} onGuardada={onGuardada} />}
      </DialogContent>
    </Dialog>
  )
}

function CuerpoCorregir({
  paleta,
  usuario,
  onCerrar,
  onGuardada,
}: {
  paleta: Paleta
  usuario: string
  onCerrar: () => void
  onGuardada: (p: Paleta) => void
}) {
  const [valor, setValor] = useState<DatosConformidad>({
    conforme: paleta.conforme,
    observacionCodigos: paleta.observacionCodigos,
    observacionOtros: paleta.observacionOtros ?? "",
    accionCorreccion: paleta.accionCorreccion ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar() {
    const e = errorConformidad(valor, false)
    if (e) {
      setError(e)
      return
    }
    setEnviando(true)
    const r = await corregirConformidad(usuario, paleta.id, valor)
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    onGuardada(r.data)
    onCerrar()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          Corregir la paleta Nº {paleta.numero ?? "—"} · {paleta.lineaNombre}
        </DialogTitle>
        <DialogDescription>
          Ticket {paleta.ticket ?? "—"} · {codigoSabor(paleta)} · Turno {numeroTurno(paleta.turnoTipo)}. Aquí la observación es opcional; el cambio queda en Auditoría.
        </DialogDescription>
      </DialogHeader>
      <CamposConformidad idBase="corregir" valor={valor} onCambio={setValor} opcional />
      <MensajeError error={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          Guardar corrección
        </Button>
      </DialogFooter>
    </form>
  )
}
