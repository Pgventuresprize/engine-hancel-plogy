"use server"
import { randomUUID } from "node:crypto"
import { after } from "next/server"
import { exigirAdvance } from "@/lib/accounts"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { configured, createCampaign, listCampaigns, campaignView, getPiece, editPiece, pauseCampaign, saveApify, connections } from "@/engine/video-campaigns/repository"
import { jsonModel } from "@/engine/video-campaigns/providers"
import { INTAKE_SYSTEM } from "@/engine/video-campaigns/prompts"
import { parseObject, parseScript, userReference, text, UUID, type Brief, type Piece } from "@/engine/video-campaigns/model"
import { actionResult, CampaignActionError } from "@/engine/video-campaigns/action-result"
import { normalizeIntake, explicitMix } from "@/engine/video-campaigns/intake"
import { workOne } from "@/engine/video-campaigns/worker"

async function readyAccount(){const a=await exigirAdvance();if(!await configured())throw new CampaignActionError("Falta aplicar la migración de almacenamiento de Campañas de video.");return a.id}
function id(value:string){if(!UUID.test(value))throw new CampaignActionError("Identificador inválido.");return value}
function wake(accountId:string){after(async()=>{try{await workOne(accountId)}catch(e){console.error("[vc2] No se completó la pasada:",e instanceof Error?e.message:"error")}})}
async function readCampaignsImpl(){const accountId=await readyAccount();return listCampaigns(accountId)}
async function readCampaignImpl(campaignId:string){const accountId=await readyAccount();return campaignView(accountId,id(campaignId))}
async function startCampaignImpl(input:unknown,requestId:string){
  const accountId=await readyAccount()
  const campaignId=await createCampaign(accountId,id(requestId),input)
  wake(accountId);return campaignView(accountId,campaignId)
}
async function interpretRequestImpl(request:string){
  const accountId=await readyAccount(), source=text(request,12000)
  if(!source)throw new CampaignActionError("Escribe lo que quieres generar.")
  if(Object.keys(explicitMix(source)).length===3)normalizeIntake({},source)
  const r=await jsonModel(accountId,INTAKE_SYSTEM,source)
  return normalizeIntake(parseObject(r.text),source)
}
async function pauseImpl(campaignId:string,paused:boolean){const accountId=await readyAccount();await pauseCampaign(accountId,id(campaignId),Boolean(paused));if(!paused)wake(accountId)}
async function connectApifyImpl(token:string){const accountId=await readyAccount();await saveApify(accountId,token);return connections(accountId)}
async function updatePieceImpl(pieceId:string,revision:number,command:unknown){
  const accountId=await readyAccount(),row=await getPiece(accountId,id(pieceId))
  if(row.revision!==revision)throw new CampaignActionError("La pieza cambió; actualiza antes de guardar.")
  const c=command as Record<string,unknown>,p=structuredClone(row.payload)
  const campaign=await campaignView(accountId,row.campaign_id)
  let queue=false
  if(c.kind==="script"){
    p.script=parseScript(c.script,campaign.config.channels);p.edits=true;p.review=null;p.phase="review";p.status="queued";queue=true
  }else if(c.kind==="reference"){
    if(p.mode!=="replica")throw new CampaignActionError("Esta pieza no pertenece al cupo de réplicas.")
    p.reference=userReference(c.url as string);p.transcript=text(c.transcript,30000);p.sourceDuration=Number(c.duration)||null;p.phase=p.transcript.length>=30?"write":"extract";p.mode="replica";p.objective="Awareness";p.script=null;p.review=null;p.edits=false;p.correctionCount=0;p.status="queued";p.error="";queue=true
  }else if(c.kind==="regenerate"){
    p.instruction=text(c.instruction,3000)
    if(typeof c.cta==="string")p.ctaOverride=text(c.cta,1000)
    p.phase=p.script?"write":p.mode==="replica"?(p.transcript?"write":p.reference?"extract":"discover"):p.mode==="adaptacion"?(p.dossier?"write":"research"):"concept"
    p.status="queued";p.error="";p.review=null;p.correctionCount=0;p.edits=false;queue=true
  }else if(c.kind==="schedule"){
    const date=text(c.date,10)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T12:00:00Z"))||new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date)throw new CampaignActionError("Fecha inválida.")
    p.date=date
  }else if(c.kind==="production"){
    if(!["guion","grabando","editando","terminado"].includes(String(c.status)))throw new CampaignActionError("Estado inválido.")
    p.productionStatus=c.status as Piece["productionStatus"]
    const url=text(c.url,1000)
    if(url){const u=new URL(url);if(u.protocol!=="https:"||u.username||u.password)throw new CampaignActionError("Usa un enlace https del video.");p.videoUrl=u.href}
  }else if(c.kind==="concept"){
    const index=Number(c.index)
    if(!Number.isInteger(index)||!p.concepts[index])throw new CampaignActionError("Concepto inválido.")
    const chosen=p.concepts.splice(index,1)[0];p.concepts.unshift(chosen);p.phase="write";p.status="queued";p.review=null;p.correctionCount=0;queue=true
  }else throw new CampaignActionError("Acción desconocida.")
  await editPiece(row,p,queue);if(queue)wake(accountId);return campaignView(accountId,row.campaign_id)
}
async function updateCampaignContextImpl(campaignId:string,input:{offer:string;cta:string;material:string}){
  const accountId=await readyAccount(),c=await campaignView(accountId,id(campaignId))
  const config:Brief={...c.config,offer:text(input.offer,2000),cta:text(input.cta,1000),material:text(input.material,20000)}
  const r=await supabaseAdmin().rpc("vc2_context",{p_campaign:c.id,p_account:accountId,p_config:config})
  if(r.error)throw new Error(r.error.message)
  if(!r.data)throw new CampaignActionError("Hay una pieza trabajando. Pausa la campaña y espera a que termine la pasada antes de cambiar el contexto.")
  wake(accountId)
  return campaignView(accountId,c.id)
}
async function versionsImpl(pieceId:string){
  const accountId=await readyAccount();await getPiece(accountId,id(pieceId))
  const r=await supabaseAdmin().from("vc2_versions").select("id,created_at,payload").eq("piece_id",pieceId).eq("account_id",accountId).order("created_at",{ascending:false}).limit(20)
  if(r.error)throw new Error(r.error.message);return r.data as {id:string;created_at:string;payload:Piece}[]
}
async function restoreVersionImpl(pieceId:string,versionId:string,revision:number){
  const accountId=await readyAccount(),row=await getPiece(accountId,id(pieceId));if(row.revision!==revision)throw new CampaignActionError("Actualiza la pieza antes de restaurar.")
  const r=await supabaseAdmin().from("vc2_versions").select("payload").eq("id",id(versionId)).eq("piece_id",pieceId).eq("account_id",accountId).maybeSingle()
  if(r.error||!r.data)throw new CampaignActionError("No existe esa versión.")
  const p=r.data.payload as Piece;p.edits=true;p.review=null;p.phase="review";p.status="queued"
  await editPiece(row,p,true);wake(accountId);return campaignView(accountId,row.campaign_id)
}
async function newRequestIdImpl(){await exigirAdvance();return randomUUID()}

export async function readCampaigns(...args:Parameters<typeof readCampaignsImpl>){return actionResult(()=>readCampaignsImpl(...args))}
export async function readCampaign(...args:Parameters<typeof readCampaignImpl>){return actionResult(()=>readCampaignImpl(...args))}
export async function startCampaign(...args:Parameters<typeof startCampaignImpl>){return actionResult(()=>startCampaignImpl(...args))}
export async function interpretRequest(...args:Parameters<typeof interpretRequestImpl>){return actionResult(()=>interpretRequestImpl(...args))}
export async function pause(...args:Parameters<typeof pauseImpl>){return actionResult(()=>pauseImpl(...args))}
export async function connectApify(...args:Parameters<typeof connectApifyImpl>){return actionResult(()=>connectApifyImpl(...args))}
export async function updatePiece(...args:Parameters<typeof updatePieceImpl>){return actionResult(()=>updatePieceImpl(...args))}
export async function updateCampaignContext(...args:Parameters<typeof updateCampaignContextImpl>){return actionResult(()=>updateCampaignContextImpl(...args))}
export async function versions(...args:Parameters<typeof versionsImpl>){return actionResult(()=>versionsImpl(...args))}
export async function restoreVersion(...args:Parameters<typeof restoreVersionImpl>){return actionResult(()=>restoreVersionImpl(...args))}
export async function newRequestId(...args:Parameters<typeof newRequestIdImpl>){return actionResult(()=>newRequestIdImpl(...args))}
