import { useEffect, useState } from "react"
import { Loader2, UserPlus } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AREAS, ROLES, nombrePorCodigo, type AreaCodigo, type RolCodigo } from "@/lib/catalogos"
import { agregarPersonal, listarPersonal, type PersonalRegistrado } from "@/lib/personal"

/*
 * Alta de personal: nombre, cédula, usuario, contraseña, área y rol.
 * Queda guardado en la tabla "usuarios" de Supabase (no en Supabase
 * Auth, ni en el navegador) — ver src/lib/personal.ts y
 * supabase/migrations/20260822090000_usuarios_tabla_propia.sql.
 *
 * La cédula se pide de una porque más adelante el acta de fin de
 * turno va a tener un botón para generar un PDF que la persona
 * firma, y ese documento necesita el número de cédula.
 */
export default function AnadirPersonal() {
  const [personal, setPersonal] = useState<PersonalRegistrado[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    listarPersonal().then((lista) => {
      setPersonal(lista)
      setCargando(false)
    })
  }, [])

  return (
    <AppShell title="Añadir Personal" description="Alta de usuarios, área y rol">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <FormularioPersonal onAgregado={(nuevo) => setPersonal((actual) => [nuevo, ...actual])} />

        {!cargando && personal.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal registrado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {personal.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      @{p.usuario}
                      {p.cedula ? ` · C.C. ${p.cedula}` : ""}
                    </p>
                  </div>
                  <span className="text-muted-foreground">
                    {p.area ? nombrePorCodigo(AREAS, p.area) : "Todas las áreas"} · {nombrePorCodigo(ROLES, p.rol)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

function FormularioPersonal({ onAgregado }: { onAgregado: (nuevo: PersonalRegistrado) => void }) {
  const [nombre, setNombre] = useState("")
  const [cedula, setCedula] = useState("")
  const [usuario, setUsuario] = useState("")
  const [password, setPassword] = useState("")
  const [area, setArea] = useState<AreaCodigo | "">("")
  const [rol, setRol] = useState<RolCodigo | "">("")
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const formularioValido =
    nombre.trim() !== "" &&
    cedula.trim() !== "" &&
    usuario.trim() !== "" &&
    password.trim() !== "" &&
    area !== "" &&
    rol !== ""

  async function handleSubmit() {
    if (!formularioValido) return
    setExito(false)
    setError(null)
    setEnviando(true)

    const resultado = await agregarPersonal({
      nombre: nombre.trim(),
      cedula: cedula.trim(),
      usuario: usuario.trim(),
      password,
      area,
      rol,
    })

    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    onAgregado(resultado.personal)
    setExito(true)
    setNombre("")
    setCedula("")
    setUsuario("")
    setPassword("")
    setArea("")
    setRol("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo integrante</CardTitle>
        <CardDescription>Va a poder iniciar sesión con este usuario y contraseña.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            placeholder="ej. Daniela Gómez"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value)
              setExito(false)
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cedula">Cédula</Label>
          <Input
            id="cedula"
            placeholder="ej. 1002345678"
            value={cedula}
            onChange={(e) => {
              setCedula(e.target.value)
              setExito(false)
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="usuario">Nombre de usuario</Label>
          <Input
            id="usuario"
            placeholder="ej. dgomez"
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value)
              setExito(false)
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setExito(false)
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Área</Label>
          <Select value={area} onValueChange={(v) => setArea(v as AreaCodigo)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un área" />
            </SelectTrigger>
            <SelectContent>
              {AREAS.map((a) => (
                <SelectItem key={a.codigo} value={a.codigo}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Rol</Label>
          <Select value={rol} onValueChange={(v) => setRol(v as RolCodigo)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un rol" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.codigo} value={r.codigo}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {exito && <p className="text-sm text-secondary-foreground">Se agregó correctamente.</p>}

        <Button className="mt-2 w-full" disabled={!formularioValido || enviando} onClick={handleSubmit}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Agregar
        </Button>
      </CardContent>
    </Card>
  )
}
