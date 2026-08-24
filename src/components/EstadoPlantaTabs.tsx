import { useState } from "react"
import { Beaker, CheckCircle2, Container, Factory, Layers, Loader2, PenLine, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TanqueEditForm } from "@/components/TanqueEditForm"
import { nombrePorCodigo, type LineaCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive, presentacionesPorLineaLive, velocidadesParaLive } from "@/lib/catalogosLive"
import type { Sabor } from "@/lib/sabores"
import {
  useTurno,
  type CondicionTanque,
  type DatosActivarLinea,
  type LineaEnTurno,
  type PreparacionRegistro,
  type TanqueRecepcion,
  type TurnoActivo,
} from "@/lib/turno"

const TANK_CAPACITY = 20000

/** Color estable por sabor (mismo sabor = mismo color siempre). */
const COLORES_SABOR = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]
function colorSabor(nombre: string | null): string {
  if (!nombre) return "var(--muted-foreground)"
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 997
  return COLORES_SABOR[hash % COLORES_SABOR.length]
}

/*
 * Tanques y Líneas: el mismo estado CONTINUO de la planta, con las
 * mismas acciones, se muestra tanto en Recepción (justo después de
 * Comenzar Turno) como en Preparación (en cualquier momento del
 * turno) — por eso vive acá, compartido entre las dos páginas, en vez
 * de duplicarse.
 *
 * Ciclo de vida de un tanque: VACÍO/SUCIO → "Iniciar Preparación"
 * (pide sabor/lote/volumen/tambores/ajustes de una sola vez) →
 * EN_PREPARACION ("no liberado", el tanque no se puede tomar
 * todavía) → "Liberar" (sin pedir nada nuevo) → LISTO ("liberado",
 * recién ahí una corrida lo puede tomar). "Cambiar estado" queda
 * como salida manual para casos puntuales (forzar SUCIO, corregir
 * algo a mano), sin pasar por el flujo guiado.
 *
 * Una corrida de línea (Activar corrida) elige un TANQUE — solo entre
 * los que están LISTOS — y el sabor/lote salen solos de ahí.
 */
export function EstadoPlantaTabs({ turno, sabores }: { turno: TurnoActivo; sabores: Sabor[] }) {
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const { activarLinea, finalizarLinea, cambiarCondicionTanque, iniciarPreparacion, liberarLote } = useTurno()

  const tanquesListos = turno.tanques.filter((t) => t.condicion === "LISTO")

  return (
    <Tabs defaultValue="tanques" className="mx-auto max-w-3xl">
      <TabsList>
        <TabsTrigger value="tanques">
          <Container className="size-4" />
          Tanques
        </TabsTrigger>
        <TabsTrigger value="lineas">
          <Factory className="size-4" />
          Líneas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tanques" className="flex flex-col gap-3">
        {turno.tanques.map((t) => (
          <TanqueCard
            key={t.numeroTanque}
            tanque={t}
            sabores={sabores}
            preparaciones={turno.preparaciones.filter((p) => p.numeroTanque === t.numeroTanque)}
            onCambiarCondicion={cambiarCondicionTanque}
            onIniciarPreparacion={iniciarPreparacion}
            onLiberarLote={liberarLote}
          />
        ))}
      </TabsContent>

      <TabsContent value="lineas" className="flex flex-col gap-3">
        {lineas
          .filter((l) => l.activo)
          .map((l) => (
            <LineaCard
              key={l.codigo}
              lineaCodigo={l.codigo}
              nombreLinea={l.nombre}
              lineaTurno={turno.lineas.find((tl) => tl.linea === l.codigo && tl.activa) ?? null}
              tanquesListos={tanquesListos}
              presentaciones={presentaciones}
              velocidades={velocidades}
              onActivar={activarLinea}
              onFinalizar={finalizarLinea}
            />
          ))}
      </TabsContent>
    </Tabs>
  )
}

const nombreCondicion: Record<CondicionTanque, string> = {
  LISTO: "Listo (liberado)",
  SUCIO: "Sucio",
  VACIO: "Vacío",
  EN_PREPARACION: "En Preparación (no liberado)",
}
const badgeVariantCondicion: Record<CondicionTanque, "success" | "warning" | "muted"> = {
  LISTO: "success",
  EN_PREPARACION: "warning",
  SUCIO: "muted",
  VACIO: "muted",
}

type Resultado = { ok: true } | { ok: false; error: string }

function TanqueCard({
  tanque,
  sabores,
  preparaciones,
  onCambiarCondicion,
  onIniciarPreparacion,
  onLiberarLote,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  preparaciones: PreparacionRegistro[]
  onCambiarCondicion: Parameters<typeof TanqueEditForm>[0]["onGuardar"]
  onIniciarPreparacion: (datos: {
    numeroTanque: 1 | 2 | 3
    saborId: string | null
    lote: string
    volumenL: number
    tambores: number
    agua: number | null
    azucar: number | null
    acidoCitrico: number | null
  }) => Promise<Resultado>
  onLiberarLote: (loteId: string) => Promise<Resultado>
}) {
  const [editando, setEditando] = useState(false)
  const [mostrarFormPrep, setMostrarFormPrep] = useState(false)
  const [liberando, setLiberando] = useState(false)

  const pct = tanque.condicion === "LISTO" ? Math.min(100, ((tanque.volumenL ?? 0) / TANK_CAPACITY) * 100) : 0
  const color = colorSabor(tanque.saborNombre)
  const loteAbierto = preparaciones.find((p) => !p.liberadoEn && !p.cerradoEn) ?? null

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex gap-4">
          <div className="relative h-32 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {tanque.condicion === "LISTO" && (
              <div
                className="absolute inset-x-0 bottom-0 transition-[height] duration-700"
                style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
              >
                <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]" style={{ backgroundColor: color }} />
                <div
                  className="liquid-wave-2 absolute -top-1 h-2.5 w-[170%] rounded-[50%]"
                  style={{ backgroundColor: color, opacity: 0.55 }}
                />
              </div>
            )}
            {tanque.condicion === "EN_PREPARACION" && (
              <Layers className="alert-pulse absolute inset-x-0 top-1/2 mx-auto size-5 -translate-y-1/2 text-warning" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Container className="size-4 text-muted-foreground" />
                Tanque {tanque.numeroTanque}
              </p>
              <Badge variant={badgeVariantCondicion[tanque.condicion]}>{nombreCondicion[tanque.condicion]}</Badge>
            </div>

            {tanque.condicion === "LISTO" && (
              <>
                <p className="num mt-2 text-xl font-semibold">{(tanque.volumenL ?? 0).toLocaleString("es-CO")} L</p>
                <p className="text-xs text-muted-foreground">
                  {tanque.saborNombre ?? "Sin sabor"}
                  {tanque.lote ? ` · Lote ${tanque.lote}` : ""}
                </p>
              </>
            )}

            {tanque.condicion === "EN_PREPARACION" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {loteAbierto
                  ? `${loteAbierto.saborNombre ?? "Sin sabor"}${loteAbierto.lote ? ` · Lote ${loteAbierto.lote}` : ""} · ${loteAbierto.tambores} tambores${loteAbierto.volumenL ? ` · ${loteAbierto.volumenL} L` : ""}`
                  : "Sin datos de la preparación."}
              </p>
            )}

            {tanque.condicion === "SUCIO" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tanque.ultimoSaborNombre
                  ? `Último: ${tanque.ultimoSaborNombre}${tanque.ultimoLote ? ` · Lote ${tanque.ultimoLote}` : ""}`
                  : "Sin datos del sabor anterior."}
              </p>
            )}

            {tanque.condicion === "VACIO" && <p className="mt-2 text-xs text-muted-foreground">Disponible para preparación.</p>}
          </div>
        </div>

        {tanque.condicion === "EN_PREPARACION" && loteAbierto && (
          <Button
            size="sm"
            className="self-start"
            disabled={liberando}
            onClick={async () => {
              setLiberando(true)
              await onLiberarLote(loteAbierto.id)
              setLiberando(false)
            }}
          >
            {liberando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Liberar (marcar Listo)
          </Button>
        )}

        {(tanque.condicion === "VACIO" || tanque.condicion === "SUCIO") &&
          (mostrarFormPrep ? (
            <FormularioIniciarPreparacion
              numeroTanque={tanque.numeroTanque}
              sabores={sabores}
              onIniciar={onIniciarPreparacion}
              onCancelar={() => setMostrarFormPrep(false)}
            />
          ) : (
            <Button size="sm" variant="outline" className="self-start" onClick={() => setMostrarFormPrep(true)}>
              <Beaker className="size-3.5" />
              Iniciar Preparación
            </Button>
          ))}

        {!editando ? (
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setEditando(true)}>
            <PenLine className="size-3.5" />
            Cambiar estado manualmente
          </Button>
        ) : (
          <TanqueEditForm
            tanque={tanque}
            sabores={sabores}
            onGuardar={async (datos) => {
              const resultado = await onCambiarCondicion(datos)
              if (resultado.ok) setEditando(false)
              return resultado
            }}
            onCancelar={() => setEditando(false)}
          />
        )}
      </CardContent>
    </Card>
  )
}

function FormularioIniciarPreparacion({
  numeroTanque,
  sabores,
  onIniciar,
  onCancelar,
}: {
  numeroTanque: 1 | 2 | 3
  sabores: Sabor[]
  onIniciar: (datos: {
    numeroTanque: 1 | 2 | 3
    saborId: string | null
    lote: string
    volumenL: number
    tambores: number
    agua: number | null
    azucar: number | null
    acidoCitrico: number | null
  }) => Promise<Resultado>
  onCancelar: () => void
}) {
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const [volumenL, setVolumenL] = useState("")
  const [tambores, setTambores] = useState("")
  const [agua, setAgua] = useState("")
  const [azucar, setAzucar] = useState("")
  const [acidoCitrico, setAcidoCitrico] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const valido =
    saborId !== "" &&
    lote.trim() !== "" &&
    volumenL !== "" &&
    Number(volumenL) > 0 &&
    Number(volumenL) <= 20000 &&
    tambores !== "" &&
    Number(tambores) >= 0

  async function handleSubmit() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await onIniciar({
      numeroTanque,
      saborId: saborId || null,
      lote: lote.trim(),
      volumenL: Number(volumenL),
      tambores: Number(tambores),
      agua: agua.trim() === "" ? null : Number(agua),
      azucar: azucar.trim() === "" ? null : Number(azucar),
      acidoCitrico: acidoCitrico.trim() === "" ? null : Number(acidoCitrico),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Nueva preparación (lote independiente, no se suma a otros)</p>
      <div className="grid grid-cols-2 gap-2">
        <Select value={saborId} onValueChange={setSaborId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sabor" />
          </SelectTrigger>
          <SelectContent>
            {sabores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nombre} ({s.familiaNombre})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
        <Input
          type="number"
          min={0}
          max={20000}
          placeholder="Volumen (L)"
          value={volumenL}
          onChange={(e) => setVolumenL(e.target.value)}
        />
        <Input type="number" min={0} placeholder="Tambores" value={tambores} onChange={(e) => setTambores(e.target.value)} />
        <Input type="number" min={0} placeholder="Agua (L)" value={agua} onChange={(e) => setAgua(e.target.value)} />
        <Input type="number" min={0} placeholder="Azúcar (kg)" value={azucar} onChange={(e) => setAzucar(e.target.value)} />
        <Input
          type="number"
          min={0}
          placeholder="Ácido cítrico (kg)"
          value={acidoCitrico}
          onChange={(e) => setAcidoCitrico(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!valido || enviando} onClick={handleSubmit}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
          Iniciar Preparación
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function LineaCard({
  lineaCodigo,
  nombreLinea,
  lineaTurno,
  tanquesListos,
  presentaciones,
  velocidades,
  onActivar,
  onFinalizar,
}: {
  lineaCodigo: LineaCodigo
  nombreLinea: string
  lineaTurno: LineaEnTurno | null
  tanquesListos: TanqueRecepcion[]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  onActivar: (datos: DatosActivarLinea) => Promise<Resultado>
  onFinalizar: (linea: LineaCodigo) => Promise<Resultado>
}) {
  const activa = lineaTurno !== null
  const [editando, setEditando] = useState(false)
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">(lineaTurno?.presentacion ?? "")
  const [envasesHora, setEnvasesHora] = useState<number | "">(lineaTurno?.envasesHora ?? "")
  const [numeroTanque, setNumeroTanque] = useState<1 | 2 | 3 | "">("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  const presentacionesDisponibles = presentacionesPorLineaLive(velocidades, lineaCodigo)
  const opcionesVelocidad = presentacion ? velocidadesParaLive(velocidades, lineaCodigo, presentacion) : []
  const tanqueElegido = tanquesListos.find((t) => t.numeroTanque === numeroTanque) ?? null

  function empezarEdicion() {
    setPresentacion(lineaTurno?.presentacion ?? "")
    setEnvasesHora(lineaTurno?.envasesHora ?? "")
    setNumeroTanque("")
    setError(null)
    setEditando(true)
  }

  const valido = presentacion !== "" && envasesHora !== "" && numeroTanque !== ""

  async function guardar() {
    if (!valido) return
    setGuardando(true)
    setError(null)
    const resultado = await onActivar({
      linea: lineaCodigo,
      presentacion,
      envasesHora: Number(envasesHora),
      numeroTanque,
    })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setEditando(false)
  }

  async function finalizar() {
    setFinalizando(true)
    await onFinalizar(lineaCodigo)
    setFinalizando(false)
  }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Factory className="size-4 text-muted-foreground" />
            {nombreLinea}
          </p>
          <Badge variant={activa ? "success" : "muted"}>{activa ? "Activa" : "Detenida"}</Badge>
        </div>

        {activa && lineaTurno && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Presentación</p>
              <p className="font-medium text-foreground">{lineaTurno.presentacion} ml</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Velocidad</p>
              <p className="num font-medium text-foreground">{lineaTurno.envasesHora} env/h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sabor / Lote</p>
              <p className="font-medium text-foreground">
                {lineaTurno.saborNombre ?? "—"}
                {lineaTurno.lote ? ` · ${lineaTurno.lote}` : ""}
              </p>
            </div>
          </div>
        )}

        {!editando ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={empezarEdicion}>
              <PenLine className="size-3.5" />
              {activa ? "Cambiar" : "Activar corrida"}
            </Button>
            {activa && (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={finalizar}
                disabled={finalizando}
              >
                {finalizando ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
                Finalizar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={numeroTanque === "" ? "" : String(numeroTanque)}
                onValueChange={(v) => setNumeroTanque(Number(v) as 1 | 2 | 3)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tanquesListos.length === 0 ? "Ningún tanque Listo" : "Tanque"} />
                </SelectTrigger>
                <SelectContent>
                  {tanquesListos.length === 0 ? (
                    <SelectItem value="__ninguno" disabled>
                      Ningún tanque está Listo (liberado) todavía
                    </SelectItem>
                  ) : (
                    tanquesListos.map((t) => (
                      <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                        Tanque {t.numeroTanque} · {t.saborNombre ?? "Sin sabor"}
                        {t.lote ? ` · Lote ${t.lote}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Select
                value={presentacion}
                onValueChange={(v) => {
                  setPresentacion(v)
                  setEnvasesHora("")
                }}
                disabled={presentacionesDisponibles.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={presentacionesDisponibles.length === 0 ? "Sin datos" : "Presentación"} />
                </SelectTrigger>
                <SelectContent>
                  {presentacionesDisponibles.map((codigo) => (
                    <SelectItem key={codigo} value={codigo}>
                      {nombrePorCodigo(presentaciones, codigo)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={envasesHora === "" ? "" : String(envasesHora)}
                onValueChange={(v) => setEnvasesHora(Number(v))}
                disabled={!presentacion || opcionesVelocidad.length === 0}
              >
                <SelectTrigger className="col-span-2 w-full">
                  <SelectValue placeholder="Velocidad" />
                </SelectTrigger>
                <SelectContent>
                  {opcionesVelocidad.map((v) => (
                    <SelectItem key={v.envasesHora} value={String(v.envasesHora)}>
                      {v.envasesHora} env/h · {v.litrosHora} L/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tanqueElegido && (
              <p className="text-xs text-muted-foreground">
                Toma {tanqueElegido.saborNombre ?? "sin sabor"}
                {tanqueElegido.lote ? ` · Lote ${tanqueElegido.lote}` : ""} del Tanque {tanqueElegido.numeroTanque}.
              </p>
            )}

            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" disabled={!valido || guardando} onClick={guardar}>
                {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
