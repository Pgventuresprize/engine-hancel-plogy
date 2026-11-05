import { after, NextResponse } from "next/server"
import { authorizeEngineRequest } from "@/lib/api-auth"
import { configured } from "@/engine/video-campaigns/repository"
import { workOne } from "@/engine/video-campaigns/worker"

export const dynamic="force-dynamic"
export const maxDuration=300
// Ruta NUEVA bajo un prefijo de motor ya permitido por el proxy, con su mismo control de secreto.
export async function POST(request:Request){
  const denied=authorizeEngineRequest(request)
  if(denied)return NextResponse.json({error:denied},{status:401})
  if(!await configured())return NextResponse.json({error:"Almacenamiento de campañas no configurado."},{status:503})
  after(async()=>{try{await workOne()}catch(e){console.error("[vc2] Recuperación:",e instanceof Error?e.message:"error")}})
  return NextResponse.json({ok:true},{status:202})
}
