"use client";

import { BarChart3, Building2, HeartPulse, LayoutDashboard, RefreshCw, Settings2, SlidersHorizontal, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import type { Ga4Property, Ga4Report } from "@/types/ga4";

type Connection = { connected: boolean; properties: Ga4Property[]; error?: string };
type Props = { user: { name: string; email: string; initials: string }; initial: Connection };

function compact(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function dateLabel(value: string) { return value.split("-").reverse().join("/"); }

export function Ga4Center({ user, initial }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Ga4Property | null>(null);
  const [report, setReport] = useState<Ga4Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const go = (path: string) => window.location.assign(path);

  async function refresh() {
    setLoading(true);
    try { const response = await fetch("/api/ga4", { cache: "no-store" }); setData(await response.json() as Connection); }
    finally { setLoading(false); }
  }
  async function openReport(property: Ga4Property, period = { startDate, endDate }) {
    setSelected(property); setReport(null); setReportError(""); setLoading(true);
    try {
      const response = await fetch(`/api/ga4?propertyId=${encodeURIComponent(property.id)}&startDate=${period.startDate}&endDate=${period.endDate}`, { cache: "no-store" });
      const result = await response.json() as { report?: Ga4Report; error?: string };
      if (!response.ok || !result.report) throw new Error(result.error ?? "Não foi possível consultar o relatório.");
      setReport(result.report);
    } catch (error) { setReportError(error instanceof Error ? error.message : "Não foi possível consultar o relatório."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("ga4");
    if (!status) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  return <div className="dashboard-shell google-ads-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar"><button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button><div className="topbar-actions"><span className="mode-pill live"><span className="mode-dot" />Google Analytics</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div></header>
    <aside className="side-rail" aria-label="Navegação principal"><button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button><button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19} /></button><button className="rail-button" onClick={() => go("/health")} title="Saúde das contas" type="button"><HeartPulse size={19} /></button><button className="rail-button" onClick={() => go("/meta-ads")} title="Meta Ads" type="button"><BarChart3 size={19} /></button><button className="rail-button" onClick={() => go("/google-ads")} title="Google Ads" type="button"><BarChart3 size={19} /></button><button className="rail-button active" title="Google Analytics 4" type="button"><BarChart3 size={19} /></button><button className="rail-button" onClick={() => go("/#leads-table")} title="Leads" type="button"><Users size={19} /></button><button className="rail-button" onClick={() => go("/#filters")} title="Filtros" type="button"><SlidersHorizontal size={19} /></button><div className="rail-spacer" /><button className="rail-button" onClick={() => go("/")} title="Preferências" type="button"><Settings2 size={19} /></button><button className="rail-avatar" onClick={() => go("/")} title="Perfil" type="button">{user.initials}</button></aside>
    <main className="dashboard-main google-ads-main"><section className="google-ads-hero"><div><p className="eyebrow">MÍDIA E PERFORMANCE · CONEXÃO CORPORATIVA</p><h1>Google Analytics 4</h1><p className="hero-subtitle">Consulte propriedades, métricas e campanhas da conta Global Mídia.</p></div><div className="meta-ads-hero-actions"><button className="meta-connection-action" onClick={() => go("/api/ga4/connect")} type="button">{data.connected ? "Reconectar conta" : "Conectar conta"}</button><button className="sync-button" disabled={loading || !data.connected} onClick={() => void refresh()} type="button"><RefreshCw size={16} />{loading ? "Atualizando..." : "Atualizar propriedades"}</button></div></section>
      {!data.connected ? <section className="google-ads-empty"><h2>Google Analytics ainda não conectado</h2><p>Use a conta marketing@globalmidia.digital quando o Google solicitar autorização.</p></section> : data.error ? <section className="google-ads-empty"><h2>Não foi possível consultar o GA4</h2><p>{data.error}</p></section> : <section className="google-ads-accounts"><header><div><p className="eyebrow">PROPRIEDADES ACESSÍVEIS</p><h2>{data.properties.length} propriedades encontradas</h2><p>As propriedades são descobertas automaticamente pela conta Global Mídia.</p></div></header><div className="google-ads-account-list">{data.properties.map((property) => <article key={property.id}><div><h3>{property.name}</h3><p>Propriedade {property.id} · Conta {property.accountName}</p></div><button className="tutorial-button" onClick={() => void openReport(property)} type="button">Ver relatórios</button></article>)}</div></section>}
    </main>
    {selected && <div className="meta-campaign-backdrop" role="presentation"><section className="meta-campaign-modal ga4-report-modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">RELATÓRIO DA PROPRIEDADE</p><h2>{selected.name}</h2><p>Resultados de {report ? dateLabel(report.startDate) : dateLabel(startDate)} até {report ? dateLabel(report.endDate) : dateLabel(endDate)}</p></div><button aria-label="Fechar relatório" onClick={() => { setSelected(null); setReport(null); }} type="button"><X size={18} /></button></header><div className="meta-campaign-period"><strong>Período do relatório</strong><div><label>De<input max={endDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><label>Até<input min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label><button disabled={loading} onClick={() => void openReport(selected)} type="button">{loading ? "Consultando..." : "Aplicar período"}</button></div></div>{reportError ? <p className="meta-campaign-empty">{reportError}</p> : report ? <><div className="meta-campaign-summary"><span><small>Usuários ativos</small><strong>{compact(report.totals.activeUsers)}</strong></span><span><small>Sessões</small><strong>{compact(report.totals.sessions)}</strong></span><span><small>Conversões</small><strong>{compact(report.totals.conversions)}</strong></span><span><small>Eventos</small><strong>{compact(report.totals.eventCount)}</strong></span></div><div className="ga4-report-content"><h3>Origem dos acessos</h3><div className="ga4-channel-list">{report.byChannel.length ? report.byChannel.map((item) => <div key={item.channel}><strong>{item.channel}</strong><span>{compact(item.sessions)} sessões · {compact(item.conversions)} conversões</span></div>) : <p>Nenhum canal encontrado no período.</p>}</div><h3>Evolução diária</h3><div className="ga4-date-list">{report.byDate.slice(-14).map((item) => <div key={item.date}><strong>{dateLabel(item.date.slice(0, 4) + "-" + item.date.slice(4, 6) + "-" + item.date.slice(6, 8))}</strong><span>{compact(item.activeUsers)} usuários · {compact(item.sessions)} sessões · {compact(item.conversions)} conversões</span></div>)}</div></div></> : <p className="meta-campaign-empty">Clique em Aplicar período para consultar os dados.</p>}<footer><button className="tutorial-button" onClick={() => { setSelected(null); setReport(null); }} type="button">Fechar</button></footer></section></div>}
  </div>;
}
