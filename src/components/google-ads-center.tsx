"use client";

import { BarChart3, Building2, CalendarDays, HeartPulse, LayoutDashboard, LoaderCircle, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import type { DashboardUser } from "@/server/dashboard-auth";
import type { GoogleAdsAccount, GoogleAdsDashboardData } from "@/types/google-ads";

type Props = { user: DashboardUser; initialData: GoogleAdsDashboardData };
type CampaignFilter = "all" | "active" | "paused";

function number(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function money(value: number, currency = "BRL") { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }

function Campaigns({ account, filter, onFilter }: { account: GoogleAdsAccount; filter: CampaignFilter; onFilter: (value: CampaignFilter) => void }) {
  const campaigns = account.campaigns.filter((campaign) => filter === "all" || (filter === "active" ? campaign.status === "ENABLED" : campaign.status === "PAUSED"));
  return <div className="google-ads-campaigns">
    <div className="google-ads-campaign-filters" role="group" aria-label={`Filtrar campanhas de ${account.name}`}>
      <span>Campanhas</span>
      {(["all", "active", "paused"] as CampaignFilter[]).map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => onFilter(value)} type="button">{value === "all" ? "Todos" : value === "active" ? "Ativos" : "Pausados"}</button>)}
    </div>
    {campaigns.length ? campaigns.map((campaign) => <div key={campaign.id}>
      <div><strong>{campaign.name}</strong><small>{campaign.status === "ENABLED" ? "Ativa" : campaign.status === "PAUSED" ? "Pausada" : campaign.status}</small></div>
      <span>{money(campaign.spend, account.currency || "BRL")}</span>
      <dl><div><dt>Impressões</dt><dd>{number(campaign.impressions)}</dd></div><div><dt>Cliques</dt><dd>{number(campaign.clicks)}</dd></div><div><dt>Conversões</dt><dd>{number(campaign.conversions)}</dd></div><div><dt>CTR</dt><dd>{campaign.ctr.toFixed(2)}%</dd></div></dl>
    </div>) : <p>Nenhuma campanha encontrada para este filtro.</p>}
  </div>;
}

export function GoogleAdsCenter({ user, initialData }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [data, setData] = useState(initialData);
  const [startDate, setStartDate] = useState(initialData.period.startDate);
  const [endDate, setEndDate] = useState(initialData.period.endDate);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [campaignFilters, setCampaignFilters] = useState<Record<string, CampaignFilter>>({});
  const totals = useMemo(() => data.accounts.reduce((total, account) => ({ spend: total.spend + account.spend, impressions: total.impressions + account.impressions, clicks: total.clicks + account.clicks, conversions: total.conversions + account.conversions }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 }), [data.accounts]);
  const connectionError = data.error?.toLowerCase().includes("oauth") || data.error?.toLowerCase().includes("token");
  const go = (path: string) => window.location.assign(path);

  async function refresh() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/google-ads?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, { cache: "no-store" });
      const result = await response.json() as { data?: GoogleAdsDashboardData; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "Não foi possível consultar o Google Ads.");
      setData(result.data); setNotice(result.data.error ?? `${result.data.accounts.length} contas consultadas.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível consultar o Google Ads."); }
    finally { setLoading(false); }
  }

  return <div className="dashboard-shell google-ads-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar"><button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button><div className="topbar-actions"><span className="mode-pill live"><span className="mode-dot" />Google Ads</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div></header>
    <aside className="side-rail" aria-label="Navegação principal"><button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button><button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19} /></button><button className="rail-button" onClick={() => go("/health")} title="Saúde das contas" type="button"><HeartPulse size={19} /></button><button className="rail-button" onClick={() => go("/meta-ads")} title="Meta Ads" type="button"><BarChart3 size={19} /></button><button className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Google Ads" type="button"><BarChart3 size={19} /></button></aside>
    <main className="dashboard-main google-ads-main"><section className="google-ads-hero"><div><p className="eyebrow">MÍDIA PAGA · CONEXÃO CORPORATIVA</p><h1>Google Ads</h1><p className="hero-subtitle">Consulte contas, campanhas e resultados diretamente da API do Google Ads.</p></div><button className="sync-button" disabled={loading} onClick={() => void refresh()} type="button">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />} {loading ? "Atualizando..." : "Atualizar resultados"}</button></section>
      <section className={`google-ads-connection ${connectionError ? "error" : "connected"}`}><div><strong>{connectionError ? "Conexão do Google Ads precisa de atenção" : data.configured ? "Google Ads conectado" : "Google Ads não configurado"}</strong><span>{connectionError ? "O refresh token foi recusado. Atualize GOOGLE_ADS_REFRESH_TOKEN na Vercel e verifique novamente." : data.configured ? "Credenciais corporativas configuradas; a atualização consulta o MCC e as contas autorizadas." : "Configure as variáveis corporativas para iniciar a conexão."}</span></div><button disabled={loading} onClick={() => void refresh()} type="button"><RefreshCw size={15} />Verificar conexão</button></section>
      <section className="google-ads-period"><div><CalendarDays size={18} /><div><strong>Período dos resultados</strong><span>O mesmo intervalo é aplicado a todas as contas e campanhas.</span></div></div><div><label>De<input max={endDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><label>Até<input min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label><button onClick={() => void refresh()} type="button">Aplicar período</button></div></section>
      {!data.configured ? <section className="google-ads-empty"><h2>Google Ads ainda não configurado</h2><p>As variáveis da integração não foram encontradas neste ambiente.</p></section> : data.error ? <section className="google-ads-empty"><h2>Não foi possível consultar o Google Ads</h2><p>{data.error}</p></section> : <><section className="google-ads-summary"><article><small>INVESTIMENTO</small><strong>{money(totals.spend, data.accounts[0]?.currency || "BRL")}</strong></article><article><small>IMPRESSÕES</small><strong>{number(totals.impressions)}</strong></article><article><small>CLIQUES</small><strong>{number(totals.clicks)}</strong></article><article><small>CONVERSÕES</small><strong>{number(totals.conversions)}</strong></article></section><section className="google-ads-accounts"><header><div><p className="eyebrow">RESULTADO POR CONTA</p><h2>{data.accounts.length} contas acessíveis</h2><p>Abra uma conta para ver suas campanhas no período selecionado.</p></div></header><div className="google-ads-account-list">{data.accounts.map((account) => <article key={account.id}><button className="google-ads-account-heading" onClick={() => setExpanded(expanded === account.id ? null : account.id)} type="button"><div><h3>{account.name}</h3><p>ID {account.id}{account.manager ? " · Conta gerente" : ""}</p></div><strong>{money(account.spend, account.currency || "BRL")}</strong></button>{account.error ? <p className="google-ads-account-error">{account.error}</p> : expanded === account.id ? <Campaigns account={account} filter={campaignFilters[account.id] ?? "all"} onFilter={(value) => setCampaignFilters((current) => ({ ...current, [account.id]: value }))} /> : <div className="google-ads-account-metrics"><span>{number(account.impressions)} impressões</span><span>{number(account.clicks)} cliques</span><span>{number(account.conversions)} conversões</span><b>Ver campanhas</b></div>}</article>)}</div></section></>}
      {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button">×</button></div>}
    </main>
  </div>;
}
