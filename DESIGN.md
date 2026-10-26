---
name: Producción Natulac
description: El tablero de turno de la planta Aséptico, hecho para cargar rápido en el teléfono y ver la planta en vivo.
colors:
  tinta-pizarra: "oklch(0.208 0.042 265.755)"
  piso-gris-azulado: "oklch(0.958 0.005 247.858)"
  superficie-clara: "oklch(0.988 0.002 247.858)"
  tarjeta-blanca: "oklch(1 0 0)"
  texto-noche: "oklch(0.129 0.042 264.695)"
  texto-apagado: "oklch(0.34 0.035 257.4)"
  borde-niebla: "oklch(0.88 0.016 255.5)"
  relleno-niebla: "oklch(0.968 0.007 247.896)"
  verde-en-marcha: "oklch(0.63 0.16 156)"
  verde-en-marcha-texto: "oklch(0.38 0.11 156)"
  verde-en-marcha-suave: "oklch(0.94 0.05 156)"
  ambar-atencion: "oklch(0.76 0.15 74)"
  ambar-atencion-texto: "oklch(0.4 0.1 66)"
  ambar-atencion-suave: "oklch(0.95 0.06 84)"
  rojo-falla: "oklch(0.56 0.21 22)"
  rojo-falla-texto: "oklch(0.42 0.17 24)"
  rojo-falla-suave: "oklch(0.94 0.05 22)"
  rojo-destructivo: "oklch(0.54 0.23 27.3)"
  azul-dato: "oklch(0.55 0.16 245)"
  azul-dato-texto: "oklch(0.46 0.15 245)"
  azul-dato-suave: "oklch(0.94 0.04 245)"
  violeta-vacio: "oklch(0.45 0.13 268)"
  violeta-vacio-suave: "oklch(0.94 0.03 268)"
  sabor-naranja: "oklch(0.72 0.18 55)"
  sabor-amarillo: "oklch(0.84 0.16 92)"
  sabor-rojo: "oklch(0.58 0.22 26)"
  sabor-verde: "oklch(0.68 0.16 148)"
  sabor-lima: "oklch(0.8 0.17 125)"
  sabor-ambar: "oklch(0.77 0.17 70)"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.025em"
  number:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
rounded:
  sm: "2.4px"
  md: "3.2px"
  lg: "4px"
  xl: "5.6px"
  2xl: "7.2px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.tinta-pizarra}"
    textColor: "{colors.superficie-clara}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.piso-gris-azulado}"
    textColor: "{colors.texto-noche}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    backgroundColor: "{colors.rojo-falla-suave}"
    textColor: "{colors.rojo-destructivo}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.tarjeta-blanca}"
    textColor: "{colors.texto-noche}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  badge-atencion:
    backgroundColor: "{colors.ambar-atencion-suave}"
    textColor: "{colors.ambar-atencion-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    height: "20px"
  badge-falla:
    backgroundColor: "{colors.rojo-falla-suave}"
    textColor: "{colors.rojo-falla-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    height: "20px"
  badge-en-marcha:
    backgroundColor: "{colors.verde-en-marcha-suave}"
    textColor: "{colors.verde-en-marcha-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    height: "20px"
  card:
    backgroundColor: "{colors.tarjeta-blanca}"
    textColor: "{colors.texto-noche}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Producción Natulac

## Overview

**Creative North Star: "El tablero de turno"**

La app es el tablero que el supervisor lleva en el bolsillo durante el turno: práctico, directo y hecho para usarse con apuro en el piso de planta. El objetivo es llevar el control, pero cargar ya tiene fama de tedioso, así que cada pantalla se juzga por lo poco que pide. La base es sobria: fondo gris azulado claro, tarjetas blancas que se despegan de él, tinta azul pizarra casi negra y una sola familia de letra. El color no decora: dice el estado de algo (en marcha, atención, falla, dato, vacío) o el sabor de un tanque.

La vida viene de la planta misma, no de adornos. Los tanques muestran el líquido con su ola y burbujas, la cinta transportadora corre en el Panel de Paradas y el punto de una línea activa late. Los números van siempre en letra monoespaciada, alineados como en una planilla. Los paneles en vivo se miran de lejos en una TV, y las pantallas de carga se usan con apuro en un teléfono chico. Las dos cosas mandan sobre cualquier gusto.

La dirección está confirmada: el aspecto actual se conserva. Cada cambio visual es un refinamiento que le quita a la app lo que tenga de plantilla genérica, sin cambiar su identidad.

**Key Characteristics:**
- Base sobria de grises azulados con tinta pizarra; color solo para estado y sabor.
- Esquinas casi rectas (base 4 px) y etiquetas sin forma de píldora: aire de tablero industrial, no de plantilla.
- Números en JetBrains Mono tabular, texto en IBM Plex Sans.
- Planos con un filo de 1 px; la sombra se reserva para los paneles en vivo.
- Movimiento que imita la planta (líquido, cinta, pulso), nunca adorno.
- Pensada primero para el teléfono a 400 px y para la TV de planta.
- Modo claro y oscuro con los mismos papeles de color.

## Colors

Grises azulados fríos con una tinta pizarra profunda; los colores fuertes son señales de estado y de sabor, no de marca.

### Primary
- **Tinta pizarra** (tinta-pizarra): el botón principal, la navegación activa y el texto fuerte sobre fondos claros. En modo oscuro se invierte a un gris niebla claro (oklch(0.929 0.013 255.508)).

### Neutral
- **Piso gris azulado** (piso-gris-azulado): el fondo de todas las pantallas.
- **Superficie clara** (superficie-clara): el encabezado y las bandas que se separan apenas del fondo.
- **Tarjeta blanca** (tarjeta-blanca): tarjetas, diálogos y campos.
- **Texto noche** (texto-noche): el texto principal.
- **Texto apagado** (texto-apagado): datos secundarios, ayudas y etiquetas.
- **Borde niebla** (borde-niebla): bordes de campos y separadores.
- **Relleno niebla** (relleno-niebla): fondos de botones secundarios, chips grises y filas en reposo.

### Estados
Cada estado viene en tres tonos: el **fuerte** para puntos, barras y rellenos; el **texto** para todo lo que se lee (también sobre la tarjeta blanca, no solo sobre el suave); y el **suave** para fondos de avisos y etiquetas. El ámbar y el verde fuertes no llegan a 4.5:1 sobre blanco: como letra siempre va su tono texto.
- **Verde en marcha** (verde-en-marcha / -texto / -suave): línea corriendo, hecho, cerrado, dentro de meta.
- **Ámbar atención** (ambar-atencion / -texto / -suave): hay que mirar, sin urgencia (Solicitud de Inspección, merma cerca del límite).
- **Rojo falla** (rojo-falla / -texto / -suave): problema que espera a alguien (Intervención pendiente, merma pasada, parada abierta).
- **Rojo destructivo** (rojo-destructivo): solo para acciones que borran o cierran sin vuelta atrás.
- **Azul dato** (azul-dato / -texto / -suave): información neutra y estados en curso (en reparación, cifras destacadas).
- **Violeta vacío** (violeta-vacio / -suave): producto de Vacío (latas) y el Modo Vacío de Preparación.

### Sabores
Seis tonos para pintar el líquido de los tanques según el sabor: sabor-naranja, sabor-amarillo, sabor-rojo, sabor-verde, sabor-lima y sabor-ambar.

### Named Rules
**The Señal-No-Adorno Rule.** Un color fuerte en pantalla siempre significa un estado o un sabor. Si no comunica nada, va en gris.

**The Tres-Tonos Rule.** Un aviso usa el fondo suave, el texto del mismo estado y, si hace falta, el tono fuerte en el punto o la barra. Como letra va siempre el tono texto, nunca el fuerte, y nunca texto fuerte sobre fondo fuerte.

## Typography

**Display Font:** JetBrains Mono (con ui-monospace), para cifras grandes de paneles
**Body Font:** IBM Plex Sans (con ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono para todo número (utilidad `num`)

**Character:** Una sans técnica y legible para todo el texto, y una mono tabular que hace que códigos, horas y cantidades se lean como en una planilla, alineados columna por columna.

### Hierarchy
- **Display** (700, 2.25rem, 1): cifras grandes de los paneles en vivo (cajas, reloj de planta), en mono y con interlineado cerrado.
- **Headline** (600, 1.875rem, 1.2): el saludo del Hub y los títulos de página grandes.
- **Title** (600, 1.125rem, 1.4): el título de cada pantalla en el encabezado y los títulos de tarjetas importantes.
- **Body** (400, 0.875rem, 1.43): el texto de trabajo de toda la app. Los campos suben a 1rem en el teléfono para que el navegador no haga zoom.
- **Label** (600, 0.75rem, 0.025em, MAYÚSCULAS): títulos de sección y nombres de datos ("ÁREA SOLICITANTE", "ABIERTAS"). Es el tamaño más chico de la app: ningún texto baja de 12 px.
- **Number** (500, mono tabular, -0.02em): códigos (SIF20261025_3, EPTL1-7), horas, cantidades y porcentajes, en cualquier tamaño.

**Todo en rem.** La escala va en rem (nunca tamaños fijos en px), así el ajuste de *Tamaño de letra* (Ajustes: Normal 100 %, Grande 112,5 %, Muy grande 125 % del tamaño base) agranda toda la app de forma pareja. Los paneles para TV usan tamaños fluidos (clamp con rem y vw) que también escalan. Títulos con `text-wrap: balance` y párrafos con `text-wrap: pretty`.

### Named Rules
**The Doce-Mínimo Rule.** Ningún texto de la app baja de 12 px (0.75rem): ni etiquetas, ni datos de paneles, ni notas. Lo secundario se marca con el gris y el peso, no achicando la letra.

**The Número-en-Mono Rule.** Todo número que se compare o se copie a mano va en JetBrains Mono tabular. Texto en Plex, cifras en Mono.

## Layout

En el teléfono (diseño base de 400 px de ancho) todo va en una columna, con márgenes laterales de 16 px y una botonera flotante abajo a la derecha que abre las apps. Desde 1024 px aparece la barra lateral fija de 240 px con las apps agrupadas por sección, y el contenido se centra con un ancho máximo de 72 rem (más angosto en listas, de 42 a 48 rem). El encabezado lleva el título y la descripción de la pantalla, más una banda con el área, el usuario y el estado del turno. El Hub ordena las apps en una grilla de tarjetas (una columna en el teléfono, hasta cuatro en la PC). El ritmo de espaciado sale de una escala de 4 px: 8 a 12 px dentro de un componente, 16 px de relleno de tarjeta y 24 a 32 px entre bloques. Los paneles en vivo usan todo el ancho y filas de métricas alineadas en grilla.

## Elevation & Depth

En modo oscuro las superficies se escalonan a propósito: fondo casi negro azulado (oklch 0.14), barra lateral apenas más clara, tarjetas un escalón arriba (0.235) y rellenos otro más (0.32), con bordes blancos al 20 %. No es el modo claro invertido.

El sistema es plano con filo. Las tarjetas se separan del fondo por el blanco contra el gris y un anillo de 1 px de la tinta al 10 %; no llevan sombra. La profundidad aparece en dos casos: las tarjetas del Hub, con una sombra mínima, y las tarjetas de los paneles en vivo (sombra "panel"), que tienen que destacarse de lejos sobre la grilla técnica del fondo. Los diálogos y menús flotan con la sombra propia de esos componentes.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 0 0 color-mix(in oklab, var(--border) 80%, transparent), 0 12px 28px -18px color-mix(in oklab, var(--foreground) 35%, transparent)`): tarjetas de los paneles en vivo.
- **Mínima** (sombra pequeña de Tailwind): tarjetas de apps del Hub.

### Named Rules
**The Plano-por-Defecto Rule.** Una tarjeta de trabajo es plana con su filo de 1 px. La sombra es para lo que se mira de lejos.

## Shapes

Esquinas casi rectas, a partir de una base de 4 px (dueña, 2026-10-25: las muy redondas daban cara de plantilla): 4 px en botones y campos, unos 6 px en tarjetas y avisos, y 2 a 3 px en etiquetas de estado y selectores segmentados. Nada de píldoras. El círculo completo queda solo para avatares, puntos de estado y el botón flotante del teléfono. Los bordes son de 1 px; un borde de 3 px solo marca el paso actual o ya hecho en una secuencia (los pasos de una solicitud).

## Components

### Buttons
Directos y sin adorno: un solo botón fuerte por bloque.
- **Shape:** esquinas casi rectas (4 px).
- **Primary:** fondo tinta pizarra y texto claro, 32 px de alto (44 px con el dedo, ver Do's), con ícono a la izquierda cuando ayuda a reconocer la acción.
- **Hover / Focus:** el fondo baja al 80 %; el foco muestra un anillo de 3 px del color de foco a media opacidad; al apretar, baja 1 px.
- **Outline / Ghost:** borde niebla sobre el fondo para acciones secundarias; fantasma sin borde para "Volver a la lista" y acciones de barra.
- **Destructive:** fondo rojo suave y texto rojo destructivo, solo para borrar o cerrar sin vuelta atrás, y siempre con confirmación. Cerrar una Solicitud de Intervención va así a propósito: la entrega real de la línea es el acta impresa y firmada.

### Chips (Badges)
- **Style:** etiqueta de 20 px de alto, esquinas de 2 a 3 px, con texto de 12 px en el tono "texto" del estado sobre su fondo suave (ámbar, rojo, verde, azul, gris).
- **State:** el texto dice el nivel y el estado juntos ("Intervención pendiente", "Inspección"), para que no haga falta otra línea que lo explique.

### Cards / Containers
- **Corner Style:** unos 6 px.
- **Background:** tarjeta blanca sobre el piso gris azulado.
- **Shadow Strategy:** plana con anillo de 1 px (ver Elevation & Depth); sombra solo en paneles.
- **Border:** anillo de 1 px de la tinta al 10 %.
- **Internal Padding:** 16 px.
- **Lista con "Ver":** cada elemento es una tarjeta cerrada con lo esencial y un botón "Ver"; el detalle se abre aparte con "Volver a la lista" (Mis Actas, Solicitudes).

### Inputs / Fields
- **Style:** borde niebla de 1 px, fondo transparente sobre la tarjeta, esquinas de 4 px y 32 px de alto; texto de 16 px en el teléfono.
- **Focus:** el borde toma el color de foco y aparece el anillo de 3 px.
- **Error / Disabled:** borde y anillo rojos con el mensaje debajo en rojo; deshabilitado al 50 % de opacidad.

### Navigation
- **Escritorio:** barra lateral de 240 px con secciones en etiqueta mayúscula ("PANELES Y ACCESOS", "SERVICIOS DE APOYO") y la app actual con fondo niebla.
- **Teléfono:** flecha de volver en el encabezado y un botón redondo flotante (tinta pizarra) abajo a la derecha que abre las apps.

### Aviso de arriba (signature)
Banda en la parte superior de todas las pantallas para lo que alguien tiene que atender. Para quien gestiona es grande: fondo suave del estado, ícono en círculo, título en negrita, la lista corta de lo pendiente y un botón "Abrir". Para el resto es una sola línea discreta con un punto de color y "Ver".

### Tanque (signature)
El tanque de Preparación y del Panel de Producción: vidrio con brillo vertical, líquido del color del sabor con dos olas superpuestas y burbujas lentas, y el nivel en mono.

## Do's and Don'ts

### Do:
- **Do** refinar sobre lo que ya existe: la dueña está conforme con el aspecto actual. El trabajo es pulir para que no se vea como una app genérica hecha con IA, no rediseñar.
- **Do** dejar que cada pantalla de carga pida lo mínimo: un dato por campo y un botón fuerte por bloque.
- **Do** hacer los botones de las pantallas de carga en planta de al menos 44 px de alto (tamaño `lg` o mayor). El tamaño por defecto actual (32 px) es chico para tocar con apuro en el teléfono.
- **Do** escribir números, códigos y horas con la utilidad mono tabular (`num`).
- **Do** usar el estado con sus tres tonos (fuerte, texto, suave) y el mismo color para el mismo significado en toda la app.
- **Do** probar cada pantalla a 400 px de ancho y cada panel en vivo como se ve de lejos.
- **Do** mantener los dos modos, claro y oscuro, tocando solo los tokens.

### Don't:
- **Don't** usar formas de píldora en etiquetas, chips ni selectores: esquinas de 2 a 3 px.
- **Don't** usar el ámbar o el verde fuertes como color de letra: va su tono texto.
- **Don't** usar letras de menos de 12 px ni tamaños fijos en px (`text-[11px]`): rompen la escala y el ajuste de tamaño de letra.
- **Don't** aclarar el gris con transparencia (`text-muted-foreground/60`): si algo es secundario, ya es gris.
- **Don't** poner párrafos ni explicaciones largas en pantalla: una línea de ayuda como máximo, y un bloqueo o botón directo en vez de un aviso de texto.
- **Don't** caer en el aspecto genérico de IA: degradados vistosos, tarjetas dentro de tarjetas, grillas de tarjetas idénticas con ícono-título-texto para todo, o una sola letra de moda para todo.
- **Don't** usar color fuerte sin significado: si no es estado ni sabor, va en gris.
- **Don't** agregar movimiento que no venga de la planta (líquido, cinta, pulso de línea activa) ni animaciones que distraigan del dato.
