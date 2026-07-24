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
  CircleHelp,
  ClipboardCopy,
  FileDown,
  FileSpreadsheet,
  Filter,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Target,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ImportLeadsModal,
  type ImportConfirmation,
} from "@/components/import-leads-modal";
import { ProfilePreferencesModal } from "@/components/profile-preferences-modal";
import { QuickGuideModal } from "@/components/quick-guide-modal";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import { normalizeCompany } from "@/lib/lead-normalization";
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
const PROTOTYPE_USER = {
  name: "Marina Costa",
  email: "marina@globalmidia.digital",
  initials: "MC",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date(value))
    .replace(".", "");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
        className="lead-chart"
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
  const {
    preferences,
    setPreferences,
    resetPreferences,
    resolvedTheme,
  } = useProfilePreferences(PROTOTYPE_USER.email);
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
  const [importOpen, setImportOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"details" | "history">("details");

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
  const selectedCompanyPeers = useMemo(() => {
    if (!selectedLead?.companyGroupId) return [];
    return leads.filter(
      (lead) =>
        lead.companyGroupId === selectedLead.companyGroupId &&
        lead.id !== selectedLead.id,
    );
  }, [leads, selectedLead]);
  const companyGroupSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    leads.forEach((lead) => {
      if (!lead.companyGroupId) return;
      sizes.set(lead.companyGroupId, (sizes.get(lead.companyGroupId) ?? 0) + 1);
    });
    return sizes;
  }, [leads]);
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
    setDetailsTab("details");
  }

  async function copyContact(value: string, label: string) {
    if (!value) {
      setNotice(`${label} não informado.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiado.`);
    } catch {
      const temporaryField = document.createElement("textarea");
      temporaryField.value = value;
      temporaryField.style.position = "fixed";
      temporaryField.style.opacity = "0";
      document.body.appendChild(temporaryField);
      temporaryField.select();
      const copied = document.execCommand("copy");
      temporaryField.remove();
      setNotice(copied ? `${label} copiado.` : `Não foi possível copiar ${label.toLowerCase()}.`);
    }
  }

  function closeLeadDetails() {
    if (!savingNotes) setSelectedLeadId(null);
  }

  async function handleSaveNotes() {
    if (!selectedLead) return;

    const before = leads;
    const notes = notesDraft.trim();
    const occurredAt = new Date().toISOString();
    setLeads((current) =>
      current.map((lead) =>
        lead.id === selectedLead.id
          ? {
              ...lead,
              notes,
              updatedAt: occurredAt,
              history: [
                {
                  id: `notes-${occurredAt}`,
                  title: "Observação atualizada",
                  description: notes
                    ? "O conteúdo das observações foi atualizado."
                    : "As observações do lead foram removidas.",
                  actor: PROTOTYPE_USER.name,
                  actorEmail: PROTOTYPE_USER.email,
                  occurredAt,
                },
                ...(lead.history ?? []),
              ],
            }
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
    const occurredAt = new Date().toISOString();
    setLeads((current) =>
      current.map((lead) =>
        lead.id === id
          ? {
              ...lead,
              status,
              updatedAt: occurredAt,
              history: [
                {
                  id: `status-${occurredAt}`,
                  title: "Qualificação alterada",
                  description: `O lead foi marcado como ${STATUS_LABELS[status].toLocaleLowerCase("pt-BR")}.`,
                  actor: PROTOTYPE_USER.name,
                  actorEmail: PROTOTYPE_USER.email,
                  occurredAt,
                },
                ...(lead.history ?? []),
              ],
            }
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
    if (mode === "demo") {
      setNotice(
        "Modo demonstração: a integração com o RD Station está desativada.",
      );
      return;
    }

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

  function handleUserAction() {
    setPreferencesOpen(true);
  }

  function handleViewLogin() {
    window.location.assign("/login?preview=1");
  }

  async function handleImport(confirmation: ImportConfirmation) {
    if (mode === "live") {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmation),
      });
      const result = (await response.json()) as {
        imported?: number;
        grouped?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Falha ao importar os leads.");
      }

      const leadsResponse = await fetch("/api/leads");
      const leadsData = (await leadsResponse.json()) as {
        leads?: Lead[];
        error?: string;
      };
      if (!leadsResponse.ok || !leadsData.leads) {
        throw new Error(
          leadsData.error ?? "A importação foi salva, mas a lista não atualizou.",
        );
      }

      setLeads(leadsData.leads);
      setPage(1);
      setImportOpen(false);
      setNotice(
        `${result.imported ?? confirmation.records.length} registros importados; ${result.grouped ?? 0} agrupados sem fusão.`,
      );
      return;
    }

    const importedAt = new Date().toISOString();
    const groupedRows = new Set(confirmation.groupedRowNumbers);
    const groupByMatchedLead = new Map<string, string>();
    const groupByCompany = new Map<string, string>();

    confirmation.records.forEach((record) => {
      if (
        record.match?.kind === "company" &&
        record.match.matchedLeadId &&
        groupedRows.has(record.rowNumber)
      ) {
        const normalizedCompany = normalizeCompany(record.company);
        const matchedLead = leads.find(
          (lead) => lead.id === record.match?.matchedLeadId,
        );
        const groupId =
          matchedLead?.companyGroupId ??
          `company:${normalizedCompany || record.match.matchedLeadId}`;
        if (normalizedCompany) groupByCompany.set(normalizedCompany, groupId);
        groupByMatchedLead.set(record.match.matchedLeadId, groupId);
      }
    });

    const importedLeads: Lead[] = confirmation.records.map((record, index) => {
      const groupId = groupByCompany.get(normalizeCompany(record.company));
      const grouped = Boolean(groupId);
      const history = [
        ...(grouped
          ? [
              {
                id: `grouped-${record.rowNumber}-${importedAt}`,
                title: "Empresa agrupada sem fusão",
                description:
                  "A empresa foi confirmada como a mesma de outro registro. Os leads permanecem separados.",
                actor: PROTOTYPE_USER.name,
                actorEmail: PROTOTYPE_USER.email,
                occurredAt: importedAt,
              },
            ]
          : []),
        {
          id: `import-${record.rowNumber}-${importedAt}`,
          title: "Lead importado",
          description: `Linha ${record.rowNumber} do arquivo ${confirmation.fileName}.`,
          actor: PROTOTYPE_USER.name,
          actorEmail: PROTOTYPE_USER.email,
          occurredAt: importedAt,
        },
      ];

      return {
        id: `csv-${Date.now()}-${index}`,
        rdUuid: null,
        name: record.name,
        company: record.company,
        email: record.email,
        phone: record.phone,
        origin: record.origin,
        enteredAt: record.enteredAt,
        status: record.status,
        notes: record.notes,
        updatedAt: importedAt,
        source: {
          type: "csv",
          label: "Importação CSV",
          fileName: confirmation.fileName,
          importedAt,
          importedBy: PROTOTYPE_USER.email,
        },
        companyGroupId: groupId,
        duplicateStatus: record.match
          ? grouped
            ? "confirmed"
            : "potential"
          : undefined,
        additionalData: record.additionalData,
        history,
      };
    });

    setLeads((current) => {
      const updatedCurrent = current.map((lead) => {
        const groupId =
          groupByMatchedLead.get(lead.id) ??
          groupByCompany.get(normalizeCompany(lead.company));
        if (!groupId) return lead;
        return {
          ...lead,
          companyGroupId: groupId,
          duplicateStatus: "confirmed" as const,
          history: [
            {
              id: `grouped-existing-${lead.id}-${importedAt}`,
              title: "Empresa agrupada sem fusão",
              description: `Agrupamento confirmado durante a importação de ${confirmation.fileName}.`,
              actor: PROTOTYPE_USER.name,
              actorEmail: PROTOTYPE_USER.email,
              occurredAt: importedAt,
            },
            ...(lead.history ?? []),
          ],
        };
      });
      return [...importedLeads, ...updatedCurrent];
    });
    setPage(1);
    setImportOpen(false);
    setNotice(
      `${importedLeads.length} registros importados na prévia; ${groupedRows.size} agrupados sem fusão.`,
    );
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
    <div
      className="dashboard-shell"
      data-contrast={preferences.highContrast ? "high" : "standard"}
      data-motion={preferences.reducedMotion ? "reduced" : "full"}
      data-text-size={preferences.textSize}
      data-theme={resolvedTheme}
    >
      <header className="topbar">
        <Logo />
        <div className="topbar-actions">
          <span className={`mode-pill ${mode}`}>
            <span className="mode-dot" />
            {mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}
          </span>
          <button
            aria-label="Abrir preferências do perfil"
            className="mobile-profile-button"
            onClick={() => setPreferencesOpen(true)}
            type="button"
          >
            {PROTOTYPE_USER.initials}
          </button>
          <button className="icon-button" aria-label="Notificações" type="button">
            <Bell size={18} strokeWidth={1.9} />
          </button>
          <button
            className="user-badge"
            onClick={handleUserAction}
            title={
              mode === "demo"
                ? "Abrir preferências de aparência"
                : "Abrir preferências do perfil"
            }
            type="button"
          >
            <span>{PROTOTYPE_USER.initials}</span>
            <div>
              <strong>{PROTOTYPE_USER.name}</strong>
              <small>{PROTOTYPE_USER.email}</small>
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
        <button
          className="rail-button"
          aria-label="Preferências do perfil"
          onClick={() => setPreferencesOpen(true)}
          type="button"
        >
          <Settings2 size={19} />
        </button>
        <button
          className="rail-avatar"
          aria-label="Abrir preferências de Marina Costa"
          onClick={() => setPreferencesOpen(true)}
          type="button"
        >
          {PROTOTYPE_USER.initials}
        </button>
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
              className="tutorial-button"
              onClick={() => setGuideOpen(true)}
              type="button"
            >
              <CircleHelp size={17} />
              Como usar
            </button>
            <button
              className="mobile-filter-button"
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
            >
              <Filter size={17} />
              Filtros
            </button>
            <button
              className="import-button"
              onClick={() => setImportOpen(true)}
              type="button"
            >
              <Upload size={17} />
              Importar CSV
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
              <strong>Protótipo da versão final</strong>
              <p>
                Teste a importação CSV, os agrupamentos, a procedência e o
                histórico. Nenhuma alteração desta prévia é permanente.
              </p>
            </div>
            <span>
              {rdConfigured ? "RD configurado" : "Ambiente demonstrativo"}
            </span>
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
                          <div className="company-stack">
                            <span className="company-value">
                              <Building2 size={13} />
                              {lead.company || "Não informada"}
                            </span>
                            {lead.companyGroupId &&
                              (companyGroupSizes.get(lead.companyGroupId) ?? 0) >
                                1 && (
                                <button
                                  className="company-group-badge"
                                  onClick={() => openLeadDetails(lead)}
                                  type="button"
                                >
                                  <Users size={11} />
                                  {companyGroupSizes.get(lead.companyGroupId)}{" "}
                                  registros agrupados
                                </button>
                              )}
                            {lead.source?.fileName && (
                              <small className="source-file">
                                <FileSpreadsheet size={10} />
                                {lead.source.fileName}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="contact-stack">
                            <button
                              aria-label={`Copiar e-mail de ${lead.name}`}
                              onClick={() => copyContact(lead.email, "E-mail")}
                              title="Copiar e-mail"
                              type="button"
                            >
                              <Mail size={13} />
                              {lead.email}
                              <ClipboardCopy className="copy-hint" size={12} />
                            </button>
                            {lead.phone && (
                              <button
                                aria-label={`Copiar telefone de ${lead.name}`}
                                onClick={() => copyContact(lead.phone, "Telefone")}
                                title="Copiar telefone"
                                type="button"
                              >
                                <Phone size={13} />
                                {lead.phone}
                                <ClipboardCopy className="copy-hint" size={12} />
                              </button>
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
                          {lead.companyGroupId &&
                            (companyGroupSizes.get(lead.companyGroupId) ?? 0) >
                              1 && (
                              <span className="mobile-group-note">
                                <Users size={11} />
                                {companyGroupSizes.get(lead.companyGroupId)}{" "}
                                registros agrupados
                              </span>
                            )}
                        </div>
                      </div>
                      <StatusSelect
                        disabled={updatingId === lead.id}
                        onChange={(status) => handleStatusChange(lead.id, status)}
                        status={lead.status}
                      />
                    </div>
                    <div className="mobile-contact-row">
                      <button
                        onClick={() => copyContact(lead.email, "E-mail")}
                        type="button"
                      >
                        <Mail size={14} />
                        {lead.email}
                        <ClipboardCopy className="copy-hint" size={12} />
                      </button>
                      <button
                        onClick={() => copyContact(lead.phone, "Telefone")}
                        type="button"
                      >
                        <Phone size={14} />
                        {lead.phone}
                        <ClipboardCopy className="copy-hint" size={12} />
                      </button>
                    </div>
                    <div className="mobile-card-footer">
                      <span>
                        <CalendarDays size={13} />
                        {formatDate(lead.enteredAt)}
                      </span>
                      <span className="mobile-origin">
                        {lead.source?.fileName ?? lead.origin}
                      </span>
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

            <nav aria-label="Seções do lead" className="details-tabs">
              <button
                className={detailsTab === "details" ? "active" : ""}
                onClick={() => setDetailsTab("details")}
                type="button"
              >
                <Building2 size={14} />
                Detalhes
              </button>
              <button
                className={detailsTab === "history" ? "active" : ""}
                onClick={() => setDetailsTab("history")}
                type="button"
              >
                <History size={14} />
                Histórico
                <span>{Math.max(selectedLead.history?.length ?? 0, 1)}</span>
              </button>
            </nav>

            {detailsTab === "details" ? (
              <>
                <div className="details-grid">
                  <div>
                    <span>E-mail</span>
                    <button
                      onClick={() => copyContact(selectedLead.email, "E-mail")}
                      title="Copiar e-mail"
                      type="button"
                    >
                      <Mail size={14} />
                      {selectedLead.email || "Não informado"}
                      <ClipboardCopy className="copy-hint" size={12} />
                    </button>
                  </div>
                  <div>
                    <span>Telefone</span>
                    <button
                      onClick={() => copyContact(selectedLead.phone, "Telefone")}
                      title="Copiar telefone"
                      type="button"
                    >
                      <Phone size={14} />
                      {selectedLead.phone || "Não informado"}
                      <ClipboardCopy className="copy-hint" size={12} />
                    </button>
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
                        style={{
                          backgroundColor: STATUS_COLORS[selectedLead.status],
                        }}
                      />
                      {STATUS_LABELS[selectedLead.status]}
                    </strong>
                  </div>
                  <div>
                    <span>Última atualização</span>
                    <strong>{formatDate(selectedLead.updatedAt)}</strong>
                  </div>
                </div>

                <section className="source-card">
                  <span>
                    <FileSpreadsheet size={16} />
                  </span>
                  <div>
                    <small>PROCEDÊNCIA DO REGISTRO</small>
                    <strong>
                      {selectedLead.source?.fileName ??
                        selectedLead.source?.label ??
                        (selectedLead.rdUuid ? "RD Station" : "Cadastro manual")}
                    </strong>
                    <p>
                      {selectedLead.source?.importedBy
                        ? `Importado por ${selectedLead.source.importedBy}`
                        : "Origem registrada automaticamente"}
                    </p>
                  </div>
                  <em>{selectedLead.source?.type?.toUpperCase() ?? "RD"}</em>
                </section>

                {selectedCompanyPeers.length > 0 && (
                  <section className="company-group-card">
                    <header>
                      <div>
                        <Users size={16} />
                        <span>
                          <strong>Mesma empresa</strong>
                          <small>
                            {selectedCompanyPeers.length + 1} registros mantidos
                            separadamente
                          </small>
                        </span>
                      </div>
                      <em>Sem fusão</em>
                    </header>
                    <div>
                      {[selectedLead, ...selectedCompanyPeers].map((lead) => (
                        <button
                          className={lead.id === selectedLead.id ? "active" : ""}
                          key={lead.id}
                          onClick={() => openLeadDetails(lead)}
                          type="button"
                        >
                          <span>{initials(lead.name)}</span>
                          <div>
                            <strong>{lead.name}</strong>
                            <small>
                              {lead.source?.fileName ??
                                lead.source?.label ??
                                "RD Station"}
                            </small>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {selectedLead.additionalData &&
                  Object.keys(selectedLead.additionalData).length > 0 && (
                    <section className="additional-data-card">
                      <header>
                        <div>
                          <FileSpreadsheet size={15} />
                          <span>
                            <strong>Dados adicionais da importação</strong>
                            <small>
                              Colunas preservadas sem alterar os campos principais
                            </small>
                          </span>
                        </div>
                      </header>
                      <dl>
                        {Object.entries(selectedLead.additionalData).map(
                          ([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ),
                        )}
                      </dl>
                    </section>
                  )}

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
              </>
            ) : (
              <section className="history-panel">
                <div className="history-intro">
                  <span>
                    <History size={16} />
                  </span>
                  <div>
                    <strong>Rastreamento de alterações</strong>
                    <p>Quem alterou, o que mudou e quando aconteceu.</p>
                  </div>
                </div>
                <ol>
                  {(selectedLead.history?.length
                    ? selectedLead.history
                    : [
                        {
                          id: `created-${selectedLead.id}`,
                          title: "Lead adicionado à base",
                          description:
                            "Registro criado durante a sincronização inicial.",
                          actor: "Integração RD Station",
                          occurredAt: selectedLead.enteredAt,
                        },
                      ]
                  ).map((event) => (
                    <li key={event.id}>
                      <span />
                      <div>
                        <header>
                          <strong>{event.title}</strong>
                          <time dateTime={event.occurredAt}>
                            {formatDateTime(event.occurredAt)}
                          </time>
                        </header>
                        <p>{event.description}</p>
                        <small>
                          {event.actor}
                          {event.actorEmail && ` · ${event.actorEmail}`}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <footer className="details-footer">
              <button
                className="details-cancel"
                disabled={savingNotes}
                onClick={closeLeadDetails}
                type="button"
              >
                {detailsTab === "details" ? "Cancelar" : "Fechar"}
              </button>
              {detailsTab === "details" && (
                <button
                  className="details-save"
                  disabled={savingNotes}
                  onClick={handleSaveNotes}
                  type="button"
                >
                  {savingNotes ? "Salvando..." : "Salvar observação"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {importOpen && (
        <ImportLeadsModal
          existingLeads={leads}
          onClose={() => setImportOpen(false)}
          onConfirm={handleImport}
        />
      )}

      {guideOpen && (
        <QuickGuideModal
          onClose={() => setGuideOpen(false)}
          onOpenImport={() => {
            setGuideOpen(false);
            setImportOpen(true);
          }}
        />
      )}

      {preferencesOpen && (
        <ProfilePreferencesModal
          email={PROTOTYPE_USER.email}
          onChange={setPreferences}
          onClose={() => setPreferencesOpen(false)}
          onLogout={mode === "live" ? () => void handleLogout() : undefined}
          onReset={resetPreferences}
          onViewLogin={handleViewLogin}
          preferences={preferences}
        />
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
