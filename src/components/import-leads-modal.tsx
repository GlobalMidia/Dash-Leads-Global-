"use client";

import {
  AlertTriangle,
  Building2,
  Check,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  Info,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  parseLeadCsv,
  SAMPLE_CSV,
  type CsvImportRecord,
  type CsvImportResult,
} from "@/lib/csv-import";
import type { Lead } from "@/types/lead";

export type ImportConfirmation = {
  fileName: string;
  records: CsvImportRecord[];
  groupedRowNumbers: number[];
};

type ImportLeadsModalProps = {
  existingLeads: Lead[];
  onClose: () => void;
  onConfirm: (confirmation: ImportConfirmation) => void;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nome do lead",
  company: "Empresa",
  email: "E-mail",
  phone: "Telefone",
  origin: "Origem",
  enteredAt: "Data de entrada",
  status: "Qualificação",
  notes: "Observações",
};

function downloadTemplate() {
  const blob = new Blob([
    "Nome do lead;Empresa;E-mail;Telefone;Origem;Data de entrada;Qualificação;Observações\n",
  ], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-importacao-leads.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportLeadsModal({
  existingLeads,
  onClose,
  onConfirm,
}: ImportLeadsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [groupedRows, setGroupedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function loadPreview(text: string, name: string) {
    try {
      const result = parseLeadCsv(text, existingLeads);
      if (!result.headers.length || !result.records.length) {
        throw new Error("O arquivo não possui registros reconhecíveis.");
      }
      if (result.records.length > 5000) {
        throw new Error("Este protótipo aceita até 5.000 registros por arquivo.");
      }
      setPreview(result);
      setFileName(name);
      setGroupedRows(new Set());
      setError(null);
    } catch (caught) {
      setPreview(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível interpretar o arquivo.",
      );
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
      setError("Selecione um arquivo no formato CSV.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 5 MB.");
      return;
    }
    loadPreview(await file.text(), file.name);
  }

  function toggleGroup(rowNumber: number) {
    setGroupedRows((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  const duplicateCount =
    preview?.records.filter((record) => record.match).length ?? 0;
  const additionalColumns =
    preview
      ? Math.max(preview.headers.length - preview.mappedFields.length, 0)
      : 0;

  return (
    <div
      className="import-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        className="import-modal"
        role="dialog"
      >
        <header className="import-header">
          <div>
            <span className="import-header-icon">
              <Upload size={18} />
            </span>
            <div>
              <p>IMPORTAÇÃO ASSISTIDA</p>
              <h2 id="import-title">Importar leads por CSV</h2>
              <span>Prévia demonstrativa · nenhuma fusão automática</span>
            </div>
          </div>
          <button aria-label="Fechar importação" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        {!preview ? (
          <div className="import-start">
            <button
              className="csv-dropzone"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <span>
                <FileSpreadsheet size={25} />
              </span>
              <strong>Selecione um arquivo CSV</strong>
              <p>
                Aceita vírgula, ponto e vírgula ou tabulação · até 5 MB
              </p>
              <em>Escolher arquivo</em>
            </button>
            <input
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => handleFile(event.target.files?.[0])}
              ref={inputRef}
              type="file"
            />

            {error && (
              <div className="import-error" role="alert">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            <div className="import-demo-actions">
              <button
                onClick={() => loadPreview(SAMPLE_CSV, "leads-campanhas-julho.csv")}
                type="button"
              >
                <FileSpreadsheet size={16} />
                Usar CSV de exemplo
              </button>
              <button onClick={downloadTemplate} type="button">
                <Download size={16} />
                Baixar modelo vazio
              </button>
            </div>

            <div className="import-guidance">
              <Info size={16} />
              <p>
                Colunas desconhecidas serão preservadas em{" "}
                <strong>Dados adicionais da importação</strong>.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="import-summary">
              <div>
                <FileSpreadsheet size={17} />
                <span>
                  <small>Arquivo</small>
                  <strong>{fileName}</strong>
                </span>
              </div>
              <div>
                <strong>{preview.records.length}</strong>
                <span>registros válidos</span>
              </div>
              <div>
                <strong>{duplicateCount}</strong>
                <span>para revisar</span>
              </div>
              <div>
                <strong>{additionalColumns}</strong>
                <span>colunas adicionais</span>
              </div>
            </div>

            <div className="mapping-strip">
              <span>Campos reconhecidos</span>
              <div>
                {preview.mappedFields.map((field) => (
                  <em key={field}>
                    <Check size={11} />
                    {FIELD_LABELS[field]}
                  </em>
                ))}
              </div>
            </div>

            <div className="import-review-heading">
              <div>
                <h3>Revisão antes de importar</h3>
                <p>
                  Confirme apenas os agrupamentos de empresa que fizerem sentido.
                </p>
              </div>
              <span>{groupedRows.size} agrupamentos confirmados</span>
            </div>

            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Lead e empresa</th>
                    <th>Contato</th>
                    <th>Análise</th>
                    <th>Decisão</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.records.map((record) => (
                    <tr key={record.rowNumber}>
                      <td>{record.rowNumber}</td>
                      <td>
                        <strong>{record.name}</strong>
                        <span>
                          <Building2 size={11} />
                          {record.company}
                        </span>
                      </td>
                      <td>
                        <span>{record.email || "Sem e-mail"}</span>
                        <span>{record.phone || "Sem telefone"}</span>
                      </td>
                      <td>
                        {record.match ? (
                          <span className={`match-badge ${record.match.kind}`}>
                            <AlertTriangle size={12} />
                            {record.match.label}
                            {record.match.sourceFile && (
                              <small>Origem: {record.match.sourceFile}</small>
                            )}
                          </span>
                        ) : (
                          <span className="match-badge new">
                            <Check size={12} />
                            Novo registro
                          </span>
                        )}
                      </td>
                      <td>
                        {record.match?.kind === "company" ? (
                          <label className="group-decision">
                            <input
                              checked={groupedRows.has(record.rowNumber)}
                              onChange={() => toggleGroup(record.rowNumber)}
                              type="checkbox"
                            />
                            <span>
                              Agrupar
                              <small>sem fundir</small>
                            </span>
                          </label>
                        ) : (
                          <span className="keep-separate">Manter separado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(preview.ignoredRows > 0 || additionalColumns > 0) && (
              <div className="import-review-note">
                <Info size={14} />
                <span>
                  {preview.ignoredRows > 0 &&
                    `${preview.ignoredRows} linhas vazias serão ignoradas. `}
                  {additionalColumns > 0 &&
                    `${additionalColumns} colunas extras serão mantidas como dados adicionais.`}
                </span>
              </div>
            )}

            <footer className="import-footer">
              <button
                className="import-back"
                onClick={() => {
                  setPreview(null);
                  setGroupedRows(new Set());
                }}
                type="button"
              >
                <ChevronLeft size={15} />
                Trocar arquivo
              </button>
              <div>
                <button className="import-cancel" onClick={onClose} type="button">
                  Cancelar
                </button>
                <button
                  className="import-confirm"
                  onClick={() =>
                    onConfirm({
                      fileName,
                      records: preview.records,
                      groupedRowNumbers: [...groupedRows],
                    })
                  }
                  type="button"
                >
                  <Upload size={15} />
                  Importar {preview.records.length} registros
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
