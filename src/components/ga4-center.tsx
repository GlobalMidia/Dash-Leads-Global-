"use client";

import { BarChart3, LayoutDashboard, Building2, HeartPulse, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import type { Ga4Property } from "@/types/ga4";

type Props = { user: { name: string; email: string; initials: string }; initial: { connected: boolean; properties: Ga4Property[]; error?: string } };

export function Ga4Center({ user, initial }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const go = (path: string) => window.location.assign(path);
  async function refresh() {
    setLoading(true);
    try { const response = await fetch("/api/ga4", { cache: "no-store" }); setData(await response.json()); } finally { setLoading(false); }
  }
  useEffect(() => { const status = new URLSearchParams(window.location.search).get("ga4"); if (status) void refresh(); }, []);
  return <div className="dashboard-shell google-ads-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar"><button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button><div className="topbar-actions"><span className="mode-pill live"><span className="mode-dot" />Google Analytics</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div></header>
    <aside className="side-rail" aria-label="Navegação principal"><button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button><button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19} /></button><button className="rail-button" onClick={() => go("/health")} title="Saúde das contas" type="button"><HeartPulse size={19} /></button><button className="rail-button" onClick={() => go("/meta-ads")} title="Meta Ads" type="button"><BarChart3 size={19} /></button><button className="rail-button" onClick={() => go("/google-ads")} title="Google Ads" type="button"><BarChart3 size={19} /></button><button className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Google Analytics 4" type="button"><BarChart3 size={19} /></button></aside>
    <main className="dashboard-main google-ads-main"><section className="google-ads-hero"><div><p className="eyebrow">MÍDIA E PERFORMANCE · CONEXÃO CORPORATIVA</p><h1>Google Analytics 4</h1><p className="hero-subtitle">Conecte a conta Global Mídia e consulte todas as propriedades disponíveis.</p></div><div className="meta-ads-hero-actions"><button className="meta-connection-action" onClick={() => go("/api/ga4/connect")} type="button">{data.connected ? "Reconectar conta" : "Conectar conta"}</button><button className="sync-button" disabled={loading || !data.connected} onClick={() => void refresh()} type="button"><RefreshCw size={16} />{loading ? "Atualizando..." : "Atualizar propriedades"}</button></div></section>
      {!data.connected ? <section className="google-ads-empty"><h2>Google Analytics ainda não conectado</h2><p>Use a conta marketing@globalmidia.digital quando o Google solicitar autorização.</p></section> : data.error ? <section className="google-ads-empty"><h2>Não foi possível consultar o GA4</h2><p>{data.error}</p></section> : <section className="google-ads-accounts"><header><div><p className="eyebrow">PROPRIEDADES ACESSÍVEIS</p><h2>{data.properties.length} propriedades encontradas</h2><p>As propriedades são descobertas automaticamente pela conta Global Mídia.</p></div></header><div className="google-ads-account-list">{data.properties.map((property) => <article key={property.id}><div><h3>{property.name}</h3><p>Propriedade {property.id} · Conta {property.accountName}</p></div><strong>Ver relatórios</strong></article>)}</div></section>}
    </main>
  </div>;
}
