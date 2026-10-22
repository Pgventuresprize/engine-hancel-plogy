import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * PROTOTIPO 4.0 (se quita cuando exista el importador de kits).
 *
 * Tres plantillas escritas a mano a partir del kit de Plogy, como las que
 * escribira Claude al importar un kit: HTML y CSS del kit con huecos donde va el
 * texto de cada pieza. Sirven para probar que el navegador dibuja igual que los
 * exports del kit, cuanto tarda y que la medicion de los huecos funciona.
 *
 * Huecos: `{{t:nombre}}` es texto de la pieza (se escapa y `*asi*` se resalta);
 * `{{a:nombre}}` es un archivo como data URI (fuente, logo, foto).
 */

const DIR = path.join(process.cwd(), "src/engine/render/prototipo")

const dataUri = (archivo: string, tipo: string) =>
  `data:${tipo};base64,${readFileSync(path.join(DIR, archivo)).toString("base64")}`

let archivosKit: Record<string, string> | null = null

/** Las fuentes y logos del kit, una vez por instancia. */
export function archivosDelKit(): Record<string, string> {
  archivosKit ??= {
    display500: dataUri("SpaceGrotesk-500.ttf", "font/ttf"),
    display700: dataUri("SpaceGrotesk-700.ttf", "font/ttf"),
    texto400: dataUri("Arimo-400.ttf", "font/ttf"),
    texto700: dataUri("Arimo-700.ttf", "font/ttf"),
    logo_color: dataUri("plogy-color.svg", "image/svg+xml"),
    logo_blanco: dataUri("plogy-white.svg", "image/svg+xml"),
    simbolo: dataUri("plogy-symbol.svg", "image/svg+xml"),
  }
  return archivosKit
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Texto de la pieza a HTML: escapado, `*x*` resaltado y `**x**` en negrita. */
function texto(s: string): string {
  return escapar(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')
}

export function rellenar(plantilla: string, textos: Record<string, string>, archivos: Record<string, string>): string {
  return plantilla
    .replace(/\{\{t:(\w+)\}\}/g, (_, k: string) => texto(textos[k] ?? ""))
    .replace(/\{\{a:(\w+)\}\}/g, (_, k: string) => archivos[k] ?? "")
}

/** Los puntos de paginacion del kit. */
export const puntos = (n: number, total: number) =>
  Array.from({ length: total }, (_, i) => (i + 1 === n ? '<i class="on"></i>' : "<i></i>")).join("")

const BASE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:'Kit Display';font-weight:500;src:url({{a:display500}}) format('truetype')}
@font-face{font-family:'Kit Display';font-weight:700;src:url({{a:display700}}) format('truetype')}
@font-face{font-family:'Kit Texto';font-weight:400;src:url({{a:texto400}}) format('truetype')}
@font-face{font-family:'Kit Texto';font-weight:700;src:url({{a:texto700}}) format('truetype')}
:root{--ink:#171310;--paper:#ffffff;--muted:#625951;--orange:#ff5b00;--orangeText:#b43d00;--surface:#f4f1ef;--border:#a39486;
  --display:'Kit Display',sans-serif;--body:'Kit Texto',sans-serif;
  --gradient:linear-gradient(180deg,#f75946 0%,#ee5358 33%,#e1556a 50%,#c85981 67%,#9c5aa7 100%)}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1350px;overflow:hidden;font-family:var(--body)}
.lamina{position:relative;width:1080px;height:1350px;overflow:hidden;padding:96px;display:flex;flex-direction:column}
.light{background:var(--paper);color:var(--ink)} .dark{background:var(--ink);color:var(--paper)}
.logo{position:absolute;top:80px;left:58px;width:230px;height:auto;z-index:3}
.count{position:absolute;top:96px;right:96px;font:700 30px/1 var(--display);letter-spacing:.04em;z-index:3}
.light .count{color:var(--muted)} .dark .count{color:#cfc6bd}
.content{position:relative;z-index:2;margin-top:auto}
h1,h2{font-family:var(--display);font-weight:700;letter-spacing:-.035em;line-height:1.06;text-wrap:balance}
.support{font-size:44px;line-height:1.38;margin-top:48px;max-width:860px}
.light .support{color:var(--muted)} .dark .support{color:#e6dfd8}
.hl{color:var(--orange)} .dark .hl{text-shadow:0 0 34px rgba(255,91,0,.55)}
.eyebrow{font:700 30px/1 var(--display);letter-spacing:.14em;text-transform:uppercase}
.light .eyebrow{color:var(--orangeText)} .dark .eyebrow{color:var(--orange)}
.dots{position:absolute;bottom:80px;left:96px;display:flex;gap:14px;z-index:3}
.dots i{width:14px;height:14px;border-radius:50%;background:currentColor;opacity:.25}
.dots i.on{opacity:1;background:var(--orange)}
`

const PIE = `<div class="dots" data-zona="puntos">{{t:puntos_html}}</div>`

/** 001, lamina 1: portada tipografica con la esfera. */
export const PORTADA =
  BASE +
  `.sphere{position:absolute;border-radius:50%;background:var(--gradient);z-index:1;width:400px;height:400px;right:-120px;top:130px}
.content{margin-bottom:60px} h1{font-size:132px}
</style></head><body>
<section class="lamina light" data-seguro="96,96,984,1240">
  <img class="logo" src="{{a:logo_color}}" alt="" data-zona="logo">
  <div class="count" data-zona="contador">{{t:contador}}</div>
  <div class="sphere" data-zona="esfera"></div>
  <div class="content">
    <p class="eyebrow" style="margin-bottom:40px" data-hueco="antetitulo" data-min="28">{{t:antetitulo}}</p>
    <h1 data-hueco="titulo" data-encoger="132:96" data-min="34">{{t:titulo}}</h1>
    <p class="support" data-hueco="cuerpo" data-min="34">{{t:cuerpo}}</p>
  </div>
  ${PIE}
</section></body></html>`

/** 003, lamina 3: el numero grande con su fuente al pie. */
export const DATO =
  BASE +
  `.lamina{display:block}
.top{position:relative;z-index:3;margin-top:170px}
h2{font-size:108px}
.big{margin-top:46px;font:700 230px/.95 var(--display);letter-spacing:-.06em;color:var(--orange);text-shadow:0 0 50px rgba(255,91,0,.45)}
.support{font-size:40px;margin-top:20px;max-width:880px} .support b{color:#fff}
.src{position:absolute;left:96px;right:96px;bottom:130px;z-index:3;font:400 30px/1.35 var(--body);color:#cfc6bd}
.dark .count{color:#e6dfd8}
</style></head><body>
<section class="lamina dark" data-seguro="96,96,984,1240">
  <img class="logo" src="{{a:logo_blanco}}" alt="" data-zona="logo">
  <div class="count" data-zona="contador">{{t:contador}}</div>
  <div class="top">
    <h2 data-hueco="titulo" data-encoger="108:80" data-min="34">{{t:titulo}}</h2>
    <p class="big" data-hueco="numero" data-encoger="230:150">{{t:numero}}</p>
    <p class="support" data-hueco="cuerpo" data-min="34">{{t:cuerpo}}</p>
  </div>
  <p class="src" data-hueco="fuente" data-min="28">{{t:fuente}}</p>
  ${PIE}
</section></body></html>`

/** 001, lamina 6: cierre con la foto en banda y la tarjeta de vidrio. */
export const CIERRE =
  BASE +
  `.photo{position:absolute;left:0;top:630px;width:1080px;height:440px;object-fit:cover;mix-blend-mode:screen;z-index:1}
.content{margin:134px 0 0}
h2{font-size:100px} h2 .hl{text-shadow:0 0 34px rgba(255,91,0,.55)}
.support{font-size:40px;margin-top:36px}
.cta-glass{position:absolute;left:96px;top:1000px;z-index:3;display:flex;align-items:center;gap:22px;width:888px;padding:28px 48px 28px 34px;border-radius:64px;background:linear-gradient(125deg,rgba(255,255,255,.24),rgba(255,255,255,.06)),rgba(23,19,16,.52);border:1.5px solid rgba(255,255,255,.42);backdrop-filter:blur(22px) saturate(125%);box-shadow:0 18px 50px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.5);color:#fff}
.cta-glass img{width:116px;height:auto;flex:none;margin:-14px -8px -14px -20px}
.cta-glass b{display:block;font:700 64px/1.05 var(--display);letter-spacing:-.03em}
.cta-glass span{display:block;margin-top:10px;font:400 34px/1.3 var(--body);color:#eee6df;text-wrap:balance}
</style></head><body>
<section class="lamina dark" data-seguro="96,96,984,1240">
  <img class="logo" src="{{a:logo_blanco}}" alt="" data-zona="logo">
  <div class="count" data-zona="contador">{{t:contador}}</div>
  <img class="photo" src="{{a:foto}}" alt="">
  <div class="content">
    <h2 data-hueco="titulo" data-encoger="100:76" data-min="34">{{t:titulo}}</h2>
    <p class="support" data-hueco="cuerpo" data-min="34">{{t:cuerpo}}</p>
  </div>
  <div class="cta-glass" data-zona="cta">
    <img src="{{a:simbolo}}" alt="">
    <div><b data-hueco="cta">{{t:cta}}</b><span data-hueco="motivo" data-min="34">{{t:motivo}}</span></div>
  </div>
  ${PIE}
</section></body></html>`

export type LaminaDePrueba = { plantilla: string; textos: Record<string, string> }

/** Los textos exactos de las laminas del kit, para comparar con sus exports. */
export function laminasDelKit(): Record<"portada" | "dato" | "cierre", LaminaDePrueba> {
  return {
    portada: {
      plantilla: PORTADA,
      textos: {
        contador: "01/06",
        antetitulo: "Procesos + IA",
        titulo: "Automatizaste el desorden. *Ahora es más rápido.*",
        cuerpo: "Y nadie sabe por qué sigue fallando.",
      },
    },
    dato: {
      plantilla: DATO,
      textos: {
        contador: "03/07",
        titulo: "El token no es la *tarea.*",
        numero: "62.000",
        cuerpo:
          "**tokens de salida por tarea** en un test de Artificial Analysis. 2,3 veces más que GPT-6 Astra en la misma prueba.",
        fuente: "Fuente: AIHubMix, 13 oct 2026, citando a Artificial Analysis.",
      },
    },
    cierre: {
      plantilla: CIERRE,
      textos: {
        contador: "06/06",
        titulo: "Primero el proceso. *Después la IA.*",
        cuerpo: "Quién decide, qué pasa si falla, cómo se mide. Con eso claro, automatizar sí ahorra tiempo.",
        cta: "Sigue a Plogy",
        motivo: "Aquí la IA se implementa, no se promete.",
      },
    },
  }
}

/** Arma el HTML final de una lamina: textos, puntos y archivos. */
export function htmlDe(l: LaminaDePrueba, n: number, total: number, extra: Record<string, string> = {}): string {
  const conPuntos = l.plantilla.replace("{{t:puntos_html}}", puntos(n, total))
  return rellenar(conPuntos, l.textos, { ...archivosDelKit(), ...extra })
}
