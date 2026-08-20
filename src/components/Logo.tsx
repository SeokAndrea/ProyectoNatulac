import { cn } from "@/lib/utils"

/*
 * Ícono de marca. Apunta a public/IconoNatulac.png, que hoy es un
 * placeholder generado (cuadrado azul) — para poner el ícono real,
 * simplemente reemplazá ese archivo por el logo definitivo con el
 * MISMO nombre (public/IconoNatulac.png). No hace falta tocar
 * código: ni acá ni en index.html (que usa el mismo archivo como
 * favicon de la pestaña).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/IconoNatulac.png"
      alt="Natulac"
      className={cn("size-8 rounded-lg object-cover", className)}
    />
  )
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Natulac<span className="text-primary">.</span>
      </span>
    </div>
  )
}
