"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  ClipboardCopy,
  FileDown,
  FileSpreadsheet,
  Filter,
  ListChecks,
  MousePointerClick,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect } from "react";

type QuickGuideModalProps = {
  onClose: () => void;
  onOpenImport: () => void;
};

export function QuickGuideModal({
  onClose,
  onOpenImport,
}: QuickGuideModalProps) {
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

  return (
    <div
      className="guide-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="quick-guide-title"
        aria-modal="true"
        className="guide-modal"
        role="dialog"
      >
        <header className="guide-header">
          <div>
            <span>
              <CircleHelp size={19} />
            </span>
            <div>
              <p>GUIA RÁPIDO · CERCA DE 2 MINUTOS</p>
              <h2 id="quick-guide-title">Como usar o painel</h2>
              <small>Os pontos essenciais para consultar, importar e exportar leads.</small>
            </div>
          </div>
          <button aria-label="Fechar guia" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="guide-content">
          <section className="guide-intro">
            <span>
              <MousePointerClick size={19} />
            </span>
            <div>
              <strong>Comece clicando no nome de um lead</strong>
              <p>
                O popup reúne empresa, contatos, origem, observações, arquivo de
                procedência e histórico de alterações.
              </p>
            </div>
            <span className="guide-copy-example">
              <ClipboardCopy size={13} />
              E-mail e telefone apenas copiam
            </span>
          </section>

          <div className="guide-grid">
            <article className="guide-card guide-card-import">
              <header>
                <span>
                  <Upload size={18} />
                </span>
                <div>
                  <small>1 · ENTRADA DE DADOS</small>
                  <h3>Como preparar o CSV</h3>
                </div>
              </header>
              <p>
                Salve a planilha como <strong>CSV</strong>, com uma linha de
                títulos. O modelo recomendado usa estas colunas:
              </p>
              <code>
                Nome do lead; Empresa; E-mail; Telefone; Origem; Data de
                entrada; Qualificação; Observações
              </code>
              <ul>
                <li>
                  <CheckCircle2 size={13} />
                  Aceita ponto e vírgula, vírgula ou tabulação.
                </li>
                <li>
                  <CheckCircle2 size={13} />
                  Aceita até 5 MB; os arquivos usuais podem ter centenas de linhas.
                </li>
                <li>
                  <CheckCircle2 size={13} />
                  Colunas extras, como Campanha e Cidade, ficam em “Dados adicionais”.
                </li>
                <li>
                  <CheckCircle2 size={13} />
                  Linhas sem nome, empresa, e-mail e telefone são ignoradas.
                </li>
              </ul>
              <p className="guide-tip">
                Em <strong>Importar CSV</strong>, use “Baixar modelo vazio” para
                começar com os títulos corretos.
              </p>
            </article>

            <article className="guide-card guide-card-groups">
              <header>
                <span>
                  <Users size={18} />
                </span>
                <div>
                  <small>2 · REVISÃO DE COINCIDÊNCIAS</small>
                  <h3>O que são registros agrupados?</h3>
                </div>
              </header>
              <div className="guide-group-example">
                <span>Norte Engenharia</span>
                <div>
                  <em>Mariana Souza</em>
                  <em>Beatriz Ramos</em>
                </div>
                <strong>
                  <Users size={12} /> 2 registros agrupados
                </strong>
              </div>
              <p>
                Significa que dois contatos foram relacionados à mesma empresa
                durante a revisão. <strong>Nenhum deles foi fundido ou apagado</strong>:
                cada lead continua com seus próprios dados, origem e histórico.
              </p>
              <p>
                E-mail ou telefone iguais também são sinalizados para conferência.
                Ao abrir o lead, o painel mostra os outros registros do grupo e o
                nome da planilha de origem.
              </p>
            </article>

            <article className="guide-card">
              <header>
                <span>
                  <FileDown size={18} />
                </span>
                <div>
                  <small>3 · SAÍDA DE DADOS</small>
                  <h3>Como funciona a exportação</h3>
                </div>
              </header>
              <div className="guide-filter-flow">
                <span>
                  <Filter size={13} /> Origem
                </span>
                <span>Qualificação</span>
                <span>Período</span>
                <ArrowRight size={15} />
                <strong>
                  <FileSpreadsheet size={14} /> CSV
                </strong>
              </div>
              <p>
                O botão <strong>Exportar</strong> baixa somente os leads visíveis
                nos filtros atuais — incluindo busca, origem, qualificação e
                intervalo de datas. Sem filtros, todos os leads são exportados.
              </p>
              <p>
                O arquivo abre no Excel e contém nome, empresa, contato, origem,
                data de entrada, qualificação e observações.
              </p>
            </article>

            <article className="guide-card">
              <header>
                <span>
                  <ListChecks size={18} />
                </span>
                <div>
                  <small>4 · ROTINA COMERCIAL</small>
                  <h3>Qualifique e acompanhe</h3>
                </div>
              </header>
              <div className="guide-statuses">
                <span>Pendente</span>
                <span>Atendido</span>
                <span>Qualificado</span>
                <span>Desqualificado</span>
                <span>Fechado</span>
              </div>
              <p>
                Atualize a qualificação diretamente na lista. Dentro do lead,
                registre uma observação curta e consulte o histórico para saber
                quem alterou o quê e quando.
              </p>
              <p>
                As origens previstas são <strong>Google Ads, Meta Ads, Orgânico</strong>{" "}
                e <strong>Recomendação</strong>.
              </p>
            </article>
          </div>
        </div>

        <footer className="guide-footer">
          <button
            className="guide-import-button"
            onClick={onOpenImport}
            type="button"
          >
            <Upload size={15} />
            Abrir importação CSV
          </button>
          <button className="guide-done-button" onClick={onClose} type="button">
            Entendi
            <ArrowRight size={15} />
          </button>
        </footer>
      </section>
    </div>
  );
}
