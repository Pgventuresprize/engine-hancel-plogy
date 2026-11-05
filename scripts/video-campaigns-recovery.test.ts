import { test } from "node:test"
import assert from "node:assert/strict"
import { modelOutputPolicy, shortSearchQuery, topicAffinity, pieceErrorLabel, retryPhase, apifyStartFailure } from "../src/engine/video-campaigns/runtime-policy"
import { collectSearchResults, normalizeReference, rankReferences } from "../src/engine/video-campaigns/references"
import { previewCampaign } from "../src/engine/video-campaigns/preview"

test("el razonamiento no consume por defecto la salida del JSON",()=>{
 assert.deepEqual(modelOutputPolicy("claude-sonnet-5"),{max_tokens:8000,thinking:{type:"disabled"}})
 assert.deepEqual(modelOutputPolicy("claude-sonnet-5-5"),{max_tokens:8000,thinking:{type:"between_tools"}})
 assert.deepEqual(modelOutputPolicy("claude-opus-5-5"),{max_tokens:16000})
})
test("una consulta de red social no incluye el objetivo editorial completo",()=>{
 const q=shortSearchQuery({name:"Agentes de WhatsApp para atención comercial",focus:"Mostrar cómo un agente atiende consultas y ayuda al cliente a comprar",weight:1,references:[]})
 assert.equal(q,"Agentes WhatsApp atención comercial")
 assert.equal(shortSearchQuery({name:"IA para el Estado/gobiernos",focus:"Mostrar aplicaciones",weight:1,references:[]}),"IA Estado gobiernos")
})
test("un proveedor rechazado no elimina los videos recuperados del otro",async()=>{
 const results=await Promise.allSettled([
   Promise.reject(new Error("Apify HTTP 402")),
   Promise.resolve({waiting:false as const,items:[{url:"https://www.instagram.com/reel/abc123/",type:"Video",caption:"Agentes de WhatsApp",videoPlayCount:200000,likesCount:4500}]})
 ])
 const found=collectSearchResults(results)
 assert.equal(found.references.length,1);assert.equal(found.references[0].platform,"INSTAGRAM")
 assert.deepEqual(found.errors,["Apify HTTP 402"]);assert.equal(found.waiting,false)
})
test("una referencia histórica conserva umbrales y afinidad, sin llamarla reciente",()=>{
 const ref=normalizeReference({webVideoUrl:"https://www.tiktok.com/@autor/video/1234567890123456789",text:"Agente de WhatsApp para atender clientes",playCount:167600,diggCount:8091,createTimeISO:"2025-09-01T00:00:00Z"},"TIKTOK")!
 const now=Date.parse("2026-11-05")
 assert.equal(rankReferences([ref],now).length,0)
 assert.equal(rankReferences([ref],now,0).length,1)
 assert.ok(topicAffinity(ref,{name:"Agentes de WhatsApp",focus:"Atención comercial",weight:1,references:[]})>0)
 assert.equal(rankReferences([{...ref,views:1000}],now,0).length,0)
})
test("fallos de proveedor y generación no piden al usuario un dato inexistente",()=>{
 assert.equal(pieceErrorLabel({phase:"write",error:"El modelo agotó el límite de salida."}),"Error de generación")
 assert.equal(pieceErrorLabel({phase:"discover",error:"No hay referencias suficientes."}),"Búsqueda sin resolver")
 assert.equal(pieceErrorLabel({phase:"extract",error:apifyStartFailure(402,"")}),"Apify necesita atención")
 assert.equal(pieceErrorLabel({phase:"concept",error:"Define la oferta o siguiente paso."}),"Necesita material")
 assert.match(apifyStartFailure(429,""),/concurrencia/)
})
test("reintentar una revisión conserva el libreto y vuelve a revisar",()=>{
 const p=previewCampaign().pieces[0].payload
 assert.equal(retryPhase({...p,phase:"review"}),"review")
 assert.equal(retryPhase({...p,phase:"write"}),"write")
 assert.equal(retryPhase({...p,phase:"done"}),"review")
})
