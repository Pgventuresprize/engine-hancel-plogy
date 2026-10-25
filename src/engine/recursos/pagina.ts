import { archivosComoDatos, kitActivo, type KitCargado } from "../marca/kit"
import { perfilDe } from "../marca/perfil"
import { supabaseAdmin } from "../supabase-admin"
import { cssDeFuentes, type ColorKit } from "../marca/kit-modelo"
import { figurasPorLugar, type FiguraHecha, type FigurasGuardadas, type FotoRecurso } from "./figuras-modelo"
import { NOMBRE_LECTURA, NOMBRE_ROTULO, NOMBRE_TIPO_RECURSO, type Bloque, type Item, type Lectura, type Recurso } from "./modelo"

/**
 * La pagina web del recurso, entera y autocontenida: lo que el portal publica
 * tal cual y lo que la ficha enseña en "Página web". La arma el codigo, no un
 * modelo: el texto es el aprobado y el estilo sale del kit de la marca (sus
 * colores por papel, sus fuentes de titulo y de texto, sus logos), con modo
 * oscuro y una columna que se lee bien en el celular. Sin kit, un estilo
 * neutro.
 */

/** Como se llama la marca en lo que se publica: el nombre del perfil, o el de la cuenta. */
export async function nombreDeMarca(accountId: string): Promise<string> {
  const perfil = await perfilDe(accountId).catch(() => null)
  if (perfil?.nombre) return perfil.nombre
  const { data } = await supabaseAdmin().from("accounts").select("name").eq("id", accountId).maybeSingle()
  return (data as { name?: string } | null)?.name || "la marca"
}

/** Lo que la pagina necesita de una fuente: la guardada con el recurso. */
export type FuentePagina = { id: string; url: string; medio: string; titulo: string; fecha: string; lectura: string }

export type TemaPagina = { css: string; fuentesCss: string; logoClaro: string | null; logoOscuro: string | null }

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

// ------------------------------------------------------------------ colores

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
}
const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`
const mezcla = (a: string, b: string, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return x && y ? hex(x.map((v, i) => v + (y[i] - v) * t) as Rgb) : a
}
const luz = (c: string) => {
  const v = rgb(c)
  if (!v) return 0.5
  const [r, g, b] = v.map((x) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const saturacion = (c: string) => {
  const v = rgb(c)
  if (!v) return 0
  const max = Math.max(...v)
  const min = Math.min(...v)
  return max === 0 ? 0 : (max - min) / max
}

/**
 * Los colores de la pagina sacados del kit. El kit nombra cada color con su
 * papel en palabras ("fondo claro principal", "acento", "texto de apoyo"); se
 * busca por esas palabras y, lo que no aparezca, por luz y saturacion.
 */
export function paletaDeKit(colores: ColorKit[]) {
  const validos = colores.filter((c) => rgb(c.valor))
  const busca = (re: RegExp, filtro: (c: ColorKit) => boolean = () => true) => validos.find((c) => re.test(`${c.nombre} ${c.papel}`.toLowerCase()) && filtro(c))?.valor
  const claro = (c: ColorKit) => luz(c.valor) > 0.6
  const oscuro = (c: ColorKit) => luz(c.valor) < 0.2
  const porLuz = [...validos].sort((a, b) => luz(b.valor) - luz(a.valor))
  const papel = busca(/fondo claro principal|paper|papel|background|blanco|white/, claro) ?? porLuz[0]?.valor ?? "#ffffff"
  const tinta = busca(/texto principal|\bink\b|tinta|fondo oscuro/, oscuro) ?? porLuz.at(-1)?.valor ?? "#161616"
  const acento =
    busca(/acento|accent|primario|primary/, (c) => saturacion(c.valor) > 0.35) ??
    [...validos].sort((a, b) => saturacion(b.valor) - saturacion(a.valor))[0]?.valor ??
    "#2f6bff"
  const acentoTexto =
    busca(/texto .*(acento|naranja|color)|accent.?text|orangetext|pequeñ.* sobre claro/, (c) => contraste(c.valor, papel) >= 4.5) ??
    (contraste(acento, papel) >= 4.5 ? acento : mezcla(acento, tinta, 0.35))
  const acentoOscuro = busca(/sobre fondo oscuro|suave|brillo/, (c) => saturacion(c.valor) > 0.35 && contraste(c.valor, tinta) >= 4.5) ?? mezcla(acento, papel, 0.25)
  const apoyo = busca(/apoyo|muted|notas|secundari|gris/, (c) => contraste(c.valor, papel) >= 4.5) ?? mezcla(tinta, papel, 0.42)
  const superficie = busca(/alterno|surface|superficie|crema/, claro) ?? mezcla(papel, tinta, 0.05)
  const borde = busca(/borde|border|l[ií]nea/, claro) ?? mezcla(papel, tinta, 0.16)
  return { papel, tinta, acento, acentoTexto, acentoOscuro, apoyo, superficie, borde }
}

const familia = (kc: KitCargado, papel: RegExp) => kc.kit.sistema.fuentes.find((f) => papel.test(f.papel.toLowerCase()))?.familia ?? null

/** Una familia con su respaldo: los alias que la fuente sustituye y el generico. */
function pila(kc: KitCargado, nombre: string | null): string {
  if (!nombre) return "system-ui, sans-serif"
  const alias = kc.archivos.find((a) => a.tipo === "fuente" && a.meta.familia === nombre && Array.isArray(a.meta.alias))?.meta.alias as string[] | undefined
  return [`'${nombre.replace(/'/g, "")}'`, ...(alias ?? []).map((n) => `'${String(n).replace(/'/g, "")}'`), "system-ui", "sans-serif"].join(", ")
}

/** El tema de la cuenta para la pagina. Sin kit activo, null (estilo neutro). */
export async function temaDeMarca(accountId: string): Promise<TemaPagina | null> {
  const kc = await kitActivo(accountId).catch(() => null)
  if (!kc) return null
  const datos = await archivosComoDatos(kc)
  const titulos = familia(kc, /t[ií]tul|display|heading/)
  const texto = familia(kc, /texto|cuerpo|body/) ?? titulos
  // Solo se embeben las fuentes propias de la marca: una sustituta de Arial o
  // Helvetica pesa cientos de kB y el navegador del lector ya tiene la suya.
  const usadas = kc.archivos.filter((a) => a.tipo === "fuente" && [titulos, texto].includes(String(a.meta.familia)) && a.meta.origen !== "sustituto")
  const p = paletaDeKit(kc.kit.sistema.colores)
  const logo = (k: "claro" | "oscuro") => {
    const papel = kc.kit.sistema.logos[k]
    return papel ? (datos[papel] ?? null) : null
  }
  return {
    fuentesCss: cssDeFuentes(usadas, datos),
    css: `:root{--papel:${p.papel};--tinta:${p.tinta};--acento:${p.acento};--acento-texto:${p.acentoTexto};--apoyo:${p.apoyo};--superficie:${p.superficie};--borde:${p.borde};--titulos:${pila(kc, titulos)};--texto:${pila(kc, texto)}}
@media (prefers-color-scheme:dark){:root{--papel:${p.tinta};--tinta:${p.papel};--acento-texto:${p.acentoOscuro};--apoyo:${mezcla(p.papel, p.tinta, 0.3)};--superficie:${mezcla(p.tinta, p.papel, 0.07)};--borde:${mezcla(p.tinta, p.papel, 0.2)}}}`,
    logoClaro: logo("claro"),
    logoOscuro: logo("oscuro") ?? logo("claro"),
  }
}

const TEMA_NEUTRO: TemaPagina = {
  fuentesCss: "",
  css: `:root{--papel:#ffffff;--tinta:#161616;--acento:#2f6bff;--acento-texto:#1f4fd1;--apoyo:#5c5c5c;--superficie:#f4f4f4;--borde:#dddddd;--titulos:system-ui,sans-serif;--texto:system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{--papel:#161616;--tinta:#f2f2f2;--acento-texto:#8fb0ff;--apoyo:#b5b5b5;--superficie:#202020;--borde:#383838}}`,
  logoClaro: null,
  logoOscuro: null,
}

const ESTILO = `*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--papel);color:var(--tinta);font:18px/1.65 var(--texto)}
main{max-width:760px;margin:0 auto;padding:28px 20px 72px}
.cab{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}
.cab img{height:44px;width:auto;max-width:220px}
.cab .claro{display:block}.cab .oscuro{display:none}
@media (prefers-color-scheme:dark){.cab .claro{display:none}.cab .oscuro{display:block}}
h1,h2,h3{font-family:var(--titulos);letter-spacing:-.02em;line-height:1.12;text-wrap:balance}
h1{font-size:clamp(32px,6vw,50px);margin:10px 0 14px}
h2{font-size:clamp(24px,4vw,30px);margin:52px 0 14px;padding-top:24px;border-top:1px solid var(--borde)}
p,li{text-wrap:pretty}
a{color:var(--acento-texto);word-break:break-word}
.tag{display:inline-block;margin:0;font:700 13px/1 var(--titulos);letter-spacing:.09em;text-transform:uppercase;color:var(--acento-texto)}
.meta{margin:0 0 26px;color:var(--apoyo);font-size:15px}
.resumen{margin:0 0 8px;padding:20px 22px 20px 40px;background:var(--superficie);border-radius:16px}
.resumen li{margin:6px 0}
figure{margin:30px 0}
figure img{display:block;width:100%;height:auto;border-radius:14px;border:1px solid var(--borde)}
.portada{margin:0 0 26px}
figcaption{margin-top:8px;font-size:14px;line-height:1.45;color:var(--apoyo)}
.rotulo{display:inline-block;margin-right:6px;padding:2px 9px;border-radius:999px;border:1px solid var(--acento-texto);color:var(--acento-texto);font:700 11px/1.5 var(--titulos);letter-spacing:.05em;text-transform:uppercase;vertical-align:2px}
sup{font-size:12px;padding-left:2px;color:var(--apoyo)}
sup a{text-decoration:none}
ul.checklist{list-style:none;padding-left:0}
ul.checklist li{display:flex;gap:12px;align-items:flex-start;margin:10px 0}
.casilla{flex:none;width:20px;height:20px;margin-top:5px;border:2px solid var(--acento);border-radius:5px}
.tabla{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:16px}
caption{text-align:left;font:700 16px/1.3 var(--titulos);margin-bottom:8px}
th,td{border:1px solid var(--borde);padding:10px 12px;text-align:left;vertical-align:top}
th{background:var(--superficie);font-family:var(--titulos)}
.plantilla{padding:18px 20px;background:var(--superficie);border:1px solid var(--borde);border-radius:14px}
.plantilla figcaption{margin:0 0 10px;font:700 15px/1.3 var(--titulos);color:var(--tinta)}
.plantilla pre{margin:0;white-space:pre-wrap;font:15px/1.6 ui-monospace,Consolas,monospace}
.siguiente{margin-top:48px;padding:22px 24px;border-left:6px solid var(--acento);background:var(--superficie);border-radius:0 14px 14px 0}
.siguiente h2{margin:0 0 6px;padding:0;border:0;font-size:22px}
.fuentes{font-size:15px;color:var(--apoyo)}
.fuentes li{margin:8px 0}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--borde);color:var(--apoyo);font-size:14px}`

// ------------------------------------------------------------------ bloques

/** Las fuentes de una afirmacion, en una sola llamada: [1, 2, 5]. */
const sup = (fuentes: string[]) =>
  fuentes.length ? `<sup>[${fuentes.map((f) => `<a href="#fuente-${escapar(f)}">${escapar(f.replace(/^f/, ""))}</a>`).join(", ")}]</sup>` : ""
/** Se marca lo que no es un hecho ni la lectura de la marca: hipotesis, calculo, traduccion, ejemplo. */
const rotulo = (i: Pick<Item, "rotulo">) => (i.rotulo && i.rotulo !== "hecho" && i.rotulo !== "lectura" ? `<span class="rotulo">${escapar(NOMBRE_ROTULO[i.rotulo])}</span>` : "")

function bloqueHtml(b: Bloque): string {
  switch (b.tipo) {
    case "parrafo":
      return `<p>${rotulo(b)}${escapar(b.texto)}${sup(b.fuentes)}</p>`
    case "lista":
      return `<ul>${b.items.map((i) => `<li>${rotulo(i)}${escapar(i.texto)}${sup(i.fuentes)}</li>`).join("")}</ul>`
    case "checklist":
      return `<ul class="checklist">${b.items.map((i) => `<li><span class="casilla" aria-hidden="true"></span><span>${rotulo(i)}${escapar(i.texto)}${sup(i.fuentes)}</span></li>`).join("")}</ul>`
    case "tabla":
      return `<figure class="tabla"><table>${b.titulo ? `<caption>${escapar(b.titulo)}</caption>` : ""}<thead><tr>${b.columnas.map((c) => `<th>${escapar(c)}</th>`).join("")}</tr></thead><tbody>${b.filas.map((f) => `<tr>${f.map((c) => `<td>${escapar(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>${b.fuentes.length || rotulo(b) ? `<figcaption>${rotulo(b)}${b.fuentes.length ? `Fuente: ${sup(b.fuentes)}` : ""}</figcaption>` : ""}</figure>`
    case "plantilla":
      return `<figure class="plantilla">${b.titulo ? `<figcaption>${escapar(b.titulo)}</figcaption>` : ""}<pre>${escapar(b.contenido)}</pre></figure>`
  }
}

/** Una figura con su pie. La portada no lleva pie: es la cabecera de la pagina y ya trae la marca. */
export function figuraHtml(f: FiguraHecha | FotoRecurso, clase = ""): string {
  return `<figure${clase ? ` class="${clase}"` : ""}><img src="${escapar(f.url)}" alt="${escapar(f.alt)}" width="${f.ancho}" height="${f.alto}"${clase === "portada" ? "" : ' loading="lazy"'}>${f.pie && clase !== "portada" ? `<figcaption>${escapar(f.pie)}</figcaption>` : ""}</figure>`
}

/** El cuerpo del recurso con sus figuras en su sitio (lo que va dentro de la pagina y en `cuerpo_html`). */
export function cuerpoConFiguras(r: Recurso, figuras: FigurasGuardadas, fuentes: FuentePagina[]): string {
  const lugar = figurasPorLugar(figuras)
  const en = (clave: string, i: number) => lugar.en(clave, i).map((f) => figuraHtml(f)).join("")
  return [
    `<ul class="resumen">${r.resumen.map((t) => `<li>${escapar(t)}</li>`).join("")}</ul>`,
    ...r.secciones.map((s) => `<section><h2>${escapar(s.titulo)}</h2>${en(s.clave, -1)}${s.bloques.map((b, i) => bloqueHtml(b) + en(s.clave, i)).join("")}</section>`),
    r.siguiente_paso ? `<section class="siguiente"><h2>Siguiente paso</h2><p>${escapar(r.siguiente_paso)}</p></section>` : "",
    fuentes.length
      ? `<section><h2>Fuentes</h2><ol class="fuentes">${fuentes
          .map(
            (f) =>
              `<li id="fuente-${escapar(f.id)}"><a href="${escapar(f.url)}" rel="noopener">${escapar(f.titulo || f.medio)}</a>, ${escapar(f.medio)}${f.fecha ? `, ${escapar(f.fecha)}` : ""}. ${escapar(NOMBRE_LECTURA[f.lectura as Lectura] ?? "")}.</li>`
          )
          .join("")}</ol></section>`
      : "",
  ].join("")
}

const fechaLarga = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function armarPagina(o: {
  recurso: Recurso
  figuras: FigurasGuardadas
  fuentes: FuentePagina[]
  tema: TemaPagina | null
  marca: string
  version: number
  /** Cuando se escribio esta version. */
  fecha: string
  palabras: number
  url?: string | null
}): string {
  const r = o.recurso
  const tema = o.tema ?? TEMA_NEUTRO
  const portada = figurasPorLugar(o.figuras).portada
  const tipo = NOMBRE_TIPO_RECURSO[r.tipo]
  const datos = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: r.titular,
    description: r.resumen[0] ?? r.promesa,
    datePublished: o.fecha,
    dateModified: o.fecha,
    inLanguage: "es",
    author: { "@type": "Organization", name: o.marca },
    publisher: { "@type": "Organization", name: o.marca },
    ...(portada ? { image: [portada.url] } : {}),
    ...(o.url ? { mainEntityOfPage: o.url } : {}),
  }
  const logos = [
    tema.logoClaro ? `<img class="claro" src="${tema.logoClaro}" alt="${escapar(o.marca)}">` : "",
    tema.logoOscuro ? `<img class="oscuro" src="${tema.logoOscuro}" alt="${escapar(o.marca)}">` : "",
  ].join("")
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(r.titular)} · ${escapar(o.marca)}</title>
<meta name="description" content="${escapar(r.resumen[0] ?? r.promesa)}">
${portada ? `<meta property="og:image" content="${escapar(portada.url)}">` : ""}
<script type="application/ld+json">${JSON.stringify(datos).replace(/</g, "\\u003c")}</script>
<style>
${tema.fuentesCss}
${tema.css}
${ESTILO}
</style>
</head>
<body>
<main>
${logos && !portada ? `<header class="cab">${logos}</header>` : ""}
${portada ? figuraHtml(portada, "portada") : ""}
<p class="tag">${escapar(tipo)} de ${escapar(o.marca)}</p>
<h1>${escapar(r.titular)}</h1>
<p class="meta">${escapar(fechaLarga(o.fecha))} · ${Math.max(1, Math.ceil(o.palabras / 200))} min de lectura</p>
${cuerpoConFiguras(r, o.figuras, o.fuentes)}
<footer>Versión ${o.version}, ${escapar(fechaLarga(o.fecha))}. Si la noticia cambia, este ${escapar(tipo.toLowerCase())} se actualiza y lo anotamos aquí.</footer>
</main>
</body>
</html>`
}
