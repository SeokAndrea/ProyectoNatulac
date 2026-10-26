import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { guardarCorreosMantenimiento, obtenerCorreosMantenimiento, obtenerEstadoCorreos, type EstadoCorreos } from "@/lib/correoMantenimiento"
import { diaMesPlanta, horaPlanta } from "@/lib/tiempoPlanta"

/*
 * A quién le llegan los avisos de Solicitudes de Inspección / Intervención
 * (Mantenimiento). Solo el dueño. La cuenta que manda sigue en .env.local del
 * servidor (SMTP_*): acá solo los destinatarios y cómo va la cola.
 */
export function CorreoMantenimiento({ usuario }: { usuario: string }) {
  const [guardado, setGuardado] = useState<string | null>(null)
  const [correos, setCorreos] = useState("")
  const [estado, setEstado] = useState<EstadoCorreos | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    obtenerCorreosMantenimiento().then((c) => {
      setGuardado(c)
      setCorreos(c)
    })
    obtenerEstadoCorreos(usuario).then(setEstado)
  }, [usuario])

  async function guardar() {
    setGuardando(true)
    setMensaje(null)
    const r = await guardarCorreosMantenimiento(usuario, correos)
    if (!r.ok) {
      setGuardando(false)
      return setMensaje({ ok: false, texto: r.error })
    }
    // La base los deja ordenados (minúscula, sin repetir): se muestran así.
    const c = await obtenerCorreosMantenimiento()
    setGuardando(false)
    setGuardado(c)
    setCorreos(c)
    setMensaje({ ok: true, texto: c ? "Correos guardados. Los próximos avisos llegan a esta lista." : "Lista vacía: se usa la del servidor (.env.local), si tiene." })
  }

  const cambiado = correos.trim() !== (guardado ?? "")
  const ultimo = estado?.ultimoEnviadoEn ? new Date(estado.ultimoEnviadoEn) : null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">Correo de Mantenimiento (Solicitudes de Inspección / Intervención)</span>
      <p className="text-xs text-muted-foreground">A quién le llega el aviso de cada solicitud nueva y de cada subida a Intervención. Separados por coma.</p>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Correos de Mantenimiento"
          placeholder="mantenimiento@natulac.com, jefe.mtto@natulac.com"
          value={correos}
          onChange={(e) => setCorreos(e.target.value)}
          className="h-9 min-w-0 flex-1 basis-72"
        />
        <Button size="sm" className="h-9" onClick={guardar} disabled={!cambiado || guardando}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar
        </Button>
      </div>
      {mensaje && (
        <p className={`text-xs ${mensaje.ok ? "text-success-foreground" : "text-destructive"}`} role={mensaje.ok ? "status" : "alert"}>
          {mensaje.texto}
        </p>
      )}
      {estado && (
        <p className="text-xs text-muted-foreground">
          {ultimo ? `Último enviado: ${diaMesPlanta(ultimo)} ${horaPlanta(ultimo)}.` : "Todavía no salió ningún correo."}
          {estado.esperando > 0 && ` ${estado.esperando} esperando para salir.`}
          {estado.fallidos > 0 && ` ${estado.fallidos} no salieron después de 5 intentos.`}
          {estado.vencidos > 0 && ` ${estado.vencidos} no se mandaron por tener más de 24 h.`}
        </p>
      )}
      {estado?.ultimoError && (
        <p className="text-xs text-destructive" role="alert">
          Último error del servidor de correo: {estado.ultimoError}
        </p>
      )}
    </div>
  )
}
