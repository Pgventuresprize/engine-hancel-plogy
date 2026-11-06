# La marca desde un link

Investigación y plan del 2026-11-04. Nada de esto está construido.

**La idea:** pegar el link de una web (y, si se puede, sus redes) y que Plogy
Studio arme solo el perfil, la voz, los colores, las fuentes, el logo, las fotos
y el kit de diseño, de modo que el primer post ya salga con la marca.

## 1. La conclusión

Lo que hace que Pomelli y compañía parezcan entender una marca no es que la
entiendan. Son cinco cosas juntas, y ninguna es magia:

1. **Reutilizan lo literal.** El logo real, el hexadecimal real, la fuente real
   y las fotos reales. La mayor parte de la coherencia percibida viene de ahí.
2. **Miden primero y luego interpretan.** El código saca los valores y el modelo
   solo decide papeles (cuál es el primario) y escribe el criterio.
3. **Entregan un borrador, no una verdad.** Todos los productos serios piden
   revisar antes de generar.
4. **Estrechan lo que se puede generar.** Plantillas, bloqueos o verificación,
   para que no se pueda salir mucho de la marca.
5. **La voz sale de ejemplos reales, no de adjetivos.**

**Para el Studio la extracción es la parte fácil.** Cuesta centavos y casi es una
mercancía. Lo que falta conectar es la salida: hoy el Studio dibuja muy bien
cuando la marca ya tiene piezas propias, y una marca nueva no tiene ninguna.

Por eso la pieza clave del plan no es el extractor, sino las **direcciones de
diseño** (§6, paso 8): crear las primeras piezas de la marca, que una persona
elige una, y pasarla por el importador de kits que ya existe. Así se aprovecha
todo el motor sin construir uno nuevo.

## 2. Qué se sabe de Pomelli

**Límite importante:** no pude abrir Pomelli. La extensión de Chrome no estaba
conectada, así que esto sale de documentación y reseñas, no de haberlo usado.

**Confirmado en fuentes de Google:**

- Es de Google Labs con DeepMind, anunciado el 28 de octubre de 2025.
- Flujo: web → perfil de marca → ideas de campaña → piezas editables.
- El anuncio lo llama Business DNA: tono, fuentes, imágenes y paleta. La ayuda
  actual lo llama Business Profile: fuentes, colores, valores, imágenes, más
  catálogo y recursos.
- El análisis tarda **hasta 8 minutos**.
- Tres formas de crear el perfil: desde la web, desde archivos con el agente
  (20 archivos, 25 MB cada uno, incluye PDF, Office y audio) o desde una plantilla.
- Se corrige de dos maneras: **hablándole al agente** o editando cada campo.
- Google pide revisar el perfil en todos los casos.

**Lo que Google no publica:** qué páginas lee, qué modelo usa, cómo decide el
color primario y cómo se componen las piezas. Quien diga saberlo está infiriendo.

**Inferencia mía:** se puede editar el titular, el texto y el CTA por separado,
cambiar la tipografía y hay un botón «Fix layout». Eso apunta a texto compuesto
como capas sobre la imagen, no quemado dentro de ella. Es la misma decisión del
Studio y es la correcta.

**Reseñas, con cautela** (son anécdotas, sin método ni muestra):

- Acierta más en B2B con la marca muy visible que en moda o estilo de vida.
- Ideas genéricas, y posts sociales «de plantilla».
- La IA puede alterar detalles del producto. Google lo advierte en su ayuda.
- Si la web está vieja o incoherente, el perfil hereda el problema.
- Falla en sitios con captcha o bloqueo de bots.
- Sin API ni programación de publicaciones: el Studio no podría integrarlo aunque
  quisiera, y por ahí no compite.

## 3. Los otros productos

| Producto | Entra | Qué saca | Cómo se corrige | Con qué genera |
|---|---|---|---|---|
| Canva Brand Kit Builder | URL o PDF | Logo, colores, fuentes, fotos, voz | Revisión en la pestaña Brand | Plantillas de marca |
| Blaze | URL, redes, PDF | Logo, colores, fuentes, rasgos de voz | Confirmar antes de guardar | Voz y materiales fuente |
| Holo | URL o manual | Identidad, voz, audiencia, competidores, productos | Campos editables | Prompts sugeridos |
| Adobe GenStudio | Documentos | Tono, valores, reglas por categoría y canal | Editar y publicar (obligatorio) | Plantillas con bloqueos; puntaje explicado por regla |
| Typeface | Manuales y muestras | Voz por canal, kit, reglas | Lint de reglas por chat | Inyecta reglas y explica cada una |
| Writer | 8 muestras, más de 300 palabras | Rasgos y perspectiva | Editar o re-extraer | Una voz por formato; solo inglés |
| Claude Design | Repo, capturas, PDF, assets | Paleta, tipografía, componentes | **Proyecto de prueba, luego publicar** | Se revisa antes de entregar |
| Firecrawl `branding` | URL | Logo, 10 colores, fuentes, botones, personalidad | API, sin humano | No genera |
| Brandfetch | Dominio | Logo, colores, fuentes, contexto | API | No genera |

Este resumen viene del informe de un agente. Canva y Jasper bloquearon la lectura
directa y se usaron extractos de su ayuda; no volví a comprobar cada fila, salvo
Pomelli, Firecrawl y Claude Design.

**Lo más útil para copiar:**

- **Claude Design:** no pregunta «¿está bien tu marca?». Hace algo con ella y lo
  muestra. La prueba es una pieza, no una ficha.
- **Adobe:** cada regla se evalúa por separado y con su razón. Es mejor que un
  puntaje general.
- **Writer:** una voz por formato. La voz de una web no es la de un carrusel.
- **DESIGN.md (Google Stitch):** tokens exactos más prosa que explica cuándo
  usarlos. El Studio ya hace algo equivalente con `SistemaVisual` y sus reglas.
  **No recomiendo adoptarlo como formato interno:** está en alfa y reemplazaría
  algo que funciona. Sirve como inspiración y, quizá, como exportación.

## 4. Cómo se hace bien: técnica

Viene de leer el código de 11 proyectos open source, más Firecrawl.

**Color primario.** Es el error más común y el que más se nota.

- Lo ingenuo es ordenar por frecuencia o por área. Eso da fondos, cremas o el
  verde del botón de WhatsApp.
- `dembrandt` usa una cascada con evidencia: pesa por contexto (logo y marca 5,
  primario y CTA 4, botón 3) y trata el fondo de un CTA como señal fuerte.
  Guarda qué regla ganó y qué alternativas hubo, y **puede negarse a decidir**.
- `extractvibe` suma confianza cuando dos fuentes independientes coinciden.
- Fuentes a cruzar: variables CSS pintadas de verdad, botones, SVG del logo,
  `theme-color`, varias páginas.

**El pantallazo es el árbitro.** Claude mira la captura y solo puede cambiar lo
medido dando una razón. Firecrawl hace algo parecido: heurísticas y luego un
modelo con visión que decide logo, botones y papeles de color.

**Logo.** Puntuar candidatos: dentro del header y enlazado a la home suma; el
dominio en el nombre del archivo suma; bajo el pliegue o en un CDN ajeno resta.
Hay que descartar logos de clientes. **Siempre lo confirma una persona:** es el
error que más avergüenza.

**Fuentes.** Medir por área de texto grande separa titulares de cuerpo; es lo
mejor de tu repo. Distinguir Google Fonts de Adobe o propias: una fuente con
licencia no se puede bajar del sitio, hay que pedirla o proponer la más parecida.

**Voz.** Armar el corpus por papeles (hero, CTA, titulares, formularios, página
404, blog) y dárselo al modelo. Las herramientas que miden voz con reglas fijas
solo sirven en inglés, así que para español tiene que ser con modelo. Pedir citas
literales y comprobarlas por código.

**Reglas.** El mejor prompt que encontré (`extractvibe`) pasa los datos ya medidos
y exige reglas concretas con hexadecimales y fuentes reales. «Usa Inter 700 en
titulares» sirve; «moderna y confiable» no.

**Fotos.** Nadie lo resuelve bien por píxeles. Filtrar por tamaño, deduplicar y
descartar logos, íconos y capturas, y luego etiquetar con visión. El Studio ya
tiene esa última parte.

**Comprobar después.** `design-dna` vuelve a medir lo generado contra la paleta
con distancia de color. Es barato, es código y encaja con el QA del Studio.

## 5. Pomelli Chimbo

**Veredicto: no lo migraría, lo usaría como cantera.** El código es riguroso. Lo
que falla es la arquitectura, solo local, y el eslabón central: el ADN visual casi
no se mide.

**Fallas verificadas:**

- **El primario sale mal.** Toma el primer color usable de una lista ordenada por
  peso, sin mirar CTA ni papel (`packages/extractor/colors.ts:80`). En Jean Pascal
  eligió un dorado de un panel de carrusel, y el logo es negro y blanco.
- **Pierde colores.** El `slice(0,10)` corta sin agrupar tonos: en Valle Verde se
  perdió el naranja del CTA.
- **El modelo nunca ve el sitio.** La captura va solo a la pantalla y es del
  viewport (`packages/extractor/site.ts:265`), no de la página entera.
- **La confianza mide si está lleno, no si acertó.** Jean Pascal saca 1,0 con el
  primario equivocado.
- **El estilo se reduce a 5 registros fijos.** Radio, densidad y márgenes los pone
  una tabla o el modelo, no el sitio.
- **Marcas de producto sin foto:** se excluyen las fotos de producto, y salen
  carteles tipográficos correctos pero genéricos.
- **Es lento y atado al equipo:** 18 a 24 minutos y unos $2,5 a $3,8 por marca, con
  la CLI de Claude, SQLite y disco local.
- **Nunca se validó de punta a punta:** 4 marcas analizadas y 0 piezas finales en
  la base.

**Vale la pena rescatar:**

- Clics seguros para revelar contenido: `browser/clickables.js` y `reveal.ts`.
- Cierre de cookies, autoscroll y espera: `dismiss-cookies.js`, `autoscroll.js`,
  `settle.js`.
- URLs canónicas de imágenes por CDN: `assets.ts`.
- Medición de fuentes por área: la idea de `page-data.js`.
- Verificación de datos duros: `generator/claims.ts` busca cada cifra en las
  fuentes. Es mejor que cualquier confianza.
- No pisar lo ya confirmado por la persona: `ingest.ts:147-155`.
- Las preguntas de `gaps`. En el Pub encontraron dos horarios y dos teléfonos
  contradictorios. Son lo mejor del proyecto.
- Revisión de contraste y jerarquía, con correcciones registradas:
  `design/check.ts` y `design/fix.ts`.

**Descartar:** SQLite y Prisma, el worker propio, la CLI de Claude y el `/lab`.

## 6. Cómo lo haría en el Studio

### Lo que ya existe

Casi todo el destino está construido. El ADN no necesita un formato nuevo: llena
lo que ya hay.

| Lo que sale del link | Dónde cae |
|---|---|
| Nombre, qué hace, mensaje, voz sí/no, reglas, vetos | `PerfilMarca` |
| Pilares, audiencias, CTA | `IdentidadEditorial` |
| Frases reales como muestra | Ejemplos y skills de marca |
| Colores, fuentes, logos, ritmo | `SistemaVisual` en `brand_kits` |
| Fotos | Biblioteca, con su etiquetado (`etiquetarPendientes`) |
| Fuentes de Google | `bajarDeGoogle` en `kit-fuentes.ts` |
| Plantillas, figuras, ejemplos para el diseñador | Importador de kits |
| Avance por pasos que se retoma | Patrón `avanzarImportacion` |
| Claude propone, el código comprueba, la persona decide | Patrón del importador de ejemplos |
| Posts propios de Instagram | `INSTAGRAM_GET_IG_USER_MEDIA` ya se usa en `publish/meta.ts` |

### Lo que falta

1. Leer sitios de afuera. `navegador.ts` corta la red a propósito, y debe seguir así.
2. Una tabla nueva, `marca_analisis`, con URL, paso, evidencia, propuesta y lo que
   la persona decidió.
3. La pantalla de revisión.
4. Las direcciones de diseño.

### El flujo

Cada paso se guarda y se retoma, como el importador, para no chocar con el límite
de las funciones de Vercel Hobby.

1. **Link y permiso.** Pega la web y, opcional, Instagram, LinkedIn o PDF. Marca
   que la marca es suya o que tiene autorización.
2. **Descubrir.** Elegir 6 a 10 páginas con intención: home, quiénes somos,
   servicios o productos, 2 o 3 del blog, contacto, y `/brand` o `/press` si existen.
3. **Capturar.** De cada página: texto, captura completa, links, imágenes y `branding`.
4. **Medir.** Por código: cascada de color con evidencia, candidatos a logo,
   fuentes. Lo no decidido queda como no decidido.
5. **Mirar.** Claude con visión compara lo medido con las capturas. Solo cambia
   un valor si da una razón.
6. **Leer.** Claude escribe perfil, voz, pilares, audiencias, CTA y vetos, cada
   campo con su cita. El código comprueba que la cita exista. Si hay Instagram,
   la voz de redes pesa más que la de la web.
7. **Fotos.** Filtrar, deduplicar, guardar 20 a 30 y etiquetarlas con lo que ya existe.
8. **Direcciones de diseño. La pieza clave.**
   - Si la marca **ya tiene posts**, van directo al importador, que acepta láminas
     sueltas como imágenes. Es lo mejor: aprende de piezas reales.
   - Si **no tiene**, Opus diseña 3 direcciones como carruseles reales, con texto y
     fotos de la marca, mirando las capturas. La persona elige una, y esa pieza
     entra al importador como HTML. De ahí salen plantillas, figuras y ejemplos.
9. **Revisar.** Una sola pantalla: cada campo con su evidencia, las preguntas
   abiertas y el logo por confirmar. Se revisa viendo la pieza, no una ficha.
10. **Primer post.** Termina en el chat con una pieza real.

### Corregir después

Igual que Pomelli: hablándole. El chat ya es el inicio del Studio, así que «ponle
un tono más cercano» debería proponer un cambio al perfil. También un botón de
«volver a analizar» que proponga diferencias sin pisar lo confirmado.

### Capturar: comprar o construir

**Mi recomendación: empezar con Firecrawl detrás de una interfaz propia.**

- Da texto, captura, links, imágenes y `branding` por una llamada.
- Plan de $19 al mes por 5.000 créditos. A 1 crédito por página, una marca de 8
  páginas cuesta unos 3 centavos. **Falta confirmarlo:** la documentación no lista
  `branding` entre los cargos extra, pero tampoco dice que sea gratis.
- Pasa bloqueos que Chromium desde Vercel probablemente no pasaría (inferencia,
  sin probar).
- La clave va en los secretos de la empresa, como el resto.

**Límite:** su motor de `branding` es una caja negra. Si la prueba de la Fase 0
muestra que falla en color, se agrega el medidor propio con el Chromium que ya está
en el Studio, adaptando `dembrandt` (MIT, conservando el aviso).

## 7. Riesgos

- **Inyección de instrucciones persistente. El más serio y el menos obvio.** El
  texto de una web termina en el perfil, y el perfil entra al prompt de todos los
  agentes, para siempre. Un sitio podría colar instrucciones. El contenido se trata
  como datos, nada entra sin revisión humana, y se vigilan patrones imperativos.
- **SSRF.** Si un usuario mete una URL que lee el servidor, hay que bloquear redes
  internas, también tras redirecciones y DNS. `lib/url.ts` de tu repo es una base
  incompleta; Firecrawl reduce el riesgo al no leer desde nuestro servidor.
- **Derechos.** Fuentes propietarias: no bajarlas. Logo y fotos: solo con el permiso
  del paso 1. No analizar marcas ajenas para imitarlas.
- **Inventar.** Lo que el sitio no dice queda vacío o como pregunta. Vale para
  cifras, clientes y premios, en línea con la regla de que los agentes no inventan.
- **La web no es la marca.** Una web mala da un perfil malo. Se avisa con un puntaje
  de calidad del análisis, y se pide material antes de insistir.
- **Copiar en vez de tener criterio.** Las citas de la web enseñan cómo suena la
  marca, no qué debe decir. El ángulo sigue naciendo del criterio de la marca.
- **Nada fijo en el motor.** Sin referencias a Plogy, ni rubros ni idiomas cableados.
- **Espacio.** 30 fotos de unos 250 KB son unos 8 MB por marca. No preocupa con 1 GB.

## 8. Cómo saber si funciona

Es lo que nadie publica: ningún proveedor da cifras de precisión. El estudio más
cercano (Aegix Pulse, 96 tareas sintéticas) encontró que agregar un perfil de marca
subió 0,16 sobre 5, sin significancia, y que los **humanos no reprodujeron lo que
decía el juez de IA**.

Lección: la calidad la juzgan personas, y el perfil solo no alcanza.

**Banco de pruebas: 12 a 15 marcas** que conozcas, para saber la respuesta correcta.
Mezclar B2B, restaurante, ecommerce, marca personal, sitio en Wix y una web mala.
Sirven Plogy, AJ Link, Pinsa, Pub des Vergers, Valle Verde, Tuvetia y Estudio Hayuelo.

**Metas propuestas:**

| Qué | Meta |
|---|---|
| Primario correcto | 12 de 15 |
| Logo correcto (o pide ayuda) | 15 de 15 |
| Fuente de titulares correcta o parecida | 12 de 15 |
| Datos inventados | 0 |
| Campos que la persona tuvo que corregir | Menos de 25 % |
| Prueba a ciegas: pieza contra una real de la marca | Empate o mejor con 3 personas |
| Del link al primer post | Menos de 15 minutos |

Son metas mías, no referencias del mercado. Los minutos y el costo reales salen de
la Fase 0; como referencia, Pomelli tarda hasta 8 minutos en el perfil.

## 9. Orden de trabajo

- **Fase 0. Probar antes de construir.** Script local con el plan gratis de
  Firecrawl sobre el banco de pruebas, sin tocar el Studio. Resuelve el costo de
  `branding`, cómo sale el color y si hace falta medidor propio.
- **Fase 1. La voz.** Link → perfil, pilares, audiencias, CTA y vetos, con evidencia
  y revisión. Es lo que más rinde primero: mejora a todos los agentes, sin tocar el diseño.
- **Fase 2. Lo visual.** Colores, logo, fuentes y fotos a la biblioteca.
- **Fase 3. Las direcciones.** Las 3 direcciones y su paso por el importador. Aquí
  aparece el resultado completo.
- **Fase 4. Redes y corrección por chat.** Instagram, LinkedIn, PDF y «volver a analizar».
- **Fase 5. Kit de fábrica neutro.** El de `ITERACIONES.md`, teñido con los tokens.
  Da un resultado inmediato y respalda a los modos «plantillas» y «mecánico».

## 10. Decisiones pendientes

1. **¿Para quién es primero?** Lo recomendado es uso interno de Plogy, con alguien
   revisando, para cuentas nuevas. Abrirlo a clientes sueltos exige más cuidado en
   §7 y debería esperar a la Fase 5.
2. **Pagar Firecrawl.** $19 al mes tras la Fase 0, que se hace gratis.
3. **Conectar la extensión de Chrome y probar Pomelli**, o que alguien pase unos 3
   sitios del banco de pruebas por ahí. Tener su resultado al lado sería la mejor
   comparación, y no requiere construir nada.

## Fuentes

**Primarias**

- [Anuncio de Pomelli](https://blog.google/innovation-and-ai/models-and-research/google-labs/pomelli/)
- [Ayuda de Google: Business Profile](https://support.google.com/labs/answer/17090488?hl=en)
- [Canva Brand Kit Builder](https://www.canva.com/help/brand-kit-builder/)
- [Blaze: crear un Brand Kit](https://help.blaze.ai/en/articles/11386914-how-to-create-a-brand-kit)
- [Holo: Brand DNA](https://docs.tryholo.ai/brand-dna/overview.md)
- [Adobe GenStudio: marcas](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/guidelines/brands)
- [Adobe GenStudio: validación de marca](https://experienceleague.adobe.com/en/docs/genstudio-for-performance-marketing/user-guide/guidelines/brand-validation)
- [Typeface Brand Agent](https://www.typeface.ai/product/brand-agent)
- [Writer: calibrar la voz](https://support.writer.com/articles/2129182165-how-to-calibrate-voice-for-your-content)
- [Claude Design: sistema de diseño](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design)
- [Firecrawl: scrape y branding](https://docs.firecrawl.dev/features/scrape)
- [Firecrawl: créditos](https://docs.firecrawl.dev/billing)
- [Firecrawl: código del paso con modelo](https://raw.githubusercontent.com/firecrawl/firecrawl/main/apps/api/src/lib/branding/llm.ts)
- [Brandfetch: precios](https://brandfetch.com/developers/pricing)
- [DESIGN.md](https://github.com/google-labs-code/design.md)
- [Aegix Pulse (arXiv)](https://arxiv.org/abs/2609.07672)

**Código leído:** dembrandt, extractvibe, designscan, design-dna, Open-Pomelli,
blueprint-extractor, web-design-tokens, stackmd, dna-studio y brnd. Casi todos con
licencia MIT; `designmd-extractor` no declara licencia y no se debe copiar.

**Reseñas de terceros, sin método**

- [Lilach Bullock](https://www.lilachbullock.com/google-pomelli/)
- [Foro tianpan](https://tianpan.co/forum/t/google-pomelli-just-launched-first-impressions-and-hands-on-review/114)
- [ComputerTech](https://computertech.co/google-pomelli-review/)
- [DesignerBox](https://designerbox.ai/blog/google-pomelli/) (vende un competidor)
