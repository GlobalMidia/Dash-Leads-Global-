"use client";

import { BarChart3, Building2, CalendarDays, HeartPulse, LayoutDashboard, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import type { MetaAdsAccount, MetaAdsDashboardData } from "@/types/meta-ads";

type Props = { mode: "live" | "demo"; user: { name: string; email: string; initials: string }; initialData: MetaAdsDashboardData; canManage: boolean };

function currency(value: number, code: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code || "BRL", maximumFractionDigits: 0 }).format(value);
}
function number(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Ainda não sincronizado";
}
function status(value: string) {
  if (value === "ACTIVE") return "Ativa";
  if (value === "PAUSED") return "Pausada";
  if (value === "ARCHIVED") return "Arquivada";
  return value === "UNKNOWN" ? "Resultado do período" : value || "Sem status";
}

export function MetaAdsCenter({ mode, user, initialData }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<MetaAdsAccount | null>(null);
  const [startDate, setStartDate] = useState(initialData.period.startDate);
  const [endDate, setEndDate] = useState(initialData.period.endDate);
  const [modalStartDate, setModalStartDate] = useState(initialData.period.startDate);
  const [modalEndDate, setModalEndDate] = useState(initialData.period.endDate);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.accounts.filter((item) => `${item.name} ${item.accountId}`.toLowerCase().includes(term));
  }, [data.accounts, query]);
  const totals = data.accounts.reduce((total, item) => ({
    spend: total.spend + item.spend,
    impressions: total.impressions + item.impressions,
    clicks: total.clicks + item.clicks,
    leads: total.leads + item.leads,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
  const go = (path: string) => window.location.assign(path);
  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  async function sync(period = { startDate, endDate }, preserveSelected = false) {
    if (syncing) return;
    if (mode !== "live") {
      setNotice("A sincronização funciona somente na base ao vivo.");
      return;
    }
    if (!period.startDate || !period.endDate || period.startDate > period.endDate) {
      setNotice("Informe um período válido antes de atualizar.");
      return;
    }
    setSyncing(true);
    try {
      const response = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(period),
      });
      const result = await response.json() as { data?: MetaAdsDashboardData; synced?: number; failed?: string[]; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "Não foi possível sincronizar as contas.");
      setData(result.data);
      setStartDate(result.data.period.startDate);
      setEndDate(result.data.period.endDate);
      setModalStartDate(result.data.period.startDate);
      setModalEndDate(result.data.period.endDate);
      setSelected((current) => preserveSelected && current ? result.data?.accounts.find((item) => item.id === current.id) ?? null : null);
      setNotice(result.failed?.length
        ? `${result.synced ?? 0} contas atualizadas; ${result.failed.length} precisam ser revisadas.`
        : `${result.synced ?? 0} contas atualizadas para o período escolhido.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível sincronizar as contas.");
    } finally {
      setSyncing(false);
    }
  }

  const openAccount = (account: MetaAdsAccount) => {
    setModalStartDate(data.period.startDate);
    setModalEndDate(data.period.endDate);
    setSelected(account);
  };
  const setModalPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    setModalStartDate(start.toISOString().slice(0, 10));
    setModalEndDate(end.toISOString().slice(0, 10));
  };

  const emptyCampaignMessage = selected?.syncError
    ? "Esta conta não pôde ser atualizada neste período. Clique em Aplicar período novamente para tentar."
    : selected?.syncedAt
      ? "Não houve campanha com entrega neste período."
      : "Esta conta ainda não foi atualizada para este período. Clique em Aplicar período.";

  return <div className="dashboard-shell meta-ads-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar">
      <button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button>
      <div className="topbar-actions"><span className={`mode-pill ${mode}`}><span className="mode-dot" />{mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div>
    </header>
    <aside className="side-rail" aria-label="Navegação principal">
      <button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button>
      <button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19} /></button>
      <button className="rail-button" onClick={() => go("/health")} title="Saúde das contas" type="button"><HeartPulse size={19} /></button>
      <button className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Meta Ads" type="button"><BarChart3 size={19} /></button>
    </aside>
    <main className="dashboard-main meta-ads-main">
      <section className="meta-ads-hero">
        <div><p className="eyebrow">MÍDIA PAGA · CONEXÃO CORPORATIVA</p><h1>Meta Ads</h1><p className="hero-subtitle">Veja todas as contas acessíveis, cada uma com seus próprios resultados e campanhas, no período que você escolher.</p></div>
        <button className="sync-button" disabled={!data.connected || syncing} onClick={() => void sync()} type="button">{syncing ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />} {syncing ? "Atualizando contas..." : "Atualizar resultados"}</button>
      </section>
      {!data.connected ? <section className="meta-ads-empty"><BarChart3 size={25} /><div><h2>Conta corporativa ainda não conectada</h2><p>Conecte a conta André no painel de leads antes de consultar resultados.</p></div><button className="tutorial-button" onClick={() => go("/")} type="button">Ir ao painel</button></section> : <>
        <section className="meta-ads-period">
          <div><CalendarDays size={18} /><div><strong>Período dos resultados</strong><span>Escolha o intervalo e aplique-o para atualizar todas as contas e campanhas abaixo.</span></div></div>
          <div className="meta-ads-period-inputs">
            <label>De<input max={endDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
            <label>Até<input min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
            <button onClick={() => setPreset(7)} type="button">7 dias</button><button onClick={() => setPreset(30)} type="button">30 dias</button>
            <button className="meta-ads-apply-period" disabled={syncing} onClick={() => void sync()} type="button">{syncing ? "Aplicando..." : "Aplicar período"}</button>
          </div>
        </section>
        <section className="meta-ads-status"><BarChart3 size={19} /><div><strong>{data.accounts.length} contas corporativas disponíveis</strong><p>Última atualização deste período: {dateTime(data.lastSyncAt)}</p></div><span>{data.accounts.filter((item) => item.syncedAt).length} atualizadas</span></section>
        <section className="meta-ads-summary" aria-label="Somatória de todas as contas corporativas no período"><article><small>INVESTIMENTO TOTAL</small><strong>{currency(totals.spend, data.accounts[0]?.currency || "BRL")}</strong></article><article><small>IMPRESSÕES TOTAIS</small><strong>{number(totals.impressions)}</strong></article><article><small>CLIQUES TOTAIS</small><strong>{number(totals.clicks)}</strong></article><article><small>LEADS IDENTIFICADOS</small><strong>{number(totals.leads)}</strong></article></section>
        <section className="meta-ads-accounts">
          <header><div><p className="eyebrow">RESULTADO POR CONTA</p><h2>Contas de anúncio</h2><p>Somatória acima e todas as contas acessíveis abaixo. Abra qualquer uma para consultar as campanhas.</p></div><label className="meta-ads-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conta ou ID" value={query} /></label></header>
          <div className="meta-ads-account-list">{visible.map((item) => <article className={item.syncedAt ? "selected" : ""} key={item.id}><div><h3>{item.name}</h3><p>{item.accountId ? `ID ${item.accountId}` : item.id}{item.currency ? ` · ${item.currency}` : ""}</p></div><dl><div><dt>Investimento</dt><dd>{item.syncedAt ? currency(item.spend, item.currency || "BRL") : "—"}</dd></div><div><dt>Campanhas</dt><dd>{item.syncedAt ? item.campaignCount : "—"}</dd></div><div><dt>Leads</dt><dd>{item.syncedAt ? item.leads : "—"}</dd></div></dl>{item.syncError && <span className="meta-ads-account-error">Atualização pendente</span>}<button className="tutorial-button" onClick={() => openAccount(item)} type="button">Ver campanhas</button></article>)}</div>
        </section>
      </>}
      <section className="meta-ads-next"><strong>Dados exibidos</strong><p>Resultados de mídia da Meta Ads. A captação de formulários e o vínculo automático de campanhas aos leads entrarão na próxima etapa, após habilitarmos a permissão específica de leads.</p></section>
      {selected && <div className="meta-campaign-backdrop" role="presentation"><section aria-modal="true" className="meta-campaign-modal" role="dialog"><header><div><p className="eyebrow">VISÃO GERAL DA CONTA</p><h2>{selected.name}</h2><p>Resultados de {startDate.split("-").reverse().join("/")} até {endDate.split("-").reverse().join("/")}</p></div><button aria-label="Fechar campanhas" onClick={() => setSelected(null)} type="button"><X size={18} /></button></header><div className="meta-campaign-summary"><span><small>Investimento</small><strong>{currency(selected.spend, selected.currency || "BRL")}</strong></span><span><small>Alcance</small><strong>{number(selected.reach)}</strong></span><span><small>Cliques</small><strong>{number(selected.clicks)}</strong></span><span><small>Leads</small><strong>{number(selected.leads)}</strong></span></div><div className="meta-campaign-period"><strong>Período desta conta</strong><div><label>De<input max={modalEndDate} onChange={(event) => setModalStartDate(event.target.value)} type="date" value={modalStartDate} /></label><label>Até<input min={modalStartDate} onChange={(event) => setModalEndDate(event.target.value)} type="date" value={modalEndDate} /></label><button onClick={() => setModalPreset(7)} type="button">7 dias</button><button onClick={() => setModalPreset(30)} type="button">30 dias</button><button className="meta-ads-apply-period" disabled={syncing} onClick={() => void sync({ startDate: modalStartDate, endDate: modalEndDate }, true)} type="button">{syncing ? "Aplicando..." : "Aplicar período"}</button></div></div><div className="meta-campaign-body"><h3>Campanhas no período</h3>{selected.campaigns.length ? <div className="meta-campaign-table">{selected.campaigns.map((campaign) => <article key={campaign.id}><header><div><strong>{campaign.name}</strong><span>{status(campaign.status)}{campaign.objective ? ` · ${campaign.objective}` : ""}</span></div><b>{currency(campaign.spend, selected.currency || "BRL")}</b></header><dl><div><dt>Impressões</dt><dd>{number(campaign.impressions)}</dd></div><div><dt>Alcance</dt><dd>{number(campaign.reach)}</dd></div><div><dt>Cliques</dt><dd>{number(campaign.clicks)}</dd></div><div><dt>Leads</dt><dd>{number(campaign.leads)}</dd></div><div><dt>CTR</dt><dd>{campaign.ctr.toFixed(2)}%</dd></div><div><dt>CPC</dt><dd>{currency(campaign.cpc, selected.currency || "BRL")}</dd></div></dl></article>)}</div> : <p className="meta-campaign-empty">{emptyCampaignMessage}</p>}</div><footer><button className="tutorial-button" onClick={() => setSelected(null)} type="button">Fechar</button></footer></section></div>}
      {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button">×</button></div>}
    </main>
  </div>;
}
