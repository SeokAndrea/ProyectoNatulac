/** Error de una acción de la tarjeta de línea. No pinta nada si no hay error. */
export function MensajeError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="text-xs text-destructive" role="alert">
      {error}
    </p>
  )
}
