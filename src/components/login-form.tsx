"use client";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

export function LoginForm({
  configured,
  preview = false,
}: {
  configured: boolean;
  preview?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível entrar.");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-mark">G</div>
        <p className="login-eyebrow">GLOBAL MÍDIA</p>
        <h1>{preview ? "Acesso corporativo" : "Acesse o painel de leads"}</h1>
        <p className="login-subtitle">
          {preview
            ? "Entre com sua conta individual da Global Mídia."
            : "Ambiente restrito para acompanhamento comercial."}
        </p>

        {preview ? (
          <div className="workspace-login">
            <button
              className="google-login-button"
              onClick={() => window.location.assign("/")}
              type="button"
            >
              <span>G</span>
              Continuar com Google
              <ArrowRight size={17} />
            </button>
            <div className="domain-rule">
              <ShieldCheck size={17} />
              <div>
                <strong>Somente contas autorizadas</strong>
                <p>
                  O acesso será permitido apenas para e-mails terminados em{" "}
                  <code>@globalmidia.digital</code>.
                </p>
              </div>
            </div>
            <button
              className="login-preview-back"
              onClick={() => window.location.assign("/")}
              type="button"
            >
              <ArrowLeft size={14} />
              Voltar ao protótipo
            </button>
          </div>
        ) : configured ? (
          <form onSubmit={handleSubmit}>
            <label>
              Senha de acesso
              <span className="password-field">
                <LockKeyhole size={17} />
                <input
                  autoComplete="current-password"
                  autoFocus
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && <p className="login-error">{error}</p>}
            <button className="login-submit" disabled={loading} type="submit">
              {loading ? "Entrando..." : "Entrar no painel"}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>
        ) : (
          <div className="login-config-error">
            Configure <code>DASHBOARD_PASSWORD</code> e{" "}
            <code>DASHBOARD_SESSION_SECRET</code> na Vercel antes de acessar
            dados reais.
          </div>
        )}
      </section>
      <p className="login-footer">Global Mídia · Dados protegidos</p>
    </main>
  );
}
