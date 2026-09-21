import { useMemo, useState } from "react"
import { Info, Lock, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fechaLocal, horaLocal } from "@/lib/turno"
import {
  CATALOGO_TIPOS,
  codigoDeParada,
  codigoPlanilla,
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
 *  - "Agregar tiempo ocioso": texto libre + duración en minutos.
 *  - "Agregar parada operacional": tipo de falla con autocompletado
 *    contra el catálogo completo (Programada + No Programada manual —
 *    Externa/Operacional/Suministro (vapor y servicios)/Esterilización/
 *    Preparación/Codificación, no texto libre) + duración en minutos.
 *    La clase (PROGRAMADA / NO_PROGRAMADA) la trae el tipo elegido, no la
 *    elige el supervisor (dueño, 2026-09-15).
 * El supervisor no anota cuándo empezó ni cuándo terminó — solo cuánto
 * duró; el inicio/fin que guarda el sistema se calcula solo, anclado al
 * momento de guardar (dueño, 2026-09-15). Por eso no hay paradas "en
 * curso" que revisar acá: cada una queda cerrada apenas se carga.
 * Debajo, para revisar lo ya cargado: elegir línea y ver lo ya cargado.
 * Las paradas MECÁNICAS (equipo/subsistema) siguen sin catálogo — llegan
 * del Sheet de Mantenimiento y se muestran aparte, solo lectura (FASE C′,
 * todavía sin datos reales).
 *
 * FASE A′: el estado vive en memoria (arranca del fixture); "Guardar" no
 * persiste todavía. En FASE B′ esto llama a registrar_parada.
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

/** Ventana inicio/fin anclada a AHORA, a partir de solo la duración en minutos (el supervisor no tipea horas). */
function ventanaDesdeAhora(minutos: number): { inicio: string; fin: string } {
  const inicioDate = new Date()
  const finDate = new Date(inicioDate.getTime() + minutos * 60_000)
  return {
    inicio: `${fechaLocal(inicioDate)}T${horaLocal(inicioDate)}`,
    fin: `${fechaLocal(finDate)}T${horaLocal(finDate)}`,
  }
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

  // Flujo de "Agregar parada": cerrado → elegir línea → elegir Ocioso/Operacional → formulario.
  const [agregando, setAgregando] = useState(false)
  const [lineaAgregar, setLineaAgregar] = useState<string | null>(null)
  const [modoAgregar, setModoAgregar] = useState<"OCIOSO" | "OPERACIONAL" | null>(null)

  const ahora = useMemo(() => new Date(), [])

  const deLinea = useMemo(
    () => filas.filter((p) => p.lineaCodigo === lineaVista).sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [filas, lineaVista],
  )

  function agregar(p: Omit<Parada, "id" | "lineaCodigo" | "turnoTipo" | "origen">, lineaCodigo: string) {
    setFilas((prev) => [...prev, { ...p, id: nuevoId(), lineaCodigo, turnoTipo: "TURNO_1", origen: "MANUAL" }])
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
            lineaCodigo={lineaElegida.lineaCodigo}
            onCancelar={() => setModoAgregar(null)}
            onGuardar={(tipo, minutos, nota, justificacionDesvio) => {
              const { inicio, fin } = ventanaDesdeAhora(minutos)
              agregar(
                {
                  clase: tipo.clase,
                  tipoCodigo: tipo.codigo,
                  tipoNombre: tipo.nombre,
                  tiempoGuiaMin: tipo.tiempoGuiaMin,
                  nota: nota || null,
                  justificacionDesvio,
                  inicio,
                  fin,
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
            onGuardar={(minutos, nota, guiaMin) => {
              const { inicio, fin } = ventanaDesdeAhora(minutos)
              agregar(
                {
                  clase: "OCIOSO",
                  tipoCodigo: null,
                  tipoNombre: "Tiempo ocioso",
                  tiempoGuiaMin: guiaMin,
                  nota,
                  justificacionDesvio: null,
                  inicio,
                  fin,
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
          {lineasDia.map((c) => (
            <Button
              key={c.lineaCodigo}
              type="button"
              size="sm"
              variant={lineaVista === c.lineaCodigo ? "default" : "outline"}
              onClick={() => setLineaVista(c.lineaCodigo)}
            >
              {c.lineaNombre}
            </Button>
          ))}
        </div>
      </div>

      <ListaCerradas
        titulo="Registradas en esta línea"
        paradas={deLinea.filter((p) => !paradaAbierta(p) && p.origen !== "SHEET")}
        ahora={ahora}
      />

      <section className="flex flex-col gap-2">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Mecánicas (falla de equipo/subsistema) es solo lectura — se carga en el Sheet de Mantenimiento y se
            sincroniza acá.
          </span>
        </div>
        <ListaCerradas
          titulo={`Mecánicas de ${nombreLineaParada(lineaVista)}`}
          paradas={deLinea.filter((p) => p.origen === "SHEET")}
          ahora={ahora}
          vacio="Sin paradas mecánicas registradas para esta línea."
        />
      </section>
    </div>
  )
}

// ------------------------------------------------------------

/**
 * Input con autocompletado contra el catálogo completo — no admite texto
 * libre: "Guardar" solo se habilita con un tipo elegido de la lista. Lista
 * plana (sin agrupar por familia, pedido del dueño 2026-09-15); cada tipo
 * muestra su código de planilla PARA LA LÍNEA elegida (`codigoPlanilla`,
 * ver paradas.ts — mismo tipo, código distinto por línea).
 */
function AutocompleteTipo({ lineaCodigo, onElegir }: { lineaCodigo: string; onElegir: (tipo: TipoParada | null) => void }) {
  const [texto, setTexto] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState<TipoParada | null>(null)

  const sugerencias =
    texto.trim() === ""
      ? CATALOGO_TIPOS
      : CATALOGO_TIPOS.filter(
          (t) =>
            t.nombre.toLowerCase().includes(texto.trim().toLowerCase()) ||
            codigoPlanilla(t, lineaCodigo).toLowerCase().includes(texto.trim().toLowerCase()),
        )

  return (
    <div className="relative">
      <Input
        placeholder="Tipo de parada o código…"
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
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card shadow-md">
          {sugerencias.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ningún tipo del catálogo coincide.</li>
          ) : (
            sugerencias.map((t) => (
              <li key={t.codigo}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTexto(t.nombre)
                    setElegido(t)
                    setAbierto(false)
                    onElegir(t)
                  }}
                >
                  <span className="min-w-0 truncate">
                    {t.nombre}
                    {t.tiempoGuiaMin != null && (
                      <span className="ml-2 text-xs text-muted-foreground">guía {fmtDuracion(t.tiempoGuiaMin)}</span>
                    )}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {codigoPlanilla(t, lineaCodigo)}
                  </span>
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
  lineaCodigo,
  onCancelar,
  onGuardar,
}: {
  lineaCodigo: string
  onCancelar: () => void
  onGuardar: (tipo: TipoParada, minutos: number, nota: string, justificacionDesvio: string | null) => void
}) {
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [duracion, setDuracion] = useState("")
  const [nota, setNota] = useState("")
  const [justificacion, setJustificacion] = useState("")

  const minutos = duracion === "" ? null : Number(duracion)
  /** Solo PROGRAMADA obliga a justificar el desvío — el resto del catálogo no trae tiempo guía (ver plan §1.3). */
  const seFuePasada = tipo?.clase === "PROGRAMADA" && tipo.tiempoGuiaMin != null && minutos != null && minutos > tipo.tiempoGuiaMin
  const valido = tipo != null && minutos != null && minutos > 0 && (!seFuePasada || justificacion.trim() !== "")

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">Parada operacional</p>
      <AutocompleteTipo
        lineaCodigo={lineaCodigo}
        onElegir={(t) => {
          setTipo(t)
          setJustificacion("")
        }}
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Duración (minutos)
        <Input
          type="number"
          min={1}
          value={duracion}
          onChange={(e) => setDuracion(e.target.value)}
          className="h-8 w-24"
          placeholder="—"
        />
        {tipo?.tiempoGuiaMin != null && <span>(guía {fmtDuracion(tipo.tiempoGuiaMin)})</span>}
      </label>
      <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8" />
      {seFuePasada && (
        <div>
          <Input
            placeholder="¿Por qué se pasó del tiempo guía? (obligatorio)"
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            className="h-8"
          />
          <p className="mt-1 text-xs text-warning-foreground">Se pasó del tiempo guía — hay que explicar por qué.</p>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!valido}
          onClick={() => valido && onGuardar(tipo, minutos, nota.trim(), seFuePasada ? justificacion.trim() : null)}
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

function FormOcioso({
  onCancelar,
  onGuardar,
}: {
  onCancelar: () => void
  onGuardar: (minutos: number, nota: string, guiaMin: number | null) => void
}) {
  const [duracion, setDuracion] = useState("")
  const [nota, setNota] = useState("")
  const [guia, setGuia] = useState("")

  const minutos = duracion === "" ? null : Number(duracion)
  const valido = minutos != null && minutos > 0 && nota.trim() !== ""

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-foreground">Tiempo ocioso</p>
        <p className="text-xs text-muted-foreground">Línea parada sin un tipo con nombre — se escribe a mano.</p>
      </div>
      <Input placeholder="¿Qué pasó? (obligatorio)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Duración (minutos)
          <Input
            type="number"
            min={1}
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            className="h-8 w-24"
            placeholder="—"
          />
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
          disabled={!valido}
          onClick={() => valido && onGuardar(minutos, nota.trim(), guia === "" ? null : Number(guia))}
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
                  {codigoDeParada(p) && (
                    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{codigoDeParada(p)}</span>
                  )}
                  {p.nota && <span className="ml-1.5 text-muted-foreground">· {p.nota}</span>}
                  {p.justificacionDesvio && (
                    <span className="ml-1.5 text-warning-foreground">· {p.justificacionDesvio}</span>
                  )}
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
