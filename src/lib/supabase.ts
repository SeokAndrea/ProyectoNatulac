import { createClient } from "@supabase/supabase-js"

/*
 * Cliente de Supabase para el frontend. Usa la clave "anon" (pública),
 * que es segura de exponer en el navegador siempre que la base de
 * datos tenga Row Level Security (RLS) activada en cada tabla — es
 * RLS, no esta clave, lo que controla qué puede leer/escribir cada
 * usuario según su rol y área.
 *
 * Las variables se leen de .env.local (copiar desde .env.example y
 * completar con los datos del proyecto). Vite solo expone al
 * navegador las variables que empiezan con VITE_.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y complétalas.",
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
