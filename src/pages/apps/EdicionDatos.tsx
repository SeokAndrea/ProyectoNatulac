import { useEffect, useState } from "react"
import { Ban, Check, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { PersonalPanel } from "@/components/PersonalPanel"
import { useCatalogosLive, type LineaLive, type PresentacionLive, type VelocidadLive } from "@/lib/catalogosLive"
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"
import {
  crearSabor,
  desactivarSabor,
  editarSabor,
  listarFamilias,
  listarSabores,
  reactivarSabor,
  type Familia,
  type Sabor,
} from "@/lib/sabores"
import {
  crearPresentacion,
  desactivarPresentacion,
  editarPresentacion,
  reactivarPresentacion,
} from "@/lib/presentaciones"
import { crearVelocidad, desactivarVelocidad, editarVelocidad, reactivarVelocidad } from "@/lib/velocidades"
import { desactivarLinea, editarLinea, reactivarLinea } from "@/lib/lineas"

/*
 * Catálogos generales de la planta, editables desde acá sin tocar
 * código ni SQL (solo SUPERADMINISTRADOR — ver rolesPermitidos en
 * src/lib/apps.tsx y src/App.tsx). "Personal" acá muestra TODAS las
 * áreas (Jorge es la jerarquía más alta); los ADMINISTRADOR_AREA
 * gestionan el suyo desde la página aparte "Personal"
 * (src/pages/apps/Personal.tsx), que reutiliza el mismo
 * <PersonalPanel /> — el filtro por área lo hace Postgres según quién
 * llama, no esta página.
 *
 * Presentaciones, Velocidades y Líneas usan el mismo
 * CatalogosProvider (src/lib/catalogosLive.tsx) que ya consume el
 * resto de la app (Comenzar Turno, el banner de estado, etc.) — por
 * eso cada pestaña llama a recargar() del contexto después de un
 * cambio, en vez de mantener su propio estado: así el resto de la
 * app ve los cambios sin recargar la página.
 */
export default function EdicionDatos() {
  return (
    <AppShell title="Edición de Datos" description="Catálogos generales de la planta, editables desde acá">
      <Tabs defaultValue="sabores">
        <TabsList>
          <TabsTrigger value="sabores">Sabores</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="presentaciones">Presentaciones</TabsTrigger>
          <TabsTrigger value="velocidades">Velocidades</TabsTrigger>
          <TabsTrigger value="lineas">Líneas</TabsTrigger>
        </TabsList>

        <TabsContent value="sabores">
          <SaboresTab />
        </TabsContent>
        <TabsContent value="personal">
          <PersonalPanel />
        </TabsContent>
        <TabsContent value="presentaciones">
          <PresentacionesTab />
        </TabsContent>
        <TabsContent value="velocidades">
          <VelocidadesTab />
        </TabsContent>
        <TabsContent value="lineas">
          <LineasTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}

function SaboresTab() {
  const [familias, setFamilias] = useState<Familia[]>([])
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [cargando, setCargando] = useState(true)

  async function recargar() {
    const [f, s] = await Promise.all([listarFamilias(), listarSabores()])
    setFamilias(f)
    setSabores(s)
    setCargando(false)
  }

  useEffect(() => {
    recargar()
  }, [])

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {familias.map((familia) => (
        <FamiliaCard
          key={familia.id}
          familia={familia}
          sabores={sabores.filter((s) => s.familiaId === familia.id)}
          onCambio={recargar}
        />
      ))}
    </div>
  )
}

function FamiliaCard({
  familia,
  sabores,
  onCambio,
}: {
  familia: Familia
  sabores: Sabor[]
  onCambio: () => void
}) {
  const [agregando, setAgregando] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{familia.nombre}</CardTitle>
        <CardDescription>
          {sabores.length} sabor{sabores.length === 1 ? "" : "es"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sabores.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Sabor</th>
                  <th className="py-1.5 pr-3 font-medium">Volumen</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sabores.map((sabor) => (
                  <FilaSabor key={sabor.id} sabor={sabor} onCambio={onCambio} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {agregando ? (
          <FormularioNuevoSabor
            familiaId={familia.id}
            onCancelar={() => setAgregando(false)}
            onAgregado={() => {
              setAgregando(false)
              onCambio()
            }}
          />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAgregando(true)}>
            <Plus className="size-3.5" />
            Agregar sabor
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function FilaSabor({ sabor, onCambio }: { sabor: Sabor; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(sabor.nombre)
  const [volumen, setVolumen] = useState(sabor.volumen?.toString() ?? "")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function cancelar() {
    setEditando(false)
    setNombre(sabor.nombre)
    setVolumen(sabor.volumen?.toString() ?? "")
    setError(null)
  }

  async function guardar() {
    if (!nombre.trim()) return
    setEnviando(true)
    setError(null)
    const resultado = await editarSabor({
      id: sabor.id,
      nombre: nombre.trim(),
      volumen: volumen.trim() === "" ? null : Number(volumen),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setEditando(false)
    onCambio()
  }

  async function toggleActivo() {
    setEnviando(true)
    if (sabor.activo) {
      await desactivarSabor(sabor.id)
    } else {
      await reactivarSabor(sabor.id)
    }
    setEnviando(false)
    onCambio()
  }

  if (editando) {
    return (
      <tr className="border-b border-border/50 last:border-0">
        <td className="py-1.5 pr-3">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-7" />
        </td>
        <td className="py-1.5 pr-3">
          <Input
            type="number"
            value={volumen}
            onChange={(e) => setVolumen(e.target.value)}
            className="h-7 w-28"
            placeholder="ej. 2710"
          />
        </td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={guardar} disabled={enviando || !nombre.trim()}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={cancelar} disabled={enviando}>
              <X className="size-3.5" />
            </Button>
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className={cn("py-1.5 pr-3", !sabor.activo && "text-muted-foreground line-through")}>{sabor.nombre}</td>
      <td className={cn("py-1.5 pr-3", !sabor.activo && "text-muted-foreground")}>{sabor.volumen ?? "—"}</td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-1.5">
          {!sabor.activo && <Badge variant="outline">Inactivo</Badge>}
          {sabor.activo ? (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setEditando(true)} aria-label="Editar">
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Desactivar">
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Reactivar">
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function FormularioNuevoSabor({
  familiaId,
  onCancelar,
  onAgregado,
}: {
  familiaId: string
  onCancelar: () => void
  onAgregado: () => void
}) {
  const [nombre, setNombre] = useState("")
  const [volumen, setVolumen] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function agregar() {
    if (!nombre.trim()) return
    setEnviando(true)
    setError(null)
    const resultado = await crearSabor({
      familiaId,
      nombre: nombre.trim(),
      volumen: volumen.trim() === "" ? null : Number(volumen),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onAgregado()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Nombre del sabor"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="h-8 min-w-40 flex-1"
        />
        <Input
          type="number"
          placeholder="Volumen (opcional)"
          value={volumen}
          onChange={(e) => setVolumen(e.target.value)}
          className="h-8 w-40"
        />
        <Button size="sm" onClick={agregar} disabled={enviando || !nombre.trim()}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Agregar
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function PresentacionesTab() {
  const { presentaciones, cargando, recargar } = useCatalogosLive()
  const [agregando, setAgregando] = useState(false)

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Presentaciones</CardTitle>
        <CardDescription>Tamaño de envase y su empaque tabulado.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Volumen</th>
                <th className="py-1.5 pr-3 font-medium">Cajas x Camada</th>
                <th className="py-1.5 pr-3 font-medium">Cant. Camada</th>
                <th className="py-1.5 pr-3 font-medium">Cajas x Paleta</th>
                <th className="py-1.5 pr-3 font-medium">Litros x Caja</th>
                <th className="py-1.5 pr-3 font-medium">Envases x Caja</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {presentaciones.map((p) => (
                <FilaPresentacion key={p.id} presentacion={p} onCambio={recargar} />
              ))}
            </tbody>
          </table>
        </div>

        {agregando ? (
          <FormularioNuevaPresentacion
            onCancelar={() => setAgregando(false)}
            onAgregado={() => {
              setAgregando(false)
              recargar()
            }}
          />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAgregando(true)}>
            <Plus className="size-3.5" />
            Agregar presentación
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function FilaPresentacion({ presentacion, onCambio }: { presentacion: PresentacionLive; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [cajasXCamada, setCajasXCamada] = useState(String(presentacion.cajasXCamada))
  const [cantCamada, setCantCamada] = useState(String(presentacion.cantCamada))
  const [cajasXPaleta, setCajasXPaleta] = useState(String(presentacion.cajasXPaleta))
  const [litrosXCaja, setLitrosXCaja] = useState(String(presentacion.litrosXCaja))
  const [envasesXCaja, setEnvasesXCaja] = useState(String(presentacion.envasesXCaja))
  const [enviando, setEnviando] = useState(false)

  function cancelar() {
    setEditando(false)
    setCajasXCamada(String(presentacion.cajasXCamada))
    setCantCamada(String(presentacion.cantCamada))
    setCajasXPaleta(String(presentacion.cajasXPaleta))
    setLitrosXCaja(String(presentacion.litrosXCaja))
    setEnvasesXCaja(String(presentacion.envasesXCaja))
  }

  async function guardar() {
    setEnviando(true)
    const ok = await editarPresentacion({
      id: presentacion.id,
      cajasXCamada: Number(cajasXCamada),
      cantCamada: Number(cantCamada),
      cajasXPaleta: Number(cajasXPaleta),
      litrosXCaja: Number(litrosXCaja),
      envasesXCaja: Number(envasesXCaja),
    })
    setEnviando(false)
    if (!ok) return
    setEditando(false)
    onCambio()
  }

  async function toggleActivo() {
    setEnviando(true)
    if (presentacion.activo) await desactivarPresentacion(presentacion.id)
    else await reactivarPresentacion(presentacion.id)
    setEnviando(false)
    onCambio()
  }

  if (editando) {
    return (
      <tr className="border-b border-border/50 last:border-0">
        <td className="py-1.5 pr-3 text-muted-foreground">{presentacion.nombre}</td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={cajasXCamada} onChange={(e) => setCajasXCamada(e.target.value)} className="h-7 w-20" />
        </td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={cantCamada} onChange={(e) => setCantCamada(e.target.value)} className="h-7 w-20" />
        </td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={cajasXPaleta} onChange={(e) => setCajasXPaleta(e.target.value)} className="h-7 w-20" />
        </td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={litrosXCaja} onChange={(e) => setLitrosXCaja(e.target.value)} className="h-7 w-20" />
        </td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={envasesXCaja} onChange={(e) => setEnvasesXCaja(e.target.value)} className="h-7 w-20" />
        </td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={guardar} disabled={enviando}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={cancelar} disabled={enviando}>
              <X className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className={cn("py-1.5 pr-3 font-medium", !presentacion.activo && "text-muted-foreground line-through")}>
        {presentacion.nombre}
      </td>
      <td className="py-1.5 pr-3 text-muted-foreground">{presentacion.cajasXCamada}</td>
      <td className="py-1.5 pr-3 text-muted-foreground">{presentacion.cantCamada}</td>
      <td className="py-1.5 pr-3 text-muted-foreground">{presentacion.cajasXPaleta}</td>
      <td className="py-1.5 pr-3 text-muted-foreground">{presentacion.litrosXCaja}</td>
      <td className="py-1.5 pr-3 text-muted-foreground">{presentacion.envasesXCaja}</td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-1.5">
          {!presentacion.activo && <Badge variant="outline">Inactivo</Badge>}
          {presentacion.activo ? (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setEditando(true)} aria-label="Editar">
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Desactivar">
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Reactivar">
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function FormularioNuevaPresentacion({ onCancelar, onAgregado }: { onCancelar: () => void; onAgregado: () => void }) {
  const [volumenMl, setVolumenMl] = useState("")
  const [cajasXCamada, setCajasXCamada] = useState("")
  const [cantCamada, setCantCamada] = useState("")
  const [cajasXPaleta, setCajasXPaleta] = useState("")
  const [litrosXCaja, setLitrosXCaja] = useState("")
  const [envasesXCaja, setEnvasesXCaja] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const valido = [volumenMl, cajasXCamada, cantCamada, cajasXPaleta, litrosXCaja, envasesXCaja].every((v) => v.trim() !== "")

  async function agregar() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await crearPresentacion({
      volumenMl: Number(volumenMl),
      cajasXCamada: Number(cajasXCamada),
      cantCamada: Number(cantCamada),
      cajasXPaleta: Number(cajasXPaleta),
      litrosXCaja: Number(litrosXCaja),
      envasesXCaja: Number(envasesXCaja),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onAgregado()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Input type="number" placeholder="Volumen (ml)" value={volumenMl} onChange={(e) => setVolumenMl(e.target.value)} className="h-8" />
        <Input
          type="number"
          placeholder="Cajas x camada"
          value={cajasXCamada}
          onChange={(e) => setCajasXCamada(e.target.value)}
          className="h-8"
        />
        <Input type="number" placeholder="Cant. camada" value={cantCamada} onChange={(e) => setCantCamada(e.target.value)} className="h-8" />
        <Input
          type="number"
          placeholder="Cajas x paleta"
          value={cajasXPaleta}
          onChange={(e) => setCajasXPaleta(e.target.value)}
          className="h-8"
        />
        <Input type="number" placeholder="Litros x caja" value={litrosXCaja} onChange={(e) => setLitrosXCaja(e.target.value)} className="h-8" />
        <Input
          type="number"
          placeholder="Envases x caja"
          value={envasesXCaja}
          onChange={(e) => setEnvasesXCaja(e.target.value)}
          className="h-8"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={agregar} disabled={enviando || !valido}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Agregar
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function VelocidadesTab() {
  const { lineas, velocidades, presentaciones, cargando, recargar } = useCatalogosLive()

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {lineas.map((linea) => (
        <LineaVelocidadesCard
          key={linea.id}
          linea={linea}
          velocidades={velocidades.filter((v) => v.linea === linea.codigo)}
          presentaciones={presentaciones}
          onCambio={recargar}
        />
      ))}
    </div>
  )
}

function LineaVelocidadesCard({
  linea,
  velocidades,
  presentaciones,
  onCambio,
}: {
  linea: LineaLive
  velocidades: VelocidadLive[]
  presentaciones: PresentacionLive[]
  onCambio: () => void
}) {
  const [agregando, setAgregando] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{linea.nombre}</CardTitle>
        <CardDescription>
          {velocidades.length} velocidad{velocidades.length === 1 ? "" : "es"} tabulada{velocidades.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {velocidades.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Presentación</th>
                  <th className="py-1.5 pr-3 font-medium">Máquina</th>
                  <th className="py-1.5 pr-3 font-medium">Envases/h</th>
                  <th className="py-1.5 pr-3 font-medium">Litros/h</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {velocidades.map((v) => (
                  <FilaVelocidad key={v.id} velocidad={v} onCambio={onCambio} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {agregando ? (
          <FormularioNuevaVelocidad
            linea={linea.codigo}
            presentaciones={presentaciones}
            onCancelar={() => setAgregando(false)}
            onAgregado={() => {
              setAgregando(false)
              onCambio()
            }}
          />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAgregando(true)}>
            <Plus className="size-3.5" />
            Agregar velocidad
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function FilaVelocidad({ velocidad, onCambio }: { velocidad: VelocidadLive; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [maquina, setMaquina] = useState(velocidad.maquina)
  const [envasesHora, setEnvasesHora] = useState(String(velocidad.envasesHora))
  const [litrosHora, setLitrosHora] = useState(String(velocidad.litrosHora))
  const [enviando, setEnviando] = useState(false)

  function cancelar() {
    setEditando(false)
    setMaquina(velocidad.maquina)
    setEnvasesHora(String(velocidad.envasesHora))
    setLitrosHora(String(velocidad.litrosHora))
  }

  async function guardar() {
    setEnviando(true)
    const ok = await editarVelocidad(velocidad.id, maquina.trim(), Number(envasesHora), Number(litrosHora))
    setEnviando(false)
    if (!ok) return
    setEditando(false)
    onCambio()
  }

  async function toggleActivo() {
    setEnviando(true)
    if (velocidad.activo) await desactivarVelocidad(velocidad.id)
    else await reactivarVelocidad(velocidad.id)
    setEnviando(false)
    onCambio()
  }

  if (editando) {
    return (
      <tr className="border-b border-border/50 last:border-0">
        <td className="py-1.5 pr-3 text-muted-foreground">{velocidad.presentacion} ml</td>
        <td className="py-1.5 pr-3">
          <Input value={maquina} onChange={(e) => setMaquina(e.target.value)} className="h-7 w-24" />
        </td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={envasesHora} onChange={(e) => setEnvasesHora(e.target.value)} className="h-7 w-24" />
        </td>
        <td className="py-1.5 pr-3">
          <Input type="number" value={litrosHora} onChange={(e) => setLitrosHora(e.target.value)} className="h-7 w-24" />
        </td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={guardar} disabled={enviando}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={cancelar} disabled={enviando}>
              <X className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className={cn("py-1.5 pr-3", !velocidad.activo && "text-muted-foreground line-through")}>
        {velocidad.presentacion} ml
      </td>
      <td className={cn("py-1.5 pr-3", !velocidad.activo && "text-muted-foreground")}>{velocidad.maquina}</td>
      <td className={cn("py-1.5 pr-3", !velocidad.activo && "text-muted-foreground")}>{velocidad.envasesHora}</td>
      <td className={cn("py-1.5 pr-3", !velocidad.activo && "text-muted-foreground")}>{velocidad.litrosHora}</td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-1.5">
          {!velocidad.activo && <Badge variant="outline">Inactivo</Badge>}
          {velocidad.activo ? (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setEditando(true)} aria-label="Editar">
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Desactivar">
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Reactivar">
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function FormularioNuevaVelocidad({
  linea,
  presentaciones,
  onCancelar,
  onAgregado,
}: {
  linea: LineaCodigo
  presentaciones: PresentacionLive[]
  onCancelar: () => void
  onAgregado: () => void
}) {
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">("")
  const [maquina, setMaquina] = useState("")
  const [envasesHora, setEnvasesHora] = useState("")
  const [litrosHora, setLitrosHora] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const valido = presentacion !== "" && maquina.trim() !== "" && envasesHora !== "" && litrosHora !== ""

  async function agregar() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await crearVelocidad({
      linea,
      presentacion,
      maquina: maquina.trim(),
      envasesHora: Number(envasesHora),
      litrosHora: Number(litrosHora),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onAgregado()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select value={presentacion} onValueChange={(v) => setPresentacion(v)}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Presentación" />
          </SelectTrigger>
          <SelectContent>
            {presentaciones
              .filter((p) => p.activo)
              .map((p) => (
                <SelectItem key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Input placeholder="Máquina" value={maquina} onChange={(e) => setMaquina(e.target.value)} className="h-8" />
        <Input type="number" placeholder="Envases/h" value={envasesHora} onChange={(e) => setEnvasesHora(e.target.value)} className="h-8" />
        <Input type="number" placeholder="Litros/h" value={litrosHora} onChange={(e) => setLitrosHora(e.target.value)} className="h-8" />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={agregar} disabled={enviando || !valido}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Agregar
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function LineasTab() {
  const { lineas, cargando, recargar } = useCatalogosLive()

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Líneas</CardTitle>
        <CardDescription>
          Las líneas físicas de la planta. El código no se puede cambiar; solo el nombre y si está activa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Código</th>
                <th className="py-1.5 pr-3 font-medium">Nombre</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <FilaLinea key={l.id} linea={l} onCambio={recargar} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function FilaLinea({ linea, onCambio }: { linea: LineaLive; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(linea.nombre)
  const [enviando, setEnviando] = useState(false)

  async function guardar() {
    if (!nombre.trim()) return
    setEnviando(true)
    const ok = await editarLinea(linea.id, nombre.trim())
    setEnviando(false)
    if (!ok) return
    setEditando(false)
    onCambio()
  }

  async function toggleActivo() {
    setEnviando(true)
    if (linea.activo) await desactivarLinea(linea.id)
    else await reactivarLinea(linea.id)
    setEnviando(false)
    onCambio()
  }

  if (editando) {
    return (
      <tr className="border-b border-border/50 last:border-0">
        <td className="py-1.5 pr-3 text-muted-foreground">{linea.codigo}</td>
        <td className="py-1.5 pr-3">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-7" />
        </td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={guardar} disabled={enviando || !nombre.trim()}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setEditando(false)
                setNombre(linea.nombre)
              }}
              disabled={enviando}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-1.5 pr-3 text-muted-foreground">{linea.codigo}</td>
      <td className={cn("py-1.5 pr-3", !linea.activo && "text-muted-foreground line-through")}>{linea.nombre}</td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-1.5">
          {!linea.activo && <Badge variant="outline">Inactiva</Badge>}
          {linea.activo ? (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setEditando(true)} aria-label="Editar">
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Desactivar">
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Reactivar">
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

