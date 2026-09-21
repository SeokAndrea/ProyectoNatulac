import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Cada cuánto se revisa si hay una versión nueva (además de al volver a la pestaña). */
const INTERVALO_MS = 5 * 60 * 1000

/**
 * Avisa cuando el JS que tiene cargado el navegador quedó viejo — ver
 * vite.config.ts: cada build escribe su version (hash corto del commit)
 * adentro del bundle (__APP_VERSION__) y también aparte en
 * /version.json. Si alguien dejó una pestaña abierta desde ANTES de un
 * deploy, su __APP_VERSION__ es la del build viejo aunque el servidor
 * ya sirva uno nuevo — comparando contra /version.json (con
 * cache-busting, nunca cacheado) se nota la diferencia sin que la
 * persona tenga que darse cuenta sola. Esto es probablemente lo que le
 * pasó a Deivis con Contador 2 (ver migración 20261047090000).
 */
export function VersionChecker() {
  const [hayVersionNueva, setHayVersionNueva] = useState(false)

  useEffect(() => {
    let vivo = true

    async function revisar() {
      try {
        const resp = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
        if (!resp.ok) return
        const { version } = (await resp.json()) as { version?: string }
        if (vivo && version && version !== __APP_VERSION__) setHayVersionNueva(true)
      } catch {
        // Sin internet, o /version.json no existe (ej. en npm run dev) — no hay nada que avisar.
      }
    }

    revisar()
    const intervalo = setInterval(revisar, INTERVALO_MS)
    function alVolverALaPestana() {
      if (document.visibilityState === "visible") revisar()
    }
    document.addEventListener("visibilitychange", alVolverALaPestana)

    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener("visibilitychange", alVolverALaPestana)
    }
  }, [])

  if (!hayVersionNueva) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-warning/40 bg-warning-soft px-4 py-2.5 text-sm text-warning shadow-lg">
      <span className="font-medium">Tienes la app desactualizada — actualízala para evitar errores.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="size-3.5" />
        Actualizar ahora
      </Button>
    </div>
  )
}
