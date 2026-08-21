import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Beaker, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useTurno } from "@/lib/turno"

/*
 * Preparaciones: mezcla de un tanque marcado "En Preparación" en
 * Recepción (tambores de concentrado + ajustes de agua/azúcar/ácido
 * cítrico). Puede haber varias por tanque en el mismo turno — se
 * acumulan, como Contadores y Merma, no se pisan. Carga 100% manual:
 * el cálculo cajas→litros→tambores lo hace el analista de producción
 * fuera de la app; los ajustes son solo para calidad/inventario, sin
 * ningún efecto calculado (ver
 * supabase/migrations/20260905090000_preparaciones.sql).
 */
export default function Preparaciones() {
  const { turnoActivo, cargando, registrarPreparacion } = useTurno()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando) {
    return (
      <AppShell title="Preparaciones" description="Tambores y ajustes por tanque">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Preparaciones" description="Tambores y ajustes por tanque">
        <EmptyState
          icon={Beaker}
          title="Primero debes iniciar un turno"
          description="Las preparaciones se asocian al turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  const tanquesEnPreparacion = turnoActivo.tanques.filter((t) => t.condicion === "EN_PREPARACION")

  if (tanquesEnPreparacion.length === 0) {
    return (
      <AppShell title="Preparaciones" description="Tambores y ajustes por tanque">
        <EmptyState
          icon={Beaker}
          title="Ningún tanque quedó en preparación"
          description="En Comenzar Turno ningún tanque se marcó como 'En Preparación', así que no hay nada que cargar acá."
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Preparaciones" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <FormularioPreparacion
          tanques={tanquesEnPreparacion.map((t) => t.numeroTanque)}
          sabores={sabores}
          onRegistrar={registrarPreparacion}
        />
        {turnoActivo.preparaciones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrado en este turno</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {turnoActivo.preparaciones.map((p) => (
                <div key={p.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <p className="font-medium text-foreground">
                    Tanque {p.numeroTanque} · {p.saborNombre ?? "Sin sabor"}
                    {p.lote ? ` · Lote ${p.lote}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {p.tambores} tambores
                    {p.agua !== null ? ` · Agua ${p.agua} L` : ""}
                    {p.azucar !== null ? ` · Azúcar ${p.azucar} kg` : ""}
                    {p.acidoCitrico !== null ? ` · Ácido cítrico ${p.acidoCitrico} kg` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

function FormularioPreparacion({
  tanques,
  sabores,
  onRegistrar,
}: {
  tanques: (1 | 2 | 3)[]
  sabores: Sabor[]
  onRegistrar: (datos: {
    numeroTanque: 1 | 2 | 3
    saborId: string | null
    lote: string
    tambores: number
    agua: number | null
    azucar: number | null
    acidoCitrico: number | null
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [numeroTanque, setNumeroTanque] = useState<1 | 2 | 3 | "">(tanques[0] ?? "")
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const [tambores, setTambores] = useState("")
  const [agua, setAgua] = useState("")
  const [azucar, setAzucar] = useState("")
  const [acidoCitrico, setAcidoCitrico] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const formularioValido = numeroTanque !== "" && saborId !== "" && tambores !== "" && Number(tambores) >= 0

  async function handleSubmit() {
    if (!formularioValido) return
    setEnviando(true)
    setError(null)

    const resultado = await onRegistrar({
      numeroTanque,
      saborId: saborId || null,
      lote: lote.trim(),
      tambores: Number(tambores),
      agua: agua.trim() === "" ? null : Number(agua),
      azucar: azucar.trim() === "" ? null : Number(azucar),
      acidoCitrico: acidoCitrico.trim() === "" ? null : Number(acidoCitrico),
    })

    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    setLote("")
    setTambores("")
    setAgua("")
    setAzucar("")
    setAcidoCitrico("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva preparación</CardTitle>
        <CardDescription>Tambores usados y ajustes de calidad para el tanque.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Tanque</Label>
          <Select value={numeroTanque === "" ? "" : String(numeroTanque)} onValueChange={(v) => setNumeroTanque(Number(v) as 1 | 2 | 3)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un tanque" />
            </SelectTrigger>
            <SelectContent>
              {tanques.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Tanque {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Sabor</Label>
          <Select value={saborId} onValueChange={setSaborId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un sabor" />
            </SelectTrigger>
            <SelectContent>
              {sabores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre} ({s.familiaNombre})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="lote">Lote</Label>
            <Input id="lote" value={lote} onChange={(e) => setLote(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tambores">Tambores</Label>
            <Input id="tambores" type="number" min={0} value={tambores} onChange={(e) => setTambores(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">Ajustes (calidad / inventario)</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agua" className="text-xs font-normal text-muted-foreground">
                Agua (L)
              </Label>
              <Input id="agua" type="number" min={0} value={agua} onChange={(e) => setAgua(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="azucar" className="text-xs font-normal text-muted-foreground">
                Azúcar (kg)
              </Label>
              <Input id="azucar" type="number" min={0} value={azucar} onChange={(e) => setAzucar(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acido" className="text-xs font-normal text-muted-foreground">
                Ácido cítrico (kg)
              </Label>
              <Input id="acido" type="number" min={0} value={acidoCitrico} onChange={(e) => setAcidoCitrico(e.target.value)} />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button className="mt-2 w-full" disabled={!formularioValido || enviando} onClick={handleSubmit}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Beaker className="size-4" />}
          Registrar
        </Button>
      </CardContent>
    </Card>
  )
}
