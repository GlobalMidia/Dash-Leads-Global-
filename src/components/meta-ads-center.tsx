"use client";

import { BarChart3, Building2, Check, CircleAlert, HeartPulse, LayoutDashboard, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import type { MetaAdsDashboardData } from "@/types/meta-ads";

type Props = {
  mode: "live" | "demo";
  user: { name: string; email: string; initials: string };
  initialData: MetaAdsDashboardData;
  canManage: boolean;
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Ainda não sincronizado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function MetaAdsCenter({ mode, user, initialData, canManage }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialData.accounts.filter((account) => account.selected).map((account) => account.id)));
  const visibleAccounts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.accounts.filter((account) => `${account.name} ${account.accountId}`.toLowerCase().includes(term));
  }, [data.accounts, query]);
  const selectedAccounts = data.accounts.filter((account) => selectedIds.has(account.id));
  const totals = selectedAccounts.reduce((total, account) => ({
    spend: total.spend + account.spend,
    impressions: total.impressions + account.impressions,
    clicks: total.clicks + account.clicks,
    leads: total.leads + account.leads,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
  const go = (path: string) => window.location.assign(path);

  function toggleAccount(id: string) {
    if (!canManage || saving) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function saveSelection() {
    if (!canManage || saving) return;
    if (mode !== "live") { setNotice("A seleção corporativa é gravada somente na base ao vivo."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/meta/accounts", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: [...selectedIds] }),
      });
      const result = await response.json() as { data?: MetaAdsDashboardData; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "Não foi possível salvar a seleção.");
      setData(result.data);
      setSelectedIds(new Set(result.data.accounts.filter((account) => account.selected).map((account) => account.id)));
      setNotice(`${result.data.selectedCount} conta${result.data.selectedCount === 1 ? "" : "s"} escolhida${result.data.selectedCount === 1 ? "" : "s"} para acompanhamento.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar a seleção."); }
    finally { setSaving(false); }
  }

  async function syncAccounts() {
    if (syncing) return;
    if (mode !== "live") { setNotice("A sincronização da Meta Ads funciona na base ao vivo."); return; }
    setSyncing(true);
    try {
      const response = await fetch("/api/meta/sync", { method: "POST" });
      const result = await response.json() as { data?: MetaAdsDashboardData; synced?: number; failed?: string[]; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "Não foi possível sincronizar as contas.");
      setData(result.data);
      setSelectedIds(new Set(result.data.accounts.filter((account) => account.selected).map((account) => account.id)));
      setNotice(result.failed?.length ? `${result.synced ?? 0} conta(s) atualizada(s). Não foi possível consultar: ${result.failed.join(", ")}.` : `${result.synced ?? 0} conta(s) sincronizada(s) com sucesso.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível sincronizar as contas."); }
    finally { setSyncing(false); }
  }

  return <div className="dashboard-shell meta-ads-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar"><button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button><div className="topbar-actions"><span className={`mode-pill ${mode}`}><span className="mode-dot"/>{mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div></header>
    <aside className="side-rail" aria-label="Navegação principal"><button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19}/></button><button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19}/></button><button className="rail-button" onClick={() => go("/health")} title="Saúde das contas" type="button"><HeartPulse size={19}/></button><button className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Meta Ads" type="button"><BarChart3 size={19}/></button></aside>
    <main className="dashboard-main meta-ads-main">
      <section className="meta-ads-hero"><div><p className="eyebrow">MÍDIA PAGA · CONEXÃO CORPORATIVA</p><h1>Meta Ads</h1><p className="hero-subtitle">Escolha as contas da empresa que serão acompanhadas. Os indicadores são corporativos e ficam disponíveis para todo o time.</p></div><button className="sync-button" disabled={!data.connected || !selectedIds.size || syncing} onClick={() => void syncAccounts()} type="button">{syncing ? <LoaderCircle className="animate-spin" size={17}/> : <RefreshCw size={17}/>} {syncing ? "Sincronizando..." : "Sincronizar contas"}</button></section>
      {!data.connected ? <section className="meta-ads-empty"><CircleAlert size={25}/><div><h2>Conta corporativa ainda não conectada</h2><p>Volte ao painel de leads e conecte a conta corporativa da Meta antes de escolher contas.</p></div><button className="tutorial-button" onClick={() => go("/")} type="button">Ir ao painel</button></section> : <>
        <section className="meta-ads-status"><BarChart3 size={19}/><div><strong>Conta corporativa conectada</strong><p>{data.accounts.length} contas acessíveis · última sincronização: {formatDate(data.lastSyncAt)}</p></div><span>{data.selectedCount} selecionada{data.selectedCount === 1 ? "" : "s"}</span></section>
        <section className="meta-ads-summary"><article><small>INVESTIMENTO · 30 DIAS</small><strong>{formatCurrency(totals.spend, selectedAccounts[0]?.currency || "BRL")}</strong></article><article><small>IMPRESSÕES</small><strong>{formatNumber(totals.impressions)}</strong></article><article><small>CLIQUES</small><strong>{formatNumber(totals.clicks)}</strong></article><article><small>LEADS IDENTIFICADOS</small><strong>{formatNumber(totals.leads)}</strong></article></section>
        <section className="meta-ads-accounts"><header><div><p className="eyebrow">CONTAS DE ANÚNCIO ACESSÍVEIS</p><h2>O que acompanhar</h2><p>Marque somente as contas que pertencem à operação. A seleção é compartilhada e não altera campanhas na Meta.</p></div><div className="meta-ads-actions"><label><Search size={16}/><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conta ou ID" value={query}/></label>{canManage && <button className="tutorial-button" disabled={saving} onClick={() => void saveSelection()} type="button">{saving ? <LoaderCircle className="animate-spin" size={15}/> : <Check size={15}/>} Salvar seleção</button>}</div></header>{!canManage && <p className="meta-ads-readonly">Somente responsáveis corporativos podem alterar a seleção. Você pode consultar e sincronizar as contas já escolhidas.</p>}<div className="meta-ads-account-list">{visibleAccounts.map((account) => <article className={selectedIds.has(account.id) ? "selected" : ""} key={account.id}><input aria-label={`Selecionar ${account.name}`} checked={selectedIds.has(account.id)} disabled={!canManage || saving} onChange={() => toggleAccount(account.id)} type="checkbox"/><div><h3>{account.name}</h3><p>{account.accountId ? `ID ${account.accountId}` : account.id}{account.currency ? ` · ${account.currency}` : ""}</p></div><dl><div><dt>Investimento</dt><dd>{account.syncedAt ? formatCurrency(account.spend, account.currency || "BRL") : "—"}</dd></div><div><dt>Campanhas</dt><dd>{account.syncedAt ? account.campaignCount : "—"}</dd></div><div><dt>Leads</dt><dd>{account.syncedAt ? account.leads : "—"}</dd></div></dl>{account.syncError && <span className="meta-ads-account-error" title={account.syncError}>Não sincronizada</span>}</article>)}</div></section>
      </>}
      <section className="meta-ads-next"><strong>Próxima etapa desta integração</strong><p>Após validar os indicadores, conectaremos a captação de formulários da Meta e o vínculo de campanha ao lead. Isso exige a permissão específica de leads, separada da leitura de anúncios.</p></section>
      {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button">×</button></div>}
    </main>
  </div>;
}
