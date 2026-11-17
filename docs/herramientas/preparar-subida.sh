#!/usr/bin/env bash
# ======================================================================
#  Ayudante para subir cambios al servidor de planta (Natulac Aséptico)
# ======================================================================
#  Uso (en Git Bash):   bash ~/Documents/herramientas-natulac/preparar-subida.sh
#
#  Solo MIRA el proyecto: no cambia ramas, no hace commits, no toca el
#  servidor. Lo que hace:
#   1. Baja de GitHub la información nueva (git fetch).
#   2. Revisa que no haya cambios sin guardar.
#   3. Decide el camino: A (Sincronizar todo) o B (subir solo lo de la rama).
#   4. Camino B: copia los archivos a subir en Documents\para-subir.
#   5. Arma la lista de archivos para borrar en el servidor
#      (Documents\borrar-en-servidor.txt).
#  Está explicado en docs/GUIA-SUBIR-AL-SERVIDOR.docx.
# ======================================================================
set -u

PROY="${PROY:-$HOME/Documents/natulac-aseptico}"
SALIDA="${SALIDA:-$HOME/Documents/para-subir}"
BORRAR="${BORRAR:-$HOME/Documents/borrar-en-servidor.txt}"
DIAS_ATRAS="${DIAS_ATRAS:-30}"

linea() { echo "----------------------------------------------------------------"; }
alto() { echo; echo "  >>> ALTO: $1"; echo; exit 1; }

cd "$PROY" 2>/dev/null || alto "no encuentro la carpeta del proyecto ($PROY)."
git rev-parse --git-dir >/dev/null 2>&1 || alto "$PROY no es la carpeta del proyecto."

linea
echo " PREPARAR LA SUBIDA AL SERVIDOR"
linea

echo "1) Bajando novedades de GitHub..."
git fetch origin --quiet || alto "no pude conectar con GitHub. Revisa el internet e intenta de nuevo."
echo "   Listo."

RAMA=$(git branch --show-current)
[ -n "$RAMA" ] || alto "no estás en ninguna rama. Pide ayuda."
echo "2) Estás en la rama:  $RAMA"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo
  echo "   Hay archivos cambiados que NO están guardados (sin commit):"
  git status --short --untracked-files=no | sed 's/^/      /'
  alto "primero hay que guardarlos (commit) o descartarlos. Pide ayuda."
fi
echo "   No hay cambios sin guardar. Bien."

if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  FALTAN_MIOS=$(git rev-list --count 'HEAD..@{u}')
  if [ "$FALTAN_MIOS" -gt 0 ]; then
    alto "tu copia de '$RAMA' está atrasada respecto a GitHub ($FALTAN_MIOS cambios). Escribe:  git pull   y vuelve a correr este ayudante."
  fi
fi

DETRAS=$(git rev-list --count HEAD..origin/main)
BASE=$(git merge-base origin/main HEAD)

: > "$BORRAR"
echo
if [ "$DETRAS" -eq 0 ]; then
  linea
  echo " RESULTADO:  CAMINO A  (Sincronizar la carpeta completa)"
  linea
  echo "  Tu rama tiene todo lo que hay en main. En WinSCP usa"
  echo "  «Sincronizar» con la carpeta natulac-aseptico completa (Paso 4, Camino A)."
  [ -d "$SALIDA" ] && [ "$(basename "$SALIDA")" = "para-subir" ] && rm -rf "$SALIDA"
  # Archivos de la app (src, public, plc-bridge) borrados en git en los últimos
  # días que ya no existen en la PC. Si quedan en el servidor pueden romper la app.
  git -c core.quotePath=false log --no-renames --since="$DIAS_ATRAS days ago" --diff-filter=D --name-only --format= HEAD -- src public plc-bridge \
    | sort -u | while IFS= read -r f; do
        [ -n "$f" ] && [ ! -e "$f" ] && printf "rm -f '%s'\n" "$f" >> "$BORRAR"
      done
  NOTA_MIG="En el servidor vas a revisar si falta alguna migración (Paso 7)."
else
  if [ "$(git rev-parse HEAD)" = "$BASE" ]; then
    alto "tu rama no tiene nada nuevo y está atrasada respecto a main. Probablemente quieres subir main:  git switch main  y luego  git pull"
  fi
  linea
  echo " RESULTADO:  CAMINO B  (subir solo lo que cambió esta rama)"
  linea
  echo "  Tu rama NO tiene $DETRAS cambio(s) que ya están en main."
  echo "  NO sincronices la carpeta completa: borrarías cosas que ya funcionan."
  [ "$(basename "$SALIDA")" = "para-subir" ] || alto "carpeta de salida inesperada: $SALIDA"
  rm -rf "$SALIDA"; mkdir -p "$SALIDA"
  N=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    mkdir -p "$SALIDA/$(dirname "$f")"
    cp "$f" "$SALIDA/$f" && N=$((N + 1))
  done < <(git -c core.quotePath=false diff --no-renames --name-only --diff-filter=ACM "$BASE" HEAD)
  git -c core.quotePath=false diff --no-renames --name-only --diff-filter=D "$BASE" HEAD | while IFS= read -r f; do
    [ -n "$f" ] && printf "rm -f '%s'\n" "$f" >> "$BORRAR"
  done
  echo
  echo "  Copié $N archivo(s) en:  Documents\\para-subir"
  echo "  En WinSCP arrastra TODO lo que hay dentro de esa carpeta (Paso 4, Camino B)."
  MIG=$(git diff --no-renames --name-only --diff-filter=A "$BASE" HEAD -- supabase/migrations)
  if [ -n "$MIG" ]; then
    NOTA_MIG="Esta subida TRAE migraciones nuevas (en este orden):"$'\n'"$(echo "$MIG" | sed 's|^|      |')"
  else
    NOTA_MIG="Esta subida no trae migraciones nuevas. Igual se revisa en el Paso 7."
  fi
  echo
  echo "  OJO: si después subes desde main SIN haber unido esta rama a main,"
  echo "  lo de esta rama desaparece del servidor."
fi

echo
linea
echo " ARCHIVOS PARA BORRAR EN EL SERVIDOR (Paso 6)"
linea
if [ -s "$BORRAR" ]; then
  echo "  Copia estas líneas y pégalas en el servidor (también quedaron en"
  echo "  Documents\\borrar-en-servidor.txt):"
  echo
  sed 's/^/    /' "$BORRAR"
else
  echo "  Ninguno. Te saltas el Paso 6."
  rm -f "$BORRAR"
fi

echo
linea
echo " MIGRACIONES"
linea
echo "  $NOTA_MIG"

UNTR=$(git ls-files --others --exclude-standard | grep -v -E '^(docs/|scripts/base-local/)' | head -10)
if [ "$DETRAS" -eq 0 ] && [ -n "$UNTR" ]; then
  echo
  echo "  Aviso: estos archivos no están en git y «Sincronizar» también los subiría:"
  echo "$UNTR" | sed 's/^/      /'
fi

echo
linea
echo " Listo. Sigue con el Paso 4 de la guía."
linea
