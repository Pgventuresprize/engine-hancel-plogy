import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { validateBrief, quotas, planPieces, referenceUrl, parseScript, type Brief, type Piece, type Script } from "../src/engine/video-campaigns/model"
import { technicalReview, parseEditorialReview } from "../src/engine/video-campaigns/quality"
import { writerPrompt, reviewPrompt } from "../src/engine/video-campaigns/prompts"
import { normalizeReference, numberOrNull, rankReferences } from "../src/engine/video-campaigns/references"
import { PREVIEW_BRIEF, PREVIEW_BRAND, PREVIEW_SCRIPT } from "../src/engine/video-campaigns/preview"
import { transcriptText } from "../src/engine/video-campaigns/transcript"
const brief=():Brief=>structuredClone(PREVIEW_BRIEF)
const piece=(mode:Piece["mode"]="original")=>planPieces({...brief(),count:1,mix:{replica:mode==="replica"?100:0,adaptacion:mode==="adaptacion"?100:0,original:mode==="original"?100:0}},"camp",randomUUID)[0]
const script=():Script=>structuredClone(PREVIEW_SCRIPT)

test("una referencia elegida tiene cupo aunque su tema tenga poco peso",()=>{
 const url="https://www.tiktok.com/@ejemplo/video/1234567890123456789/"
 const b=validateBrief({...brief(),topics:[{name:"Prioritario",focus:"",weight:100,references:[]},{name:"Elegido",focus:"",weight:1,references:[url]}]})
 assert.ok(planPieces(b,"c",randomUUID).some(p=>p.reference?.url===url))
 assert.throws(()=>validateBrief({...b,count:1,mix:{replica:0,adaptacion:0,original:100}}),/más referencias/)
})

test("la recuperación de audio limpia subtítulos y segmentos sin usar el caption",()=>{
 assert.equal(transcriptText("WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHola <b>equipo</b>\n\n2\n00:00:02.000 --> 00:00:04.000\nEsto es una prueba."),"Hola equipo Esto es una prueba.")
 assert.equal(transcriptText(JSON.stringify({segments:[{text:"Hola"},{text:"equipo"}]})),"Hola equipo")
 assert.equal(transcriptText(JSON.stringify({caption:"Esto no es voz"})),"")
})
test("una campaña multitema conserva 6/2/2 sobre diez videos base",()=>{
 const b=validateBrief(brief()),p=planPieces(b,"campaign",randomUUID)
 assert.equal(p.length,10);assert.equal(p.filter(x=>x.mode==="replica").length,6);assert.equal(p.filter(x=>x.mode==="adaptacion").length,2);assert.equal(p.filter(x=>x.mode==="original").length,2)
 assert.ok(new Set(p.map(x=>x.topic)).size>1);assert.equal(new Set(p.map(x=>x.id)).size,10)
})
test("el redondeo conserva el total para campañas pequeñas y todas las mezclas enteras",()=>{
 for(let count=1;count<=35;count++)for(let a=0;a<=100;a+=5)for(let b=0;b<=100-a;b+=5){const q=quotas(count,{replica:a,adaptacion:b,original:100-a-b});assert.equal(q.replica+q.adaptacion+q.original,count);assert.ok(Object.values(q).every(Number.isInteger))}
})
test("la cantidad cuenta videos y no se multiplica por los tres canales",()=>assert.equal(planPieces(brief(),"c",randomUUID).length,10))
test("mezcla, fechas inexistentes y valores fuera de límites se rechazan",()=>{
 assert.throws(()=>validateBrief({...brief(),mix:{replica:60,adaptacion:40,original:20}}))
 assert.throws(()=>validateBrief({...brief(),start:"2026-02-30"}))
 assert.throws(()=>validateBrief({...brief(),count:1000}))
 assert.throws(()=>validateBrief({...brief(),topics:[]}))
 assert.throws(()=>validateBrief({...brief(),channels:[]}))
})
test("el usuario puede seleccionar una referencia sin métricas ni filtro de dificultad",()=>{
 const b=brief();b.topics[0].references=["https://www.instagram.com/reel/ABC_12/"]
 const p=planPieces(b,"c",randomUUID).find(x=>x.reference)!
 assert.ok(p.reference?.selectedByUser);assert.equal(p.phase,"extract");assert.equal(p.reference?.views,null)
})
test("referencias canónicas; se rechazan hosts internos y enlaces ambiguos",()=>{
 assert.equal(referenceUrl("https://www.instagram.com/reel/ABC/?utm_source=x"),"https://www.instagram.com/reel/ABC/")
 for(const u of ["https://localhost/reel/a/","https://instagram.com.evil.com/reel/ABC/","http://www.instagram.com/reel/ABC/","https://user:pass@www.instagram.com/reel/ABC/","https://www.instagram.com:444/reel/ABC/","https://vm.tiktok.com/short/"])assert.throws(()=>referenceUrl(u))
})
test("los null no eclipsan campos alternativos de vistas",()=>{
 assert.equal(numberOrNull(null),null);assert.equal(numberOrNull(""),null);assert.equal(numberOrNull(-1),null)
 assert.equal(normalizeReference({url:"https://www.instagram.com/reel/ABC/",videoPlayCount:null,igPlayCount:100000,likesCount:2000},"INSTAGRAM")?.views,100000)
})
test("se conservan comentarios y compartidos; se excluyen anuncios y slideshows en discovery",()=>{
 const x={webVideoUrl:"https://www.tiktok.com/@builder/video/123456/",playCount:100000,diggCount:2000,commentCount:30,shareCount:80}
 const r=normalizeReference(x,"TIKTOK")!;assert.equal(r.comments,30);assert.equal(r.shares,80)
 assert.equal(normalizeReference({...x,isAd:true},"TIKTOK"),null);assert.equal(normalizeReference({...x,isSlideshow:true},"TIKTOK"),null)
 assert.equal(rankReferences([r,r]).length,1)
})
test("parser exige campos y captions de los canales solicitados",()=>{
 assert.doesNotThrow(()=>parseScript(script(),brief().channels))
 assert.throws(()=>parseScript({...script(),captions:{instagram:"hola"}},brief().channels))
 assert.throws(()=>parseScript({...script(),shots:[]},brief().channels))
})
test("línea de tiempo, voz y CTA se contrastan con el libreto",()=>{
 const p=piece(),b=brief(),s=script();s.shots[3].end=120
 assert.ok(technicalReview(s,p,b).some(x=>x.rule==="duration"))
 s.shots[1].start=3;assert.ok(technicalReview(s,p,b).some(x=>x.rule==="timeline"))
 s.cta="Síguenos";assert.ok(technicalReview(s,p,b).some(x=>x.rule==="cta_changed"))
 s.narration="Texto diferente";assert.ok(technicalReview(s,p,b).some(x=>x.rule==="narration"))
})
test("pendientes y oferta ausente impiden marcar listo para grabar",()=>{
 const p=piece(),b=brief(),s=script();s.pending=["Caso real"]
 assert.ok(technicalReview(s,p,b).some(x=>x.rule==="pending"))
 assert.ok(technicalReview(script(),p,{...b,offer:""}).some(x=>x.rule==="offer"))
})
test("el relleno de la auditoría se detecta en originales y adaptaciones",()=>{
 const s=script();s.shots[1].voice="Hay varias opciones que puedes revisar según lo que necesites. Primero revisa tu caso."
 s.narration=s.shots.map(x=>x.voice).join(" ")
 for(const mode of ["original","adaptacion"] as const)assert.ok(technicalReview(s,piece(mode),brief()).some(x=>x.rule==="generic_argument"))
 const p=piece("replica");p.reference={url:"https://www.instagram.com/reel/ABC/",author:"x",platform:"INSTAGRAM",caption:"",views:null,likes:null,comments:null,shares:null,publishedAt:null,capturedAt:"",selectedByUser:true};p.transcript=s.narration
 assert.ok(!technicalReview(s,p,brief()).some(x=>x.rule==="generic_argument"))
})
test("una afirmación necesita evidencia del material disponible, no una URL inventada",()=>{
 const s=script();s.claims=[{text:"Esto ocurrió",kind:"fact",source:"https://inexistente.example",evidence:"Texto que no existe"}]
 assert.ok(technicalReview(s,piece(),brief()).some(x=>x.rule==="claim_evidence"))
})
test("una réplica no hereda narrativa original ni veto de producción",()=>{
 const p=piece("replica"),b=brief()
 const w=writerPrompt(b,p,PREVIEW_BRAND),r=reviewPrompt(b,p,PREVIEW_BRAND)
 assert.match(w.system,/RÉPLICA FIEL/);assert.match(w.system,/Primera persona permitida/);assert.match(w.system,/nunca rechaces una referencia por complejidad/)
 assert.match(r.system,/No exijas novedad/);assert.match(r.system,/TODAS las afirmaciones/)
})
test("adaptación y original tienen contratos diferentes",()=>{
 assert.match(writerPrompt(brief(),piece("adaptacion"),PREVIEW_BRAND).system,/PARA CONFIANZA/)
 assert.match(writerPrompt(brief(),piece("original"),PREVIEW_BRAND).system,/PARA CONVERSIÓN/)
 assert.match(reviewPrompt(brief(),piece("original"),PREVIEW_BRAND).system,/recurso.*exista/)
})
test("el revisor editorial falla cerrado ante una respuesta incompleta",()=>{
 assert.throws(()=>parseEditorialReview({decision:"ready"}));assert.throws(()=>parseEditorialReview({findings:[{detail:"x"}]}))
 assert.deepEqual(parseEditorialReview({findings:[]}),[])
})
