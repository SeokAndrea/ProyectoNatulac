import { useMemo, useState } from "react"
import { Clock, Info, Lock, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fechaLocal } from "@/lib/turno"
import {
  CATALOGO_PROGRAMADA,
  duracionMin,
  fmtDesvio,
  fmtDuracion,
  LINEAS_PARADAS,
  nombreLineaParada,
  paradaAbierta,
  type Parada,
  type TipoParada,
} from "@/lib/paradas"

/*
 * Registro de Paradas — captura del supervisor. Flujo (2026-09-14, pedido
 * del dueño): "Agregar parada" primero pide EN CUÁL LÍNEA es — la parada
 * es siempre de la línea, nunca del lote — pero cada línea se muestra con
 * el lote/sabor que tiene corriendo AHORA (mismo dato que Producción al
 * activar), solo como contexto para reconocerla de un vistazo. Elegida la
 * línea, dos caminos:
 *  - "Agregar tiempo ocioso": texto libre + hora de inicio (+ fin si ya
 *    se sabe).
 *  - "Agregar parada operacional": tipo de falla con autocompletado
 *    contra el catálogo (no texto libre — el catálogo es la única fuente
 *    de tipos programados) + hora de inicio (+ fin si ya se sabe).
 * Debajo, para revisar lo ya cargado: elegir línea, ver las abiertas (con
 * botón para ponerles hora de fin más tarde), lo ya cerrado, y No
 * Programada (solo lectura, llega del Sheet de Mantenimiento).
 *
 * FASE A′: el estado vive en memoria (arranca del fixture); "Guardar" no
 * persiste todavía. En FASE B′ esto llama a registrar_parada / cerrar_parada.
 */

export interface LineaDelDia {
  /** Código genérico LINEA_1/2/3 (ver LINEAS_PARADAS) — no el código real de la línea, que difiere por área. */
  lineaCodigo: string
  lineaNombre: string
  /** Lote/sabor corriendo AHORA en esa línea — contexto para reconocerla, la parada sigue siendo de la línea, no del lote. */
  loteTexto: string | null
  saborNombre: string | null
  activa: boolean
}

let contador = 0
const nuevoId = () => `local-${Date.now()}-${contador++}`

/** Arma un ISO local 'YYYY-MM-DDTHH:MM:SS' de HOY con la hora 'HH:MM'. */
function isoDeHoy(hora: string): string {
  return `${fechaLocal(new Date())}T${hora.length === 5 ? `${hora}:00` : hora}`
}

/** Si la hora de fin quedó antes que la de inicio, cuenta como del día siguiente. */
function isoFin(inicio: string, horaFin: string): string {
  const fin = isoDeHoy(horaFin)
  if (fin > inicio) return fin
  const d = new Date(inicio)
  d.setDate(d.getDate() + 1)
  return `${fechaLocal(d)}T${horaFin.length === 5 ? `${horaFin}:00` : horaFin}`
}

const horaCorta = (iso: string) => iso.slice(11, 16)

/** Sin `lineasHoy` (ej. preview sin login /paradas-demo): 3 líneas genéricas, sin lote/sabor. */
const LINEAS_GENERICAS: LineaDelDia[] = LINEAS_PARADAS.map((l) => ({
  lineaCodigo: l.codigo,
  lineaNombre: l.nombre,
  loteTexto: null,
  saborNombre: null,
  activa: false,
}))

export function RegistroParadas({
  paradas: iniciales,
  lineasHoy,
}: {
  paradas: Parada[]
  /** Las 3 líneas de HOY, con el lote/sabor que tienen corriendo ahora (mismo dato que al activar en Producción) — solo contexto, la parada es de la línea, no del lote. */
  lineasHoy?: LineaDelDia[]
}) {
  const lineasDia = lineasHoy && lineasHoy.length > 0 ? lineasHoy : LINEAS_GENERICAS
  const [filas, setFilas] = useState<Parada[]>(iniciales)
  const [lineaVista, setLineaVista] = useState<string>(lineasDia[0].lineaCodigo)

  // Flujo de "Agregar parada": cerrado → elegir corrida → elegir Ocioso/Operacional → formulario.
  const [agregando, setAgregando] = useState(false)
  const [lineaAgregar, setLineaAgregar] = useState<string | null>(null)
  const [modoAgregar, setModoAgregar] = useState<"OCIOSO" | "OPERACIONAL" | null>(null)

  const ahora = useMemo(() => new Date(), [])

  const deLinea = useMemo(
    () => filas.filter((p) => p.lineaCodigo === lineaVista).sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [filas, lineaVista],
  )
  const abiertas = deLinea.filter(paradaAbierta)

  function agregar(p: Omit<Parada, "id" | "lineaCodigo" | "turnoTipo" | "origen">, lineaCodigo: string) {
    setFilas((prev) => [...prev, { ...p, id: nuevoId(), lineaCodigo, turnoTipo: "TURNO_1", origen: "MANUAL" }])
  }

  function cerrar(id: string, horaFin: string) {
    setFilas((prev) => prev.map((p) => (p.id === id ? { ...p, fin: isoFin(p.inicio, horaFin) } : p)))
  }

  function cerrarFlujoAgregar() {
    setAgregando(false)
    setLineaAgregar(null)
    setModoAgregar(null)
  }

  function alGuardar(lineaCodigo: string) {
    setLineaVista(lineaCodigo)
    cerrarFlujoAgregar()
  }

  const lineaElegida = lineasDia.find((c) => c.lineaCodigo === lineaAgregar) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>Vista de diseño — todavía no guarda en el sistema (FASE A′).</span>
      </div>

      {/* ---- Agregar parada ---- */}
      <div className="rounded-xl border border-border bg-card p-3">
        {!agregando ? (
          <Button type="button" onClick={() => setAgregando(true)}>
            <Plus className="size-4" />
            Agregar parada
          </Button>
        ) : !lineaElegida ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">¿En cuál línea?</p>
              <Button type="button" size="icon-sm" variant="ghost" onClick={cerrarFlujoAgregar}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {lineasDia.map((c) => (
                <button
                  key={c.lineaCodigo}
                  type="button"
                  onClick={() => setLineaAgregar(c.lineaCodigo)}
                  className="rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <p className="text-sm font-semibold text-foreground">{c.lineaNombre}</p>
                  {c.activa ? (
                    <p className="text-xs text-muted-foreground">
                      {c.saborNombre ?? "—"}
                      {c.loteTexto ? ` · Lote ${c.loteTexto}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin producción activa</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : !modoAgregar ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {lineaElegida.lineaNombre}
                {lineaElegida.activa && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · {lineaElegida.saborNombre ?? "—"}
                    {lineaElegida.loteTexto ? ` · Lote ${lineaElegida.loteTexto}` : ""}
                  </span>
                )}
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLineaAgregar(null)}>
                Cambiar línea
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setModoAgregar("OCIOSO")}>
                Agregar tiempo ocioso
              </Button>
              <Button type="button" variant="outline" onClick={() => setModoAgregar("OPERACIONAL")}>
                Agregar parada operacional
              </Button>
            </div>
          </div>
        ) : modoAgregar === "OPERACIONAL" ? (
          <FormOperacional
            onCancelar={() => setModoAgregar(null)}
            onGuardar={(tipo, hora, horaFin, nota) => {
              const inicio = isoDeHoy(hora)
              agregar(
                {
                  clase: "PROGRAMADA",
                  tipoCodigo: tipo.codigo,
                  tipoNombre: tipo.nombre,
                  tiempoGuiaMin: tipo.tiempoGuiaMin,
                  nota: nota || null,
                  inicio,
                  fin: horaFin ? isoFin(inicio, horaFin) : null,
                  supervisorNombre: null,
                },
                lineaElegida.lineaCodigo,
              )
              alGuardar(lineaElegida.lineaCodigo)
            }}
          />
        ) : (
          <FormOcioso
            onCancelar={() => setModoAgregar(null)}
            onGuardar={(hora, horaFin, nota, guiaMin) => {
              const inicio = isoDeHoy(hora)
              agregar(
                {
                  clase: "OCIOSO",
                  tipoCodigo: null,
                  tipoNombre: "Tiempo ocioso",
                  tiempoGuiaMin: guiaMin,
                  nota,
                  inicio,
                  fin: horaFin ? isoFin(inicio, horaFin) : null,
                  supervisorNombre: null,
                },
                lineaElegida.lineaCodigo,
              )
              alGuardar(lineaElegida.lineaCodigo)
            }}
          />
        )}
      </div>

      {/* ---- Ver / revisar lo cargado, por línea ---- */}
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Viendo</p>
        <div className="flex flex-wrap gap-1.5">
          {lineasDia.map((c) => {
            const n = filas.filter((p) => p.lineaCodigo === c.lineaCodigo && paradaAbierta(p)).length
            return (
              <Button
                key={c.lineaCodigo}
                type="button"
                size="sm"
                variant={lineaVista === c.lineaCodigo ? "default" : "outline"}
                onClick={() => setLineaVista(c.lineaCodigo)}
              >
                {c.lineaNombre}
                {n > 0 && (
                  <Badge variant={lineaVista === c.lineaCodigo ? "muted" : "warning"} className="ml-1 px-1 font-normal">
                    {n} en curso
                  </Badge>
                )}
              </Button>
            )
          })}
        </div>
      </div>

      {abiertas.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft/30 p-3">
          <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">
            En curso en {nombreLineaParada(lineaVista)}
          </p>
          {abiertas.map((p) => (
            <FilaAbierta key={p.id} parada={p} ahora={ahora} onCerrar={(h) => cerrar(p.id, h)} />
          ))}
        </div>
      )}

      <ListaCerradas
        titulo="Registradas en esta línea"
        paradas={deLinea.filter((p) => !paradaAbierta(p) && p.clase !== "NO_PROGRAMADA")}
        ahora={ahora}
      />

      <section className="flex flex-col gap-2">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            No programada es solo lectura — se carga en el Sheet de Mantenimiento y se sincroniza acá.
          </span>
        </div>
        <ListaCerradas
          titulo={`No programadas de ${nombreLineaParada(lineaVista)}`}
          paradas={deLinea.filter((p) => p.clase === "NO_PROGRAMADA")}
          ahora={ahora}
          vacio="Sin paradas no programadas registradas para esta línea."
        />
      </section>
    </div>
  )
}

// ------------------------------------------------------------

/** Input con autocompletado contra el catálogo — no admite texto libre: "Guardar" solo se habilita con un tipo elegido de la lista. */
function AutocompleteTipo({ onElegir }: { onElegir: (tipo: TipoParada | null) => void }) {
  const [texto, setTexto] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState<TipoParada | null>(null)

  const sugerencias =
    texto.trim() === ""
      ? CATALOGO_PROGRAMADA
      : CATALOGO_PROGRAMADA.filter((t) => t.nombre.toLowerCase().includes(texto.trim().toLowerCase()))

  return (
    <div className="relative">
      <Input
        placeholder="Tipo de falla…"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          if (elegido) {
            setElegido(null)
            onElegir(null)
          }
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="h-9"
      />
      {abierto && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card shadow-md">
          {sugerencias.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ningún tipo del catálogo coincide.</li>
          ) : (
            sugerencias.map((t) => (
              <li key={t.codigo}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTexto(t.nombre)
                    setElegido(t)
                    setAbierto(false)
                    onElegir(t)
                  }}
                >
                  {t.nombre}
                  {t.tiempoGuiaMin != null && <span className="ml-2 text-xs text-muted-foreground">guía {fmtDuracion(t.tiempoGuiaMin)}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {!elegido && texto.trim() !== "" && (
        <p className="mt-1 text-xs text-warning-foreground">Hay que elegir un tipo de la lista — no se puede escribir uno nuevo acá.</p>
      )}
    </div>
  )
}

function FormOperacional({
  onCancelar,
  onGuardar,
}: {
  onCancelar: () => void
  onGuardar: (tipo: TipoParada, hora: string, horaFin: string, nota: string) => void
}) {
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [hora, setHora] = useState("")
  const [horaFin, setHoraFin] = useState("")
  const [nota, setNota] = useState("")

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">Parada operacional</p>
      <AutocompleteTipo onElegir={setTipo} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Inicio
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-8 w-32" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Fin (si ya terminó)
          <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="h-8 w-32" />
        </label>
      </div>
      <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8" />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!tipo || !hora} onClick={() => tipo && onGuardar(tipo, hora, horaFin, nota.trim())}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function FormOcioso({
  onCancelar,
  onGuardar,
}: {
  onCancelar: () => void
  onGuardar: (hora: string, horaFin: string, nota: string, guiaMin: number | null) => void
}) {
  const [hora, setHora] = useState("")
  const [horaFin, setHoraFin] = useState("")
  const [nota, setNota] = useState("")
  const [guia, setGuia] = useState("")

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-foreground">Tiempo ocioso</p>
        <p className="text-xs text-muted-foreground">Línea parada sin un tipo con nombre — se escribe a mano.</p>
      </div>
      <Input placeholder="¿Qué pasó? (obligatorio)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Inicio
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-8 w-32" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Fin (si ya terminó)
          <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="h-8 w-32" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Guía (min)
          <Input type="number" min={0} value={guia} onChange={(e) => setGuia(e.target.value)} className="h-8 w-20" placeholder="—" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!hora || !nota.trim()}
          onClick={() => onGuardar(hora, horaFin, nota.trim(), guia === "" ? null : Number(guia))}
        >
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function FilaAbierta({ parada: p, ahora, onCerrar }: { parada: Parada; ahora: Date; onCerrar: (hora: string) => void }) {
  const [cerrando, setCerrando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [hora, setHora] = useState("")

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{p.tipoNombre}</p>
          <p className="text-xs text-muted-foreground">
            Desde {horaCorta(p.inicio)} · va {fmtDuracion(duracionMin(p, ahora))}
            {p.nota ? ` · ${p.nota}` : ""}
          </p>
        </div>
        {!cerrando ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setCerrando(true)}>
            <Clock className="size-3.5" />
            Poner hora de fin
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-8 w-32" />
            {!confirmar ? (
              <Button type="button" size="sm" disabled={!hora} onClick={() => setConfirmar(true)}>
                Cerrar
              </Button>
            ) : (
              <Button type="button" size="sm" variant="destructive" onClick={() => onCerrar(hora)}>
                Confirmar cierre
              </Button>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setCerrando(false)
                setConfirmar(false)
                setHora("")
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ListaCerradas({
  titulo,
  paradas,
  ahora,
  vacio = "Nada registrado todavía.",
}: {
  titulo: string
  paradas: Parada[]
  ahora: Date
  vacio?: string
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      {paradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {paradas.map((p) => {
            const min = duracionMin(p, ahora)
            const desvio = p.tiempoGuiaMin != null ? min - p.tiempoGuiaMin : null
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/40"
              >
                <span className="min-w-0 truncate text-foreground">
                  {p.tipoNombre}
                  {p.nota && <span className="ml-1.5 text-muted-foreground">· {p.nota}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.fin ? `${horaCorta(p.inicio)}–${horaCorta(p.fin)}` : horaCorta(p.inicio)} ·{" "}
                  <span className="font-semibold text-foreground">{fmtDuracion(min)}</span>
                  {desvio != null && desvio !== 0 && (
                    <span className={desvio > 0 ? " text-danger" : " text-success"}> ({fmtDesvio(desvio)})</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
