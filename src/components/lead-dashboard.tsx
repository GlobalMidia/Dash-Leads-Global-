"use client";

import {
  ArrowDownToLine,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  Filter,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { leadsToCsv } from "@/lib/export-leads";
import {
  filterLeads,
  groupByDay,
  groupByOrigin,
  summarizeLeads,
  type DashboardFilters,
} from "@/lib/lead-metrics";
import {
  LEAD_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  type Lead,
  type LeadStatus,
} from "@/types/lead";

type DashboardProps = {
  initialLeads: Lead[];
  mode: "demo" | "live";
  rdConfigured: boolean;
};

const DEFAULT_FILTERS: DashboardFilters = {
  query: "",
  origin: "all",
  status: "all",
  startDate: "",
  endDate: "",
};

const PAGE_SIZE = 8;
const ORIGIN_COLORS = ["#2f7df4", "#17b6a4", "#ff9f43", "#7257d8", "#e95e6b"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date(value))
    .replace(".", "");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function MetricCard({
  title,
  value,
  detail,
  color,
  icon,
}: {
  title: string;
  value: string | number;
  detail: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon" style={{ color, backgroundColor: `${color}14` }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="metric-title">{title}</p>
        <div className="mt-1 flex items-end gap-2">
          <strong className="metric-value">{value}</strong>
          <span className="metric-detail">{detail}</span>
        </div>
      </div>
    </article>
  );
}

function LeadsChart({ leads }: { leads: Lead[] }) {
  const data = groupByDay(leads);
  const width = 720;
  const height = 190;
  const paddingX = 20;
  const paddingTop = 20;
  const paddingBottom = 38;
  const max = Math.max(4, ...data.map((item) => item.total));
  const xStep = (width - paddingX * 2) / Math.max(data.length - 1, 1);
  const usableHeight = height - paddingTop - paddingBottom;
  const points = data.map((item, index) => ({
    ...item,
    x: paddingX + index * xStep,
    y: paddingTop + usableHeight - (item.total / max) * usableHeight,
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `M ${points[0].x} ${height - paddingBottom}`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L ${points.at(-1)?.x ?? width - paddingX} ${height - paddingBottom}`,
    "Z",
  ].join(" ");

  return (
    <div className="chart-wrap">
      <svg
        aria-label="Evolução diária da entrada de leads"
        className="h-auto w-full min-w-[560px]"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
      >
        <defs>
          <linearGradient id="lead-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2f7df4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2f7df4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = paddingTop + (usableHeight / 3) * line;
          return (
            <line
              key={line}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="#e8edf5"
              strokeDasharray="4 5"
            />
          );
        })}
        <path d={areaPath} fill="url(#lead-chart-fill)" />
        <polyline
          fill="none"
          points={polyline}
          stroke="#2f7df4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {points.map((point) => (
          <g key={point.date}>
            <circle
              cx={point.x}
              cy={point.y}
              fill="#fff"
              r="4.5"
              stroke="#2f7df4"
              strokeWidth="2.5"
            />
            <text
              fill="#758198"
              fontSize="10"
              textAnchor="middle"
              x={point.x}
              y={height - 14}
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StatusSelect({
  status,
  disabled,
  onChange,
}: {
  status: LeadStatus;
  disabled: boolean;
  onChange: (status: LeadStatus) => void;
}) {
  return (
    <label
      className="status-select"
      style={{
        color: STATUS_COLORS[status],
        backgroundColor: `${STATUS_COLORS[status]}12`,
        borderColor: `${STATUS_COLORS[status]}30`,
      }}
    >
      <span
        className="status-dot"
        style={{ backgroundColor: STATUS_COLORS[status] }}
      />
      <select
        aria-label="Alterar qualificação do lead"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as LeadStatus)}
        value={status}
      >
        {LEAD_STATUSES.map((option) => (
          <option key={option} value={option}>
            {STATUS_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Logo() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        G
      </div>
      <div className="leading-tight">
        <strong className="block text-[15px] tracking-[-0.02em] text-slate-900">
          Global Mídia
        </strong>
        <span className="block text-[9px] font-bold tracking-[0.19em] text-slate-400">
          LEADS
        </span>
      </div>
    </div>
  );
}

export function LeadDashboard({
  initialLeads,
  mode,
  rdConfigured,
}: DashboardProps) {
  const [leads, setLeads] = useState(initialLeads);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const origins = useMemo(
    () => [...new Set(leads.map((lead) => lead.origin))].sort(),
    [leads],
  );
  const filteredLeads = useMemo(
    () => filterLeads(leads, filters),
    [filters, leads],
  );
  const metrics = useMemo(() => summarizeLeads(filteredLeads), [filteredLeads]);
  const originData = useMemo(() => groupByOrigin(filteredLeads), [filteredLeads]);
  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const paginatedLeads = filteredLeads.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!selectedLead) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedLeadId(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedLead]);

  function updateFilter<Key extends keyof DashboardFilters>(
    key: Key,
    value: DashboardFilters[Key],
  ) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setPage(1);
    setFilters(DEFAULT_FILTERS);
  }

  function openLeadDetails(lead: Lead) {
    setSelectedLeadId(lead.id);
    setNotesDraft(lead.notes);
  }

  function closeLeadDetails() {
    if (!savingNotes) setSelectedLeadId(null);
  }

  async function handleSaveNotes() {
    if (!selectedLead) return;

    const before = leads;
    const notes = notesDraft.trim();
    setLeads((current) =>
      current.map((lead) =>
        lead.id === selectedLead.id
          ? { ...lead, notes, updatedAt: new Date().toISOString() }
          : lead,
      ),
    );

    if (mode === "demo") {
      setNotice("Modo demonstração: observação salva apenas nesta prévia.");
      setSelectedLeadId(null);
      return;
    }

    setSavingNotes(true);
    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(selectedLead.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao salvar a observação.");
      }
      setNotice("Observação salva.");
      setSelectedLeadId(null);
    } catch (error) {
      setLeads(before);
      setNotice(
        error instanceof Error ? error.message : "Falha ao salvar a observação.",
      );
    } finally {
      setSavingNotes(false);
    }
  }

  function handleExport() {
    if (!filteredLeads.length) {
      setNotice("Não há leads no filtro atual para exportar.");
      return;
    }

    const blob = new Blob([leadsToCsv(filteredLeads)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-global-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      `${filteredLeads.length} ${
        filteredLeads.length === 1 ? "lead exportado" : "leads exportados"
      } com os filtros atuais.`,
    );
  }

  async function handleStatusChange(id: string, status: LeadStatus) {
    const before = leads;
    setLeads((current) =>
      current.map((lead) =>
        lead.id === id
          ? { ...lead, status, updatedAt: new Date().toISOString() }
          : lead,
      ),
    );

    if (mode === "demo") {
      setNotice("Modo demonstração: a mudança é apenas visual.");
      return;
    }

    setUpdatingId(id);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao atualizar o lead.");
      setNotice("Qualificação atualizada.");
    } catch (error) {
      setLeads(before);
      setNotice(error instanceof Error ? error.message : "Falha ao atualizar.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const response = await fetch("/api/rd/sync", { method: "POST" });
      const data = (await response.json()) as {
        imported?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Falha na sincronização.");

      const leadsResponse = await fetch("/api/leads");
      const leadsData = (await leadsResponse.json()) as { leads: Lead[] };
      setLeads(leadsData.leads);
      setNotice(`${data.imported ?? 0} contatos sincronizados com o RD Station.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Falha na sincronização.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
    window.location.assign("/login");
  }

  const topOrigins = originData.slice(0, 5);
  const originTotal = Math.max(filteredLeads.length, 1);
  const ringSegments = topOrigins.reduce(
    (result, item, index) => {
      const nextOffset = result.offset + (item.count / originTotal) * 360;
      return {
        offset: nextOffset,
        parts: [
          ...result.parts,
          `${ORIGIN_COLORS[index]} ${result.offset}deg ${nextOffset}deg`,
        ],
      };
    },
    { offset: 0, parts: [] as string[] },
  ).parts;

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <Logo />
        <div className="topbar-actions">
          <span className={`mode-pill ${mode}`}>
            <span className="mode-dot" />
            {mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}
          </span>
          <button className="icon-button" aria-label="Notificações" type="button">
            <Bell size={18} strokeWidth={1.9} />
          </button>
          <button
            className="user-badge"
            onClick={handleLogout}
            title="Sair do painel"
            type="button"
          >
            <span>GM</span>
            <div>
              <strong>Equipe Global</strong>
              <small>Marketing</small>
            </div>
            {mode === "live" && <LogOut className="logout-icon" size={14} />}
          </button>
        </div>
      </header>

      <aside className="side-rail" aria-label="Navegação principal">
        <button className="rail-button active" aria-label="Dashboard" type="button">
          <LayoutDashboard size={19} />
        </button>
        <button
          className="rail-button"
          aria-label="Ir para os leads"
          onClick={() =>
            document.getElementById("leads-table")?.scrollIntoView({
              behavior: "smooth",
            })
          }
          type="button"
        >
          <Users size={19} />
        </button>
        <button
          className="rail-button"
          aria-label="Abrir filtros"
          onClick={() => setFiltersOpen(true)}
          type="button"
        >
          <SlidersHorizontal size={19} />
        </button>
        <div className="rail-spacer" />
        <div className="rail-avatar" aria-label="Equipe Global">
          GM
        </div>
      </aside>

      <main className="dashboard-main">
        <section className="hero-row">
          <div>
            <p className="eyebrow">VISÃO COMERCIAL</p>
            <h1>Painel de leads</h1>
            <p className="hero-subtitle">
              Acompanhe entradas, origens e avanço das oportunidades em um só
              lugar.
            </p>
          </div>
          <div className="hero-actions">
            <button
              className="mobile-filter-button"
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
            >
              <Filter size={17} />
              Filtros
            </button>
            <button
              className="export-button"
              disabled={!filteredLeads.length}
              onClick={handleExport}
              type="button"
            >
              <FileDown size={17} />
              Exportar
            </button>
            <button
              className="sync-button"
              disabled={syncing}
              onClick={handleSync}
              type="button"
            >
              <RefreshCw className={syncing ? "animate-spin" : ""} size={17} />
              {syncing ? "Sincronizando..." : "Sincronizar RD"}
            </button>
          </div>
        </section>

        {mode === "demo" && (
          <section className="setup-note" aria-label="Status da integração">
            <div className="setup-note-icon">
              <ArrowDownToLine size={19} />
            </div>
            <div>
              <strong>Prévia pronta para conexão</strong>
              <p>
                Esta tela usa dados fictícios. Banco, OAuth e webhook do RD
                Station já estão preparados para receber as credenciais.
              </p>
            </div>
            <span>{rdConfigured ? "RD configurado" : "Aguardando credenciais"}</span>
          </section>
        )}

        <section
          className={`filter-panel ${filtersOpen ? "mobile-open" : ""}`}
          aria-label="Filtros dos leads"
        >
          <div className="filter-search">
            <Search size={17} />
            <input
              aria-label="Buscar por nome, empresa, contato ou origem"
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="Buscar lead, empresa, e-mail ou telefone"
              value={filters.query}
            />
          </div>
          <label className="filter-control">
            <span>Origem</span>
            <select
              onChange={(event) => updateFilter("origin", event.target.value)}
              value={filters.origin}
            >
              <option value="all">Todas as origens</option>
              {origins.map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Qualificação</span>
            <select
              onChange={(event) =>
                updateFilter(
                  "status",
                  event.target.value as DashboardFilters["status"],
                )
              }
              value={filters.status}
            >
              <option value="all">Todos os status</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control date-control">
            <span>De</span>
            <input
              aria-label="Data inicial"
              onChange={(event) => updateFilter("startDate", event.target.value)}
              type="date"
              value={filters.startDate}
            />
          </label>
          <label className="filter-control date-control">
            <span>Até</span>
            <input
              aria-label="Data final"
              onChange={(event) => updateFilter("endDate", event.target.value)}
              type="date"
              value={filters.endDate}
            />
          </label>
          <button
            className="clear-filter"
            onClick={resetFilters}
            type="button"
          >
            Limpar
          </button>
        </section>

        <section className="metrics-grid" aria-label="Indicadores">
          <MetricCard
            color="#2f7df4"
            detail="no período"
            icon={<Users size={20} />}
            title="Total de leads"
            value={metrics.total}
          />
          <MetricCard
            color="#17b6a4"
            detail={`${metrics.qualificationRate}% da base`}
            icon={<UserCheck size={20} />}
            title="Qualificados"
            value={metrics.qualified}
          />
          <MetricCard
            color="#7257d8"
            detail={`${metrics.conversionRate}% conversão`}
            icon={<Check size={20} />}
            title="Fechados"
            value={metrics.closed}
          />
          <MetricCard
            color="#ff9f43"
            detail="aguardando ação"
            icon={<Target size={20} />}
            title="Pendentes"
            value={metrics.pending}
          />
        </section>

        <section className="analytics-grid">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">FLUXO DE ENTRADA</p>
                <h2>Evolução de leads</h2>
              </div>
              <span className="panel-period">
                <CalendarDays size={14} />
                Últimos 11 dias
              </span>
            </div>
            <LeadsChart leads={filteredLeads} />
          </article>

          <article className="panel origin-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">AQUISIÇÃO</p>
                <h2>Origem dos leads</h2>
              </div>
              <BarChart3 size={19} className="text-slate-400" />
            </div>
            {topOrigins.length ? (
              <div className="origin-content">
                <div
                  className="origin-ring"
                  style={{
                    background: `conic-gradient(${ringSegments.join(", ")})`,
                  }}
                  aria-label="Distribuição dos leads por origem"
                >
                  <div>
                    <strong>{filteredLeads.length}</strong>
                    <span>leads</span>
                  </div>
                </div>
                <div className="origin-list">
                  {topOrigins.map((item, index) => (
                    <div className="origin-item" key={item.origin}>
                      <div className="origin-label">
                        <span
                          style={{ backgroundColor: ORIGIN_COLORS[index] }}
                        />
                        <p>{item.origin}</p>
                        <strong>{item.count}</strong>
                      </div>
                      <div className="origin-track">
                        <span
                          style={{
                            backgroundColor: ORIGIN_COLORS[index],
                            width: `${Math.max(
                              8,
                              (item.count / originTotal) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="compact-empty">Nenhuma origem no filtro atual.</div>
            )}
          </article>
        </section>

        <section className="panel leads-panel" id="leads-table">
          <div className="leads-heading">
            <div>
              <p className="panel-kicker">GESTÃO COMERCIAL</p>
              <h2>Leads recentes</h2>
              <p>
                {filteredLeads.length}{" "}
                {filteredLeads.length === 1 ? "contato encontrado" : "contatos encontrados"}
              </p>
            </div>
            <span className="live-indicator">
              <span />
              {mode === "live" ? "Base conectada" : "Prévia"}
            </span>
          </div>

          {paginatedLeads.length ? (
            <>
              <div className="table-scroller">
                <table>
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Empresa</th>
                      <th>Contato</th>
                      <th>Origem</th>
                      <th>Data de entrada</th>
                      <th>Qualificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <div className="lead-identity">
                            <span className="lead-avatar">{initials(lead.name)}</span>
                            <div>
                              <button
                                className="lead-name-button"
                                onClick={() => openLeadDetails(lead)}
                                type="button"
                              >
                                {lead.name}
                              </button>
                              <small>ID {lead.id.slice(0, 8).toUpperCase()}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="company-value">
                            <Building2 size={13} />
                            {lead.company || "Não informada"}
                          </span>
                        </td>
                        <td>
                          <div className="contact-stack">
                            <a href={`mailto:${lead.email}`}>
                              <Mail size={13} />
                              {lead.email}
                            </a>
                            {lead.phone && (
                              <a href={`tel:${lead.phone.replace(/\D/g, "")}`}>
                                <Phone size={13} />
                                {lead.phone}
                              </a>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="origin-badge">{lead.origin}</span>
                        </td>
                        <td>
                          <span className="date-value">{formatDate(lead.enteredAt)}</span>
                        </td>
                        <td>
                          <StatusSelect
                            disabled={updatingId === lead.id}
                            onChange={(status) =>
                              handleStatusChange(lead.id, status)
                            }
                            status={lead.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-lead-list">
                {paginatedLeads.map((lead) => (
                  <article className="mobile-lead-card" key={lead.id}>
                    <div className="mobile-lead-top">
                      <div className="lead-identity">
                        <span className="lead-avatar">{initials(lead.name)}</span>
                        <div>
                          <button
                            className="lead-name-button"
                            onClick={() => openLeadDetails(lead)}
                            type="button"
                          >
                            {lead.name}
                          </button>
                          <small>{lead.company || "Empresa não informada"}</small>
                        </div>
                      </div>
                      <StatusSelect
                        disabled={updatingId === lead.id}
                        onChange={(status) => handleStatusChange(lead.id, status)}
                        status={lead.status}
                      />
                    </div>
                    <div className="mobile-contact-row">
                      <a href={`mailto:${lead.email}`}>
                        <Mail size={14} />
                        {lead.email}
                      </a>
                      <a href={`tel:${lead.phone.replace(/\D/g, "")}`}>
                        <Phone size={14} />
                        {lead.phone}
                      </a>
                    </div>
                    <div className="mobile-card-footer">
                      <span>
                        <CalendarDays size={13} />
                        {formatDate(lead.enteredAt)}
                      </span>
                      <span className="mobile-origin">{lead.origin}</span>
                      <a href={`mailto:${lead.email}`}>
                        Contatar
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>

              <div className="pagination">
                <span>
                  Exibindo {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filteredLeads.length)} de{" "}
                  {filteredLeads.length}
                </span>
                <div>
                  <button
                    aria-label="Página anterior"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                    type="button"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    aria-label="Próxima página"
                    disabled={page === totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    type="button"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div>
                <Search size={22} />
              </div>
              <h3>Nenhum lead encontrado</h3>
              <p>Ajuste a busca ou limpe os filtros para visualizar a base.</p>
              <button onClick={resetFilters} type="button">
                Limpar filtros
              </button>
            </div>
          )}
        </section>

        <footer className="dashboard-footer">
          <p>Global Mídia · Gestão de leads</p>
          <span>Integração preparada para RD Station Marketing</span>
        </footer>
      </main>

      {filtersOpen && (
        <button
          aria-label="Fechar filtros"
          className="filter-overlay"
          onClick={() => setFiltersOpen(false)}
          type="button"
        />
      )}

      {selectedLead && (
        <div
          className="details-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLeadDetails();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="lead-details-title"
            aria-modal="true"
            className="details-modal"
            role="dialog"
          >
            <header className="details-header">
              <div className="details-person">
                <span className="details-avatar">{initials(selectedLead.name)}</span>
                <div>
                  <p>DETALHES DO LEAD</p>
                  <h2 id="lead-details-title">{selectedLead.name}</h2>
                  <span>{selectedLead.company || "Empresa não informada"}</span>
                </div>
              </div>
              <button
                aria-label="Fechar detalhes"
                disabled={savingNotes}
                onClick={closeLeadDetails}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <div className="details-grid">
              <div>
                <span>E-mail</span>
                <a href={`mailto:${selectedLead.email}`}>
                  <Mail size={14} />
                  {selectedLead.email}
                </a>
              </div>
              <div>
                <span>Telefone</span>
                <a href={`tel:${selectedLead.phone.replace(/\D/g, "")}`}>
                  <Phone size={14} />
                  {selectedLead.phone || "Não informado"}
                </a>
              </div>
              <div>
                <span>Origem</span>
                <strong>{selectedLead.origin}</strong>
              </div>
              <div>
                <span>Data de entrada</span>
                <strong>{formatDate(selectedLead.enteredAt)}</strong>
              </div>
              <div className="details-status-row">
                <span>Qualificação</span>
                <strong
                  style={{
                    color: STATUS_COLORS[selectedLead.status],
                    backgroundColor: `${STATUS_COLORS[selectedLead.status]}12`,
                  }}
                >
                  <i
                    style={{ backgroundColor: STATUS_COLORS[selectedLead.status] }}
                  />
                  {STATUS_LABELS[selectedLead.status]}
                </strong>
              </div>
              <div>
                <span>Última atualização</span>
                <strong>{formatDate(selectedLead.updatedAt)}</strong>
              </div>
            </div>

            <label className="notes-field">
              <span>
                <span>
                  <MessageSquareText size={15} />
                  Observações
                </span>
                <small>{notesDraft.length}/280</small>
              </span>
              <textarea
                autoFocus
                maxLength={280}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="Adicione uma observação breve sobre este lead..."
                rows={4}
                value={notesDraft}
              />
            </label>

            <footer className="details-footer">
              <button
                className="details-cancel"
                disabled={savingNotes}
                onClick={closeLeadDetails}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="details-save"
                disabled={savingNotes}
                onClick={handleSaveNotes}
                type="button"
              >
                {savingNotes ? "Salvando..." : "Salvar observação"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          <p>{notice}</p>
          <button
            aria-label="Fechar mensagem"
            onClick={() => setNotice(null)}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <button
        aria-label="Abrir menu"
        className="mobile-menu"
        onClick={() => setFiltersOpen(true)}
        type="button"
      >
        <Menu size={19} />
      </button>
    </div>
  );
}
