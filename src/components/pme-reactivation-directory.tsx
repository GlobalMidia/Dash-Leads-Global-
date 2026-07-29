"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
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
import type {
  PmeCompany,
  PmeCompanyDetails,
  PmeDirectoryData,
  PmeImportBatch,
  PmeImportBatchDetails,
  PmeImportBatchRecord,
} from "@/types/pme";

type PmeReactivationDirectoryProps = {
  mode: "demo" | "live";
  user: { name: string; email: string; initials: string };
  initialDirectory: PmeDirectoryData;
};

const IMPORT_BATCH_PAGE_SIZE = 50;

type PmeBatchCompanyGroup = {
  normalizedCompany: string;
  companyName: string;
  contacts: string[];
  phones: string[];
  latestStatus: string;
  latestActivityAt: string | null;
  categories: string[];
  records: PmeImportBatchRecord[];
};

function groupBatchCompanies(records: PmeImportBatchRecord[]) {
  const groups = new Map<string, PmeBatchCompanyGroup>();

  for (const record of records) {
    const key = record.normalizedCompany || record.companyName.toLocaleLowerCase("pt-BR");
    const current = groups.get(key) ?? {
      normalizedCompany: key,
      companyName: record.companyName,
      contacts: [],
      phones: [],
      latestStatus: "",
      latestActivityAt: null,
      categories: [],
      records: [],
    };
    const activityAt = record.contactAt ?? record.displayedAt ?? record.recordedAt;

    if (record.companyName.length > current.companyName.length) current.companyName = record.companyName;
    if (record.contactName && !current.contacts.includes(record.contactName)) current.contacts.push(record.contactName);
    if (record.phone && !current.phones.includes(record.phone)) current.phones.push(record.phone);
    if (record.category && !current.categories.includes(record.category)) current.categories.push(record.category);
    if (
      activityAt &&
      (!current.latestActivityAt || new Date(activityAt).getTime() > new Date(current.latestActivityAt).getTime())
    ) {
      current.latestActivityAt = activityAt;
      if (record.historicStatus) current.latestStatus = record.historicStatus;
    } else if (!current.latestStatus && record.historicStatus) {
      current.latestStatus = record.historicStatus;
    }
    current.records.push(record);
    groups.set(key, current);
  }

  return [...groups.values()];
}

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
  const [orderedBatches, setOrderedBatches] = useState(initialDirectory.importBatches);
  const [query, setQuery] = useState("");
  const [batchQuery, setBatchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<PmeWorkbookPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<PmeCompanyDetails | null>(null);
  const [loadingCompany, setLoadingCompany] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<PmeImportBatchDetails | null>(null);
  const [selectedBatchCompany, setSelectedBatchCompany] = useState<PmeBatchCompanyGroup | null>(null);
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);
  const [reorderingBatch, setReorderingBatch] = useState<string | null>(null);
  const [batchRecordQuery, setBatchRecordQuery] = useState("");
  const [batchRecordPage, setBatchRecordPage] = useState(1);
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
  const visibleBatches = useMemo(() => {
    const term = batchQuery.trim().toLocaleLowerCase("pt-BR");
    return orderedBatches.filter((batch) => [batch.fileName, batch.importedByName, batch.importedByEmail]
      .join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [batchQuery, orderedBatches]);
  const batchCompanies = useMemo(
    () => groupBatchCompanies(selectedBatch?.records ?? []),
    [selectedBatch],
  );
  const filteredBatchCompanies = useMemo(() => {
    if (!selectedBatch) return [];
    const term = batchRecordQuery.trim().toLocaleLowerCase("pt-BR");
    if (!term) return batchCompanies;
    return batchCompanies.filter((company) => [
      company.companyName,
      company.contacts.join(" "),
      company.phones.join(" "),
      company.records.map((record) => record.sourceSheet).join(" "),
      company.categories.join(" "),
      company.latestStatus,
    ].join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [batchCompanies, batchRecordQuery, selectedBatch]);
  const batchRecordPageCount = Math.max(1, Math.ceil(filteredBatchCompanies.length / IMPORT_BATCH_PAGE_SIZE));
  const currentBatchRecordPage = Math.min(batchRecordPage, batchRecordPageCount);
  const batchRecordStart = (currentBatchRecordPage - 1) * IMPORT_BATCH_PAGE_SIZE;
  const visibleBatchCompanies = filteredBatchCompanies.slice(
    batchRecordStart,
    batchRecordStart + IMPORT_BATCH_PAGE_SIZE,
  );

  async function moveImportBatch(batchId: string, direction: -1 | 1) {
    if (reorderingBatch) return;
    const currentIndex = orderedBatches.findIndex((batch) => batch.id === batchId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedBatches.length) return;

    const previousOrder = orderedBatches;
    const nextOrder = [...orderedBatches];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    setOrderedBatches(nextOrder);
    setReorderingBatch(batchId);

    try {
      const response = await fetch("/api/pme/imports/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIds: nextOrder.map((batch) => batch.id) }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a ordem das planilhas.");
    } catch (error) {
      setOrderedBatches(previousOrder);
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar a ordem das planilhas.");
    } finally {
      setReorderingBatch(null);
    }
  }

  function closeImportBatch() {
    setSelectedBatch(null);
    setSelectedBatchCompany(null);
  }

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

  async function openImportBatch(batch: PmeImportBatch) {
    if (mode !== "live") {
      setNotice("Os detalhes das planilhas ficam disponíveis após a importação na base ao vivo.");
      return;
    }
    setLoadingBatch(batch.id);
    try {
      const response = await fetch(`/api/pme/imports/${encodeURIComponent(batch.id)}`);
      const result = (await response.json()) as { batch?: PmeImportBatchDetails; error?: string };
      if (!response.ok || !result.batch) throw new Error(result.error ?? "Não foi possível abrir a planilha.");
      setBatchRecordQuery("");
      setBatchRecordPage(1);
      setSelectedBatchCompany(null);
      setSelectedBatch(result.batch);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível abrir a planilha.");
    } finally {
      setLoadingBatch(null);
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

        <section className="pme-import-batches" aria-labelledby="pme-imported-files">
          <header>
            <div><p className="eyebrow">ORIGEM DOS DADOS</p><h2 id="pme-imported-files">Planilhas importadas</h2><p>Cada arquivo permanece separado. Use as setas para personalizar a ordem na sua conta.</p></div>
            <label><Search size={16}/><input onChange={(event) => setBatchQuery(event.target.value)} placeholder="Pesquisar nome ou responsável" value={batchQuery}/></label>
          </header>
          {orderedBatches.length ? <div className="pme-batch-list">{visibleBatches.length ? visibleBatches.map((batch) => {
            const batchIndex = orderedBatches.findIndex((item) => item.id === batch.id);
            return <article key={batch.id}>
              <div className="pme-batch-icon"><FileSpreadsheet size={18}/></div>
              <div className="pme-batch-copy"><h3>{batch.fileName}</h3><p>Importada em {formatDate(batch.createdAt)} por {batch.importedByName || batch.importedByEmail || "Usuário não identificado"}</p><span>{batch.sourceSheets.length} aba{batch.sourceSheets.length === 1 ? "" : "s"}: {batch.sourceSheets.join(" · ") || "Sem aba identificada"}</span></div>
              <div className="pme-batch-metrics"><strong>{batch.importedRows}</strong><small>registros</small></div>
              <div className="pme-batch-order" aria-label={`Ordenar ${batch.fileName}`}>
                <button
                  aria-label={`Mover ${batch.fileName} para cima`}
                  disabled={batchIndex === 0 || Boolean(reorderingBatch)}
                  onClick={() => void moveImportBatch(batch.id, -1)}
                  title="Mover para cima"
                  type="button"
                >
                  <ArrowUp size={14}/>
                </button>
                <button
                  aria-label={`Mover ${batch.fileName} para baixo`}
                  disabled={batchIndex === orderedBatches.length - 1 || Boolean(reorderingBatch)}
                  onClick={() => void moveImportBatch(batch.id, 1)}
                  title="Mover para baixo"
                  type="button"
                >
                  <ArrowDown size={14}/>
                </button>
              </div>
              <button className="pme-batch-open" onClick={() => void openImportBatch(batch)} type="button">{loadingBatch === batch.id ? <LoaderCircle className="animate-spin" size={15}/> : <>Abrir<ChevronRight size={15}/></>}</button>
            </article>;
          }) : <p className="pme-batch-empty">Nenhuma planilha corresponde à pesquisa.</p>}</div> : <p className="pme-batch-empty">Quando uma planilha for confirmada, ela aparecerá aqui como uma origem separada.</p>}
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
        {selectedBatch && <div className="pme-import-backdrop" role="presentation">
          <section aria-modal="true" className="pme-records-modal" role="dialog">
            <header>
              <div>
                <p className="eyebrow">PLANILHA IMPORTADA</p>
                <h2>{selectedBatch.fileName}</h2>
                <p>Importada em {formatDate(selectedBatch.createdAt)} por {selectedBatch.importedByName || selectedBatch.importedByEmail || "Usuário não identificado"}</p>
              </div>
              <button aria-label="Fechar planilha" onClick={closeImportBatch} type="button"><X size={18}/></button>
            </header>
            <div className="pme-records-body">
              {selectedBatchCompany ? <>
                <button className="pme-records-back" onClick={() => setSelectedBatchCompany(null)} type="button">
                  <ArrowLeft size={15}/>Voltar para as empresas
                </button>
                <div className="pme-batch-company-heading">
                  <div>
                    <span><Building2 size={17}/></span>
                    <div>
                      <p className="eyebrow">REGISTROS NA PLANILHA</p>
                      <h3>{selectedBatchCompany.companyName}</h3>
                    </div>
                  </div>
                  <b>{selectedBatchCompany.records.length} registro{selectedBatchCompany.records.length === 1 ? "" : "s"}</b>
                </div>
                {selectedBatchCompany.records.map((record) => <article key={record.id} className="pme-source-record">
                  <header>
                    <div>
                      <strong>{record.sourceSheet}</strong>
                      <span>Linha {record.sourceRow} · {record.category}</span>
                    </div>
                    <span>{formatDate(record.contactAt ?? record.displayedAt ?? record.recordedAt)}</span>
                  </header>
                  <dl>
                    <div><dt>Contato</dt><dd>{record.contactName || "Não informado"}</dd></div>
                    <div><dt>Telefone</dt><dd>{record.phone || "Não informado"}</dd></div>
                    <div><dt>Situação</dt><dd>{record.historicStatus || "Sem situação registrada"}</dd></div>
                    <div><dt>Valor</dt><dd>{formatCurrency(record.historicValue)}</dd></div>
                  </dl>
                  {record.website && <a className="pme-source-profile" href={record.website} rel="noreferrer" target="_blank"><ExternalLink size={13}/>Abrir perfil da empresa</a>}
                  {record.notes && <p className="pme-source-notes">{record.notes}</p>}
                </article>)}
              </> : <>
                <p className="pme-records-intro">{selectedBatch.importedRows} registros preservados nas abas: {selectedBatch.sourceSheets.join(" · ") || "não identificadas"}. Empresas repetidas aparecem agrupadas abaixo.</p>
                <div className="pme-records-toolbar">
                  <label>
                    <Search size={15}/>
                    <input
                      aria-label="Pesquisar empresas da planilha"
                      onChange={(event) => {
                        setBatchRecordQuery(event.target.value);
                        setBatchRecordPage(1);
                      }}
                      placeholder="Pesquisar empresa, contato, telefone ou aba"
                      value={batchRecordQuery}
                    />
                  </label>
                  <span>{filteredBatchCompanies.length} empresa{filteredBatchCompanies.length === 1 ? "" : "s"}</span>
                </div>
                <div className="pme-batch-company-list">
                  {visibleBatchCompanies.length ? visibleBatchCompanies.map((company) => <article key={company.normalizedCompany}>
                    <header>
                      <div>
                        <span><Building2 size={16}/></span>
                        <div>
                          <h3>{company.companyName}</h3>
                          <p>{company.contacts.join(" · ") || "Contato não informado"}{company.phones.length ? ` · ${company.phones.join(" · ")}` : ""}</p>
                        </div>
                      </div>
                      <div className="pme-batch-company-actions">
                        <b>{company.records.length} registro{company.records.length === 1 ? "" : "s"}</b>
                        <button onClick={() => setSelectedBatchCompany(company)} type="button">
                          Ver registros<ChevronRight size={14}/>
                        </button>
                      </div>
                    </header>
                    <dl>
                      <div><dt>Situação mais recente</dt><dd>{company.latestStatus || "Sem situação registrada"}</dd></div>
                      <div><dt>Última atividade</dt><dd>{formatDate(company.latestActivityAt)}</dd></div>
                      <div><dt>Abas</dt><dd>{[...new Set(company.records.map((record) => record.sourceSheet))].join(" · ")}</dd></div>
                      <div><dt>Origem</dt><dd>{company.categories.join(" · ")}</dd></div>
                    </dl>
                  </article>) : <p className="pme-records-empty">Nenhuma empresa corresponde à pesquisa.</p>}
                </div>
              </>}
            </div>
            <footer className="pme-records-footer">
              <span>
                {selectedBatchCompany
                  ? `${selectedBatchCompany.records.length} registro${selectedBatchCompany.records.length === 1 ? "" : "s"} desta empresa`
                  : filteredBatchCompanies.length
                    ? `Exibindo ${batchRecordStart + 1}–${Math.min(batchRecordStart + IMPORT_BATCH_PAGE_SIZE, filteredBatchCompanies.length)} de ${filteredBatchCompanies.length} empresas`
                    : "Nenhuma empresa"}
              </span>
              {!selectedBatchCompany && <div className="pme-records-pagination">
                <button
                  disabled={currentBatchRecordPage === 1}
                  onClick={() => setBatchRecordPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <b>{currentBatchRecordPage} / {batchRecordPageCount}</b>
                <button
                  disabled={currentBatchRecordPage === batchRecordPageCount}
                  onClick={() => setBatchRecordPage((page) => Math.min(batchRecordPageCount, page + 1))}
                  type="button"
                >
                  Próxima
                </button>
              </div>}
              {selectedBatchCompany && <button className="tutorial-button" onClick={() => setSelectedBatchCompany(null)} type="button">Voltar</button>}
              <button className="tutorial-button" onClick={closeImportBatch} type="button">Fechar</button>
            </footer>
          </section>
        </div>}
        {notice && <div className="toast-notice">{notice}<button onClick={() => setNotice("")} type="button"><X size={15}/></button></div>}
      </main>
    </div>
  );
}
