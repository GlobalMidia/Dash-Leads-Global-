"use client";

import { Activity, AlertTriangle, Building2, HeartPulse, LayoutDashboard, Plus, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import type { ClientAccount } from "@/types/client-health";

type Props = { initialAccounts: ClientAccount[]; mode: "demo" | "live"; user: { name: string; email: string; initials: string } };

const healthLabel = { green: "Saudável", yellow: "Atenção", red: "Urgente", unassessed: "Sem avaliação" } as const;

export function HealthCenter({ initialAccounts, mode, user }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", profileUrl: "", nucleus: "", accountHead: "", direction: "" });
  const go = (path: string) => window.location.assign(path);

  const red = accounts.filter((account) => account.healthStatus === "red");
  const reviewNeeded = accounts.filter((account) => !account.lastReviewAt).length;

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "demo") { setNotice("A área demonstrativa não grava clientes."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/health/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { account?: ClientAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível cadastrar a conta.");
      setAccounts((current) => [data.account!, ...current]);
      setForm({ name: "", profileUrl: "", nucleus: "", accountHead: "", direction: "" });
      setOpen(false);
      setNotice("Cliente adicionado. A primeira avaliação semanal já pode ser registrada na próxima etapa.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível cadastrar a conta."); }
    finally { setSaving(false); }
  }

  return <div className="dashboard-shell health-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar"><button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button><div className="topbar-actions"><span className={`mode-pill ${mode}`}><span className="mode-dot" />{mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div></header>
    <aside className="side-rail" aria-label="Navegação principal"><button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button><button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19} /></button><button className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Saúde das contas" type="button"><HeartPulse size={19} /></button></aside>
    <main className="dashboard-main health-center"><section className="health-hero"><div><p className="eyebrow">CUSTOMER EXPERIENCE</p><h1>Saúde das contas</h1><p className="hero-subtitle">Acompanhe o estado de cada cliente, entregas, pendências e a revisão semanal.</p></div><button className="sync-button" onClick={() => setOpen(true)} type="button"><Plus size={17} />Nova conta</button></section>
    {red.length > 0 && <section className="health-alert"><AlertTriangle size={18} /><div><strong>{red.length} conta{red.length > 1 ? "s" : ""} com prioridade urgente</strong><small>Esses clientes permanecem no topo até receberem uma revisão.</small></div></section>}
    <section className="health-summary"><article><Activity size={20}/><div><small>CONTAS ATIVAS</small><strong>{accounts.length}</strong></div></article><article><ShieldCheck size={20}/><div><small>SEM REVISÃO</small><strong>{reviewNeeded}</strong></div></article><article><AlertTriangle size={20}/><div><small>URGENTES</small><strong>{red.length}</strong></div></article></section>
    <section className="health-list"><header><div><p className="eyebrow">ACOMPANHAMENTO</p><h2>Clientes ativos</h2></div><span>As pendências e avaliações semanais serão registradas por cliente.</span></header>{accounts.length ? <div className="health-grid">{accounts.map((account) => <article className={`health-account health-${account.healthStatus}`} key={account.id}><div className="health-account-title"><span><Building2 size={18}/></span><div><h3>{account.name}</h3><p>{account.nucleus || "Núcleo não definido"}{account.accountHead ? ` · ${account.accountHead}` : ""}</p></div></div><b>{healthLabel[account.healthStatus]}</b><footer><span>{account.openPendencies} pendência{account.openPendencies === 1 ? "" : "s"} aberta{account.openPendencies === 1 ? "" : "s"}</span>{account.profileUrl && <a href={account.profileUrl} target="_blank" rel="noreferrer">Perfil da empresa</a>}</footer></article>)}</div> : <div className="health-empty"><HeartPulse size={30}/><h2>Comece pela primeira conta</h2><p>Cadastre um cliente para organizar as avaliações, entregas e pendências semanais.</p><button className="sync-button" onClick={() => setOpen(true)} type="button"><Plus size={16}/>Cadastrar cliente</button></div>}</section>
    {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button"><X size={15}/></button></div>}
    {open && <div className="health-modal-backdrop"><form className="health-modal" onSubmit={createAccount}><header><div><p className="eyebrow">NOVA CONTA</p><h2>Cadastrar cliente</h2></div><button onClick={() => setOpen(false)} type="button"><X size={18}/></button></header><label>Nome do cliente<input required value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/></label><label>Link profissional <small>Site, Instagram, LinkedIn ou Facebook</small><input placeholder="https://" value={form.profileUrl} onChange={(e) => setForm({...form,profileUrl:e.target.value})}/></label><div className="health-form-grid"><label>Núcleo<input value={form.nucleus} onChange={(e) => setForm({...form,nucleus:e.target.value})}/></label><label>Head responsável<input value={form.accountHead} onChange={(e) => setForm({...form,accountHead:e.target.value})}/></label></div><label>Direção<input value={form.direction} onChange={(e) => setForm({...form,direction:e.target.value})}/></label><footer><button className="tutorial-button" onClick={() => setOpen(false)} type="button">Cancelar</button><button className="sync-button" disabled={saving} type="submit">{saving ? "Salvando..." : "Cadastrar conta"}</button></footer></form></div>}
    </main></div>;
}
