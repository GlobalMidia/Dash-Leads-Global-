"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { useProfilePreferences } from "@/components/use-profile-preferences";

type PmeReactivationDirectoryProps = {
  mode: "demo" | "live";
  user: {
    name: string;
    email: string;
    initials: string;
  };
};

export function PmeReactivationDirectory({
  mode,
  user,
}: PmeReactivationDirectoryProps) {
  const { preferences, resolvedTheme } = useProfilePreferences(user.email);

  return (
    <div
      className="dashboard-shell pme-shell"
      data-contrast={preferences.highContrast ? "high" : "standard"}
      data-motion={preferences.reducedMotion ? "reduced" : "full"}
      data-text-size={preferences.textSize}
      data-theme={resolvedTheme}
    >
      <header className="topbar">
        <Link className="brand-lockup" href="/" aria-label="Voltar ao painel de leads">
          <span className="brand-mark">G</span>
          <span className="brand-copy">
            <strong>Global Mídia</strong>
            <small>LEADS</small>
          </span>
        </Link>
        <div className="topbar-actions">
          <span className={`mode-pill ${mode}`}>
            <span className="mode-dot" />
            {mode === "live" ? "Dados ao vivo" : "Dados demonstrativos"}
          </span>
          <div className="user-badge" aria-label={`Perfil de ${user.name}`}>
            <span>{user.initials}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        </div>
      </header>

      <aside className="side-rail" aria-label="Navegação principal">
        <Link
          aria-label="Voltar ao dashboard"
          className="rail-button"
          href="/"
          title="Painel de leads"
        >
          <LayoutDashboard size={19} />
        </Link>
        <span
          aria-label="PME e reativação"
          className="rail-button active"
          title="PME e reativação"
        >
          <BriefcaseBusiness size={19} />
        </span>
      </aside>

      <main className="dashboard-main pme-directory">
        <section className="pme-hero">
          <div>
            <p className="eyebrow">BASE COMERCIAL SEPARADA</p>
            <h1>PME / Reativação</h1>
            <p className="hero-subtitle">
              Clientes que já participaram do PME e podem ser trabalhados pela
              agência novamente.
            </p>
          </div>
          <span className="pme-state">
            <FileSpreadsheet size={17} />
            Aguardando planilha
          </span>
        </section>

        <section className="pme-empty-card" aria-labelledby="pme-ready-title">
          <div className="pme-empty-icon">
            <BriefcaseBusiness size={30} />
          </div>
          <div>
            <h2 id="pme-ready-title">Diretório pronto para configuração</h2>
            <p>
              Quando a planilha for enviada, esta área receberá sua própria
              importação, campos e acompanhamento — sem misturar os registros
              de PME com os leads sincronizados do RD Station.
            </p>
          </div>
        </section>

        <section className="pme-guidelines" aria-label="Como a base será organizada">
          <article className="pme-guideline">
            <span className="pme-guideline-icon"><Building2 size={19} /></span>
            <div>
              <h2>Base independente</h2>
              <p>Os clientes de PME ficam em um diretório próprio e não entram nas estatísticas do RD.</p>
            </div>
          </article>
          <article className="pme-guideline">
            <span className="pme-guideline-icon"><FileSpreadsheet size={19} /></span>
            <div>
              <h2>Importação guiada</h2>
              <p>Vamos ajustar os campos à estrutura real da planilha antes de importar qualquer dado.</p>
            </div>
          </article>
          <article className="pme-guideline">
            <span className="pme-guideline-icon"><ShieldCheck size={19} /></span>
            <div>
              <h2>Histórico preservado</h2>
              <p>O acompanhamento de reativação poderá evoluir sem alterar a origem dos registros existentes.</p>
            </div>
          </article>
        </section>

        <div className="pme-next-step">
          <span>Próximo passo: analisar a planilha de PME e mapear os campos que realmente vierem nela.</span>
          <span aria-hidden="true"><ArrowRight size={17} /></span>
        </div>
      </main>
    </div>
  );
}
