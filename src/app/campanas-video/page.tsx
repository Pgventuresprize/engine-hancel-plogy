import Link from "next/link"
import { DashboardShell } from "@/components/dashboard-shell"
import { exigirAdvance } from "@/lib/accounts"
import { configured, listCampaigns, connections, SETUP_MESSAGE } from "@/engine/video-campaigns/repository"
import { CampaignWorkspace } from "@/components/video-campaigns/workspace"
import { previewCampaign } from "@/engine/video-campaigns/preview"
import { getSettings } from "@/engine/schedule"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const metadata = { title: "Campañas de video · Plogy Studio" }

export default async function VideoCampaignsPage(){
  if(process.env.NODE_ENV==="development"&&process.env.VIDEO_CAMPAIGNS_PREVIEW==="1"){
    const demo=previewCampaign()
    return <main className="mx-auto max-w-7xl p-6"><h1 className="mb-6 font-display text-3xl">Campañas de video · Plogy Studio</h1><CampaignWorkspace initialCampaigns={[demo]} connected={{apify:true,claude:true}} setup="" accountName="Plogy" preview/></main>
  }
  const account=await exigirAdvance(),isReady=await configured()
  const settings=await getSettings(account.id)
  const [campaigns,connected]=isReady?await Promise.all([listCampaigns(account.id),connections(account.id)]):[[],{apify:false,claude:false}]
  return <DashboardShell title="Campañas de video">
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Estudio de contenido">
      {[["/","Chat"],["/estudio","Carruseles"],["/campanas-video","Campañas de video"],["/videos","Producción actual"],["/calendario","Calendario"],["/marca","Marca"]].map(([url,label])=><Link key={url} href={url} aria-current={url==="/campanas-video"?"page":undefined} className={url==="/campanas-video"?"rounded-full bg-foreground px-4 py-2 text-background":"rounded-full border px-4 py-2 hover:bg-muted"}>{label}</Link>)}
    </nav>
    <CampaignWorkspace initialCampaigns={campaigns} connected={connected} setup={isReady?"":SETUP_MESSAGE} accountName={account.name} timezone={settings.timezone}/>
  </DashboardShell>
}
