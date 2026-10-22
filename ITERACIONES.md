# Iteraciones posibles

Lo que se aparcó **por orden, no por falta de valor**: todo esto sirve, pero
había algo antes. Cada punto dice qué es, por qué esperó y cuándo tiene sentido
retomarlo. Lo descartado porque no funcionaba no está aquí.

Al retomar uno, se detalla como bloque antes de construir.

---

## Prompts y agentes

### Mejores ángulos para escribir las piezas
- **Qué es:** subir la calidad del agente de ángulo, que es de donde parten el
  criterio, el post y el carrusel. Que entregue mejores puntos de partida: una
  tesis que la fuente sostenga, varios puntos o ángulos posibles desde los que
  escribir y no uno solo, y lo que es dato separado de lo que es lectura de la
  marca.
- **Por qué:** la prueba real del 2026-10-22 (4 noticias de hancel) mostró que el
  ángulo es el eslabón débil. Los 3 ángulos generados usan la fórmula "no es X,
  sino Y". En la noticia del hacker con agentes, la tesis ("no es una
  vulnerabilidad técnica sino un cambio de escala") contradice a la fuente, que
  dice que la técnica fue sofisticada. El post la heredó, el revisor lo frenó 3
  veces y las 2 vueltas de corrección no la tocaron. El agente de criterio llegó
  a citar esa tesis como si fuera material. El revisor mira las piezas, nunca el
  ángulo.
- **Ideas a probar:** revisar el ángulo antes de escribir (fidelidad a la fuente
  y sin la fórmula); que proponga 2 o 3 ángulos y se elija uno; que la tesis
  vaya marcada como lectura de la marca; ejemplos de buenos ángulos de Plogy en
  su skill.
- **Cuándo:** pedido por Luciano el 2026-10-22; al retomarlo, se detalla como
  bloque y se prueba con las mismas noticias de esa prueba.

### Herramienta "consultar documento"
- **Qué es:** el agente, mientras escribe, pide una sección de un documento de la
  marca ("dame Anglicismos del sistema narrativo") en vez de recibirlo entero.
  Hasta 3 consultas por pieza, anotadas en la receta.
- **Por qué esperó:** la prueba de la pieza 004 (2026-10-20) mostró que el
  documento entero en el prompt funciona y cabe. Entero es más seguro: el agente
  no puede olvidarse de abrir una sección.
- **Cuándo:** cuando los documentos de una marca no quepan juntos (los cuatro del
  kit de Plogy son unos 90.000 caracteres; un catálogo de servicios o de casos
  lo empujaría más).

### Marca › Documentos (tabla `brand_documentos`)
- **Qué es:** una pantalla para subir o pegar documentos largos de la marca; la
  app los parte por títulos y cada sección queda "fuera", "por regla" o
  "consultable". Es la base de los dos puntos siguientes.
- **Por qué esperó:** el sistema narrativo de Plogy ya entra entero como tres
  skills (1D-6a), así que hoy la pantalla repetiría lo que hacen las skills.
  Se sacó del 1D-6b el 2026-10-20.
- **Cuándo:** con la herramienta de consulta, o cuando una marca tenga un
  documento que no tenga sentido pegar como skill (catálogo, casos, glosario).

### Partir los documentos por secciones con "cuándo entra"
- **Qué es:** que de un documento largo entre solo la sección que aplica (la
  densidad del pilar de la pieza, la audiencia de la pieza).
- **Por qué esperó:** el sistema narrativo entero dio la mejor nota; partirlo
  podría perder calidad.
- **Cuándo:** solo si una prueba como la de la 004 demuestra que partido no pierde.

### Opus para LinkedIn
- **Qué es:** el mismo cambio de modelo que se hizo en Instagram.
- **Probado (2026-10-21), dos veces:**
  - Sin agente de criterio, Sonnet 5 ganó a ciegas en las tres noticias (75
    puntos contra 66): Opus escribía más corto y fiel, pero ponía menos de Plogy.
  - Con el agente de criterio, que le da ese criterio ya decidido, Opus ganó a
    ciegas en las tres (99 contra 89) y le ganó también al post del kit en la
    004. En 9 posts: 0 con criterio copiado y 6 sin ningún freno (Sonnet: 3 y
    0), de 318 a 385 palabras (Sonnet: de 415 a 662).
- **Cuándo volver a probar:** si sale un modelo nuevo o cambian las skills de LinkedIn.

### Estadística de avisos por bloque del prompt
- **Qué es:** contar qué avisos del revisor salen en las piezas que llevaban cada
  bloque, para saber qué bloque está fallando.
- **Cuándo:** cuando haya receta guardada en suficientes piezas (después del 1D-6b).

### Un agente por skill
- **Qué es:** separar narrativa, caption y CTA en agentes distintos.
- **Por qué esperó:** el texto es uno solo y tiene que ser coherente (el caption
  pide lo mismo que el cierre); cuatro llamadas cuestan y tardan cuatro veces más.
  Los agentes aparte se reservan para trabajos distintos (analizar, angular,
  escribir, revisar).
- **Cuándo:** si una prueba muestra que un agente especializado escribe mejor una
  parte concreta sin romper la coherencia.

## Revisor y corrección

### "Corregir" en segundo plano
- **Qué es:** que "Corregir" encole el trabajo en vez de esperar en la petición.
- **Por qué esperó:** en local no hay problema; en Vercel la corrección de un
  carrusel (Claude + redibujo) ronda los 40 a 50 s y la acción tiene un minuto.
- **Cuándo:** al subir a producción, si se pasa del tiempo.

### Corregir una pieza solo de Facebook redibuja la portada
- **Qué es:** hoy, si un carrusel se generó solo para Facebook, corregirlo cambia
  el texto pero no vuelve a dibujar la portada.
- **Cuándo:** si alguna marca usa Facebook sin Instagram.

### Revisor en las piezas del Estudio (recetas)
- **Qué es:** el mismo revisor automático para las piezas que salen de recetas y
  capas, no solo las del tablero.
- **Cuándo:** cuando el Estudio vuelva a usarse para publicar.

### Editor del texto de las láminas
- **Qué es:** editar a mano el titular o el cuerpo de una lámina y redibujar.
- **Por qué esperó:** hoy se corrige con "Corregir" (el agente) o regenerando.
- **Cuándo:** cuando se quiera retocar una pieza sin pasar por el agente.

### Ajustes del revisor vistos en la prueba real (2026-10-22)
- **Qué es:** tres detalles. La regla de código "alcance" frena "nadie" dentro de
  una instrucción del criterio ("apaga lo que nadie reclame"), que no es una
  afirmación de hecho. La fórmula con "eran" ("su problema no eran los agentes:
  era…") no la caza. Un post de 339 palabras con longitud "largo" (220 a 320)
  no salió marcado.
- **Por qué esperó:** son avisos menores; los frenos de esa prueba fueron
  legítimos.
- **Cuándo:** junto con el bloque de ángulos o la próxima vez que se toque el
  revisor.

## Entrada (lo que el agente lee)

### Lector de páginas que cargan con JavaScript o bloquean
- **Qué es:** leer fichas y documentaciones que no traen el texto en el HTML, y
  las páginas que bloquean a los lectores automáticos (HTTP 429 o 403), con un
  navegador de verdad o un servicio de lectura.
- **Por qué esperó:** el problema es de la entrada, no del escritor. En la prueba
  de la 004 el lector sacó 909 caracteres de la ficha de gpt-6-luna; el kit leyó
  la ficha entera y por eso ganó en evidencia. Desde 2026-10-20 el análisis lee
  también las fuentes que cita la búsqueda, y eso cubre casi siempre la página
  bloqueada (en la noticia de Basis, wboc.com respondía 429 y el comunicado
  original entró por las citas). Las notas del análisis dicen ahora el motivo.
- **Cuándo:** si las notas del análisis muestran a menudo "bloquea la lectura
  automática" y ninguna fuente citada que la sustituya.

### Agentes que buscan temas virales en la competencia
- **Qué es:** un grupo de agentes que revisa TikTok, LinkedIn, Reels y otras
  redes buscando temas virales y de alta retención para cada marca. Analizan a
  la competencia y separan qué elementos se pueden replicar (gancho, formato,
  estructura, ritmo) de los que es mejor no replicar, con el motivo. El resultado
  entra al análisis como ideas de tema y forma, no como texto que copiar: el
  criterio de la pieza sigue naciendo de la marca.
- **Por qué esperó:** se pidió anotarlo (2026-10-22). Hoy el motor parte de
  noticias, no de lo que funciona en redes.
- **Cautelas:** esas redes bloquean la lectura automática y sus condiciones la
  prohíben. Hay que decidir antes si se usan sus API oficiales, un servicio de
  datos de terceros o la lectura con un navegador real (se cruza con "Lector de
  páginas que cargan con JavaScript o bloquean").
- **Cuándo:** sin fecha; al retomarlo, se detalla como bloque.

### Serper como alternativa a Composio
- **Qué es:** otra búsqueda web para el análisis, por si Composio falla o se
  encarece.
- **Cuándo:** si Composio da problemas.

## Marca desde las referencias

### Importar la marca entera desde una carpeta
- **Qué es:** adjuntar la carpeta de referencias de una marca (para Plogy,
  `PLOGY\plogy carruseles`: el kit de agentes, el brand kit, las fotos de
  `assets refference`, las skills y los PDF) y que la app extraiga todo lo que
  necesita para armarla: identidad, voz, editorial y CTA, colores, tipografías,
  logos, imágenes, ejemplos, y cómo se diseña cada carrusel (layout, estética,
  tipos de lámina). Como el importador de ejemplos: Claude propone, el código
  comprueba contra los archivos y la persona revisa campo por campo antes de
  guardar. Es el Paso 2 del roadmap, ampliado.
- **Por qué esperó:** el importador de ejemplos (2026-10-20) resolvió primero lo
  que mejora el texto. Lo visual necesita antes la biblioteca de imágenes
  (Paso 3) y una plantilla que dibuje esos tipos de lámina (Paso 4).
- **Cuándo:** después de los Pasos 3 y 4. Reutiliza el flujo del importador de
  ejemplos (subir, extraer, comprobar, revisar, guardar).

### Carruseles de Plogy como los del visor del kit
- **Qué es:** que los carruseles de Plogy salgan visualmente como los de
  `PLOGY_Carousel_Agent_Kit\piezas\visor.html`, tal cual: su estética, su
  layout, sus láminas de dato, listas, tablas, citas y cierre de vidrio sobre
  foto. El texto sigue con lo que ya tiene Hancel (revisor, receta, ejemplos,
  CTA por pieza). Es la meta del Paso 4 (plantilla editorial).
- **Cómo (decidido 2026-10-20):** no se configura a mano. La plantilla "plogy"
  de hoy no sirve. El importador analiza las piezas que la marca ya tiene
  (sus carruseles, su brand kit, sus fotos) y genera el design system y las
  plantillas de cada tipo de lámina a partir de ellas. Una marca que ya tiene
  plantillas no tiene que configurar nada; una que no tiene, parte de las
  neutras.
- **Por qué esperó:** se pidió anotarlo y cerrar antes el Paso 1.
- **Cuándo:** Paso 4, junto con "Importar la marca entera desde una carpeta".
  Los ejemplos ya guardan el tipo de cada lámina y una línea de lo visual, que
  es lo que la plantilla necesitará para elegir el diseño.

### Guardar las imágenes de las láminas en los ejemplos
- **Qué es:** subir las capturas o el `carrusel.html` de una pieza y que queden
  junto a su ejemplo (la opción C del importador).
- **Por qué esperó:** el agente que escribe no dibuja, así que hoy las imágenes
  solo servirían para mirarlas en Marca › Ejemplos.
- **Cuándo:** con el Paso 4, cuando un agente elija el diseño de cada lámina y
  las use de referencia. Se cruza con la biblioteca de imágenes (Paso 3).

### Foto de portada que confunde
- **Qué es:** cuando el banco de fotos no da nada, la portada usa la imagen de
  la noticia, una miniatura de unos 300 px que sale pixelada. En la prueba real
  (2026-10-22) salió una mujer borrosa detrás del titular "Jeremy Knox puso a 23
  agentes…", como si fuera él. Una persona de la noticia no debería ir de fondo
  si el titular nombra a otra.
- **Por qué esperó:** lo resuelve la biblioteca de imágenes (Paso 3): la portada
  sale de fotos de la marca y la miniatura deja de ser el respaldo.
- **Cuándo:** con el Paso 3; si algo queda, se ajusta ahí.
- **Estado (2026-10-22):** hecho en el código del Paso 3. La miniatura ya no es
  respaldo; el agente que elige no pone de fondo a una persona si el texto habla
  de otra. Falta verlo con fotos reales de la marca.

### Cambiar la foto de una sola lámina desde la ficha
- **Qué es:** en la ficha del carrusel, elegir otra foto para una lámina (de la
  biblioteca o de Pexels) y redibujar solo esa.
- **Por qué esperó:** hoy "Regenerar imágenes" cambia todas y no repite las que
  tenía; con eso alcanza para empezar. La ficha ya dice de dónde salió cada foto.
- **Cuándo:** si en el uso diario se quiere tocar una lámina sin perder las demás.

### Pasar la biblioteca a Cloudflare R2 o al plan Pro
- **Qué es:** el storage gratuito de Supabase es 1 GB compartido con los
  carruseles; caben unas 3.000 a 3.500 fotos. Marca › Imágenes enseña el espacio
  usado y se pone en rojo pasado el 85 %.
- **Cuándo:** al acercarse al límite. R2 da 10 GB sin costo de descarga; el
  cambio está en imagenes.ts (subida, lectura y enlaces firmados).

### Subir fotos HEIC del iPhone
- **Qué es:** Chrome no abre HEIC, así que la subida las marca como fallo y pide
  exportarlas a JPG. Safari sí las abre.
- **Cuándo:** si se suben fotos directo del iPhone desde Chrome a menudo.

### Importar ejemplos desde .html, PDF o Word
- **Qué es:** que el importador de ejemplos lea también el `carrusel.html` del
  kit, un PDF o un .docx, y no solo .md y .txt.
- **Cuándo:** con "Importar la marca entera desde una carpeta", que los necesita.

## Reportes y guías como los del kit

Revisión del 2026-10-22 de cómo hace el kit los reportes (`plogy carruseles\
PLOGY_Carousel_Agent_Kit`, piezas 003 a 018) y de qué tiene Hancel para hacerlos.
Nada construido. Al retomarlo, cada punto se detalla como bloque.

### Cómo los hace el kit
- **Orden:** clasificar → planear y decidir si la pieza lleva reporte → **escribir
  el reporte primero** → láminas con "Comenta PALABRA" → captions → DM sacado del
  reporte ya terminado. El carrusel da el gancho y el criterio; el reporte
  profundiza; el DM entrega. Ninguno copia al otro. Reglas en
  `skills\plogy-cta-design\FLUJO-REPORTE-DM.md` (§4, 7, 9, 10, 20 a 23).
- **Estructura:** resumen de 3 a 5 puntos; Qué pasó; Qué se sabe y qué no; La
  lectura de Plogy; Qué significa para tu negocio; Qué haría Plogy primero;
  Fuentes; Siguiente paso; Historial de cambios. De 1.300 a 2.900 palabras y de 5
  a 8 imágenes. Las guías (005, 010 a 012) no parten de una noticia y cambian a
  idea, paso a paso, errores, ejemplo y plantilla.
- **Lo que lo hace bueno, por peso:**
  1. Fuente primaria leída entera y fechada. En Fuentes se separa lo leído
     completo, lo visto en búsqueda y lo pendiente.
  2. "Qué se sabe y qué no", con las contradicciones a la vista, sin forzar
     una conclusión.
  3. El interés comercial de la fuente declarado, también el de Plogy.
  4. Una tesis que la fuente no tiene. La 003 bajó de nota por repetir el
     titular de AIHubMix.
  5. Un recurso que sirve: checklist con casillas, plantilla o matriz.
  6. Todo rotulado (hecho, lectura de Plogy, hipótesis, cálculo propio,
     traducción nuestra), en el texto y dentro de cada figura.
  7. Lo que promete el DM coincide con secciones que existen.
  8. Un revisor aparte que vuelve a leer las fuentes y mira los PNG. La segunda
     revisión a ciegas de la 005 encontró un "÷ 60" mal puesto.
- **Registro de verificación en el brief:** cada dato con su estado (confirmado,
  de terceros, sin verificar) y la fuente de cada afirmación de las láminas.
- **Figuras:** `reporte-figuras.html` con secciones de 1600×900 en los tokens de
  marca, pasadas a PNG con Edge sin ventana (`render-slides.ps1`). Llevan la
  fuente siempre visible. El cálculo propio va en barra rayada, el dato sin
  confirmar en punto discontinuo y el ejemplo con la etiqueta "Ejemplo
  hipotético". Las fotos de la biblioteca salen con `derive.py` (recorte y paso
  del rojo al naranja de marca).
- **Revisión:** `plogy-editorial-review` y su `RUBRICA.md`:
  - 8 criterios de 1 a 5 con anclas, sin nota global;
  - 10 reglas duras: cifras iguales a la fuente, no inventar datos, recurso
    listo, no decir publicado si no lo está, y otras;
  - tres veredictos: "Publicar con ajustes", "Mejorar antes de seguir" y
    "Descartar o replantear".
- **Huecos del propio kit:**
  - la skill `plogy-news-report` está propuesta pero no existe;
  - la plantilla de brief no tiene el bloque "Reporte y DM";
  - `CALIBRACION.md` no tiene ningún veredicto humano.

  Las reglas están repartidas entre el documento de flujo y las piezas, y hay
  que juntarlas antes de llevarlas a Hancel.

### Qué tiene Hancel y qué le falta
- **Lo que ya sirve:**
  - la investigación de la redacción (`redaccion/fuentes.ts`), con la fuente
    clasificada en primaria, parte interesada o medio;
  - las citas por bloque con ids `f1`, `f2`;
  - la imagen con crédito;
  - el envío firmado al portal (`web/webhook.ts`);
  - el ángulo y el agente de criterio;
  - el revisor con Claude;
  - `content_ctas.requiere_recurso` y `recurso_listo`, que ya impiden ofrecer
    por DM algo que no existe.
- **Por qué hoy no llega al nivel del kit:**
  - **Hace otra cosa.** La redacción escribe una noticia de 250 a 400 palabras,
    sin opinión, sin CTA y sin la lectura de Plogy. No recibe el ángulo ni el
    criterio.
  - **Lee poco.** Cada fuente entra con 7.000 caracteres como máximo y todas
    juntas con 48.000. El kit lee la ficha primaria entera.
  - **Lo hace de una pasada.** Una sola llamada. El kit planea, investiga,
    escribe, mira y corrige con herramientas.
  - **Nadie lo revisa.** El revisor solo trabaja con Instagram y LinkedIn.
  - **No tiene figuras.** Las figuras con dato y fuente solo existen en el
    compositor del Estudio, que pasa por Canva.
  - **No tiene ejemplos.** Los ejemplos solo existen para Instagram y LinkedIn.

### R1. Agente "reporte"
- **Qué es:** un agente nuevo, con Opus, que escribe el reporte con la estructura
  del kit.
  - **Entradas:** la investigación de la redacción, el análisis completo, el
    ángulo y el criterio ya decidido. Así la lectura de Plogy no la inventa el
    escritor (lo que aprendimos en B4).
  - **Contrato:** un JSON por bloques. Cada afirmación lleva las fuentes que la
    respaldan y su rótulo (hecho, lectura, hipótesis, cálculo, traducción). El
    recurso va como bloque propio (checklist, plantilla o tabla).
  - **Para qué sirve el contrato así:** el código puede comprobar que nada
    quede sin rótulo y que cada cifra esté en una fuente, como hace hoy
    `cifrasPerdidas`.
  - **Orden:** se genera antes del carrusel, y el escritor de Instagram recibe
    las secciones del reporte para que el cierre y el CTA prometan solo lo que
    hay.
- **Además:**
  - una skill "Reporte de Plogy" que junte las reglas hoy repartidas en el kit;
  - los 8 `reporte.md` del kit como ejemplos de un tipo nuevo, "reporte" (el
    importador ya lee .md).
- **Cuándo:** primero de este grupo. Es lo que más mueve la calidad.

### R2. Investigar a fondo y registro de verificación
- **Qué es:**
  - para los reportes, leer la fuente primaria entera y no recortada a 7.000
    caracteres, con un tope mucho más alto;
  - guardar por fuente si se leyó completa, solo se vio en la búsqueda o queda
    pendiente;
  - un paso que arme el registro de verificación (dato, estado, fuente) y el
    interés comercial de cada fuente.

  Las secciones "Qué se sabe y qué no" y "Fuentes" salen de ese registro, no de
  la memoria del escritor.
- **Se cruza con:** "Lector de páginas que cargan con JavaScript o bloquean"
  (sección Entrada), que aquí pasa a importar mucho más.
- **Cuándo:** junto con R1.

### R3. Revisor de reportes
- **Qué es:** llevar el revisor con Claude a los reportes, con la rúbrica del kit:
  - los 8 criterios y las 10 reglas duras;
  - comprobar que lo que promete el DM existe en el reporte;
  - frenar si algo va sin rótulo;
  - que el revisor pueda volver a abrir las fuentes, no solo leer lo que vio el
    escritor;
  - dar el veredicto en la ficha.

  Opcional: una segunda pasada a ciegas para cifras y fórmulas, y una columna
  para el veredicto de la persona que sirva de calibración.
- **Cuándo:** con R1. Sin revisor, un texto de 2.000 palabras no se puede mirar
  a ojo cada vez.

### R4. Figuras del reporte
- **Qué es:** figuras de 1600×900 dibujadas con Satori, como las láminas, a
  partir de bloques con datos:
  - tipos: portada, cifras, barras, comparación, fórmula, checklist y tabla;
  - cada una con la fuente visible, la barra rayada para el cálculo propio y la
    etiqueta de ejemplo hipotético;
  - se puede partir del modelo `Grafico` del compositor del Estudio, que ya
    pide fuente y periodo;
  - una revisión visual de cada PNG (texto solapado, cortes), como la que
    salvó la portada de la 003.
- **Por qué espera:** el estilo de las figuras debe salir de la misma plantilla
  editorial que los carruseles (Paso 4), y la foto de la biblioteca necesita el
  Paso 3.
- **Cuándo:** después de R1 a R3. Mientras tanto el reporte puede salir con la
  imagen con crédito que ya trae la redacción.

### R5. Publicación, palabra clave y DM
- **Qué es:**
  - enviar el reporte al portal con el webhook que ya existe, con un tipo
    nuevo (reporte o guía) y una URL tipo `/reportes/<slug>`;
  - cuando el portal devuelve la URL, marcar `recurso_listo` en el CTA de
    palabra clave, para que el escritor solo pueda ofrecerlo si el reporte ya
    está publicado;
  - generar los dos mensajes del DM desde el reporte, con UTM
    `utm_campaign=<id>-<palabra>`.

  El envío del DM (ManyChat u otro) sigue fuera.
- **Cuándo:** cuando exista la web de Plogy que recibe los reportes. Es lo que
  sigue pendiente del "Flujo de CTA con reporte por DM".

### R6. Guías sin noticia
- **Qué es:** reportes educativos que parten de un tema y no de `raw_news`, como
  la 005 o la 010.
- **Cuándo:** después de R1 a R3, si las noticias ya salen bien.

**Orden propuesto:** R1 + R2 + R3 juntos (el texto al nivel del kit), luego R4,
luego R5 cuando haya web y R6 al final.

**Costo:** se acepta que salga caro. Un reporte con Opus, fuentes enteras y
revisor cuesta varias veces lo que un carrusel. Va en la línea de calidad antes
que costo.

## Producto y operación

### Programador automático (scheduler)
- **Qué es:** que el motor corra solo por horario. pg_cron no está instalado;
  hoy todo se lanza a mano. Pasos y cautelas en la memoria del proyecto.
- **Cuándo:** cuando la calidad de las piezas permita dejarlas correr sin mirar.

### El carrusel espera a la siguiente pasada
- **Qué es:** una pasada a mano genera una sola pieza (procesar.ts, por el
  límite de 300 s). Si se piden LinkedIn e Instagram del mismo ángulo, el
  carrusel queda en cola hasta que alguien vuelva a pulsar un botón. Arreglo:
  que al terminar el post se dispare sola otra pasada, o el programador.
- **Por qué esperó:** visto en la prueba real del 2026-10-22; con el programador
  se resuelve solo.
- **Cuándo:** con el programador, o antes si molesta en el uso diario.

### Marcas personales
- **Qué es:** las marcas de Luciano y Juan Francisco como cuentas hijas de Plogy.
  Plan completo en `MARCAS.md`, sin construir.
- **Cuándo:** después de cerrar el paso 1.

### Biblioteca de skills de plataforma
- **Qué es:** skills base que las empresas copian y adaptan.
- **Cuándo:** cuando haya más de una marca usando Hancel en serio.

### Flujo de CTA con reporte por DM
- **Qué es:** "Comenta PALABRA", DM en dos mensajes y un reporte web, como en
  las piezas 003 a 005 del kit. Documentado, sin construir.
- **Cuándo:** solo si Luciano lo pide. El plan para generar los reportes dentro
  de Hancel está en "Reportes y guías como los del kit" (R1 a R6); la parte del
  DM es R5.

### Futuro local
- **Qué es:** que el análisis y la generación usen el CLI de Claude y corran en
  el computador. Exploración en `FUTURO-LOCAL.md`, sin implementar.
- **Cuándo:** si el token de Claude en la base vuelve a dar problemas.

### Preset opcional "Agro Colombia"
- **Qué es:** guardar como preset lo de agro que salió de la fábrica neutra.
- **Cuándo:** si entra una marca de ese sector.

### Transferencias de archivos propias (tipo WeTransfer)
- **Qué es:** un WeTransfer con la marca de Plogy para entregar archivos pesados
  (videos, piezas finales). El equipo sube con login; los archivos se suben en
  trozos directo al almacenamiento; se genera un link único con vencimiento y
  contraseña opcional; se avisa por email a los destinatarios; la página pública
  de descarga lleva la estética de Plogy (vidrio sobre foto) y la descarga sale
  del almacenamiento con una URL firmada de corta duración; un proceso
  programado borra lo vencido. Queda registro de quién descargó qué y cuándo,
  que sirve como prueba de entrega y para el seguimiento comercial.
- **Cómo (propuesto 2026-10-22):** archivos en Cloudflare R2 (10 GB gratis y no
  cobra por descargas, que es lo que encarece este tipo de servicio); datos de
  transferencias y descargas en Supabase; emails con Resend o el Gmail de
  Plogy. No en Supabase Storage: el plan gratis tiene 1 GB y se llena con dos o
  tres entregas de video.
- **Por qué esperó:** se pidió anotarlo (2026-10-22). No es parte del motor de
  contenido.
- **Pendiente de decidir:** si sirve para entregar a clientes, para recibir
  archivos de ellos o para las dos cosas.
- **Se cruza con:** "Programador automático (scheduler)", porque la limpieza de lo
  vencido necesita pg_cron o un cron de Cloudflare.
- **Cuándo:** sin fecha; al retomarlo, se detalla como bloque.

### Limpieza de código
- **Qué es:** quitar `news.ts`, que ya no se usa, y rehacer `schema.sql` desde cero
  con todas las migraciones.
- **Cuándo:** antes de que entre otra persona a trabajar en el código.
