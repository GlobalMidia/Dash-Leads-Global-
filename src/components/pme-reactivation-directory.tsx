"use client";

import {
  Building2,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  LoaderCircle,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useProfilePreferences } from "@/components/use-profile-preferences";
import { parsePmeWorkbook, type PmeWorkbookPreview } from "@/lib/pme-workbook";
import type { PmeCompany, PmeCompanyDetails, PmeDirectoryData } from "@/types/pme";

type PmeReactivationDirectoryProps = {
  mode: "demo" | "live";
  user: { name: string; email: string; initials: string };
  initialDirectory: PmeDirectoryData;
};

function formatDate(value: string | null) {
  if (!value) return "Sem data registrada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value))
    .replace(".", "");
}

function formatCurrency(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(value);
}

async function hashFile(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function PmeReactivationDirectory({ mode, user, initialDirectory }: PmeReactivationDirectoryProps) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);
  const inputRef = useRef<HTMLInputElement>(null);
  const [directory] = useState(initialDirectory);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<PmeWorkbookPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<PmeCompanyDetails | null>(null);
  const [loadingCompany, setLoadingCompany] = useState<string | null>(null);
  const go = (path: string) => window.location.assign(path);

  const categories = useMemo(
    () => [...new Set(directory.companies.flatMap((company) => company.categories))].sort(),
    [directory.companies],
  );
  const visibleCompanies = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return directory.companies.filter((company) => {
      const searchable = [company.companyName, company.contacts, company.phones, company.latestStatus, company.notes].join(" ").toLocaleLowerCase("pt-BR");
      return (!term || searchable.includes(term)) && (category === "all" || company.categories.includes(category));
    });
  }, [directory.companies, query, category]);

  async function chooseFile(file?: File) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
      setNotice("Selecione uma planilha no formato XLSX.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice("A planilha deve ter no máximo 5 MB.");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parsePmeWorkbook(buffer);
      if (!parsed.records.length) throw new Error("Nenhuma empresa reconhecível foi encontrada na planilha.");
      setPreview(parsed);
      setFileName(file.name);
      setFileHash(await hashFile(buffer));
      setNotice("");
    } catch (error) {
      setPreview(null);
      setNotice(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    }
  }

  async function importPreview() {
    if (!preview || !fileName || !fileHash) return;
    if (mode !== "live") { setNotice("A área demonstrativa não grava a base PME."); return; }
    setImporting(true);
    try {
      const response = await fetch("/api/pme/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, fileHash, ...preview }),
      });
      const result = await response.json() as { imported?: number; alreadyImported?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível importar a base PME.");
      setPreview(null);
      setNotice(result.alreadyImported ? "Esta mesma planilha já está no diretório PME." : `${result.imported ?? 0} registros foram importados. Atualizando o diretório...`);
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível importar a base PME.");
    } finally {
      setImporting(false);
    }
  }

  async function openCompanyDetails(company: PmeCompany) {
    if (mode !== "live") {
      setNotice("O histórico PME completo fica disponível após a importação na base ao vivo.");
      return;
    }
    setLoadingCompany(company.normalizedCompany);
    try {
      const response = await fetch(`/api/pme/companies/${encodeURIComponent(company.normalizedCompany)}`);
      const result = (await response.json()) as { company?: PmeCompanyDetails; error?: string };
      if (!response.ok || !result.company) {
        throw new Error(result.error ?? "Não foi possível abrir os registros da empresa.");
      }
      setSelectedCompany(result.company);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível abrir os registros da empresa.");
    } finally {
      setLoadingCompany(null);
    }
  }

  return (
    <div className="dashboard-shell pme-shell" data-contrast={preferences.highContrast ? "high" : "standard"} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-text-size={preferences.textSize} data-theme={resolvedTheme}>
      <header className="topbar">
        <button className="brand-lockup" aria-label="Voltar ao painel de leads" onClick={() => go("/")} type="button"><span className="brand-mark">G</span><span className="brand-copy"><strong>Global Mídia</strong><small>LEADS</small></span></button>
        <div className="topbar-actions"><span className={`mode-pill ${mode}`}><span className="mode-dot" />{mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}</span><div className="user-badge"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></div>
      </header>
      <aside className="side-rail" aria-label="Navegação principal">
        <button aria-label="Voltar ao dashboard" className="rail-button" onClick={() => go("/")} title="Painel de leads" type="button"><LayoutDashboard size={19} /></button>
        <button aria-label="PME e reativação" className="rail-button active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="PME e reativação" type="button"><Building2 size={19} /></button>
        <button aria-label="Saúde das contas" className="rail-button" onClick={() => go("/health")} title="Saúde das contas" type="button"><HeartPulse size={19} /></button>
      </aside>

      <main className="dashboard-main pme-directory">
        <section className="pme-hero">
          <div><p className="eyebrow">BASE COMERCIAL SEPARADA</p><h1>PME / Reativação</h1><p className="hero-subtitle">Empresas que já participaram do PME e podem ser trabalhadas novamente pela agência.</p></div>
          <button className="sync-button" onClick={() => inputRef.current?.click()} type="button"><Upload size={17} />Importar planilha</button>
          <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0])} ref={inputRef} type="file" />
        </section>

        <section className="pme-summary" aria-label="Resumo da base PME">
          <article><Building2 size={20}/><div><small>EMPRESAS ÚNICAS</small><strong>{directory.companies.length}</strong></div></article>
          <article><FileSpreadsheet size={20}/><div><small>REGISTROS PRESERVADOS</small><strong>{directory.importedRecords}</strong></div></article>
          <article><Users size={20}/><div><small>ÚLTIMA IMPORTAÇÃO</small><strong>{directory.latestImportAt ? formatDate(directory.latestImportAt) : "—"}</strong></div></article>
        </section>

        {directory.companies.length > 0 ? <>
          <section className="pme-filters">
            <label><Search size={16}/><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa, contato, telefone ou situação" value={query}/></label>
            <select aria-label="Filtrar por categoria" onChange={(event) => setCategory(event.target.value)} value={category}><option value="all">Todas as categorias</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <span>{visibleCompanies.length} empresa{visibleCompanies.length === 1 ? "" : "s"}</span>
          </section>
          <section className="pme-company-list" aria-label="Empresas PME">
            {visibleCompanies.map((company) => <article key={company.normalizedCompany}>
              <header><div><span><Building2 size={17}/></span><div><h2>{company.companyName}</h2><p>{company.contacts || "Contato não informado"}{company.phones ? ` · ${company.phones}` : ""}</p></div></div><div className="pme-company-actions"><b>{company.recordCount} registro{company.recordCount === 1 ? "" : "s"}</b><button aria-label={`Abrir registros de ${company.companyName}`} onClick={() => void openCompanyDetails(company)} type="button">{loadingCompany === company.normalizedCompany ? <LoaderCircle className="animate-spin" size={15}/> : <><span>Ver registros</span><ChevronRight size={15}/></>}</button></div></header>
              <dl><div><dt>Situação mais recente</dt><dd>{company.latestStatus || "Sem situação registrada"}</dd></div><div><dt>Última atividade</dt><dd>{formatDate(company.latestActivityAt)}</dd></div><div><dt>Valor histórico</dt><dd>{formatCurrency(company.historicValue)}</dd></div><div><dt>Origem</dt><dd>{company.categories.join(" · ")}</dd></div></dl>
              {(company.notes || company.website) && <footer>{company.notes && <p>{company.notes}</p>}{company.website && <a href={company.website} rel="noreferrer" target="_blank">Abrir perfil da empresa</a>}</footer>}
            </article>)}
          </section>
        </> : <section className="pme-empty-card" aria-labelledby="pme-ready-title"><div className="pme-empty-icon"><FileSpreadsheet size={30} /></div><div><h2 id="pme-ready-title">Importe a base de reativação</h2><p>Selecione a planilha XLSX recebida. O diretório lê as abas, preserva o histórico e mantém PME separado dos leads do RD Station.</p></div><button className="sync-button" onClick={() => inputRef.current?.click()} type="button"><Upload size={16}/>Selecionar planilha</button></section>}

        {preview && <div className="pme-import-backdrop" role="presentation"><section aria-modal="true" className="pme-import-modal" role="dialog"><header><div><p className="eyebrow">PRÉVIA DA IMPORTAÇÃO</p><h2>{fileName}</h2></div><button aria-label="Fechar prévia" onClick={() => setPreview(null)} type="button"><X size={18}/></button></header><div className="pme-import-stats"><span><strong>{preview.records.length}</strong> registros preservados</span><span><strong>{preview.sourceSheets.length}</strong> abas lidas</span><span><strong>100%</strong> linhas com conteúdo</span></div><p>Linhas vazias usadas somente pela formatação da planilha não entram na contagem. Todo registro com conteúdo fica preservado com a aba e a linha de origem; empresas repetidas serão agrupadas apenas na visualização.</p><footer><button className="tutorial-button" onClick={() => setPreview(null)} type="button">Cancelar</button><button className="sync-button" disabled={importing} onClick={() => void importPreview()} type="button">{importing ? "Importando..." : "Confirmar importação"}</button></footer></section></div>}
        {selectedCompany && <div className="pme-import-backdrop" role="presentation"><section aria-modal="true" className="pme-records-modal" role="dialog"><header><div><p className="eyebrow">HISTÓRICO PME</p><h2>{selectedCompany.companyName}</h2><p>{selectedCompany.contacts || "Contato não informado"}{selectedCompany.phones ? ` · ${selectedCompany.phones}` : ""}</p></div><button aria-label="Fechar histórico" onClick={() => setSelectedCompany(null)} type="button"><X size={18}/></button></header><div className="pme-records-body">{selectedCompany.website && <a className="pme-profile-link" href={selectedCompany.website} rel="noreferrer" target="_blank"><ExternalLink size={15}/>Abrir perfil da empresa</a>}<p className="pme-records-intro">Cada item abaixo é uma linha original da planilha, mantida com a aba e a posição de onde veio.</p>{selectedCompany.records.map((record) => <article key={record.id} className="pme-source-record"><header><div><strong>{record.sourceSheet}</strong><span>Linha {record.sourceRow} · {record.category}</span></div><span>{formatDate(record.contactAt ?? record.displayedAt ?? record.recordedAt)}</span></header><dl><div><dt>Contato</dt><dd>{record.contactName || "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{record.phone || "Não informado"}</dd></div><div><dt>Situação</dt><dd>{record.historicStatus || "Sem situação registrada"}</dd></div><div><dt>Valor</dt><dd>{formatCurrency(record.historicValue)}</dd></div></dl>{record.notes && <p className="pme-source-notes">{record.notes}</p>}</article>)}</div><footer><button className="tutorial-button" onClick={() => setSelectedCompany(null)} type="button">Fechar</button></footer></section></div>}
        {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button"><X size={15}/></button></div>}
      </main>
    </div>
  );
}
