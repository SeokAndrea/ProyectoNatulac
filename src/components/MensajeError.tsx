/** Error de la última acción de un panel (tarjetas de línea y de tanque). No pinta nada si no hay error. */
export function MensajeError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="text-xs text-destructive" role="alert">
      {error}
    </p>
  )
}
