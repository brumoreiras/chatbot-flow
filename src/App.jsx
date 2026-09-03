import { useState } from "react";
import AppV1 from "./versions/v1/App.jsx";
import AppV2 from "./versions/v2/App.jsx";
import { trackEvent } from "./utils/analytics.js";
import "./selector.css";

const VERSION_QUERY = "version";
const VERSION_STORAGE_KEY = "chatbot_builder_selected_version";
const VERSION_OPTIONS = {
  v1: {
    label: "V1 — Versão Clássica",
    description: "Utilize a versão original do construtor.",
    component: AppV1,
  },
  v2: {
    label: "V2 — Nova Versão",
    description: "Experimente a nova experiência, com melhorias de usabilidade e novos recursos.",
    component: AppV2,
  },
};

function readInitialVersion() {
  const queryVersion = new URLSearchParams(window.location.search).get(VERSION_QUERY);
  if (queryVersion in VERSION_OPTIONS) return queryVersion;

  const savedVersion = window.localStorage.getItem(VERSION_STORAGE_KEY);
  return savedVersion in VERSION_OPTIONS ? savedVersion : null;
}

function updateUrl(version) {
  const url = new URL(window.location.href);
  url.searchParams.set(VERSION_QUERY, version);
  window.history.replaceState({}, "", url);
}

function VersionSelector({ onSelect }) {
  return (
    <main className="version-selector">
      <div className="selector-heading">
        <span className="selector-eyebrow">CHATBOT FLOW BUILDER</span>
        <p className="welcome-label">Bem-vindo ao</p>
        <h1>Construtor de Chatbot</h1>
        <div className="welcome-copy">
          <p>Crie os arquivos necessários para configurar os fluxos de atendimento do Chatbot.</p>
          <p>
            Para tornar esse processo mais simples e eficiente, disponibilizamos uma nova versão do construtor,
            com melhorias na experiência e novos recursos.
          </p>
          <p>Escolha abaixo a versão que deseja utilizar.</p>
          {/* <p>Seus projetos são armazenados separadamente em cada versão.</p> */}
        </div>
      </div>
      <div className="version-options">
        {Object.entries(VERSION_OPTIONS).map(([version, option]) => (
          <button className="version-option" key={version} type="button" onClick={() => onSelect(version)}>
            <span className="version-number">{version.toUpperCase()}</span>
            <span className="version-option-copy">
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </span>
            {/* <span className="version-arrow" aria-hidden="true">-&gt;</span> */}
          </button>
        ))}
      </div>
    </main>
  );
}

function VersionToolbar({ version, onChange }) {
  return (
    <header className="version-toolbar">
      <span className="toolbar-title">Chatbot Flow Builder</span>
      <span className="toolbar-current">{VERSION_OPTIONS[version].label}</span>
      <button type="button" onClick={() => onChange(version)}>
        Trocar versão
      </button>
    </header>
  );
}

export default function App() {
  const [version, setVersion] = useState(readInitialVersion);

  function selectVersion(nextVersion) {
    trackEvent("version_selected", {
      selected_version: nextVersion,
      source: "welcome_screen",
    });
    window.localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
    updateUrl(nextVersion);
    setVersion(nextVersion);
  }

  function clearVersion(currentVersion) {
    trackEvent("version_change_requested", {
      current_version: currentVersion,
      source: "version_toolbar",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete(VERSION_QUERY);
    window.history.replaceState({}, "", url);
    setVersion(null);
  }

  if (!version) return <VersionSelector onSelect={selectVersion} />;

  const SelectedApp = VERSION_OPTIONS[version].component;
  return (
    <div className="version-shell">
      <VersionToolbar version={version} onChange={clearVersion} />
      <SelectedApp />
    </div>
  );
}
