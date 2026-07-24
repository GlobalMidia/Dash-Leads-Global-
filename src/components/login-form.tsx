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
import { neonAuthClient } from "@/lib/neon-auth-client";

export function LoginForm({
  configured,
  individualAuthEnabled,
  preview = false,
}: {
  configured: boolean;
  individualAuthEnabled: boolean;
  preview?: boolean;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hasCorporateEmail(value: string) {
    return value.trim().toLowerCase().endsWith("@globalmidia.digital");
  }

  async function handleIndividualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!hasCorporateEmail(email)) {
        throw new Error("Use seu e-mail com final @globalmidia.digital.");
      }

      if (mode === "sign-up") {
        if (name.trim().length < 2) {
          throw new Error("Informe seu nome para criar a conta.");
        }
        if (password.length < 8) {
          throw new Error("Crie uma senha com pelo menos 8 caracteres.");
        }

        const result = await neonAuthClient.signUp.email({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        });
        if (result.error) throw new Error(result.error.message);
        setMode("sign-in");
        setPassword("");
        setError("Conta criada. Verifique seu e-mail e entre com sua senha.");
        return;
      }

      const result = await neonAuthClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        callbackURL: "/",
      });
      if (result.error) throw new Error(result.error.message);
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSharedPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
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
        ) : individualAuthEnabled ? (
          <form onSubmit={handleIndividualSubmit}>
            <div className="login-mode-switch" role="tablist" aria-label="Tipo de acesso">
              <button
                aria-selected={mode === "sign-in"}
                className={mode === "sign-in" ? "is-active" : ""}
                onClick={() => {
                  setMode("sign-in");
                  setError(null);
                }}
                role="tab"
                type="button"
              >
                Entrar
              </button>
              <button
                aria-selected={mode === "sign-up"}
                className={mode === "sign-up" ? "is-active" : ""}
                onClick={() => {
                  setMode("sign-up");
                  setError(null);
                }}
                role="tab"
                type="button"
              >
                Criar conta
              </button>
            </div>
            {mode === "sign-up" && (
              <label>
                Nome completo
                <input
                  autoComplete="name"
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Seu nome"
                  required
                  value={name}
                />
              </label>
            )}
            <label>
              E-mail corporativo
              <input
                autoComplete="email"
                autoFocus={mode === "sign-in"}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@globalmidia.digital"
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Senha individual
              <span className="password-field">
                <LockKeyhole size={17} />
                <input
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
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
            <div className="domain-rule">
              <ShieldCheck size={17} />
              <div>
                <strong>Acesso exclusivo da Global Mídia</strong>
                <p>
                  Somente e-mails com final <code>@globalmidia.digital</code>{" "}
                  acessam o painel.
                </p>
              </div>
            </div>
            <button className="login-submit" disabled={loading} type="submit">
              {loading
                ? "Aguarde..."
                : mode === "sign-in"
                  ? "Entrar no painel"
                  : "Criar conta"}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>
        ) : configured ? (
          <form onSubmit={handleSharedPasswordSubmit}>
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
            Configure o login individual na Vercel antes de acessar dados reais.
          </div>
        )}
      </section>
      <p className="login-footer">Global Mídia · Dados protegidos</p>
    </main>
  );
}
