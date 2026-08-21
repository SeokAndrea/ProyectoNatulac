import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Check, Loader2, PackageCheck } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { nombrePorCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useTurno, type LineaEnTurno, type ProductoTerminadoRegistro } from "@/lib/turno"

/*
 * Producto Terminado: conteo físico de paletas + "restos" (cajas
 * sueltas) por línea, cargado una vez al finalizar el turno — NO sale
 * de los contadores de envases (eso es "Contadores y Merma", una
 * pantalla aparte). Pensado para más adelante conectarse a un PLC
 * que cuente las cajas automático; por eso son números simples
 * (paletas, cajas sueltas), no texto libre.
 *
 * El sabor se elige a mano por ahora (a veces se continúa el del
 * turno anterior, a veces viene de Recepción o de una futura sección
 * "Preparación" todavía sin definir) — ver
 * supabase/migrations/20260831090000_producto_terminado.sql.
 */
export default function ProductoTerminado() {
  const { turnoActivo, cargando, registrarProductoTerminado } = useTurno()
  const { lineas, presentaciones, cargando: cargandoCatalogos } = useCatalogosLive()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Producto Terminado" description="Carga de lotes de producto terminado">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Producto Terminado" description="Carga de lotes de producto terminado">
        <EmptyState
          icon={PackageCheck}
          title="Primero debes iniciar un turno"
          description="Producto Terminado se asocia al turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  if (turnoActivo.lineas.length === 0) {
    return (
      <AppShell title="Producto Terminado" description="Carga de lotes de producto terminado">
        <EmptyState
          icon={PackageCheck}
          title="El turno está registrado como parada"
          description="No se seleccionaron líneas en uso para este turno, así que no hay nada que registrar acá."
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Producto Terminado" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        {turnoActivo.lineas.map((l) => (
          <FormularioLinea
            key={l.linea}
            lineaTurno={l}
            nombreLinea={nombrePorCodigo(lineas, l.linea)}
            presentaciones={presentaciones}
            sabores={sabores}
            registroExistente={turnoActivo.productoTerminado.find((p) => p.linea === l.linea) ?? null}
            onRegistrar={registrarProductoTerminado}
          />
        ))}
      </div>
    </AppShell>
  )
}

function FormularioLinea({
  lineaTurno,
  nombreLinea,
  presentaciones,
  sabores,
  registroExistente,
  onRegistrar,
}: {
  lineaTurno: LineaEnTurno
  nombreLinea: string
  presentaciones: { codigo: PresentacionCodigo; nombre: string; cajasXPaleta: number; litrosXCaja: number }[]
  sabores: Sabor[]
  registroExistente: ProductoTerminadoRegistro | null
  onRegistrar: (datos: {
    linea: LineaEnTurno["linea"]
    saborId: string | null
    presentacion: PresentacionCodigo
    paletas: number
    cajasSueltas: number
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [saborId, setSaborId] = useState(registroExistente?.saborId ?? "")
  const [paletas, setPaletas] = useState(registroExistente ? String(registroExistente.paletas) : "")
  const [cajasSueltas, setCajasSueltas] = useState(registroExistente ? String(registroExistente.cajasSueltas) : "")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const presentacion = presentaciones.find((p) => p.codigo === lineaTurno.presentacion)
  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const cajasTotales = presentacion ? nPaletas * presentacion.cajasXPaleta + nCajasSueltas : 0
  const litrosPreview = presentacion ? cajasTotales * presentacion.litrosXCaja : 0

  const valido = saborId !== "" && paletas !== "" && cajasSueltas !== "" && nPaletas >= 0 && nCajasSueltas >= 0

  async function guardar() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await onRegistrar({
      linea: lineaTurno.linea,
      saborId: saborId || null,
      presentacion: lineaTurno.presentacion,
      paletas: nPaletas,
      cajasSueltas: nCajasSueltas,
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{nombreLinea}</span>
          {registroExistente && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Check className="size-3.5" />
              Registrado
            </span>
          )}
        </CardTitle>
        <CardDescription>{presentacion?.nombre ?? `${lineaTurno.presentacion} ml`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
            <Label htmlFor={`paletas-${lineaTurno.linea}`}>Paletas completas</Label>
            <Input
              id={`paletas-${lineaTurno.linea}`}
              type="number"
              min={0}
              value={paletas}
              onChange={(e) => setPaletas(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`resto-${lineaTurno.linea}`}>Cajas sueltas (resto)</Label>
            <Input
              id={`resto-${lineaTurno.linea}`}
              type="number"
              min={0}
              value={cajasSueltas}
              onChange={(e) => setCajasSueltas(e.target.value)}
            />
          </div>
        </div>

        {presentacion && (paletas !== "" || cajasSueltas !== "") && (
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">{cajasTotales.toLocaleString("es-CO")} cajas</span>{" "}
            <span className="text-xs">({litrosPreview.toLocaleString("es-CO")} L)</span>
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button onClick={guardar} disabled={!valido || enviando}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
          {registroExistente ? "Actualizar" : "Registrar"}
        </Button>
      </CardContent>
    </Card>
  )
}
