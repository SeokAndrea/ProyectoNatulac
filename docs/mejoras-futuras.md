# Mejoras futuras

Lista de mejoras acordadas para más adelante. Cada una dice quién la pidió, cuándo y dónde está el detalle.

## Leer el QR del ticket de paleta con la cámara desde la app (opción B)

- **Pedido:** Alexander, 2026-11-17. Es la versión final que él quiere.
- **Hoy (opción C):** la cámara del teléfono o Google Lens muestra el texto del QR; se copia y se pega en
  el buscador de Trazabilidad del paletizado, que toma el código del ticket (`P-000124`) del texto.
- **Mejora:** botón «Escanear ticket» en Trazabilidad que abre la cámara para tomar una foto
  (`<input type="file" accept="image/*" capture="environment">`, funciona con http) y lee el QR de la foto
  en el teléfono, sin copiar y pegar.
- **Librería:** `barcode-detector` (MIT, con su `.wasm` servido desde nuestro servidor, nunca de internet)
  o `jsQR` (Apache-2.0, sin dependencias) como plan B. Si algún día la app tiene HTTPS, la misma pantalla
  puede usar la cámara en vivo.
- **Detalle:** [ticket-paletas/plan-tickets-paletas.md](ticket-paletas/plan-tickets-paletas.md), secciones 4b y 5.
