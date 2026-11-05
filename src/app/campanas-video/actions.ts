"use server"
import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { exigirAdvance } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { configured, createCampaign, listCampaigns, campaignView, getPiece, editPiece, pauseCampaign, saveApify, connections } from "@/engine/video-campaigns/repository"
import { jsonModel } from "@/engine/video-campaigns/providers"
import { INTAKE_SYSTEM } from "@/engine/video-campaigns/prompts"
import { parseObject, parseScript, userReference, text, UUID, MODES, type Brief, type Piece } from "@/engine/video-campaigns/model"
import { workOne } from "@/engine/video-campaigns/worker"

async function readyAccount(){const a=await exigirAdvance();if(!await configured())throw new Error("Falta aplicar la migración de almacenamiento de Campañas de video.");return a.id}
function id(value:string){if(!UUID.test(value))throw new Error("Identificador inválido.");return value}
function wake(accountId:string){after(async()=>{try{await workOne(accountId)}catch(e){console.error("[vc2] No se completó la pasada:",e instanceof Error?e.message:"error")}})}
export async function readCampaigns(){const accountId=await readyAccount();return listCampaigns(accountId)}
export async function readCampaign(campaignId:string){const accountId=await readyAccount();return campaignView(accountId,id(campaignId))}
export async function startCampaign(input:unknown,requestId:string){
  const accountId=await readyAccount()
  const campaignId=await createCampaign(accountId,id(requestId),input)
  wake(accountId);return campaignView(accountId,campaignId)
}
export async function interpretRequest(request:string){
  const accountId=await readyAccount(), source=text(request,12000)
  if(!source)throw new Error("Escribe lo que quieres generar.")
  const r=await jsonModel(accountId,INTAKE_SYSTEM,source)
  const o=parseObject(r.text)
  // El intérprete no puede introducir enlaces que la persona nunca aportó.
  if(Array.isArray(o.topics))for(const item of o.topics){const t=item as Record<string,unknown>;if(Array.isArray(t.references))t.references=t.references.filter(u=>typeof u==="string"&&source.includes(u))}
  if(Array.isArray(o.topics))o.topics=o.topics.map(item=>{const t=item as Record<string,unknown>;return {name:text(t.name,120),focus:text(t.focus,1500),weight:Math.max(1,Math.min(100,Math.round(Number(t.weight)||1))),references:Array.isArray(t.references)?t.references:[]}}).filter(t=>t.name).slice(0,20)
  if(o.mix){const mix=o.mix as Record<string,unknown>;if(MODES.some(m=>!Number.isInteger(mix[m])||Number(mix[m])<0||Number(mix[m])>100)||MODES.reduce((n,m)=>n+Number(mix[m]),0)!==100)throw new Error("El pedido contiene una mezcla incompleta o contradictoria. Ajusta los porcentajes de los tres grupos.")}
  if(o.count!==undefined&&(!Number.isInteger(o.count)||Number(o.count)<1||Number(o.count)>35))throw new Error("La cantidad debe estar entre uno y 35 videos.")
  return o
}
export async function pause(campaignId:string,paused:boolean){const accountId=await readyAccount();await pauseCampaign(accountId,id(campaignId),Boolean(paused));if(!paused)wake(accountId)}
export async function connectApify(token:string){const accountId=await readyAccount();await saveApify(accountId,token);return connections(accountId)}
export async function updatePiece(pieceId:string,revision:number,command:unknown){
  const accountId=await readyAccount(),row=await getPiece(accountId,id(pieceId))
  if(row.revision!==revision)throw new Error("La pieza cambió; actualiza antes de guardar.")
  const c=command as Record<string,unknown>,p=structuredClone(row.payload)
  const campaign=await campaignView(accountId,row.campaign_id)
  let queue=false
  if(c.kind==="script"){
    p.script=parseScript(c.script,campaign.config.channels);p.edits=true;p.review=null;p.phase="review";p.status="queued";queue=true
  }else if(c.kind==="reference"){
    if(p.mode!=="replica")throw new Error("Esta pieza no pertenece al cupo de réplicas.")
    p.reference=userReference(c.url as string);p.transcript=text(c.transcript,30000);p.sourceDuration=Number(c.duration)||null;p.phase=p.transcript.length>=30?"write":"extract";p.mode="replica";p.objective="Awareness";p.script=null;p.review=null;p.edits=false;p.correctionCount=0;p.status="queued";p.error="";queue=true
  }else if(c.kind==="regenerate"){
    p.instruction=text(c.instruction,3000)
    if(typeof c.cta==="string")p.ctaOverride=text(c.cta,1000)
    p.phase=p.script?"write":p.mode==="replica"?(p.transcript?"write":p.reference?"extract":"discover"):p.mode==="adaptacion"?(p.dossier?"write":"research"):"concept"
    p.status="queued";p.error="";p.review=null;p.correctionCount=0;p.edits=false;queue=true
  }else if(c.kind==="schedule"){
    const date=text(c.date,10)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T12:00:00Z"))||new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date)throw new Error("Fecha inválida.")
    p.date=date
  }else if(c.kind==="production"){
    if(!["guion","grabando","editando","terminado"].includes(String(c.status)))throw new Error("Estado inválido.")
    p.productionStatus=c.status as Piece["productionStatus"]
    const url=text(c.url,1000)
    if(url){const u=new URL(url);if(u.protocol!=="https:"||u.username||u.password)throw new Error("Usa un enlace https del video.");p.videoUrl=u.href}
  }else if(c.kind==="concept"){
    const index=Number(c.index)
    if(!Number.isInteger(index)||!p.concepts[index])throw new Error("Concepto inválido.")
    const chosen=p.concepts.splice(index,1)[0];p.concepts.unshift(chosen);p.phase="write";p.status="queued";p.review=null;p.correctionCount=0;queue=true
  }else throw new Error("Acción desconocida.")
  await editPiece(row,p,queue);if(queue)wake(accountId);return campaignView(accountId,row.campaign_id)
}
export async function updateCampaignContext(campaignId:string,input:{offer:string;cta:string;material:string}){
  const accountId=await readyAccount(),c=await campaignView(accountId,id(campaignId))
  const config:Brief={...c.config,offer:text(input.offer,2000),cta:text(input.cta,1000),material:text(input.material,20000)}
  const r=await supabaseAdmin().rpc("vc2_context",{p_campaign:c.id,p_account:accountId,p_config:config})
  if(r.error)throw new Error(r.error.message)
  if(!r.data)throw new Error("Hay una pieza trabajando. Pausa la campaña y espera a que termine la pasada antes de cambiar el contexto.")
  wake(accountId)
  return campaignView(accountId,c.id)
}
export async function versions(pieceId:string){
  const accountId=await readyAccount();await getPiece(accountId,id(pieceId))
  const r=await supabaseAdmin().from("vc2_versions").select("id,created_at,payload").eq("piece_id",pieceId).eq("account_id",accountId).order("created_at",{ascending:false}).limit(20)
  if(r.error)throw new Error(r.error.message);return r.data as {id:string;created_at:string;payload:Piece}[]
}
export async function restoreVersion(pieceId:string,versionId:string,revision:number){
  const accountId=await readyAccount(),row=await getPiece(accountId,id(pieceId));if(row.revision!==revision)throw new Error("Actualiza la pieza antes de restaurar.")
  const r=await supabaseAdmin().from("vc2_versions").select("payload").eq("id",id(versionId)).eq("piece_id",pieceId).eq("account_id",accountId).maybeSingle()
  if(r.error||!r.data)throw new Error("No existe esa versión.")
  const p=r.data.payload as Piece;p.edits=true;p.review=null;p.phase="review";p.status="queued"
  await editPiece(row,p,true);wake(accountId);return campaignView(accountId,row.campaign_id)
}
export async function newRequestId(){await exigirAdvance();return randomUUID()}
