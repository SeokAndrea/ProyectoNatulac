import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"
import { supabase } from "@/lib/supabase"

export interface Session {
  username: string
  nombre: string
  /** null = todas las áreas (solo aplica a SuperAdministrador). */
  area: AreaCodigo | null
  rol: RolCodigo
}

interface AuthContextValue {
  session: Session | null
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
}

const STORAGE_KEY = "natulac.session"

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Session
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [session])

  /*
   * Login contra la tabla "usuarios" de Supabase (NO Supabase Auth,
   * por decisión explícita). La verificación de la contraseña pasa
   * entera adentro de la función verificar_login() en Postgres — acá
   * nunca se ve el hash, solo el resultado. Ver
   * supabase/migrations/20260822090000_usuarios_tabla_propia.sql.
   *
   * Lo que queda en localStorage (STORAGE_KEY de arriba) es la
   * SESIÓN ya autenticada, para no tener que loguearse de nuevo en
   * cada refresh — no es donde vive la contraseña.
   */
  async function login(username: string, password: string) {
    if (!username.trim() || !password.trim()) {
      return { ok: false as const, error: "Ingresa tu usuario y contraseña." }
    }

    const { data, error } = await supabase.rpc("verificar_login", {
      p_usuario: username.trim(),
      p_password: password,
    })

    if (error) {
      return { ok: false as const, error: "No se pudo validar el usuario. Intenta de nuevo." }
    }
    const perfil = data?.[0]
    if (!perfil) {
      return { ok: false as const, error: "Usuario o contraseña incorrectos." }
    }

    setSession({
      username: perfil.usuario,
      nombre: perfil.nombre ?? perfil.usuario,
      area: perfil.area_codigo as AreaCodigo | null,
      rol: perfil.rol_codigo as RolCodigo,
    })
    return { ok: true as const }
  }

  function logout() {
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider")
  return ctx
}
