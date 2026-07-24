"use client";

import {
  Accessibility,
  Check,
  Contrast,
  Eye,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Sparkles,
  Sun,
  Type,
  X,
} from "lucide-react";
import { useEffect } from "react";
import type {
  ProfilePreferences,
  ProfileTextSize,
  ProfileTheme,
} from "@/components/use-profile-preferences";

type ProfilePreferencesModalProps = {
  email: string;
  preferences: ProfilePreferences;
  onChange: (preferences: ProfilePreferences) => void;
  onClose: () => void;
  onReset: () => void;
  onViewLogin: () => void;
  onLogout?: () => void;
};

const THEME_OPTIONS: Array<{
  value: ProfileTheme;
  label: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    value: "system",
    label: "Dispositivo",
    description: "Segue o sistema",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Claro",
    description: "Fundo claro",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Escuro",
    description: "Menos luminosidade",
    icon: Moon,
  },
];

const TEXT_OPTIONS: Array<{
  value: ProfileTextSize;
  label: string;
  sample: string;
}> = [
  { value: "normal", label: "Normal", sample: "Aa" },
  { value: "large", label: "Grande", sample: "Aa" },
  { value: "extra", label: "Extra", sample: "Aa" },
];

export function ProfilePreferencesModal({
  email,
  preferences,
  onChange,
  onClose,
  onReset,
  onViewLogin,
  onLogout,
}: ProfilePreferencesModalProps) {
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

  function update<Key extends keyof ProfilePreferences>(
    key: Key,
    value: ProfilePreferences[Key],
  ) {
    onChange({ ...preferences, [key]: value });
  }

  return (
    <div
      className="preferences-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="preferences-title"
        aria-modal="true"
        className="preferences-modal"
        role="dialog"
      >
        <header className="preferences-header">
          <div>
            <span>
              <Accessibility size={19} />
            </span>
            <div>
              <p>PREFERÊNCIAS DO PERFIL</p>
              <h2 id="preferences-title">Aparência e acessibilidade</h2>
              <small>{email}</small>
            </div>
          </div>
          <button aria-label="Fechar preferências" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="preferences-content">
          <fieldset className="preference-section">
            <legend>
              <span>
                <Sparkles size={15} />
              </span>
              <div>
                <strong>Tema</strong>
                <small>Escolha como o painel aparece para você.</small>
              </div>
            </legend>
            <div className="theme-options">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    className={
                      preferences.theme === option.value ? "selected" : ""
                    }
                    key={option.value}
                  >
                    <input
                      checked={preferences.theme === option.value}
                      name="profile-theme"
                      onChange={() => update("theme", option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span>
                      <Icon size={17} />
                    </span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                    {preferences.theme === option.value && (
                      <em>
                        <Check size={10} />
                      </em>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="preference-section">
            <legend>
              <span>
                <Type size={15} />
              </span>
              <div>
                <strong>Tamanho do texto</strong>
                <small>Textos e controles crescem juntos para evitar cortes.</small>
              </div>
            </legend>
            <div className="text-size-options">
              {TEXT_OPTIONS.map((option) => (
                <label
                  className={
                    preferences.textSize === option.value ? "selected" : ""
                  }
                  data-size={option.value}
                  key={option.value}
                >
                  <input
                    checked={preferences.textSize === option.value}
                    name="profile-text-size"
                    onChange={() => update("textSize", option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.sample}</span>
                  <strong>{option.label}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="preference-section accessibility-options">
            <header>
              <span>
                <Eye size={15} />
              </span>
              <div>
                <strong>Leitura e movimento</strong>
                <small>Ajustes adicionais para conforto visual.</small>
              </div>
            </header>

            <label className="preference-toggle">
              <span>
                <Contrast size={17} />
                <div>
                  <strong>Alto contraste</strong>
                  <small>Realça textos, bordas, botões e foco do teclado.</small>
                </div>
              </span>
              <input
                checked={preferences.highContrast}
                onChange={(event) =>
                  update("highContrast", event.target.checked)
                }
                role="switch"
                type="checkbox"
              />
            </label>

            <label className="preference-toggle">
              <span>
                <Sparkles size={17} />
                <div>
                  <strong>Reduzir movimentos</strong>
                  <small>Desativa animações e transições decorativas.</small>
                </div>
              </span>
              <input
                checked={preferences.reducedMotion}
                onChange={(event) =>
                  update("reducedMotion", event.target.checked)
                }
                role="switch"
                type="checkbox"
              />
            </label>
          </section>

          <section className="preferences-preview">
            <span>PRÉVIA</span>
            <div>
              <span>GM</span>
              <div>
                <strong>Oportunidade qualificada</strong>
                <p>Exemplo de texto e contraste aplicado ao seu perfil.</p>
              </div>
              <em>Qualificado</em>
            </div>
          </section>

          <div className="profile-session-actions">
            <button
              className="view-login-button"
              onClick={onViewLogin}
              type="button"
            >
              <LogIn size={16} />
              Visualizar tela de acesso corporativo
            </button>
            {onLogout && (
              <button
                className="profile-logout-button"
                onClick={onLogout}
                type="button"
              >
                <LogOut size={16} />
                Sair do painel
              </button>
            )}
          </div>
        </div>

        <footer className="preferences-footer">
          <button className="preferences-reset" onClick={onReset} type="button">
            <RotateCcw size={14} />
            Restaurar padrões
          </button>
          <div>
            <span>
              <Check size={12} />
              Salvo neste perfil
            </span>
            <button
              className="preferences-done"
              onClick={onClose}
              type="button"
            >
              Concluir
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
