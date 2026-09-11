import { useMemo, useState } from "react"
import { Clock, Info, Lock, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
} from "@/lib/paradas"

/*
 * Registro de Paradas — captura del supervisor. Elige una de sus 3
 * líneas, y en cada pestaña:
 *  - PROGRAMADA: marca un tipo del catálogo, pone hora de inicio y guarda;
 *    vuelve más tarde y la cierra con hora de fin.
 *  - TIEMPO OCIOSO: entradas de texto libre con el mismo mecanismo.
 *  - NO PROGRAMADA: solo lectura (llega del Sheet de Mantenimiento).
 *
 * FASE A′: el estado vive en memoria (arranca del fixture); "Guardar" no
 * persiste todavía. En FASE B′ esto llama a registrar_parada / cerrar_parada.
 */

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

export function RegistroParadas({ paradas: iniciales }: { paradas: Parada[] }) {
  const [filas, setFilas] = useState<Parada[]>(iniciales)
  const [linea, setLinea] = useState<string>(LINEAS_PARADAS[0].codigo)
  const ahora = useMemo(() => new Date(), [])

  const deLinea = useMemo(
    () => filas.filter((p) => p.lineaCodigo === linea).sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [filas, linea],
  )
  const abiertas = deLinea.filter(paradaAbierta)

  function agregar(p: Omit<Parada, "id" | "lineaCodigo" | "turnoTipo" | "origen" | "fin">) {
    setFilas((prev) => [
      ...prev,
      { ...p, id: nuevoId(), lineaCodigo: linea, turnoTipo: "TURNO_1", origen: "MANUAL", fin: null },
    ])
  }

  function cerrar(id: string, horaFin: string) {
    setFilas((prev) => prev.map((p) => (p.id === id ? { ...p, fin: isoFin(p.inicio, horaFin) } : p)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>Vista de diseño — todavía no guarda en el sistema (FASE A′).</span>
      </div>

      {/* ---- Selector de línea ---- */}
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">¿En qué línea?</p>
        <div className="flex flex-wrap gap-1.5">
          {LINEAS_PARADAS.map((l) => {
            const n = filas.filter((p) => p.lineaCodigo === l.codigo && paradaAbierta(p)).length
            return (
              <Button
                key={l.codigo}
                type="button"
                size="sm"
                variant={linea === l.codigo ? "default" : "outline"}
                onClick={() => setLinea(l.codigo)}
              >
                {l.nombre}
                {n > 0 && (
                  <Badge variant={linea === l.codigo ? "muted" : "warning"} className="ml-1 px-1 font-normal">
                    {n} en curso
                  </Badge>
                )}
              </Button>
            )
          })}
        </div>
      </div>

      {/* ---- Abiertas de la línea (siempre visibles, arriba de las pestañas) ---- */}
      {abiertas.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft/30 p-3">
          <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">
            En curso en {nombreLineaParada(linea)}
          </p>
          {abiertas.map((p) => (
            <FilaAbierta key={p.id} parada={p} ahora={ahora} onCerrar={(h) => cerrar(p.id, h)} />
          ))}
        </div>
      )}

      <Tabs defaultValue="PROGRAMADA">
        <TabsList>
          <TabsTrigger value="PROGRAMADA">Programada</TabsTrigger>
          <TabsTrigger value="NO_PROGRAMADA">No programada</TabsTrigger>
        </TabsList>

        {/* ================= PROGRAMADA ================= */}
        <TabsContent value="PROGRAMADA" className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Paradas programadas</h3>
            <p className="text-xs text-muted-foreground">
              Marca el tipo, pon la hora de inicio y guarda. La duración la calcula el sistema al cerrarla.
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {CATALOGO_PROGRAMADA.map((t) => (
                <FilaCatalogo
                  key={t.codigo}
                  nombre={t.nombre}
                  guiaMin={t.tiempoGuiaMin}
                  codigoPlanilla={t.codigoPlanilla}
                  onAgregar={(hora, nota) =>
                    agregar({
                      clase: "PROGRAMADA",
                      tipoCodigo: t.codigo,
                      tipoNombre: t.nombre,
                      tiempoGuiaMin: t.tiempoGuiaMin,
                      nota: nota || null,
                      inicio: isoDeHoy(hora),
                      supervisorNombre: null,
                    })
                  }
                />
              ))}
            </ul>
          </section>

          <SeccionOcioso
            onAgregar={(hora, nota, guiaMin) =>
              agregar({
                clase: "OCIOSO",
                tipoCodigo: null,
                tipoNombre: "Tiempo ocioso",
                tiempoGuiaMin: guiaMin,
                nota,
                inicio: isoDeHoy(hora),
                supervisorNombre: null,
              })
            }
          />

          <ListaCerradas
            titulo="Registradas en esta línea"
            paradas={deLinea.filter((p) => !paradaAbierta(p) && p.clase !== "NO_PROGRAMADA")}
            ahora={ahora}
          />
        </TabsContent>

        {/* ================= NO PROGRAMADA ================= */}
        <TabsContent value="NO_PROGRAMADA" className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>
              Solo lectura. Las paradas no programadas se cargan en el Sheet de Mantenimiento y se sincronizan acá.
            </span>
          </div>
          <ListaCerradas
            titulo={`No programadas de ${nombreLineaParada(linea)}`}
            paradas={deLinea.filter((p) => p.clase === "NO_PROGRAMADA")}
            ahora={ahora}
            vacio="Sin paradas no programadas registradas para esta línea."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ------------------------------------------------------------

function FilaCatalogo({
  nombre,
  guiaMin,
  codigoPlanilla,
  onAgregar,
}: {
  nombre: string
  guiaMin: number | null
  codigoPlanilla: string
  onAgregar: (hora: string, nota: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [hora, setHora] = useState("")
  const [nota, setNota] = useState("")

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-sm text-foreground">
          {nombre}
          {guiaMin != null && <span className="ml-2 text-xs text-muted-foreground">guía {fmtDuracion(guiaMin)}</span>}
          <span className="ml-2 text-[11px] text-muted-foreground/70">{codigoPlanilla}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant={abierto ? "ghost" : "outline"}
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {abierto ? "Cancelar" : "Agregar"}
        </Button>
      </div>
      {abierto && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Hora de inicio
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-8 w-32" />
          </label>
          <Input
            placeholder="Nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="h-8 min-w-[180px] flex-1"
          />
          <Button
            type="button"
            size="sm"
            disabled={!hora}
            onClick={() => {
              onAgregar(hora, nota.trim())
              setAbierto(false)
              setHora("")
              setNota("")
            }}
          >
            Guardar
          </Button>
        </div>
      )}
    </li>
  )
}

function SeccionOcioso({ onAgregar }: { onAgregar: (hora: string, nota: string, guiaMin: number | null) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [hora, setHora] = useState("")
  const [nota, setNota] = useState("")
  const [guia, setGuia] = useState("")

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tiempo ocioso</h3>
          <p className="text-xs text-muted-foreground">Línea parada sin un tipo con nombre — se escribe a mano.</p>
        </div>
        <Button type="button" size="sm" variant={abierto ? "ghost" : "outline"} onClick={() => setAbierto((v) => !v)}>
          {abierto ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {abierto ? "Cancelar" : "Agregar"}
        </Button>
      </div>
      {abierto && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
          <Input
            placeholder="¿Qué pasó? (obligatorio)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="h-8 min-w-[200px] flex-1"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Inicio
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-8 w-32" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Guía (min)
            <Input
              type="number"
              min={0}
              value={guia}
              onChange={(e) => setGuia(e.target.value)}
              className="h-8 w-20"
              placeholder="—"
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!hora || !nota.trim()}
            onClick={() => {
              onAgregar(hora, nota.trim(), guia === "" ? null : Number(guia))
              setAbierto(false)
              setHora("")
              setNota("")
              setGuia("")
            }}
          >
            Guardar
          </Button>
        </div>
      )}
    </section>
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
