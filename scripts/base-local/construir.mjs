// ============================================================
// BASE LOCAL DE PRUEBAS (PGlite, Postgres en WASM, sin Docker)
// ============================================================
// Arma una base con TODAS las migraciones del proyecto, en orden de nombre,
// y la guarda en base.tar.gz para correr los ensayos (scripts/ensayo-*.sql)
// con correr.mjs. No toca ninguna base de verdad: todo vive en memoria.
//
// Uso (desde scripts/base-local, la primera vez con npm install):
//   node construir.mjs ../../supabase/migrations
//   node construir.mjs ../../supabase/migrations 20261115890000_robot_tavil_anterior_abierta.sql
// El segundo argumento corta en esa migración (incluida): sirve para armar la
// base SIN la migración que se está escribiendo y aplicarla fresca con
// correr.mjs --migracion.
//
// Lo que Supabase trae hecho y un Postgres suelto no (como en
// scripts/generar-sql-maestro.ps1), armado antes de las migraciones:
//   * roles anon, authenticated, service_role y authenticator (sin login);
//   * pgcrypto en el esquema "extensions" (las claves usan extensions.crypt);
//   * auth.users y auth.uid() (la app no usa Supabase Auth: da null);
//   * cron.schedule / cron.unschedule de mentira (pg_cron no existe acá);
//   * storage.buckets / storage.objects (el bucket de las actas).
//
// check_function_bodies = off, como al restaurar un pg_dump: la migración
// 20261104090000 (corrida_produjo) usa producto_terminado.cajas_retenidas, que
// la 20261037090000 borró. En planta esa columna sigue existiendo; desde cero,
// esa función SQL no se podría crear y la base no se armaría.
// ============================================================
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const carpeta = process.argv[2]
const hasta = process.argv[3] ?? null
if (!carpeta) {
  console.error("Uso: node construir.mjs <carpeta de migraciones> [hasta.sql]")
  process.exit(1)
}

const db = await PGlite.create({ extensions: { pgcrypto } })

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
  end $$;
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
  alter database template1 set search_path = "$user", public, extensions;
  set search_path = "$user", public, extensions;
  set check_function_bodies = off;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $f$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $f$;
  create schema if not exists cron;
  create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
  create or replace function cron.schedule(p_nombre text, p_cuando text, p_comando text) returns bigint
    language sql as $f$ insert into cron.job (jobname, schedule, command) values (p_nombre, p_cuando, p_comando) returning jobid $f$;
  create or replace function cron.unschedule(p_nombre text) returns boolean
    language sql as $f$ delete from cron.job where jobname = p_nombre returning true $f$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`)

const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".sql")).sort()
if (hasta && !archivos.includes(hasta)) {
  console.error(`No existe ${hasta} en ${carpeta}.`)
  process.exit(1)
}
let aplicadas = 0
for (const archivo of archivos) {
  // pg_cron ya está simulado arriba.
  const sql = readFileSync(join(carpeta, archivo), "utf8").replace(/create extension if not exists pg_cron[^;]*;/gi, "select 1;")
  try {
    await db.exec(sql)
    aplicadas++
  } catch (error) {
    console.error(`FALLÓ ${archivo}: ${error.message}`)
    process.exit(1)
  }
  if (hasta && archivo === hasta) break
}
console.log(`Aplicadas ${aplicadas} migraciones.`)

const dump = await db.dumpDataDir("gzip")
writeFileSync(new URL("./base.tar.gz", import.meta.url), Buffer.from(await dump.arrayBuffer()))
console.log("Base guardada en base.tar.gz")
await db.close()
