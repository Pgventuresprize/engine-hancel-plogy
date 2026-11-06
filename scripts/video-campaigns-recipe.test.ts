import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { planPieces, type Brief, type Piece, type Script } from "../src/engine/video-campaigns/model"
import { technicalReview } from "../src/engine/video-campaigns/quality"
import { reviewPrompt, writerPrompt } from "../src/engine/video-campaigns/prompts"
import { PREVIEW_BRAND, PREVIEW_BRIEF, PREVIEW_SCRIPT } from "../src/engine/video-campaigns/preview"
import { needsRecipe, parseRecipe, recipeFindings, recipeIsCurrent, recipePrompt, RECIPE_REVIEW_RULE, RECIPE_RULE } from "../src/engine/video-campaigns/recipe"

const brief=():Brief=>structuredClone(PREVIEW_BRIEF)
const reference={url:"https://www.tiktok.com/@ana/video/1/",author:"ana",platform:"TIKTOK" as const,caption:"",views:1,likes:1,comments:null,shares:null,publishedAt:null,capturedAt:"",selectedByUser:true}
const transcript="Los animadores me van a odiar por revelar esto, pero esta IA crea animaciones en minutos."
const replica=():Piece=>({...planPieces({...brief(),count:1,mix:{replica:100,adaptacion:0,original:0}},"c",randomUUID)[0],reference,transcript})
const raw={windowSeconds:4,spoken:transcript,spokenOutput:transcript,onScreen:["2 horas / 10 minutos"],visual:"Comparación",mechanic:"Enemigo y secreto",why:"Tensión",template:"Los [GREMIO] me van a odiar por revelar esto, pero [HERRAMIENTA] [RESULTADO]",anchors:["me van a odiar por revelar esto","en [TIEMPO] muy rápido","pero"],slots:[{name:"GREMIO",guide:"oficio"}],care:"Confirmar",beats:[{role:"paso",what:"uno"}],retention:"Pasos",bait:false}
const conFicha=(extra:Partial<Piece>={})=>{const p={...replica(),...extra};p.recipe=parseRecipe(raw,p);return p}
const libreto=(voice:string,text="Texto"):Script=>({...structuredClone(PREVIEW_SCRIPT),hook:voice,narration:voice,shots:[{start:0,end:4,visual:"Plano",voice,text}]})

test("sin contexto visual la ficha no finge haber visto el video",()=>{
 const p=conFicha()
 assert.equal(p.recipe?.visualObserved,false)
 assert.deepEqual(p.recipe?.onScreen,[])
 const v=conFicha({dossier:"Contexto visual recuperado por el proveedor (distinguir de propuestas): caja blanca"})
 assert.equal(v.recipe?.visualObserved,true)
 assert.deepEqual(v.recipe?.onScreen,["2 horas / 10 minutos"])
 assert.match(recipePrompt(v,PREVIEW_BRAND),/caja blanca/)
})

test("un ancla con hueco deja su parte fija y una ficha sin plantilla se rechaza",()=>{
 assert.deepEqual(conFicha().recipe?.anchors,["me van a odiar por revelar esto","muy rápido"])
 assert.throws(()=>parseRecipe({},replica()),/plantilla/)
})

test("la ficha queda atada a su fuente: cambiar referencia o transcripción obliga a repetirla",()=>{
 const p=conFicha()
 assert.equal(needsRecipe(p),false)
 assert.equal(needsRecipe({...p,transcript:transcript+" Otra cosa más."}),true)
 assert.equal(needsRecipe({...p,reference:{...reference,url:"https://www.tiktok.com/@otra/video/2/"}}),true)
 assert.equal(recipeIsCurrent({...p,recipe:null}),false)
 const sinFicha=replica();assert.equal(needsRecipe(sinFicha),true)
 assert.equal(needsRecipe({...sinFicha,transcript:"corto"}),false)
})

test("adaptación y original no pasan por la ficha",()=>{
 const p={...replica(),mode:"original" as const}
 assert.equal(needsRecipe(p),false)
 assert.deepEqual(recipeFindings(libreto("Otra cosa"),{...conFicha(),mode:"adaptacion"}),[])
})

test("un hook que pierde el mecanismo se frena con la plantilla exacta",()=>{
 const f=recipeFindings(libreto("Todos automatizan sin revisar, pero esta IA revisa tu proceso"),conFicha()).find(x=>x.rule==="hook_recipe")
 assert.equal(f?.level,"block")
 assert.match(f?.fix||"",/\[GREMIO\]/)
})

test("el mecanismo intacto pasa aunque cambie el tema, sin importar tildes ni signos",()=>{
 const p=conFicha();p.recipe!.anchors=["me van a odiar por revelar esto"]
 const f=recipeFindings(libreto("Los consultores ME VAN a odiar, por revelar esto, pero esta IA revisa tu proceso en minutos"),p)
 assert.ok(!f.some(x=>x.rule==="hook_recipe"))
})

test("una edición manual se señala, nunca se bloquea para reescribirla",()=>{
 const f=recipeFindings(libreto("Mi versión escrita a mano del hook"),conFicha({edits:true})).find(x=>x.rule==="hook_recipe")
 assert.equal(f?.level,"warning")
})

test("una promesa de dinero se marca para ajuste manual sin bloquear",()=>{
 const p=conFicha();p.recipe!.bait=true;p.recipe!.anchors=[]
 const f=recipeFindings(libreto(transcript),p).filter(x=>x.rule==="manual_promise")
 assert.equal(f.length,1)
 assert.equal(f[0].level,"warning")
})

test("el texto en pantalla solo se exige si se observó",()=>{
 assert.ok(!recipeFindings(libreto(transcript,""),conFicha()).some(x=>x.rule==="hook_screen"))
 const v=conFicha({dossier:"Contexto visual recuperado por el proveedor: caja"})
 assert.ok(recipeFindings(libreto(transcript,""),v).some(x=>x.rule==="hook_screen"))
})

test("el largo del hook no cuenta el desarrollo de los planos siguientes",()=>{
 const p=conFicha();p.recipe!.anchors=[];p.recipe!.windowSeconds=6
 const s=libreto(transcript);s.shots.push({start:4,end:12,visual:"x",voice:"Ahora viene todo un desarrollo larguísimo que no pertenece al hook y que no debería contar para medir su largo real en absoluto",text:""})
 assert.ok(!recipeFindings(s,p).some(x=>x.rule==="hook_length"))
})

test("el prompt incluye la ficha solo si está vigente y es réplica",()=>{
 const b=brief(),p=conFicha()
 const w=writerPrompt(b,p,PREVIEW_BRAND)
 assert.ok(w.system.includes(RECIPE_RULE));assert.match(w.prompt,/GREMIO/)
 const vieja=writerPrompt(b,{...p,transcript:transcript+" Cambió."},PREVIEW_BRAND)
 assert.ok(!vieja.system.includes(RECIPE_RULE));assert.doesNotMatch(vieja.prompt,/GREMIO/)
})

test("el revisor editorial recibe la ficha y no cuenta como cambio llenar sus corchetes",()=>{
 const b=brief(),p=conFicha(),s=libreto(transcript);p.script=s
 const r=reviewPrompt(b,p,PREVIEW_BRAND)
 assert.ok(r.system.includes(RECIPE_REVIEW_RULE));assert.match(r.prompt,/GREMIO/)
 const sin=reviewPrompt(b,{...replica(),script:s},PREVIEW_BRAND)
 assert.ok(!sin.system.includes(RECIPE_REVIEW_RULE));assert.doesNotMatch(sin.prompt,/receta/)
})

test("la regla del escritor no choca con las revisiones técnicas de tiempo y apertura",()=>{
 assert.match(RECIPE_RULE,/3,5 palabras por segundo/)
 assert.match(RECIPE_RULE,/primer plano completo/)
 assert.match(RECIPE_RULE,/changes/)
 const p=conFicha(),s=libreto(transcript);s.shots[0].end=6;p.recipe!.anchors=["me van a odiar por revelar esto"]
 const f=technicalReview(s,p,brief()).map(x=>x.rule)
 assert.ok(!f.includes("voice_time"));assert.ok(!f.includes("hook"));assert.ok(!f.includes("hook_recipe"))
})

test("sin ficha el prompt y la revisión de una pieza quedan igual que antes",()=>{
 const b=brief(),p=replica(),s=libreto(transcript)
 assert.doesNotMatch(writerPrompt(b,p,PREVIEW_BRAND).prompt,/receta/)
 assert.ok(!technicalReview(s,p,b).some(x=>x.rule.startsWith("hook_")&&x.rule!=="hook"))
})
