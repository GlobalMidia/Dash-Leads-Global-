"use client";

import { Activity, AlertTriangle, ArrowRight, Bell, Building2, Check, ClipboardList, ExternalLink, HeartPulse, History, LayoutDashboard, LoaderCircle, Pencil, Plus, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import {
  formatCnpj,
  isCurrentFridayReminder,
  isWeeklyReviewPending,
  normalizeCnpj,
  reviewWeek,
} from "@/lib/client-health";
import type { AccountHealth, ClientAccount, ClientAccountDetails, ClientHealthReview, ClientPendency, ClientSatisfaction, DeliveryStatus } from "@/types/client-health";

type Props = { initialAccounts: ClientAccount[]; initialNow: string; mode: "demo" | "live"; user: { name: string; email: string; initials: string } };
type ReviewForm = { healthStatus: Exclude<AccountHealth, "unassessed">; satisfaction: ClientSatisfaction; deliveryStatus: DeliveryStatus; notes: string };
type AccountEditForm = Pick<ClientAccount, "name" | "nucleus" | "accountHead" | "direction">;

const healthLabel = { green: "Saudável", yellow: "Atenção", red: "Urgente", unassessed: "Sem avaliação" } as const;
const satisfactionLabel = { satisfied: "Está gostando", neutral: "Neutro", dissatisfied: "Insatisfeito", unknown: "Não avaliado" } as const;
const deliveryLabel = { on_track: "Em dia", attention: "Atenção", late: "Atrasada", unknown: "Não avaliada" } as const;

export function HealthCenter({ initialAccounts, initialNow, mode, user }: Props) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ClientAccountDetails | null>(null);
  const [loadingAccount, setLoadingAccount] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [redAlertOpen, setRedAlertOpen] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [accountView, setAccountView] = useState<"active" | "closed">("active");
  const [accountSearch, setAccountSearch] = useState("");
  const [form, setForm] = useState({ name: "", cnpj: "", profileUrl: "", nucleus: "", accountHead: "", direction: "" });
  const [accountEdit, setAccountEdit] = useState<AccountEditForm | null>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(false);
  const [review, setReview] = useState<ReviewForm>({ healthStatus: "yellow", satisfaction: "unknown", deliveryStatus: "unknown", notes: "" });
  const [pendencyTitle, setPendencyTitle] = useState("");
  const [now, setNow] = useState(() => new Date(initialNow));
  const go = (path: string) => window.location.assign(path);

  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts]);
  const closedAccounts = useMemo(() => accounts.filter((account) => !account.active), [accounts]);
  const red = activeAccounts.filter((account) => account.healthStatus === "red");
  const reviewNeeded = activeAccounts.filter((account) => isWeeklyReviewPending(account, now)).length;
  const weeklyReminder = reviewNeeded > 0;
  const currentFridayReminder = isCurrentFridayReminder(now);
  const alertItems = useMemo(() => {
    const items: Array<{ id: string; account: ClientAccount; level: "urgent" | "pending" | "attention"; title: string; description: string }> = [];
    const millisecondsPerDay = 86_400_000;

    for (const account of activeAccounts) {
      if (account.healthStatus === "red") {
        items.push({ id: `urgent-${account.id}`, account, level: "urgent", title: "Conta com prioridade urgente", description: `${account.name} foi marcada como urgente na última revisão.` });
      }
      if (isWeeklyReviewPending(account, now)) {
        items.push({ id: `review-${account.id}`, account, level: "pending", title: "Revisão semanal pendente", description: `${account.name} precisa de uma atualização semanal.` });
      }
      if (account.openPendencies > 0) {
        items.push({ id: `pendency-${account.id}`, account, level: "attention", title: `${account.openPendencies} pendência${account.openPendencies === 1 ? "" : "s"} aberta${account.openPendencies === 1 ? "" : "s"}`, description: `Há itens em aberto no acompanhamento de ${account.name}.` });
      }
      const referenceDate = new Date(account.lastReviewAt ?? account.createdAt);
      const inactiveDays = Math.floor((now.getTime() - referenceDate.getTime()) / millisecondsPerDay);
      if (Number.isFinite(inactiveDays) && inactiveDays >= 21) {
        items.push({ id: `stale-${account.id}`, account, level: "attention", title: "Conta sem atualização recente", description: `${account.name} não recebe revisão há ${inactiveDays} dias.` });
      }
    }

    const priority = { urgent: 0, pending: 1, attention: 2 } as const;
    return items.sort((a, b) => priority[a.level] - priority[b.level] || a.account.name.localeCompare(b.account.name, "pt-BR"));
  }, [activeAccounts, now]);
  const orderedAccounts = useMemo(() => {
    const normalizedSearch = accountSearch.trim().toLocaleLowerCase("pt-BR");
    const visibleAccounts = (accountView === "active" ? activeAccounts : closedAccounts)
      .filter((account) => !normalizedSearch || [
        account.name,
        account.cnpj,
        account.nucleus,
        account.accountHead,
        account.direction,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedSearch)));
    const priority = { red: 0, yellow: 1, unassessed: 2, green: 3 } as const;
    return [...visibleAccounts].sort((a, b) => accountView === "closed"
      ? (b.closedAt ?? b.updatedAt).localeCompare(a.closedAt ?? a.updatedAt)
      : priority[a.healthStatus] - priority[b.healthStatus] || b.updatedAt.localeCompare(a.updatedAt));
  }, [accountSearch, accountView, activeAccounts, closedAccounts]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function replaceAccount(account: ClientAccount) {
    setAccounts((current) => current.map((item) => item.id === account.id ? account : item));
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "demo") { setNotice("A área demonstrativa não grava clientes."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/health/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { account?: ClientAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível cadastrar a conta.");
      setAccounts((current) => [data.account!, ...current]);
      setForm({ name: "", cnpj: "", profileUrl: "", nucleus: "", accountHead: "", direction: "" });
      setCreateOpen(false);
      setNotice("Cliente adicionado. Registre a primeira avaliação semanal quando estiver pronto.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível cadastrar a conta."); }
    finally { setSaving(false); }
  }

  async function openAccount(account: ClientAccount) {
    if (mode !== "live") { setNotice("O acompanhamento completo fica disponível na base ao vivo."); return; }
    setLoadingAccount(account.id);
    try {
      const response = await fetch(`/api/health/accounts/${encodeURIComponent(account.id)}`);
      const data = await response.json() as { account?: ClientAccountDetails; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível abrir a conta.");
      setSelected(data.account);
      setAccountEdit(null);
      const latest = data.account.reviews[0];
      setReview(latest ? { healthStatus: latest.healthStatus, satisfaction: latest.satisfaction, deliveryStatus: latest.deliveryStatus, notes: latest.notes } : { healthStatus: account.healthStatus === "unassessed" ? "yellow" : account.healthStatus, satisfaction: "unknown", deliveryStatus: "unknown", notes: "" });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível abrir a conta."); }
    finally { setLoadingAccount(null); }
  }

  function openAlertAccount(account: ClientAccount) {
    setAlertsOpen(false);
    void openAccount(account);
  }

  function beginAccountEdit() {
    if (!selected) return;
    setAccountEdit({
      name: selected.name,
      nucleus: selected.nucleus,
      accountHead: selected.accountHead,
      direction: selected.direction,
    });
  }

  async function saveAccountInformation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !accountEdit) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountEdit),
      });
      const data = await response.json() as { account?: ClientAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível atualizar a conta.");
      const detailsResponse = await fetch(`/api/health/accounts/${selected.id}`);
      const detailsData = await detailsResponse.json().catch(() => null) as { account?: ClientAccountDetails } | null;
      const updated = detailsResponse.ok && detailsData?.account
        ? detailsData.account
        : { ...selected, ...data.account };
      setSelected(updated);
      replaceAccount(updated);
      setAccountEdit(null);
      setNotice("Informações da conta atualizadas.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a conta.");
    } finally {
      setSaving(false);
    }
  }

  async function saveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...review, reviewWeek: reviewWeek() }) });
      const data = await response.json() as { review?: ClientHealthReview; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error ?? "Não foi possível salvar a avaliação.");
      const updated = { ...selected, healthStatus: data.review.healthStatus, lastReviewAt: data.review.updatedAt, reviews: [data.review, ...selected.reviews.filter((item) => item.reviewWeek.slice(0, 10) !== data.review!.reviewWeek.slice(0, 10))], updatedAt: data.review.updatedAt };
      setSelected(updated);
      replaceAccount(updated);
      setNotice("Avaliação semanal salva.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar a avaliação."); }
    finally { setSaving(false); }
  }

  async function addPendency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !pendencyTitle.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}/pendencies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: pendencyTitle, reviewWeek: reviewWeek() }) });
      const data = await response.json() as { pendency?: ClientPendency; error?: string };
      if (!response.ok || !data.pendency) throw new Error(data.error ?? "Não foi possível criar a pendência.");
      const updated = { ...selected, pendencies: [data.pendency, ...selected.pendencies], openPendencies: selected.openPendencies + 1 };
      setSelected(updated); replaceAccount(updated); setPendencyTitle("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar a pendência."); }
    finally { setSaving(false); }
  }

  async function togglePendency(pendency: ClientPendency) {
    if (!selected) return;
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}/pendencies/${pendency.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !pendency.completedAt }) });
      const data = await response.json() as { pendency?: ClientPendency; error?: string };
      if (!response.ok || !data.pendency) throw new Error(data.error ?? "Não foi possível atualizar a pendência.");
      const updated = { ...selected, pendencies: selected.pendencies.map((item) => item.id === data.pendency!.id ? data.pendency! : item), openPendencies: selected.openPendencies + (data.pendency.completedAt ? -1 : 1) };
      setSelected(updated); replaceAccount(updated);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a pendência."); }
  }

  async function endAccount() {
    if (!selected || !window.confirm(`Encerrar ${selected.name}? Os registros permanecem no histórico, mas a conta deixa de pedir revisões.`)) return;
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) });
      const data = await response.json() as { account?: ClientAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível encerrar a conta.");
      replaceAccount(data.account);
      setSelected(null);
      setAccountView("closed");
      setNotice("Conta encerrada. O histórico foi preservado e ela não receberá novos avisos.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível encerrar a conta."); }
  }

  async function reactivateAccount() {
    if (!selected || !window.confirm(`Reativar ${selected.name}? A conta voltará a receber os lembretes semanais.`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      const data = await response.json() as { account?: ClientAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível reativar a conta.");
      replaceAccount(data.account);
      setSelected(null);
      setAccountView("active");
      setNotice("Conta reativada. Ela voltou ao acompanhamento e aos lembretes semanais.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível reativar a conta.");
    } finally {
      setSaving(false);
    }
  }

  function closedAccountRetentionLabel(account: ClientAccount) {
    if (!account.closedAt) return "Exclusão automática em até 7 dias";
    const purgeAt = new Date(account.closedAt).getTime() + 7 * 86_400_000;
    const remainingDays = Math.max(0, Math.ceil((purgeAt - now.getTime()) / 86_400_000));
    return remainingDays === 0
      ? "Exclusão automática prevista para hoje"
      : `Exclusão automática em ${remainingDays} dia${remainingDays === 1 ? "" : "s"}`;
  }

  async function permanentlyDeleteAccount() {
    if (!selected || selected.active) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/health/accounts/${selected.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { deleted?: boolean; error?: string } | null;
      if (!response.ok || !data?.deleted) throw new Error(data?.error ?? "Não foi possível excluir a conta.");
      setAccounts((current) => current.filter((account) => account.id !== selected.id));
      setSelected(null);
      setPermanentDeleteConfirm(false);
      setNotice("Conta excluída definitivamente, junto com seu histórico, avaliações e pendências.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="dashboard-shell health-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
    <header className="topbar"><button className="brand-lockup" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button><div className="topbar-actions"><span className={`mode-pill ${mode}`}><span className="mode-dot" />{mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}</span><button aria-expanded={alertsOpen} aria-haspopup="dialog" aria-label={`Central de avisos, ${alertItems.length} aviso${alertItems.length === 1 ? "" : "s"}`} className="icon-button health-alert-trigger" onClick={() => setAlertsOpen((open) => !open)} type="button"><Bell size={18}/>{alertItems.length > 0 && <span>{alertItems.length > 99 ? "99+" : alertItems.length}</span>}</button><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div></header>
    <aside className="side-rail" aria-label="Navegação principal"><button className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button><button className="rail-button" onClick={() => go("/pme")} title="PME e reativação" type="button"><Building2 size={19} /></button><button className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Saúde das contas" type="button"><HeartPulse size={19} /></button></aside>
    <main className="dashboard-main health-center"><section className="health-hero"><div><p className="eyebrow">CUSTOMER EXPERIENCE</p><h1>Saúde das contas</h1><p className="hero-subtitle">Acompanhe o estado de cada cliente, entregas, pendências e a revisão semanal.</p></div><button className="sync-button" onClick={() => setCreateOpen(true)} type="button"><Plus size={17} />Nova conta</button></section>
    {weeklyReminder && <section className="health-weekly-reminder"><ClipboardList size={19}/><div><strong>Revisão semanal pendente</strong><small>{reviewNeeded} conta{reviewNeeded > 1 ? "s" : ""} ainda precisa{reviewNeeded === 1 ? "" : "m"} de atualização {currentFridayReminder ? "nesta sexta-feira" : "desde a última sexta-feira"}.</small></div></section>}
    {red.length > 0 && redAlertOpen && <section className="health-alert"><AlertTriangle size={18} /><div><strong>{red.length} conta{red.length > 1 ? "s" : ""} com prioridade urgente</strong><small>O aviso pode ser fechado, mas essas contas continuam prioritárias na Central de Avisos.</small></div><button aria-label="Fechar alerta urgente" onClick={() => setRedAlertOpen(false)} type="button"><X size={16}/></button></section>}
    {alertsOpen && <section aria-label="Central de avisos" className="health-alert-center" role="dialog">
      <header><div><p className="eyebrow">ACOMPANHAMENTO</p><h2>Central de Avisos</h2><span>{alertItems.length ? `${alertItems.length} aviso${alertItems.length === 1 ? "" : "s"} que merecem atenção` : "Nenhum aviso pendente"}</span></div><button aria-label="Fechar central de avisos" onClick={() => setAlertsOpen(false)} type="button"><X size={17}/></button></header>
      {alertItems.length ? <div className="health-alert-list">{alertItems.map((item) => <button className={`health-alert-item ${item.level}`} key={item.id} onClick={() => openAlertAccount(item.account)} type="button"><span>{item.level === "urgent" ? <AlertTriangle size={17}/> : item.level === "pending" ? <ClipboardList size={17}/> : <Check size={17}/>}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><ArrowRight size={16}/></button>)}</div> : <div className="health-alert-empty"><Bell size={22}/><p>Todas as contas estão em dia. A central avisará quando houver uma revisão, pendência ou prioridade a tratar.</p></div>}
    </section>}
    <section className="health-summary"><article><Activity size={20}/><div><small>CONTAS ATIVAS</small><strong>{activeAccounts.length}</strong></div></article><article><ShieldCheck size={20}/><div><small>REVISÃO DA SEMANA</small><strong>{reviewNeeded}</strong></div></article><article><AlertTriangle size={20}/><div><small>URGENTES</small><strong>{red.length}</strong></div></article></section>
    <section className="health-list">
      <header>
        <div><p className="eyebrow">ACOMPANHAMENTO</p><h2>{accountView === "active" ? "Clientes ativos" : "Contas encerradas"}</h2></div>
        <span>{accountView === "active" ? "Abra uma conta para registrar o estado do cliente, entregas, pendências e o histórico semanal." : "Consulte o histórico, reative se necessário ou exclua definitivamente. Contas encerradas são removidas automaticamente após 7 dias."}</span>
      </header>
      <div className="health-account-controls">
        <div className="health-account-tabs" role="tablist" aria-label="Situação das contas">
          <button aria-selected={accountView === "active"} className={accountView === "active" ? "active" : ""} onClick={() => setAccountView("active")} role="tab" type="button">Ativas <span>{activeAccounts.length}</span></button>
          <button aria-selected={accountView === "closed"} className={accountView === "closed" ? "active" : ""} onClick={() => setAccountView("closed")} role="tab" type="button">Encerradas <span>{closedAccounts.length}</span></button>
        </div>
        <label className="health-account-search"><Search size={15}/><input aria-label="Pesquisar conta" onChange={(event) => setAccountSearch(event.target.value)} placeholder="Pesquisar empresa, CNPJ ou responsável" type="search" value={accountSearch}/></label>
      </div>
      {orderedAccounts.length ? <div className="health-grid">{orderedAccounts.map((account) => <article className={`health-account ${account.active ? `health-${account.healthStatus}` : "health-closed"}`} key={account.id}>
        <div className="health-account-title"><span><Building2 size={18}/></span><div><h3>{account.name}</h3>{!account.active && <p>Conta encerrada</p>}</div></div>
        <dl className="health-card-metadata"><div><dt>Núcleo</dt><dd>{account.nucleus || "Não definido"}</dd></div><div><dt>Head responsável</dt><dd>{account.accountHead || "Não informado"}</dd></div><div><dt>Direção</dt><dd>{account.direction || "Não informada"}</dd></div><div><dt>Perfil profissional</dt><dd>{account.profileUrl ? <a href={account.profileUrl} rel="noreferrer" target="_blank" title={account.profileUrl}><span>{account.profileUrl}</span><ExternalLink size={12}/></a> : "Não informado"}</dd></div></dl>
        <b>{account.active ? healthLabel[account.healthStatus] : "Encerrada"}</b>
        <footer><span>{account.active ? `${account.openPendencies} pendência${account.openPendencies === 1 ? "" : "s"} aberta${account.openPendencies === 1 ? "" : "s"}` : <><span>{account.closedAt ? `Encerrada em ${new Date(account.closedAt).toLocaleDateString("pt-BR")}${account.closedBy ? ` por ${account.closedBy}` : ""}` : "Histórico preservado"}</span><small>{closedAccountRetentionLabel(account)}</small></>}</span><button onClick={() => void openAccount(account)} type="button">{loadingAccount === account.id ? <LoaderCircle className="animate-spin" size={14}/> : account.active ? "Acompanhar" : "Ver histórico"}</button></footer>
      </article>)}</div> : <div className="health-empty"><HeartPulse size={30}/><h2>{accountSearch ? "Nenhuma conta encontrada" : accountView === "active" ? "Comece pela primeira conta" : "Nenhuma conta encerrada"}</h2><p>{accountSearch ? "Revise o termo pesquisado ou limpe a busca." : accountView === "active" ? "Cadastre um cliente para organizar as avaliações, entregas e pendências semanais." : "Quando uma conta for encerrada, o histórico dela ficará disponível aqui."}</p>{accountView === "active" && !accountSearch && <button className="sync-button" onClick={() => setCreateOpen(true)} type="button"><Plus size={16}/>Cadastrar cliente</button>}</div>}
    </section>
    {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button"><X size={15}/></button></div>}
    {createOpen && <div className="health-modal-backdrop"><form className="health-modal" onSubmit={createAccount}><header><div><p className="eyebrow">NOVA CONTA</p><h2>Cadastrar cliente</h2></div><button onClick={() => setCreateOpen(false)} type="button"><X size={18}/></button></header><div className="health-form-grid"><label>Nome do cliente<input required value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/></label><label>CNPJ <small>Opcional</small><input inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({...form,cnpj:formatCnpj(normalizeCnpj(e.target.value))})}/></label></div><label>Link profissional <small>Obrigatório · Site, Instagram, LinkedIn ou Facebook</small><input placeholder="https://" required type="url" value={form.profileUrl} onChange={(e) => setForm({...form,profileUrl:e.target.value})}/></label><div className="health-form-grid"><label>Núcleo<input value={form.nucleus} onChange={(e) => setForm({...form,nucleus:e.target.value})}/></label><label>Head responsável<input value={form.accountHead} onChange={(e) => setForm({...form,accountHead:e.target.value})}/></label></div><label>Direção<input value={form.direction} onChange={(e) => setForm({...form,direction:e.target.value})}/></label><footer><button className="tutorial-button" onClick={() => setCreateOpen(false)} type="button">Cancelar</button><button className="sync-button" disabled={saving} type="submit">{saving ? "Salvando..." : "Cadastrar conta"}</button></footer></form></div>}
    {selected && <div className="health-modal-backdrop">
      <section aria-modal="true" className="health-detail-modal" role="dialog">
        <header>
          <div className="health-detail-heading"><p className="eyebrow">{selected.active ? "ACOMPANHAMENTO SEMANAL" : "HISTÓRICO DA CONTA"}</p><h2>{selected.name}</h2>{!selected.active && <span className="health-closed-heading">Conta encerrada{selected.closedAt ? ` em ${new Date(selected.closedAt).toLocaleDateString("pt-BR")}` : ""}{selected.closedBy ? ` por ${selected.closedBy}` : ""}</span>}</div>
          <button aria-label="Fechar conta" onClick={() => { setSelected(null); setAccountEdit(null); setPermanentDeleteConfirm(false); }} type="button"><X size={18}/></button>
        </header>
        <div className="health-detail-body">
          <section className="health-account-summary">
            <div className="health-section-title"><div><Building2 size={17}/><h3>Informações da conta</h3></div></div>
            <dl className="health-account-metadata"><div><dt>CNPJ</dt><dd>{selected.cnpj ? formatCnpj(selected.cnpj) : "Não informado"}</dd></div><div><dt>Núcleo</dt><dd>{selected.nucleus || "Não definido"}</dd></div><div><dt>Head responsável</dt><dd>{selected.accountHead || "Não informado"}</dd></div><div><dt>Direção</dt><dd>{selected.direction || "Não informada"}</dd></div><div className="health-metadata-wide"><dt>Perfil profissional</dt><dd>{selected.profileUrl ? <a className="health-profile-value" href={selected.profileUrl} rel="noreferrer" target="_blank"><span>{selected.profileUrl}</span><ExternalLink size={14}/></a> : <span className="health-profile-missing">Não informado</span>}</dd></div></dl>
            {selected.active && <button className="health-edit-account-button" onClick={beginAccountEdit} type="button"><Pencil size={14}/>Editar informações</button>}
          </section>
          {selected.active && accountEdit && <form className="health-account-edit-form" onSubmit={saveAccountInformation}><div className="health-section-title"><div><Pencil size={17}/><h3>Editar informações da conta</h3></div><span>CNPJ e link permanecem fixos</span></div><label>Nome da conta<input required value={accountEdit.name} onChange={(e) => setAccountEdit({...accountEdit,name:e.target.value})}/></label><div className="health-form-grid"><label>Núcleo<input value={accountEdit.nucleus} onChange={(e) => setAccountEdit({...accountEdit,nucleus:e.target.value})}/></label><label>Head responsável<input value={accountEdit.accountHead} onChange={(e) => setAccountEdit({...accountEdit,accountHead:e.target.value})}/></label></div><label>Direção<input value={accountEdit.direction} onChange={(e) => setAccountEdit({...accountEdit,direction:e.target.value})}/></label><div className="health-account-edit-actions"><button className="tutorial-button" onClick={() => setAccountEdit(null)} type="button">Cancelar</button><button className="sync-button" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar informações"}</button></div></form>}
          {selected.active && <form className="health-review-form" onSubmit={saveReview}><div className="health-section-title"><div><ClipboardList size={17}/><h3>Revisão desta semana</h3></div><span>{reviewWeek().split("-").reverse().join("/")}</span></div><div className="health-form-grid"><label>Estado da conta<select value={review.healthStatus} onChange={(e) => setReview({...review,healthStatus:e.target.value as ReviewForm["healthStatus"]})}><option value="green">Saudável</option><option value="yellow">Atenção</option><option value="red">Urgente</option></select></label><label>Satisfação<select value={review.satisfaction} onChange={(e) => setReview({...review,satisfaction:e.target.value as ClientSatisfaction})}>{Object.entries(satisfactionLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Entregas<select value={review.deliveryStatus} onChange={(e) => setReview({...review,deliveryStatus:e.target.value as DeliveryStatus})}>{Object.entries(deliveryLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>Resumo da semana<textarea maxLength={1200} placeholder="O que está bem, o que exige cuidado e próximos passos..." value={review.notes} onChange={(e) => setReview({...review,notes:e.target.value})}/></label><button className="sync-button" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar revisão"}</button></form>}
          <section className="health-pendency-section"><div className="health-section-title"><div><Check size={17}/><h3>Pendências</h3></div><span>{selected.openPendencies} aberta{selected.openPendencies === 1 ? "" : "s"}</span></div>{selected.active && <form className="health-add-pendency" onSubmit={addPendency}><input maxLength={240} onChange={(e) => setPendencyTitle(e.target.value)} placeholder="Nova pendência da semana" value={pendencyTitle}/><button disabled={saving || !pendencyTitle.trim()} type="submit"><Plus size={16}/><span>Adicionar</span></button></form>}<div className="health-pendency-list">{selected.pendencies.length ? selected.pendencies.map((pendency) => <label className={pendency.completedAt ? "completed" : ""} key={pendency.id}><input checked={Boolean(pendency.completedAt)} disabled={!selected.active} onChange={() => void togglePendency(pendency)} type="checkbox"/><span>{pendency.title}</span></label>) : <p>Nenhuma pendência cadastrada para esta conta.</p>}</div></section>
          <section className="health-review-history"><div className="health-section-title"><div><Activity size={17}/><h3>Histórico semanal</h3></div></div>{selected.reviews.length ? selected.reviews.slice(0, 6).map((item) => <article key={item.id}><strong>{item.reviewWeek.slice(0,10).split("-").reverse().join("/")}</strong><span className={`health-chip ${item.healthStatus}`}>{healthLabel[item.healthStatus]}</span><span>{satisfactionLabel[item.satisfaction]} · Entregas {deliveryLabel[item.deliveryStatus]}</span>{item.notes && <p>{item.notes}</p>}</article>) : <p>A primeira revisão ainda não foi registrada.</p>}</section>
          <section className="health-account-audit"><div className="health-section-title"><div><History size={17}/><h3>Auditoria da conta</h3></div><span>Quem alterou, quando e o que mudou</span></div>{selected.auditEvents.length ? <div className="health-audit-list">{selected.auditEvents.slice(0,20).map((event) => <article key={event.id}><header><div><strong>{event.title}</strong><small>por {event.actor}{event.actorEmail && event.actorEmail !== event.actor ? ` · ${event.actorEmail}` : ""}</small></div><time>{new Date(event.occurredAt).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</time></header>{event.changes.length > 0 && <dl>{event.changes.map((change) => <div key={change.field}><dt>{change.label}</dt><dd><span>{change.before}</span><ArrowRight size={13}/><strong>{change.after}</strong></dd></div>)}</dl>}</article>)}</div> : <p className="health-audit-empty">A auditoria será exibida a partir da próxima alteração desta conta.</p>}</section>
        </div>
        <footer>{selected.active ? <button className="health-end-account" onClick={() => void endAccount()} type="button">Encerrar conta</button> : <div className="health-closed-actions"><span>{closedAccountRetentionLabel(selected)}</span>{permanentDeleteConfirm ? <div className="health-delete-confirm"><strong>Excluir definitivamente?</strong><small>Remove a conta e todos os dados relacionados, sem recuperação.</small><button className="tutorial-button" disabled={saving} onClick={() => setPermanentDeleteConfirm(false)} type="button">Cancelar</button><button className="health-permanent-delete" disabled={saving} onClick={() => void permanentlyDeleteAccount()} type="button">{saving ? "Excluindo..." : "Confirmar exclusão"}</button></div> : <><button className="health-reactivate-account" disabled={saving} onClick={() => void reactivateAccount()} type="button"><RotateCcw size={14}/>{saving ? "Reativando..." : "Reativar conta"}</button><button className="health-permanent-delete" disabled={saving} onClick={() => setPermanentDeleteConfirm(true)} type="button">Excluir definitivamente</button></>}</div>}<button className="tutorial-button" onClick={() => { setSelected(null); setAccountEdit(null); setPermanentDeleteConfirm(false); }} type="button">Fechar</button></footer>
      </section>
    </div>}
    </main></div>;
}
