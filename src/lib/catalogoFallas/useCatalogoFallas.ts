import { useCallback, useEffect, useState } from "react"
import { leerCatalogoFallas } from "./api"
import { CATALOGO_VACIO, type CatalogoFallas } from "./tipos"

/** El catálogo entero (activos e inactivos); `recargar` después de editar. */
export function useCatalogoFallas() {
  const [catalogo, setCatalogo] = useState<CatalogoFallas>(CATALOGO_VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const r = await leerCatalogoFallas()
    if (r.ok) {
      setCatalogo(r.valor)
      setError(null)
    } else {
      setError(r.error)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { catalogo, cargando, error, recargar }
}
