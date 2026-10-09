import { useEffect, useState } from "react"
import { horaPlanta } from "@/lib/tiempoPlanta"

/** Hora de planta con segundos. Lleva su propio intervalo para que el Panel completo no se redibuje cada segundo. */
export function RelojPlanta() {
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const [hh, mm, ss] = horaPlanta(ahora).split(":")
  return (
    <p className="num flex items-baseline justify-center gap-1 text-4xl font-bold leading-none tracking-tight text-foreground">
      {hh}
      <span className="alert-pulse text-muted-foreground">:</span>
      {mm}
      <span className="text-lg font-semibold text-muted-foreground">:{ss}</span>
    </p>
  )
}
