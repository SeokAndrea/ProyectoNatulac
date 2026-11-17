import { useEffect, useMemo, useState } from "react"
import { FileDown, Loader2, PackageSearch, Printer, Search, X } from "lucide-react"
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
import { imprimirYRegistrar } from "@/lib/imprimirEtiqueta"
import { puede } from "@/lib/permisos"
import { fechaJornadaPlanta, fechaPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"
import { extraerTicket, lineaPresentacion, lineaSabor, numeroPaleta4, textoVence } from "@/lib/ticketPaleta"
import {
  TURNOS,
  armarHojas,
  buscarPorTicket,
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
 *
 * Buscar por ticket (migración 20261116590000): se pega el texto del QR del
 * ticket (copiado con la cámara del teléfono o Google Lens) o se escribe el
 * código. Leer el QR con la cámara desde la app es una mejora futura
 * (docs/mejoras-futuras.md).
 */
export default function TrazabilidadPaletizado() {
  const { session } = useAuth()
  const usuario = session?.username ?? null
  const puedeCorregir = !!session?.esDueno || puede(session, "TRAZABILIDAD_EDITAR")
  const puedeImprimir = !!session?.esDueno || puede(session, "TRAZABILIDAD_EDITAR") || puede(session, "ROBOT_TAVIL_CARGAR")

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
  const [aviso, setAviso] = useState<{ tono: "ok" | "warning" | "error"; texto: string; paleta: Paleta | null } | null>(null)

  async function reimprimir(p: Paleta) {
    if (!usuario) return
    const r = await imprimirYRegistrar(usuario, p, 1, "Trazabilidad del paletizado")
    setAviso(r.error ? { tono: "error", texto: r.error, paleta: p } : { tono: "ok", texto: `Ticket ${p.ticket ?? ""} enviado a la impresora.`, paleta: null })
  }

  function irAlDia(dia: string) {
    setTurnos(TURNOS.map((t) => t.codigo))
    setLineasSel(null)
    if (dia !== fecha) {
      setCargando(true)
      setFecha(dia)
    }
  }

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
        {aviso && (
          <div
            role={aviso.tono === "error" ? "alert" : "status"}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
              aviso.tono === "ok" && "border-success/35 bg-success-soft text-success-foreground",
              aviso.tono === "warning" && "border-warning/50 bg-warning-soft text-warning-foreground",
              aviso.tono === "error" && "border-danger/40 bg-danger-soft text-danger-foreground",
            )}
          >
            <span>{aviso.texto}</span>
            <span className="flex shrink-0 items-center gap-1">
              {aviso.paleta && puedeImprimir && (
                <Button size="sm" variant="outline" className="bg-card" onClick={() => void reimprimir(aviso.paleta!)}>
                  <Printer className="size-4" />
                  Reimprimir
                </Button>
              )}
              <Button size="icon" variant="ghost" className="size-8" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}>
                <X className="size-4" />
              </Button>
            </span>
          </div>
        )}

        {usuario && <BuscarTicket usuario={usuario} puedeImprimir={puedeImprimir} onReimprimir={reimprimir} onIrAlDia={irAlDia} />}

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
                            <td className="num px-3 py-2 whitespace-nowrap">{p.ticket ?? "—"}</td>
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
        onGuardada={(p) => {
          const antes = corrigiendo
          setPaletas((ps) => ps.map((x) => (x.id === p.id ? p : x)))
          // El ticket pegado dice la conformidad de antes: hay que reimprimirlo.
          if (p.ticketSistema && antes && antes.conforme !== p.conforme)
            setAviso({
              tono: "warning",
              texto: `El ticket ${p.ticket ?? ""} pegado en la paleta Nº ${numeroPaleta4(p.numero)} dice «${antes.conforme ? "CONFORME" : "NO CONFORME"}». Reimprímelo y cambia el pegado.`,
              paleta: p,
            })
        }}
      />
    </AppShell>
  )
}

/**
 * Buscar una paleta por su ticket: se pega el texto del QR (o el código) y
 * salen las paletas con ese ticket, con sus datos de hoy en la base.
 */
function BuscarTicket({
  usuario,
  puedeImprimir,
  onReimprimir,
  onIrAlDia,
}: {
  usuario: string
  puedeImprimir: boolean
  onReimprimir: (p: Paleta) => Promise<void>
  onIrAlDia: (fecha: string) => void
}) {
  const [texto, setTexto] = useState("")
  const [buscado, setBuscado] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Paleta[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buscar(valor = texto) {
    const ticket = extraerTicket(valor)
    if (!ticket) {
      setError("Pega el texto del QR o escribe el ticket (por ejemplo, P-000124).")
      return
    }
    setError(null)
    setBuscando(true)
    const r = await buscarPorTicket(usuario, ticket)
    setBuscando(false)
    setBuscado(ticket)
    if (!r.ok) {
      setError(r.error)
      setResultados(null)
    } else setResultados(r.data)
  }

  return (
    <Card className="gap-3 px-4 py-3">
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void buscar()
        }}
      >
        <Label htmlFor="traza-ticket">Buscar paleta por ticket</Label>
        <div className="flex gap-2">
          <Input
            id="traza-ticket"
            value={texto}
            autoComplete="off"
            placeholder="Pega el texto del QR o escribe P-000124"
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              // Al pegar el texto del QR, busca enseguida.
              const pegado = e.clipboardData.getData("text")
              if (pegado.trim()) {
                e.preventDefault()
                setTexto(pegado.trim())
                void buscar(pegado)
              }
            }}
            className="max-w-md"
          />
          <Button type="submit" variant="outline" disabled={buscando}>
            {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Buscar
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">Con la cámara del teléfono (o Google Lens) apunta al QR del ticket, copia el texto y pégalo aquí.</span>
      </form>
      <MensajeError error={error} />
      {resultados && resultados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay ninguna paleta con el ticket <b className="num text-foreground">{buscado}</b>.
        </p>
      )}
      {resultados && resultados.length > 0 && (
        <ul className="flex flex-col gap-2">
          {resultados.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <b className="num text-lg">Nº {numeroPaleta4(p.numero)}</b>
                  {p.anuladaEn ? (
                    <Badge variant="muted">Anulada</Badge>
                  ) : p.conforme ? (
                    <Badge variant="success">Conforme</Badge>
                  ) : (
                    <Badge variant="danger">No conforme</Badge>
                  )}
                  <span className="num text-sm text-muted-foreground">Ticket {p.ticket}</span>
                </span>
                <span className="text-sm font-semibold">{lineaSabor(p)}</span>
                <span className="text-sm text-muted-foreground">
                  {lineaPresentacion(p)} · {p.cajas ?? "—"} cajas · Lote {p.lote ?? "—"}
                </span>
                <span className="num text-xs text-muted-foreground">
                  {p.lineaNombre} · {p.fechaProduccion ? fechaHoja(p.fechaProduccion) : "—"} · Turno {numeroTurno(p.turnoTipo)} · Vence {textoVence(p.vence)}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                {puedeImprimir && p.ticketSistema && !p.anuladaEn && (
                  <Button size="sm" variant="outline" onClick={() => void onReimprimir(p)}>
                    <Printer className="size-4" />
                    Reimprimir
                  </Button>
                )}
                {p.fechaProduccion && !p.anuladaEn && (
                  <Button size="sm" onClick={() => onIrAlDia(p.fechaProduccion!)}>
                    Ver el día
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
