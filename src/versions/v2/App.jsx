import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const LS_KEY = "chatbot_builder_project_v2";
const STAGING_TENANT = "c2d9536e-2a42-46f6-af66-9412f769aa13";
const STAGING_FILIAL_ID = 4;
const LISTA_INTERATIVA = 2;
const MAX_LIST_OPTIONS = 10;
const MAX_LIST_SECTIONS = 10;
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

function createListSection() {
  return { uiId: uid(), titulo: "", opcoes: [] };
}

function createListConfig() {
  return {
    cabecalho: "",
    rodape: "",
    tituloBotao: "Ver opções",
    secoes: [createListSection()],
  };
}

function normalizeListConfig(value) {
  const fallback = createListConfig();
  const source = value && typeof value === "object" ? value : {};
  const sections = Array.isArray(source.secoes) ? source.secoes : fallback.secoes;
  return {
    ...fallback,
    ...source,
    secoes: sections.map((section) => ({
      uiId: section?.uiId || uid(),
      titulo: section?.titulo || "",
      opcoes: Array.isArray(section?.opcoes)
        ? section.opcoes.map((option) => ({
            uiId: option?.uiId || uid(),
            titulo: option?.titulo || "",
            descricao: option?.descricao || "",
          }))
        : [],
    })),
  };
}

const defaultProject = () => ({
  tenant: "",
  filialId: "",
  descricao: "",
  ambiente: "staging",
  utilizaIA: false,
  ativo: true,
  mensagemComandoInvalido: "A resposta que você enviou não é um comando válido. Verifique a última mensagem enviada e tente novamente.",
  tempoInatividade: {
    tempoEnvioInatividade: 60,
    mensagemInatividade: "Ainda não recebemos a sua resposta. Estamos aguardando para prosseguir com o seu atendimento.",
    tempoEnvioFinalizacaoBot: 120,
    mensagemFinalizacaoBot: "Infelizmente não recebemos uma resposta. Estamos transferindo para um atendente para que ele possa lhe ajudar e possamos dar continuidade no seu atendimento.",
  },
  defaults: {
    comandoTipo: 1,
    transferirParaHumano: false,
    voltarMenu: false,
    enviaMensagemComandoInvalido: false,
  },
  // Root sem "comando" por regra
  flow: {
    uiId: uid(),
    resposta: "",
    comandoTipo: 1,
    transferirParaHumano: false,
    voltarMenu: false,
    enviaMensagemComandoInvalido: true,
    statusParametroId: "",
    isTemplate: false,
    templateName: "",
    templateCategory: "",
    utilizaIA: false,
    mensagemInterativa: null,
    children: [],
  },
});

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeNode(savedNode, fallbackNode) {
  return {
    ...fallbackNode,
    ...(savedNode || {}),
    uiId: savedNode?.uiId || fallbackNode.uiId,
    comandoTipo: Number(savedNode?.comandoTipo ?? fallbackNode.comandoTipo),
    children: Array.isArray(savedNode?.children)
      ? savedNode.children.map((child) => normalizeNode(child, { ...fallbackNode, uiId: uid(), children: [] }))
      : [],
  };
}

function loadProject() {
  const fresh = defaultProject();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fresh;

    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || !saved.flow || typeof saved.flow !== "object") return fresh;

    return {
      ...fresh,
      ...saved,
      tempoInatividade: { ...fresh.tempoInatividade, ...(saved.tempoInatividade || {}) },
      defaults: { ...fresh.defaults, ...(saved.defaults || {}) },
      flow: normalizeNode(saved.flow, fresh.flow),
    };
  } catch {
    return fresh;
  }
}

function findNode(root, uiId) {
  if (!root) return null;
  if (root.uiId === uiId) return root;
  for (const ch of root.children || []) {
    const found = findNode(ch, uiId);
    if (found) return found;
  }
  return null;
}

function flattenNodes(root, nodes = []) {
  if (!root) return nodes;
  nodes.push(root);
  (root.children || []).forEach((child) => flattenNodes(child, nodes));
  return nodes;
}

function isDescendant(root, ancestorUiId, targetUiId) {
  const ancestor = findNode(root, ancestorUiId);
  return Boolean(ancestor && findNode(ancestor, targetUiId));
}

function findParent(root, targetUiId, parent = null) {
  if (!root) return null;
  if (root.uiId === targetUiId) return parent;
  for (const ch of root.children || []) {
    const found = findParent(ch, targetUiId, root);
    if (found !== null) return found;
  }
  return null;
}

function removeNode(root, targetUiId) {
  if (!root?.children) return;
  root.children = root.children.filter((c) => c.uiId !== targetUiId);
  for (const ch of root.children) removeNode(ch, targetUiId);
}

function duplicateSubtree(node) {
  const cloned = deepClone(node);
  const assignNewIds = (n) => {
    n.uiId = uid();
    (n.children || []).forEach(assignNewIds);
  };
  assignNewIds(cloned);
  return cloned;
}

// Garante ordem das chaves no comando (exigência do time)
function buildInterativo(mensagemInterativa, environment) {
  if (!mensagemInterativa || mensagemInterativa.tipo === undefined || mensagemInterativa.tipo === null) return null;
  if (Number(mensagemInterativa.tipo) === LISTA_INTERATIVA) {
    const lista = normalizeListConfig(mensagemInterativa.lista);
    const identifier = environment === "production" ? "id" : "_id";
    return {
      tipo: LISTA_INTERATIVA,
      botao: null,
      listaBotao: {
        cabecalho: { texto: lista.cabecalho?.trim() || "" },
        rodape: { texto: lista.rodape?.trim() || "" },
        texto: lista.tituloBotao?.trim() || "",
        secoes: (lista.secoes || []).map((secao) => ({
          titulo: secao.titulo?.trim() || "",
          opcoes: (secao.opcoes || []).map((opcao) => ({
            [identifier]: opcao.titulo?.trim() || "",
            titulo: opcao.titulo?.trim() || "",
            ...(opcao.descricao?.trim() ? { descricao: opcao.descricao.trim() } : {}),
          })),
        })),
      },
    };
  }
  const identifier = environment === "production" ? "id" : "_id";
  const respostas = (mensagemInterativa.botoes || [])
    .map((botao) => ({
      [identifier]: botao.comando?.trim() || botao.titulo?.trim() || "",
      titulo: botao.titulo?.trim() || botao.comando?.trim() || "",
    }))
    .filter((resp) => resp[identifier] || resp.titulo);

  if (respostas.length === 0) return null;

  return {
    tipo: mensagemInterativa.tipo,
    botao: {
      respostas,
    },
    listaBotao: null,
  };
}

function buildCommandWithOrder({ commandId, parentId, isRoot, node, defaults, environment }) {
  const comandoTipo = node.utilizaIA ? 2 : 1;
  const transferirParaHumano = node.transferirParaHumano ?? defaults.transferirParaHumano ?? false;
  const voltarMenu = node.voltarMenu ?? defaults.voltarMenu ?? false;
  const enviaMensagemComandoInvalido =
    node.enviaMensagemComandoInvalido ?? defaults.enviaMensagemComandoInvalido ?? false;

  const mensagemInterativa =
    node.mensagemInterativa && typeof node.mensagemInterativa === "object" ? node.mensagemInterativa : null;
  const interativo = buildInterativo(mensagemInterativa, environment);

  // statusParametroId é opcional, mas quando existir, deve ser o ÚLTIMO campo.
  const hasStatus =
    node.alterarStatus !== false &&
    node.statusParametroId !== undefined &&
    node.statusParametroId !== null &&
    node.statusParametroId !== "";

  const identifier = environment === "production" ? "id" : "_id";
  if (isRoot) {
    const cmd = {
      [identifier]: commandId,
      idMensagemPai: null,
      comando: null,
      comandoTipo,
      resposta: node.resposta ?? "",
      transferirParaHumano,
      voltarMenu,
      enviaMensagemComandoInvalido,
      statusParametroId: hasStatus ? String(node.statusParametroId).trim().toLowerCase() : null,
      ...(interativo ? { interativo } : {}),
    };
    return cmd;
  }

  const cmd = {
    [identifier]: commandId,
    idMensagemPai: parentId,
    comando: node.comando ?? "",
    comandoTipo,
    resposta: node.resposta ?? "",
    transferirParaHumano,
    voltarMenu,
    enviaMensagemComandoInvalido,
    statusParametroId: hasStatus ? String(node.statusParametroId).trim().toLowerCase() : null,
    ...(interativo ? { interativo } : {}),
  };
  return cmd;
}

function buildChatbotJson(project, environment = "staging") {
  let nextId = 1;
  const comandos = [];
  const templates = [];

  const defaults = {
    comandoTipo: 1,
    transferirParaHumano: false,
    voltarMenu: false,
    enviaMensagemComandoInvalido: false,
    ...(project.defaults || {}),
  };

  const errors = [];

  function validateList(node, commandId) {
    if (Number(node?.mensagemInterativa?.tipo) !== LISTA_INTERATIVA) return;
    const lista = normalizeListConfig(node.mensagemInterativa.lista);
    const secoes = lista.secoes || [];
    const totalOpcoes = secoes.reduce((total, secao) => total + (secao.opcoes || []).length, 0);
    const normalizedSectionTitles = new Map();
    const normalizedOptionTitles = new Map();

    if (!String(lista.tituloBotao || "").trim()) errors.push(`Nó ${commandId}: o título do botão é obrigatório.`);
    if (String(lista.cabecalho || "").length > 55) errors.push(`Nó ${commandId}: o cabeçalho deve ter no máximo 55 caracteres.`);
    if (String(lista.rodape || "").length > 55) errors.push(`Nó ${commandId}: o rodapé deve ter no máximo 55 caracteres.`);
    if (String(lista.tituloBotao || "").length > 20) errors.push(`Nó ${commandId}: o título do botão deve ter no máximo 20 caracteres.`);
    if (secoes.length < 1) errors.push(`Nó ${commandId}: a lista deve possuir pelo menos uma seção.`);
    if (secoes.length > MAX_LIST_SECTIONS) errors.push(`Nó ${commandId}: a lista pode possuir no máximo 10 seções.`);
    if (totalOpcoes < 1 || totalOpcoes > MAX_LIST_OPTIONS) errors.push(`Nó ${commandId}: a lista deve possuir entre 1 e 10 opções.`);

    secoes.forEach((secao, sectionIndex) => {
      const sectionTitle = String(secao.titulo || "").trim();
      const sectionLabel = `seção ${sectionIndex + 1}`;
      if (String(secao.titulo || "").length > 24) {
        errors.push(`Nó ${commandId}, ${sectionLabel}: O limite permitido de caracteres é de no mínimo 1 no máximo 24 caracteres`);
      }
      if (!sectionTitle) {
        const emptySection = [...normalizedSectionTitles.values()][0];
        if (emptySection !== undefined) errors.push(`Nó ${commandId}: Já existe um titulo com o titulo vazio na seção ${emptySection}`);
        normalizedSectionTitles.set("", sectionIndex + 1);
      } else if (normalizedSectionTitles.has(sectionTitle.toLowerCase())) {
        errors.push(`Nó ${commandId}: Titulo já cadastrado na seção ${normalizedSectionTitles.get(sectionTitle.toLowerCase())}`);
      } else {
        normalizedSectionTitles.set(sectionTitle.toLowerCase(), sectionIndex + 1);
      }

      if (!secao.opcoes?.length) errors.push(`Nó ${commandId}, ${sectionLabel}: Não existe opções cadastradas`);
      (secao.opcoes || []).forEach((opcao) => {
        const optionTitle = String(opcao.titulo || "").trim();
        if (!optionTitle) errors.push(`Nó ${commandId}, ${sectionLabel}: Campo não pode ser vazio preenchimento obrigatório`);
        if (String(opcao.titulo || "").length > 24) errors.push(`Nó ${commandId}: O limite permitido de caracteres é de no mínimo 1 no máximo 24 caracteres`);
        if (String(opcao.descricao || "").length > 65) errors.push(`Nó ${commandId}: O limite permitido de caracteres é de no mínimo 1 no máximo 65 caracteres`);
        if (optionTitle && normalizedOptionTitles.has(optionTitle.toLowerCase())) {
          errors.push(`Nó ${commandId}: Título de opção já cadastrado na lista`);
        } else if (optionTitle) {
          normalizedOptionTitles.set(optionTitle.toLowerCase(), true);
        }
      });
    });
  }

  function walk(node, parentId, isRoot) {
    const commandId = nextId++;

    // validação mínima
    if (!node?.resposta || String(node.resposta).trim().length === 0) {
      errors.push(`Nó ${commandId} está sem resposta.`);
    }
    if (!isRoot && (!node?.comando || String(node.comando).trim().length === 0)) {
      errors.push(`Nó ${commandId} (não-root) está sem comando.`);
    }
    if (node?.alterarStatus && !String(node.statusParametroId || "").trim()) {
      errors.push(`Nó ${commandId} está marcado para alterar o status, mas não possui ID de status.`);
    }
    validateList(node, commandId);

    const cmd = buildCommandWithOrder({ commandId, parentId, isRoot, node, defaults, environment });
    comandos.push(cmd);

    // Se é template, adicionar ao array de templates
    if (node.isTemplate) {
      if (!node.templateName || String(node.templateName).trim().length === 0) {
        errors.push(`Template no nó ${commandId} está sem nome.`);
      }
      if (!node.templateCategory) {
        errors.push(`Template no nó ${commandId} está sem categoria.`);
      }
      templates.push({
        tipo: null,
        mensagem: node.resposta ?? "",
        nome: node.templateName ?? "",
        categoria: node.templateCategory,
        linguagem: "pt_BR",
      });
    }

    (node.children || [])
      .filter((child) => !isVoltarCommand(child))
      .forEach((child) => walk(child, commandId, false));
  }

  walk(project.flow, undefined, true);

  const output = {
    tenant: environment === "production" ? String(project.tenant || "").toLowerCase() : STAGING_TENANT,
    filialId: environment === "production" ? Number(project.filialId) : STAGING_FILIAL_ID,
    descricao: project.descricao,
    comandos,
    ativo: true,
    mensagemComandoInvalido: project.mensagemComandoInvalido ?? "",
    comandoVoltar: "voltar",
    tempoInatividade: project.tempoInatividade ?? {},
    utilizaIA: Boolean(project.utilizaIA || comandos.some((comando) => comando.comandoTipo === 2)),
  };

  return { output, errors, templates };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 4)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fileSlug(value) {
  return String(value || "chatbot")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "CHATBOT";
}

// --------
// Helpers só de apresentação (não afetam o JSON exportado)
// --------
function nodeHasIssue(node, isRoot) {
  const noResposta = !node?.resposta || String(node.resposta).trim().length === 0;
  const noComando = !isRoot && (!node?.comando || String(node.comando).trim().length === 0);
  const brokenTemplate =
    node?.isTemplate &&
    (!node?.templateName || String(node.templateName).trim().length === 0 || !node?.templateCategory);
  const missingStatus = node?.alterarStatus && !String(node.statusParametroId || "").trim();
  return noResposta || noComando || brokenTemplate || missingStatus;
}

function getPath(root, uiId) {
  const path = [];
  function walk(node, trail) {
    if (!node) return false;
    const next = [...trail, node];
    if (node.uiId === uiId) {
      path.push(...next);
      return true;
    }
    for (const ch of node.children || []) {
      if (walk(ch, next)) return true;
    }
    return false;
  }
  walk(root, []);
  return path;
}

function subtreeMatches(node, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  const label = (node.comando || node.origemButtonTitulo || "inicial").toLowerCase();
  const body = (node.resposta || "").toLowerCase();
  if (label.includes(t) || body.includes(t)) return true;
  return (node.children || []).some((ch) => subtreeMatches(ch, t));
}

function isVoltarCommand(node) {
  return [node?.comando, node?.origemButtonTitulo].some(
    (value) => String(value || "").trim().toLowerCase() === "voltar"
  );
}

function getListUiErrors(lista) {
  const sectionErrors = {};
  const optionErrors = {};
  const normalizedSections = new Map();
  const normalizedOptions = new Map();
  let emptySectionId = null;

  (lista?.secoes || []).forEach((secao, sectionIndex) => {
    const sectionTitle = String(secao.titulo || "").trim();
    if (String(secao.titulo || "").length > 24) {
      sectionErrors[secao.uiId] = "O limite permitido de caracteres é de no mínimo 1 no máximo 24 caracteres";
    } else if (!sectionTitle) {
      if (emptySectionId) sectionErrors[secao.uiId] = `Já existe um titulo com o titulo vazio na seção ${sectionIndex}`;
      else emptySectionId = secao.uiId;
    } else if (normalizedSections.has(sectionTitle.toLowerCase())) {
      sectionErrors[secao.uiId] = `Titulo já cadastrado na seção ${normalizedSections.get(sectionTitle.toLowerCase())}`;
    } else {
      normalizedSections.set(sectionTitle.toLowerCase(), sectionIndex + 1);
    }

    (secao.opcoes || []).forEach((opcao) => {
      const errors = [];
      const optionTitle = String(opcao.titulo || "").trim();
      if (!optionTitle) errors.push("Campo não pode ser vazio preenchimento obrigatório");
      if (String(opcao.titulo || "").length > 24) errors.push("O limite permitido de caracteres é de no mínimo 1 no máximo 24 caracteres");
      if (String(opcao.descricao || "").length > 65) errors.push("O limite permitido de caracteres é de no mínimo 1 no máximo 65 caracteres");
      if (optionTitle && normalizedOptions.has(optionTitle.toLowerCase())) errors.push("Título de opção já cadastrado na lista");
      if (optionTitle) normalizedOptions.set(optionTitle.toLowerCase(), true);
      if (errors.length) optionErrors[opcao.uiId] = errors;
    });
  });

  return { sectionErrors, optionErrors };
}

// --------
// Self-tests (sem framework): rodam uma vez e ajudam a garantir a regra de ORDEM das chaves
// --------
function runSelfTestsOnce() {
  if (typeof window === "undefined") return;
  if (window.__CHATBOT_BUILDER_TESTS_RAN__) return;
  window.__CHATBOT_BUILDER_TESTS_RAN__ = true;

  try {
    const proj = defaultProject();
    proj.flow.resposta = "INICIAL";
    proj.flow.children.push({
      uiId: uid(),
      comando: "Volta Redonda",
      resposta: "Ok",
      comandoTipo: 1,
      transferirParaHumano: false,
      voltarMenu: false,
      enviaMensagemComandoInvalido: false,
      statusParametroId: "693c190b0c3433d55d7610ab",
      isTemplate: false,
      templateName: "",
      templateCategory: "",
      children: [],
    });

    const { output, errors } = buildChatbotJson(proj);
    if (errors.length > 0) {
      console.warn("Self-test: erros detectados na configuração básica:", errors);
    }

    const childCmd = output.comandos.find((c) => c.comando === "Volta Redonda");
    console.assert(!!childCmd, "Self-test: comando filho deveria existir");

    const expectedOrder = [
      "_id",
      "idMensagemPai",
      "comando",
      "comandoTipo",
      "resposta",
      "transferirParaHumano",
      "voltarMenu",
      "enviaMensagemComandoInvalido",
      "statusParametroId",
    ];

    const keys = Object.keys(childCmd);
    console.assert(
      expectedOrder.every((k, i) => keys[i] === k),
      `Self-test: ordem das chaves incorreta. Esperado: ${expectedOrder.join(", ")} | Atual: ${keys.join(", ")}`
    );

    const rootCmd = output.comandos[0];
    const rootExpectedStart = ["_id", "idMensagemPai", "comando", "comandoTipo", "resposta"];
    console.assert(
      rootExpectedStart.every((k, i) => Object.keys(rootCmd)[i] === k),
      "Self-test: root deve iniciar com _id, comandoTipo, resposta"
    );
  } catch (e) {
    console.error("Self-tests falharam:", e);
  }
}

runSelfTestsOnce();

// --------
// Ícones inline (sem dependências externas)
// --------
const ICONS = {
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h10v10H9zM5 15V5h10",
  trash: "M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
  x: "M6 6l12 12M18 6L6 18",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  alert: "M12 9v4m0 4h.01M10.3 3.9L2.8 17a1.7 1.7 0 001.5 2.5h15.4a1.7 1.7 0 001.5-2.5L13.7 3.9a1.7 1.7 0 00-3.4 0z",
  message: "M4 5h16v11H8l-4 4V5z",
};

function Icon({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

// --------
// UI: componentes de apresentação
// --------

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}

function TypeBadge({ utilizaIA, hasInteractive }) {
  const text = utilizaIA ? "IA" : hasInteractive ? "Interativo" : "Texto";
  const cls = utilizaIA || hasInteractive ? "badge badge-accent" : "badge";
  return <span className={cls}>{text}</span>;
}

function TreeRow({
  node,
  level,
  isRoot,
  selectedId,
  onSelect,
  onAddChild,
  onDuplicate,
  onDelete,
  collapsed,
  onToggleCollapse,
  searchTerm,
}) {
  if (!subtreeMatches(node, searchTerm)) return null;

  const isSelected = selectedId === node.uiId;
  const hasChildren = (node.children || []).length > 0;
  const hasListSections = Number(node.mensagemInterativa?.tipo) === LISTA_INTERATIVA;
  const hasTreeContent = hasChildren || hasListSections;
  const isCollapsed = !searchTerm && collapsed.has(node.uiId);
  const hasIssue = nodeHasIssue(node, isRoot);

  const label = isRoot
    ? "INICIAL"
    : node.origemButtonIndex !== undefined
    ? node.comando || node.origemButtonTitulo || `Botão ${node.origemButtonIndex + 1}`
    : node.comando || "(sem comando)";

  const renderChildren = () => {
    if (Number(node.mensagemInterativa?.tipo) === LISTA_INTERATIVA) {
      const sections = normalizeListConfig(node.mensagemInterativa.lista).secoes;
      return sections.map((section, sectionIndex) => {
        const sectionChildren = node.children.filter((child) => child.origemListSectionUiId === section.uiId);
        const visibleChildren = sectionChildren.filter((child) => subtreeMatches(child, searchTerm));
        if (searchTerm && !visibleChildren.length) return null;
        return (
          <li className="tree-section-group" key={section.uiId}>
            <div className="tree-section-label">
              <span className="tree-section-marker" aria-hidden="true" />
              <span>Seção {sectionIndex + 1}{section.titulo.trim() ? `: ${section.titulo.trim()}` : ""}</span>
            </div>
            {visibleChildren.length > 0 && (
              <ul className="tree-children">
                {visibleChildren.map((child) => (
                  <TreeRow
                    key={child.uiId}
                    node={child}
                    level={level + 1}
                    isRoot={false}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onAddChild={onAddChild}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    collapsed={collapsed}
                    onToggleCollapse={onToggleCollapse}
                    searchTerm={searchTerm}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      });
    }

    return node.children.map((ch) => (
      <TreeRow
        key={ch.uiId}
        node={ch}
        level={level + 1}
        isRoot={false}
        selectedId={selectedId}
        onSelect={onSelect}
        onAddChild={onAddChild}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        searchTerm={searchTerm}
      />
    ));
  };

  return (
    <li className="tree-item">
      <div
        className={`tree-row${isSelected ? " is-selected" : ""}`}
        style={{ "--depth": level }}
      >
        {hasTreeContent ? (
          <button
            type="button"
            className="tree-caret"
            onClick={() => onToggleCollapse(node.uiId)}
            aria-label={isCollapsed ? "Expandir nó" : "Recolher nó"}
          >
            <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={14} />
          </button>
        ) : (
          <span className="tree-caret tree-caret-empty" aria-hidden="true" />
        )}

        <button type="button" className="tree-label" onClick={() => onSelect(node.uiId)}>
          <span className="tree-label-top">
            {hasIssue && <span className="dot dot-warn" title="Campos obrigatórios pendentes" />}
            <span className="tree-title">{label}</span>
            <TypeBadge utilizaIA={node.utilizaIA} hasInteractive={!!node.mensagemInterativa} />
            {node.isTemplate && <span className="badge badge-neutral">Template</span>}
          </span>
          <span className="tree-preview">
            {String(node.resposta || "").slice(0, 64) || "Sem resposta definida"}
            {String(node.resposta || "").length > 64 ? "…" : ""}
          </span>
        </button>

        <div className="tree-actions">
          <button type="button" className="icon-btn" title="Adicionar nó filho" onClick={() => onAddChild(node.uiId)}>
            <Icon name="plus" />
          </button>
          {!isRoot && (
            <button type="button" className="icon-btn" title="Duplicar fluxo para outro comando" onClick={() => onDuplicate(node.uiId)}>
              <Icon name="copy" />
            </button>
          )}
          {!isRoot && (
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              title="Excluir nó"
              onClick={() => onDelete(node.uiId)}
            >
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>

      {hasTreeContent && !isCollapsed && (
        <ul className="tree-children">
          {renderChildren()}
        </ul>
      )}
    </li>
  );
}

export default function App() {
  const [project, setProject] = useState(loadProject);

  const [selectedUiId, setSelectedUiId] = useState(() => project.flow.uiId);
  const [lastErrors, setLastErrors] = useState(() => []);
  const [categoryErrorMessage, setCategoryErrorMessage] = useState("");
  const [listActionError, setListActionError] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("global");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingProduction, setConfirmingProduction] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState(null);
  const [duplicateTargetId, setDuplicateTargetId] = useState("");
  const [copyOptions, setCopyOptions] = useState({
    copyResponse: true,
    copyInteractive: true,
    copyBehavior: false,
    behaviorFields: {
      transferirParaHumano: true,
      voltarMenu: true,
      enviaMensagemComandoInvalido: true,
      utilizaIA: true,
      alterarStatus: true,
      statusParametroId: true,
    },
    related: {
      copyResponse: true,
      copyBehavior: false,
      copyStatus: false,
    },
  });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  function selectNode(uiId) {
    setCategoryErrorMessage("");
    setListActionError("");
    setSelectedUiId(uiId);
  }

  function showToast(message, tone = "default") {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }

  const selectedNode = useMemo(() => findNode(project.flow, selectedUiId) || project.flow, [project, selectedUiId]);
  const duplicateTargets = useMemo(() => flattenNodes(project.flow).filter((node) => node.uiId !== duplicateSourceId && !isDescendant(project.flow, duplicateSourceId, node.uiId)), [project, duplicateSourceId]);
  const isRootSelected = selectedNode.uiId === project.flow.uiId;
  const selectedList = normalizeListConfig(selectedNode.mensagemInterativa?.lista);
  const listOptionCount = selectedList.secoes.reduce((total, secao) => total + secao.opcoes.length, 0);
  const listUiErrors = useMemo(() => getListUiErrors(selectedList), [selectedList]);

  const path = useMemo(() => getPath(project.flow, selectedUiId), [project, selectedUiId]);

  const availableTabs = useMemo(() => {
    if (isRootSelected) {
      const tabs = [
        { key: "global", label: "Configurações globais" },
        { key: "mensagem", label: "Mensagem" },
      ];
      tabs.push({ key: "interativo", label: "Interativo" });
      tabs.push({ key: "comportamento", label: "Comportamento" });
      return tabs;
    }

    const tabs = [
      { key: "mensagem", label: "Mensagem" },
      { key: "comportamento", label: "Comportamento" },
      { key: "interativo", label: "Interativo" },
    ];
    return tabs;
  }, [isRootSelected]);

  const effectiveTab = availableTabs.some((t) => t.key === activeTab) ? activeTab : availableTabs[0]?.key || "mensagem";

  const stats = useMemo(() => {
    let total = 0;
    let templates = 0;
    let issues = 0;
    function walk(node, isRoot) {
      total += 1;
      if (node.isTemplate) templates += 1;
      if (nodeHasIssue(node, isRoot)) issues += 1;
      (node.children || []).forEach((ch) => walk(ch, false));
    }
    walk(project.flow, true);
    return { total, templates, issues };
  }, [project]);

  function updateProjectField(field, value) {
    setProject((p) => ({ ...p, [field]: value }));
  }

  function updateInatividadeField(field, value) {
    setProject((p) => ({
      ...p,
      tempoInatividade: { ...(p.tempoInatividade || {}), [field]: value },
    }));
  }

  const FEATURE_DYNAMIC_INTERACTIVE_NODES = true; // MARCO: rollback flag for dynamic interactive node generation

  function createInteractiveChildNode(button, index) {
    const comando = button.comando?.trim() || button.titulo?.trim() || `Botão ${index + 1}`;
    return {
      uiId: uid(),
      comando,
      resposta: `Resposta para ${button.titulo?.trim() || comando}`,
      comandoTipo: 1,
      transferirParaHumano: false,
      voltarMenu: false,
      enviaMensagemComandoInvalido: false,
      statusParametroId: "",
      isTemplate: false,
      templateName: "",
      templateCategory: "",
      mensagemInterativa: null,
      origemButtonIndex: index,
      origemButtonTitulo: button.titulo?.trim() || "",
      children: [],
    };
  }

  function createListOptionChildNode(option, index) {
    const comando = option.titulo?.trim() || `Opção ${index + 1}`;
    return {
      uiId: uid(),
      comando,
      resposta: `Resposta para ${comando}`,
      comandoTipo: 1,
      transferirParaHumano: false,
      voltarMenu: false,
      enviaMensagemComandoInvalido: false,
      utilizaIA: false,
      statusParametroId: "",
      isTemplate: false,
      templateName: "",
      templateCategory: "",
      mensagemInterativa: null,
      origemListOptionUiId: option.uiId,
      children: [],
    };
  }

  function syncListOptionChildren(node) {
    const sections = normalizeListConfig(node.mensagemInterativa?.lista).secoes;
    const existingChildren = node.children || [];
    const previousOptionChildren = [];
    const collectOptionChildren = (children) => {
      (children || []).forEach((child) => {
        if (child.origemListOptionUiId !== undefined) previousOptionChildren.push(child);
        collectOptionChildren(child.children);
      });
    };
    collectOptionChildren(existingChildren);

    const manualChildren = existingChildren.filter(
      (child) => child.origemListOptionUiId === undefined && child.origemListSectionUiId === undefined
    );
    const options = sections.flatMap((section) => section.opcoes);
    const optionChildren = options
      .filter((option) => String(option.titulo || "").trim().toLowerCase() !== "voltar")
      .map((option, index) => {
        const existing = previousOptionChildren.find((child) => child.origemListOptionUiId === option.uiId);
        const comando = option.titulo?.trim() || `Opção ${index + 1}`;
        const section = sections.find((item) => item.opcoes.some((itemOption) => itemOption.uiId === option.uiId));
        if (existing) {
          existing.comando = comando;
          existing.origemListOptionUiId = option.uiId;
          existing.origemListSectionUiId = section?.uiId;
          return existing;
        }
        const optionNode = createListOptionChildNode(option, index);
        optionNode.origemListSectionUiId = section?.uiId;
        return optionNode;
      });
    node.children = [...manualChildren, ...optionChildren];
  }

  function syncInteractiveChildren(node) {
    if (!FEATURE_DYNAMIC_INTERACTIVE_NODES) return;

    if (Number(node.mensagemInterativa?.tipo) === LISTA_INTERATIVA) {
      syncListOptionChildren(node);
      return;
    }

    const shouldHaveInteractiveChildren = node.mensagemInterativa && Number(node.mensagemInterativa.tipo) === 1;
    if (!shouldHaveInteractiveChildren) {
      if (node.children?.length) {
        node.children = node.children.filter((child) => child.origemButtonIndex === undefined);
      }
      return;
    }

    const buttons = node.mensagemInterativa.botoes || [];
    const activeButtons = buttons
      .map((button, index) => ({ button, index }))
      .filter(({ button }) => {
        const isVoltar = [button.comando, button.titulo]
          .some((value) => String(value || "").trim().toLowerCase() === "voltar");
        return (button.titulo?.trim() || button.comando?.trim()) && !isVoltar;
      });

    const existingChildren = node.children || [];
    const manualChildren = existingChildren.filter((child) => child.origemButtonIndex === undefined);
    const dynamicChildren = activeButtons.map(({ button, index }) => {
      const existing = existingChildren.find((child) => child.origemButtonIndex === index);
      if (existing) {
        existing.comando = button.comando?.trim() || button.titulo?.trim() || `Botão ${index + 1}`;
        existing.origemButtonTitulo = button.titulo?.trim() || "";
        existing.origemButtonIndex = index;
        return existing;
      }
      return createInteractiveChildNode(button, index);
    });

    node.children = [...manualChildren, ...dynamicChildren];
  }

  function updateSelectedNodeField(field, value) {
    setProject((p) => {
      const next = deepClone(p);
      const node = findNode(next.flow, selectedUiId);
      if (!node) return p;
      if (field === "comandoTipo") {
        if (Number(value) === 3) {
          node.isTemplate = false;
          node.templateName = "";
          node.templateCategory = "";
        }
        node[field] = value;
        syncInteractiveChildren(node);
      } else {
        node[field] = value;
      }
      return next;
    });
  }

  function updateSelectedNodeMensagemInterativa(updater) {
    setProject((p) => {
      const next = deepClone(p);
      const node = findNode(next.flow, selectedUiId);
      if (!node) return p;
      const current = node.mensagemInterativa || { tipo: 1, botoes: [] };
      node.mensagemInterativa = updater(current);
      syncInteractiveChildren(node);
      return next;
    });
  }

  function setMensagemInterativaTipo(tipo) {
    updateSelectedNodeMensagemInterativa((current) => ({
      ...current,
      tipo,
      ...(Number(tipo) === LISTA_INTERATIVA
        ? { lista: current.lista || createListConfig() }
        : { botoes: current.botoes && current.botoes.length > 0 ? current.botoes : [{ titulo: "", comando: "" }, { titulo: "", comando: "" }] }),
    }));
  }

  function updateListConfig(updater) {
    updateSelectedNodeMensagemInterativa((current) => ({
      ...current,
      tipo: LISTA_INTERATIVA,
      lista: updater(normalizeListConfig(current.lista)),
    }));
  }

  function updateListField(field, value) {
    updateListConfig((lista) => ({ ...lista, [field]: value }));
  }

  function updateListSection(sectionId, field, value) {
    setListActionError("");
    updateListConfig((lista) => ({
      ...lista,
      secoes: lista.secoes.map((secao) => (secao.uiId === sectionId ? { ...secao, [field]: value } : secao)),
    }));
  }

  function addListSection() {
    const invalidSectionIndex = selectedList.secoes.findIndex(
      (section) => !section.opcoes.some((option) => String(option.titulo || "").trim())
    );
    if (invalidSectionIndex >= 0) {
      setListActionError(`Preencha pelo menos uma opção válida na seção ${invalidSectionIndex + 1} antes de adicionar outra seção.`);
      return;
    }
    if (selectedList.secoes.length >= MAX_LIST_SECTIONS) return;
    if (listOptionCount >= MAX_LIST_OPTIONS) {
      setListActionError("O limite máximo de 10 opções da lista já foi atingido.");
      return;
    }
    setListActionError("");
    updateListConfig((lista) => ({ ...lista, secoes: [...lista.secoes, createListSection()] }));
  }

  function removeListSection(sectionId) {
    if (selectedList.secoes.length <= 1) {
      setListActionError("A lista deve possuir pelo menos uma seção. Não é possível remover a última seção.");
      return;
    }
    setListActionError("");
    updateListConfig((lista) => ({ ...lista, secoes: lista.secoes.filter((secao) => secao.uiId !== sectionId) }));
  }

  function addListOption(sectionId) {
    setListActionError("");
    updateListConfig((lista) => {
      const total = lista.secoes.reduce((count, secao) => count + secao.opcoes.length, 0);
      if (total >= MAX_LIST_OPTIONS) return lista;
      return {
        ...lista,
        secoes: lista.secoes.map((secao) =>
          secao.uiId === sectionId ? { ...secao, opcoes: [...secao.opcoes, { uiId: uid(), titulo: "", descricao: "" }] } : secao
        ),
      };
    });
  }

  function updateListOption(sectionId, optionId, field, value) {
    setListActionError("");
    updateListConfig((lista) => ({
      ...lista,
      secoes: lista.secoes.map((secao) =>
        secao.uiId === sectionId
          ? { ...secao, opcoes: secao.opcoes.map((opcao) => (opcao.uiId === optionId ? { ...opcao, [field]: value } : opcao)) }
          : secao
      ),
    }));
  }

  function removeListOption(sectionId, optionId) {
    const section = selectedList.secoes.find((item) => item.uiId === sectionId);
    if (section?.opcoes.length <= 1) {
      setListActionError("Cada seção deve possuir pelo menos uma opção. Não é possível remover a última opção da seção.");
      return;
    }
    setListActionError("");
    setProject((p) => {
      const next = deepClone(p);
      const node = findNode(next.flow, selectedUiId);
      if (!node) return p;

      const lista = normalizeListConfig(node.mensagemInterativa?.lista);
      node.mensagemInterativa = {
        ...node.mensagemInterativa,
        tipo: LISTA_INTERATIVA,
        lista: {
          ...lista,
          secoes: lista.secoes.map((secao) =>
            secao.uiId === sectionId
              ? { ...secao, opcoes: secao.opcoes.filter((opcao) => opcao.uiId !== optionId) }
              : secao
          ),
        },
      };
      node.children = (node.children || []).filter((child) => child.origemListOptionUiId !== optionId);
      syncListOptionChildren(node);
      return next;
    });
  }

  function updateMensagemInterativaButton(index, field, value) {
    updateSelectedNodeMensagemInterativa((current) => {
      const botoes = [...(current.botoes || [])];
      while (botoes.length <= index) {
        botoes.push({ titulo: "", comando: "" });
      }
      botoes[index] = { ...botoes[index], [field]: value };
      return { ...current, botoes };
    });
  }

  function setMensagemInterativaButtonsCount(count) {
    updateSelectedNodeMensagemInterativa((current) => {
      const botoes = [...(current.botoes || [])];
      while (botoes.length < count) {
        botoes.push({ titulo: "", comando: "" });
      }
      return { ...current, botoes: botoes.slice(0, count) };
    });
  }

  function addChild(parentUiId) {
    let newId = null;
    setProject((p) => {
      const next = deepClone(p);
      const parent = findNode(next.flow, parentUiId);
      if (!parent) return p;

      newId = uid();
      parent.children = parent.children || [];
      parent.children.push({
        uiId: newId,
        comando: "Novo comando",
        resposta: "Nova resposta",
        comandoTipo: 1,
        transferirParaHumano: false,
        voltarMenu: false,
        enviaMensagemComandoInvalido: false,
        statusParametroId: "",
        isTemplate: false,
        templateName: "",
        templateCategory: "",
        mensagemInterativa: null,
        children: [],
      });

      return next;
    });
    setCollapsed((c) => {
      if (!c.has(parentUiId)) return c;
      const next = new Set(c);
      next.delete(parentUiId);
      return next;
    });
    if (newId) {
      setActiveTab("mensagem");
      setSelectedUiId(newId);
    }
  }

  function startDuplicateFlow(uiIdToDup) {
    const source = findNode(project.flow, uiIdToDup);
    const parent = findParent(project.flow, uiIdToDup);
    if (!source || !parent) return;
    const targets = flattenNodes(project.flow).filter(
      (node) => node.uiId !== uiIdToDup && !isDescendant(project.flow, uiIdToDup, node.uiId)
    );
    setDuplicateSourceId(uiIdToDup);
    setDuplicateTargetId(parent.uiId && targets.some((node) => node.uiId === parent.uiId) ? parent.uiId : targets[0]?.uiId || "");
  }

  function duplicateNode(uiIdToDup, targetUiId) {
    setProject((p) => {
      const next = deepClone(p);
      if (uiIdToDup === next.flow.uiId) return p;

      const node = findNode(next.flow, uiIdToDup);
      const target = findNode(next.flow, targetUiId);
      if (!node || !target || isDescendant(next.flow, uiIdToDup, targetUiId)) return p;

      target.children = target.children || [];
      target.children.push(duplicateSubtree(node));
      return next;
    });
    setDuplicateSourceId(null);
    setDuplicateTargetId("");
    showToast("Fluxo duplicado no comando selecionado.");
  }

  function copyInteraction(sourceUiId, targetUiId, options) {
    const sourceNode = findNode(project.flow, sourceUiId);
    const targetNode = findNode(project.flow, targetUiId);
    if (!sourceNode || !targetNode) {
      showToast("Não foi possível localizar a origem ou o destino.", "danger");
      return;
    }
    if (options.copyInteractive && !sourceNode.mensagemInterativa) {
      showToast("A interação de origem não está configurada.", "danger");
      return;
    }
    if (
      options.copyInteractive &&
      targetNode.mensagemInterativa &&
      Number(sourceNode.mensagemInterativa.tipo) !== Number(targetNode.mensagemInterativa.tipo)
    ) {
      showToast("A interação de origem e a interação de destino precisam ser do mesmo tipo.", "danger");
      return;
    }

    setProject((p) => {
      const next = deepClone(p);
      const source = findNode(next.flow, sourceUiId);
      const target = findNode(next.flow, targetUiId);
      const sourceInteraction = source?.mensagemInterativa;
      const targetInteraction = target?.mensagemInterativa;
      if (!target) return p;

      const copyBehaviorFields = (sourceNode, targetNode, fields) => {
        fields.forEach((field) => {
          if (field === "alterarStatus") {
            targetNode.alterarStatus = sourceNode.alterarStatus;
          } else if (field === "statusParametroId") {
            targetNode.statusParametroId = sourceNode.statusParametroId;
          } else {
            targetNode[field] = sourceNode[field];
          }
        });
      };

      const copyRelatedNode = (sourceRelated, targetRelated) => {
        if (options.related.copyResponse) targetRelated.resposta = sourceRelated.resposta;
        if (options.related.copyBehavior) {
          copyBehaviorFields(
            sourceRelated,
            targetRelated,
            Object.entries(options.behaviorFields)
              .filter(([, enabled]) => enabled)
              .map(([field]) => field)
          );
        }
        if (options.related.copyStatus) {
          targetRelated.alterarStatus = sourceRelated.alterarStatus;
          targetRelated.statusParametroId = sourceRelated.statusParametroId;
        }

        if (options.copyInteractive && sourceRelated.mensagemInterativa) {
          if (!targetRelated.mensagemInterativa) {
            targetRelated.mensagemInterativa = deepClone(sourceRelated.mensagemInterativa);
          } else if (Number(sourceRelated.mensagemInterativa.tipo) === Number(targetRelated.mensagemInterativa.tipo)) {
            mergeInteraction(sourceRelated, targetRelated);
          }
          syncInteractiveChildren(targetRelated);
          const sourceChildren = sourceRelated.children || [];
          const targetChildren = targetRelated.children || [];
          sourceChildren.forEach((sourceChild) => {
            const targetChild = targetChildren.find(
              (candidate) => candidate.comando?.trim().toLowerCase() === sourceChild.comando?.trim().toLowerCase()
            );
            if (targetChild) copyRelatedNode(sourceChild, targetChild);
          });
        }
      };

      const mergeInteraction = (sourceNode, targetNode) => {
        const sourceInteraction = sourceNode.mensagemInterativa;
        const targetInteraction = targetNode.mensagemInterativa;
        if (!sourceInteraction || !targetInteraction) return;
        if (Number(sourceInteraction.tipo) === LISTA_INTERATIVA) {
          const sourceList = normalizeListConfig(sourceInteraction.lista);
          const targetList = normalizeListConfig(targetInteraction.lista);
          const existingOptionTitles = new Set(
            targetList.secoes.flatMap((section) => section.opcoes.map((option) => option.titulo.trim().toLowerCase()))
          );
          let nextTotal = targetList.secoes.reduce((total, section) => total + section.opcoes.length, 0);
          const mergedSections = [...targetList.secoes];
          sourceList.secoes.forEach((sourceSection) => {
            const sectionTitle = sourceSection.titulo.trim().toLowerCase();
            let targetSection = mergedSections.find((section) => section.titulo.trim().toLowerCase() === sectionTitle);
            if (!targetSection && mergedSections.length < MAX_LIST_SECTIONS) {
              targetSection = { ...deepClone(sourceSection), uiId: uid(), opcoes: [] };
              mergedSections.push(targetSection);
            }
            sourceSection.opcoes.forEach((sourceOption) => {
              const optionTitle = sourceOption.titulo.trim().toLowerCase();
              if (targetSection && optionTitle && !existingOptionTitles.has(optionTitle) && nextTotal < MAX_LIST_OPTIONS) {
                targetSection.opcoes.push({ ...deepClone(sourceOption), uiId: uid() });
                existingOptionTitles.add(optionTitle);
                nextTotal += 1;
              }
            });
          });
          targetNode.mensagemInterativa = { ...targetInteraction, lista: { ...targetList, secoes: mergedSections } };
        } else {
          const targetButtons = targetInteraction.botoes || [];
          const existingTitles = new Set(targetButtons.map((button) => (button.titulo || button.comando || "").trim().toLowerCase()));
          const newButtons = (sourceInteraction.botoes || [])
            .filter((button) => {
              const title = (button.titulo || button.comando || "").trim().toLowerCase();
              return title && !existingTitles.has(title);
            })
            .map((button) => ({ ...deepClone(button) }));
          targetNode.mensagemInterativa = { ...targetInteraction, botoes: [...targetButtons, ...newButtons] };
        }
      };

      if (options.copyResponse) target.resposta = source.resposta;
      if (options.copyBehavior) {
        copyBehaviorFields(
          source,
          target,
          Object.entries(options.behaviorFields)
            .filter(([, enabled]) => enabled)
            .map(([field]) => field)
        );
      }

      if (!options.copyInteractive || !sourceInteraction) return next;

      if (!targetInteraction) target.mensagemInterativa = deepClone(sourceInteraction);
      else mergeInteraction(source, target);

      syncInteractiveChildren(target);
      (source.children || []).forEach((sourceChild) => {
        const targetChild = (target.children || []).find(
          (candidate) => candidate.comando?.trim().toLowerCase() === sourceChild.comando?.trim().toLowerCase()
        );
        if (targetChild) copyRelatedNode(sourceChild, targetChild);
      });
      return next;
    });
    setDuplicateSourceId(null);
    setDuplicateTargetId("");
    showToast("Interações adicionadas ao comando selecionado.");
  }

  function deleteNode(uiIdToDelete) {
    setProject((p) => {
      const next = deepClone(p);
      if (uiIdToDelete === next.flow.uiId) return p;

      const node = findNode(next.flow, uiIdToDelete);
      const parent = findParent(next.flow, uiIdToDelete);
      if (!node || !parent) return p;

      if (node.origemButtonIndex !== undefined && parent.mensagemInterativa?.botoes) {
        const removedButtonIndex = node.origemButtonIndex;
        parent.mensagemInterativa.botoes = parent.mensagemInterativa.botoes.filter(
          (_, index) => index !== removedButtonIndex
        );
        parent.children = parent.children
          .filter((child) => child.uiId !== uiIdToDelete)
          .map((child) =>
            child.origemButtonIndex !== undefined && child.origemButtonIndex > removedButtonIndex
              ? { ...child, origemButtonIndex: child.origemButtonIndex - 1 }
              : child
          );
      } else if (node.origemListOptionUiId !== undefined && parent.mensagemInterativa?.lista) {
        const optionId = node.origemListOptionUiId;
        parent.mensagemInterativa.lista.secoes = parent.mensagemInterativa.lista.secoes.map((section) => ({
          ...section,
          opcoes: section.opcoes.filter((option) => option.uiId !== optionId),
        }));
        parent.children = parent.children.filter((child) => child.uiId !== uiIdToDelete);
      } else {
        removeNode(next.flow, uiIdToDelete);
      }
      return next;
    });

    if (uiIdToDelete === selectedUiId) setSelectedUiId(project.flow.uiId);
    showToast("Nó excluído.");
  }

  function toggleCollapse(uiId) {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(uiId)) next.delete(uiId);
      else next.add(uiId);
      return next;
    });
  }

  function resetProject() {
    const fresh = defaultProject();
    setProject(fresh);
    setSelectedUiId(fresh.flow.uiId);
    setActiveTab("global");
    setLastErrors([]);
    setConfirmingReset(false);
    setConfirmingProduction(false);
    showToast("Projeto reiniciado.");
  }

  function generateAndDownload() {
    if (project.ambiente === "production" && !project.tenant?.trim()) {
      setLastErrors(["Tenant é obrigatório para exportação em produção."]);
      showToast("Informe o tenant antes de exportar para produção.", "danger");
      return;
    }

    if (project.ambiente === "production" && !project.filialId) {
      setLastErrors(["filialId é obrigatório para exportação em produção."]);
      showToast("Informe o filialId antes de exportar para produção.", "danger");
      return;
    }

    if (project.ambiente === "production" && !confirmingProduction) {
      setConfirmingProduction(true);
      return;
    }

    const environment = project.ambiente === "production" ? "production" : "staging";
    const res = buildChatbotJson(project, environment);
    setLastErrors(res.errors);

    if (res.errors.length > 0) {
      showToast(`${res.errors.length} erro(s) de validação. Corrija antes de exportar.`, "danger");
      return;
    }

    const suffix = environment === "production" ? "PROD" : "STG";
    const descriptionSlug = fileSlug(project.descricao);
    downloadJson(`chatbot-${descriptionSlug}-${suffix}.json`, res.output);

    if (res.templates.length > 0) {
      const templatesOutput = {
        tenant: environment === "production" ? String(project.tenant || "").toLowerCase() : STAGING_TENANT,
        filialId: environment === "production" ? Number(project.filialId) : STAGING_FILIAL_ID,
        templatesTwilio: [],
        templatesDialog360: res.templates,
      };
      downloadJson(`templates-${descriptionSlug}-${suffix}.json`, templatesOutput);
    }

    setConfirmingProduction(false);
    showToast(`Arquivos de ${environment === "production" ? "produção" : "staging"} gerados e baixados.`, "success");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="message" size={20} />
          </span>
          <div>
            <div className="topbar-title-row">
              <h1>Chatbot Flow</h1>
              <span
                className={`environment-badge ${project.ambiente === "production" ? "environment-production" : "environment-staging"}`}
                aria-label={`Ambiente: ${project.ambiente === "production" ? "produção" : "staging"}`}
              >
                {project.ambiente === "production" ? "PRODUÇÃO" : "STAGING"}
              </span>
            </div>
            <p className="topbar-sub">
              {project.ambiente === "production"
                ? `${project.tenant || "sem tenant"} · filial ${project.filialId || "—"}`
                : "validação antes da ativação em produção"}
            </p>
          </div>
        </div>

        <div className="topbar-right">
          {!confirmingReset ? (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirmingReset(true)}>
              Reiniciar projeto
            </button>
          ) : (
            <div className="confirm-inline">
              <span>Apagar tudo e recomeçar?</span>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmingReset(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={resetProject}>
                Confirmar
              </button>
            </div>
          )}
        </div>
      </header>

      {project.ambiente !== "production" && (
        <div className="environment-notice" role="status">
          <Icon name="alert" size={16} />
          <span>
            <strong>Ambiente de staging:</strong> informe no chamado que este bot será validado em staging antes de ir para produção.
          </span>
        </div>
      )}

      <div className="workbench">
        <section className="panel panel-tree" aria-label="Árvore de comandos">
          <div className="panel-head">
            <h2>Árvore de comandos</h2>
          </div>

          <div className="search-field">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Buscar por comando ou resposta"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" className="search-clear" onClick={() => setSearchTerm("")} aria-label="Limpar busca">
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          <ul className="tree-root">
            <TreeRow
              node={project.flow}
              level={0}
              isRoot={true}
              selectedId={selectedUiId}
              onSelect={selectNode}
              onAddChild={addChild}
              onDuplicate={startDuplicateFlow}
              onDelete={deleteNode}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              searchTerm={searchTerm}
            />
          </ul>
        </section>

        <section className="panel panel-editor" aria-label="Edição do nó">
          <div className="breadcrumb">
            {path.map((n, i) => (
              <span key={n.uiId} className="breadcrumb-item">
                {i > 0 && (
                  <span className="breadcrumb-sep">
                    <Icon name="chevronRight" size={12} />
                  </span>
                )}
                <span className={i === path.length - 1 ? "breadcrumb-current" : ""}>
                  {i === 0 ? "INICIAL" : n.comando || n.origemButtonTitulo || "(sem comando)"}
                </span>
              </span>
            ))}
          </div>

          <div className="tabs" role="tablist">
            {availableTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={effectiveTab === t.key}
                className={`tab${effectiveTab === t.key ? " is-active" : ""}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tab-panel">
            {effectiveTab === "mensagem" && (
              <div className="field-stack">
                {!isRootSelected && (
                  <label className="field">
                    <span className="field-label">Comando (texto que o usuário escolhe)</span>
                    <input
                      className="input input-mono"
                      value={selectedNode.comando || ""}
                      onChange={(e) => updateSelectedNodeField("comando", e.target.value)}
                    />
                  </label>
                )}

                {isRootSelected && <p className="hint">Esta é a mensagem inicial enviada pelo bot antes de qualquer comando.</p>}

                <label className="field">
                  <span className="field-label">Resposta</span>
                  <textarea
                    className="input textarea"
                    value={selectedNode.resposta || ""}
                    onChange={(e) => updateSelectedNodeField("resposta", e.target.value)}
                  />
                </label>

                <div className="section-divider">
                  <span>Template</span>
                </div>

                <Toggle
                  label="Esse comando é um template?"
                  checked={!!selectedNode.isTemplate}
                  onChange={(v) => updateSelectedNodeField("isTemplate", v)}
                />

                {selectedNode.isTemplate && (
                  <>
                    <label className="field">
                      <span className="field-label">Nome do template</span>
                      <input
                        className="input input-mono"
                        value={selectedNode.templateName || ""}
                        onChange={(e) => updateSelectedNodeField("templateName", e.target.value)}
                      />
                    </label>

                    <div className="field">
                      <span className="field-label">Categoria do template</span>
                      <div className="segmented">
                        <button
                          type="button"
                          className={`segmented-btn${selectedNode.templateCategory === "Utility" ? " is-active" : ""}`}
                          onClick={() => {
                            updateSelectedNodeField("templateCategory", "Utility");
                            setCategoryErrorMessage("");
                          }}
                        >
                          Utility
                        </button>
                        <button
                          type="button"
                          className="segmented-btn"
                          onClick={() => setCategoryErrorMessage("Não é permitido cadastrar templates do tipo marketing para o chatbot")}
                        >
                          Marketing
                        </button>
                      </div>
                      {categoryErrorMessage && <p className="field-error">{categoryErrorMessage}</p>}
                    </div>
                  </>
                )}
              </div>
            )}

            {effectiveTab === "comportamento" && (
              <div className="field-stack">
                <div className="toggle-group">
                  <Toggle
                    label="Transferir para humano"
                    checked={!!selectedNode.transferirParaHumano}
                    onChange={(v) => updateSelectedNodeField("transferirParaHumano", v)}
                  />
                  <Toggle
                    label="Voltar menu anterior"
                    checked={!!selectedNode.voltarMenu}
                    onChange={(v) => updateSelectedNodeField("voltarMenu", v)}
                  />
                  <Toggle
                    label="Enviar mensagem de comando inválido"
                    checked={!!selectedNode.enviaMensagemComandoInvalido}
                    onChange={(v) => updateSelectedNodeField("enviaMensagemComandoInvalido", v)}
                  />
                  <Toggle
                    label="Enviar anexo para leitura da IA"
                    checked={!!selectedNode.utilizaIA}
                    onChange={(v) => updateSelectedNodeField("utilizaIA", v)}
                  />
                  <Toggle
                    label="Alterar status do atendimento"
                    checked={selectedNode.alterarStatus ?? Boolean(selectedNode.statusParametroId)}
                    onChange={(v) => {
                      updateSelectedNodeField("alterarStatus", v);
                      if (!v) updateSelectedNodeField("statusParametroId", "");
                    }}
                  />
                  {(selectedNode.alterarStatus ?? Boolean(selectedNode.statusParametroId)) && (
                    <label className="field field-inline">
                      <span className="field-label">ID do status</span>
                      <input
                        className="input input-mono"
                        value={selectedNode.statusParametroId || ""}
                        onChange={(e) => updateSelectedNodeField("statusParametroId", e.target.value)}
                        placeholder="ex.: 693c190b0c3433d55d7610ab"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {effectiveTab === "interativo" && (
              <div className="field-stack">
                <div className="field">
                  <span className="field-label">Tipo de mensagem</span>
                  <div className="segmented">
                    <button
                      type="button"
                      className={`segmented-btn${selectedNode.mensagemInterativa?.tipo === 1 ? " is-active" : ""}`}
                      onClick={() => setMensagemInterativaTipo(1)}
                    >
                      Botões
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn${selectedNode.mensagemInterativa?.tipo === 2 ? " is-active" : ""}`}
                      onClick={() => setMensagemInterativaTipo(2)}
                    >
                      Lista
                    </button>
                  </div>
                </div>

                {selectedNode.mensagemInterativa?.tipo === 1 && (
                  <>
                    <label className="field field-inline">
                      <span className="field-label">Quantidade de botões</span>
                      <select
                        className="input"
                        style={{ maxWidth: 160 }}
                        value={(selectedNode.mensagemInterativa?.botoes || []).length || 2}
                        onChange={(e) => setMensagemInterativaButtonsCount(Number(e.target.value))}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </label>
                    <p className="hint">Ao preencher um botão, um nó filho é criado automaticamente na árvore para configurar o comando relacionado.</p>

                    <div className="button-grid">
                      {(selectedNode.mensagemInterativa?.botoes || [{ titulo: "", comando: "" }, { titulo: "", comando: "" }]).map((botao, index) => (
                        <div key={index} className="button-card">
                          <span className="button-card-label">Botão {index + 1}</span>
                          <label className="field">
                            <span className="field-label">Texto do botão</span>
                            <input
                              className="input"
                              value={botao.titulo || ""}
                              onChange={(e) => updateMensagemInterativaButton(index, "titulo", e.target.value)}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {selectedNode.mensagemInterativa?.tipo === 2 && (
                  <div className="list-editor">
                    <div className="list-editor-header">
                      <div>
                        <h3>Configurar lista</h3>
                        <p className="hint">Configure a mensagem, as seções e as opções da lista.</p>
                      </div>
                      <span className="list-counter">{listOptionCount}/10 opções</span>
                    </div>

                    <div className="list-message-fields">
                      <label className="field">
                        <span className="field-label">Cabeçalho da mensagem <span className="field-optional">(opcional)</span></span>
                        <input
                          className="input"
                          maxLength={55}
                          value={selectedList.cabecalho}
                          onChange={(e) => updateListField("cabecalho", e.target.value)}
                        />
                        <span className="character-count">{selectedList.cabecalho.length}/55</span>
                      </label>
                      <label className="field">
                        <span className="field-label">Rodapé da mensagem <span className="field-optional">(opcional)</span></span>
                        <input
                          className="input"
                          maxLength={55}
                          value={selectedList.rodape}
                          onChange={(e) => updateListField("rodape", e.target.value)}
                        />
                        <span className="character-count">{selectedList.rodape.length}/55</span>
                      </label>
                      <label className="field">
                        <span className="field-label">Título do botão <span className="field-required">(obrigatório)</span></span>
                        <input
                          className="input"
                          maxLength={20}
                          value={selectedList.tituloBotao}
                          onChange={(e) => updateListField("tituloBotao", e.target.value)}
                        />
                        <span className="character-count">{selectedList.tituloBotao.length}/20</span>
                      </label>
                    </div>

                    <div className="list-sections-header">
                      <div>
                        <span className="field-label">Seções</span>
                        <span className="hint"> Cada seção precisa de pelo menos uma opção válida.</span>
                        {listActionError && <p className="field-error">{listActionError}</p>}
                      </div>
                      <button type="button" className="btn btn-ghost" onClick={addListSection} disabled={selectedList.secoes.length >= MAX_LIST_SECTIONS || listOptionCount >= MAX_LIST_OPTIONS}>
                        <Icon name="plus" size={14} /> Adicionar nova seção
                      </button>
                    </div>

                    {selectedList.secoes.map((secao, sectionIndex) => (
                      <div className="list-section" key={secao.uiId}>
                        <div className="list-section-header">
                          <label className="field list-section-title">
                            <span className="field-label">Seção {sectionIndex + 1} <span className="field-optional">(título opcional)</span></span>
                            <input
                              className="input"
                              maxLength={24}
                              value={secao.titulo}
                              onChange={(e) => updateListSection(secao.uiId, "titulo", e.target.value)}
                            />
                            <span className="character-count">{secao.titulo.length}/24</span>
                            {listUiErrors.sectionErrors[secao.uiId] && <span className="field-error">{listUiErrors.sectionErrors[secao.uiId]}</span>}
                          </label>
                          <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => removeListSection(secao.uiId)}>
                            Remover seção
                          </button>
                        </div>

                        {!secao.opcoes.length && <p className="empty-list-options">Não existe opções cadastradas</p>}
                        <div className="list-options">
                          {secao.opcoes.map((opcao, optionIndex) => (
                            <div className="list-option" key={opcao.uiId}>
                              <div className="list-option-title-row">
                                <span className="list-option-index">Opção {optionIndex + 1}</span>
                                <button type="button" className="icon-btn icon-btn-danger" title="Remover opção" onClick={() => removeListOption(secao.uiId, opcao.uiId)}>
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                              <label className="field">
                                <span className="field-label">Título da opção <span className="field-required">(obrigatório)</span></span>
                                <input
                                  className="input"
                                  maxLength={24}
                                  value={opcao.titulo}
                                  onChange={(e) => updateListOption(secao.uiId, opcao.uiId, "titulo", e.target.value)}
                                />
                                <span className="character-count">{opcao.titulo.length}/24</span>
                              </label>
                              <label className="field">
                                <span className="field-label">Descrição <span className="field-optional">(opcional)</span></span>
                                <input
                                  className="input"
                                  maxLength={65}
                                  value={opcao.descricao}
                                  onChange={(e) => updateListOption(secao.uiId, opcao.uiId, "descricao", e.target.value)}
                                />
                                <span className="character-count">{opcao.descricao.length}/65</span>
                              </label>
                              {(listUiErrors.optionErrors[opcao.uiId] || []).map((error) => <span className="field-error" key={error}>{error}</span>)}
                            </div>
                          ))}
                        </div>
                        <button type="button" className="btn btn-ghost list-add-option" onClick={() => addListOption(secao.uiId)} disabled={listOptionCount >= MAX_LIST_OPTIONS}>
                          <Icon name="plus" size={14} /> Adicionar opção
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="hint hint-muted">A mensagem só será exportada como interativa quando houver botões ou uma lista configurada.</p>
              </div>
            )}

            {effectiveTab === "global" && isRootSelected && (
              <div className="field-stack">
                <div className="field">
                  <span className="field-label">Ambiente de validação</span>
                  <div className="segmented">
                    <button
                      type="button"
                      className={`segmented-btn${project.ambiente !== "production" ? " is-active" : ""}`}
                      onClick={() => {
                        updateProjectField("ambiente", "staging");
                        setConfirmingProduction(false);
                      }}
                    >
                      Staging
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn${project.ambiente === "production" ? " is-active" : ""}`}
                      onClick={() => {
                        updateProjectField("ambiente", "production");
                        setConfirmingProduction(false);
                      }}
                    >
                      Produção
                    </button>
                  </div>
                </div>

                {project.ambiente !== "production" && (
                  <p className="hint hint-warning">
                    Deve ser informado no chamado que esse bot será validado no ambiente de staging antes de ir para produção.
                  </p>
                )}

                <Toggle
                  label="Habilitar leitura de anexos pela IA"
                  checked={!!project.utilizaIA}
                  onChange={(v) => updateProjectField("utilizaIA", v)}
                />

                {project.ambiente === "production" && (
                  <div className="field-row">
                  <label className="field">
                    <span className="field-label">tenant</span>
                    <input className="input input-mono" value={project.tenant} onChange={(e) => updateProjectField("tenant", e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">filialId</span>
                    <input
                      className="input input-mono"
                      type="number"
                      value={project.filialId}
                      onChange={(e) => updateProjectField("filialId", Number(e.target.value))}
                    />
                  </label>
                  </div>
                )}

                <label className="field">
                  <span className="field-label">descricao</span>
                  <input className="input" value={project.descricao} onChange={(e) => updateProjectField("descricao", e.target.value)} />
                </label>

                <label className="field">
                  <span className="field-label">Mensagem de comando inválido</span>
                  <textarea
                    className="input textarea textarea-sm"
                    value={project.mensagemComandoInvalido}
                    onChange={(e) => updateProjectField("mensagemComandoInvalido", e.target.value)}
                  />
                </label>

                <div className="section-divider">
                  <span>Inatividade</span>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span className="field-label">Tempo p/ mensagem de inatividade (min)</span>
                    <input
                      className="input input-mono"
                      type="number"
                      value={project.tempoInatividade?.tempoEnvioInatividade ?? 60}
                      onChange={(e) => updateInatividadeField("tempoEnvioInatividade", Number(e.target.value))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Tempo p/ finalização do bot (min)</span>
                    <input
                      className="input input-mono"
                      type="number"
                      value={project.tempoInatividade?.tempoEnvioFinalizacaoBot ?? 120}
                      onChange={(e) => updateInatividadeField("tempoEnvioFinalizacaoBot", Number(e.target.value))}
                    />
                  </label>
                </div>

                <label className="field">
                  <span className="field-label">Mensagem de inatividade</span>
                  <textarea
                    className="input textarea textarea-sm"
                    value={project.tempoInatividade?.mensagemInatividade ?? ""}
                    onChange={(e) => updateInatividadeField("mensagemInatividade", e.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="field-label">Mensagem de finalização do bot</span>
                  <textarea
                    className="input textarea textarea-sm"
                    value={project.tempoInatividade?.mensagemFinalizacaoBot ?? ""}
                    onChange={(e) => updateInatividadeField("mensagemFinalizacaoBot", e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
        </section>

        <aside className="panel panel-export" aria-label="Exportação">
          <div className="panel-head">
            <h2>Exportação</h2>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Comandos</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Templates</span>
              <span className="stat-value">{stats.templates}</span>
            </div>
            <div className={`stat-card${stats.issues > 0 ? " stat-card-warn" : ""}`}>
              <span className="stat-label">Pendências</span>
              <span className="stat-value">{stats.issues}</span>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={generateAndDownload}>
            <Icon name="download" size={18} /> Gerar e baixar JSON
          </button>

          {confirmingProduction && project.ambiente === "production" && (
            <div className="error-banner">
              <div className="error-banner-title">Confirmação de produção</div>
              <p className="hint">
                Confirme que o chamado informa a ativação direta em produção e que a validação será realizada nesse ambiente.
              </p>
              <button type="button" className="btn btn-danger btn-block" onClick={generateAndDownload}>
                Confirmar e gerar produção
              </button>
            </div>
          )}

          {lastErrors.length > 0 && (
            <div className="error-banner">
              <div className="error-banner-title">
                <Icon name="alert" /> Erros de validação
              </div>
              <ul>
                {lastErrors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="hint hint-muted">
            Depois de concluir a árvore de comandos, clique em "Gerar e baixar JSON" para exportar o arquivo de configuração do chatbot.
          </p>
        </aside>
      </div>

      {duplicateSourceId && (
        <div className="modal-backdrop" role="presentation">
          <div className="duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
            <div className="duplicate-modal-header">
              <div>
                <h2 id="duplicate-title">Duplicar fluxo</h2>
                <p className="hint">O comando e todos os seus descendentes serão copiados.</p>
              </div>
              <button type="button" className="icon-btn" title="Fechar" onClick={() => setDuplicateSourceId(null)}>
                <Icon name="x" size={14} />
              </button>
            </div>

            <label className="field">
              <span className="field-label">Comando pai de destino</span>
              <select className="input" value={duplicateTargetId} onChange={(event) => setDuplicateTargetId(event.target.value)}>
                {duplicateTargets.map((target) => (
                  <option key={target.uiId} value={target.uiId}>
                    {target.uiId === project.flow.uiId ? "INICIAL" : target.comando || "(sem comando)"}
                  </option>
                ))}
              </select>
            </label>

            <div className="copy-options">
              <div className="copy-options-title">Informações para adicionar</div>
              <label className="copy-option copy-option-all">
                <input
                  type="checkbox"
                  checked={copyOptions.copyResponse && copyOptions.copyInteractive && copyOptions.copyBehavior && Object.values(copyOptions.related).every(Boolean)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setCopyOptions((current) => ({
                      ...current,
                      copyResponse: checked,
                      copyInteractive: checked,
                      copyBehavior: checked,
                      behaviorFields: Object.fromEntries(Object.keys(current.behaviorFields).map((field) => [field, checked])),
                      related: Object.fromEntries(Object.keys(current.related).map((field) => [field, checked])),
                    }));
                  }}
                />
                <strong>Copiar todas as informações</strong>
              </label>
              <label className="copy-option">
                <input
                  type="checkbox"
                  checked={copyOptions.copyResponse}
                  onChange={(event) => setCopyOptions((current) => ({ ...current, copyResponse: event.target.checked }))}
                />
                <span>Copiar resposta</span>
              </label>
              <label className="copy-option">
                <input
                  type="checkbox"
                  checked={copyOptions.copyInteractive}
                  onChange={(event) => setCopyOptions((current) => ({ ...current, copyInteractive: event.target.checked }))}
                />
                <span>Copiar interação</span>
              </label>
              <label className="copy-option">
                <input
                  type="checkbox"
                  checked={copyOptions.copyBehavior}
                  onChange={(event) => setCopyOptions((current) => ({ ...current, copyBehavior: event.target.checked }))}
                />
                <span>Copiar comportamento</span>
              </label>

              {copyOptions.copyBehavior && (
                <div className="copy-suboptions">
                  {[
                    ["transferirParaHumano", "Transferir para humano"],
                    ["voltarMenu", "Voltar menu anterior"],
                    ["enviaMensagemComandoInvalido", "Mensagem de comando inválido"],
                    ["utilizaIA", "Enviar anexo para leitura da IA"],
                    ["alterarStatus", "Alterar status do atendimento"],
                    ["statusParametroId", "ID do status"],
                  ].map(([field, label]) => (
                    <label className="copy-option" key={field}>
                      <input
                        type="checkbox"
                        checked={copyOptions.behaviorFields[field]}
                        onChange={(event) =>
                          setCopyOptions((current) => ({
                            ...current,
                            behaviorFields: { ...current.behaviorFields, [field]: event.target.checked },
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}

              {copyOptions.copyInteractive && (
                <div className="copy-related">
                  <div className="copy-options-title">Comandos das opções</div>
                  {[
                    ["copyResponse", "Copiar respostas"],
                    ["copyBehavior", "Copiar comportamentos"],
                    ["copyStatus", "Copiar status"],
                  ].map(([field, label]) => (
                    <label className="copy-option" key={field}>
                      <input
                        type="checkbox"
                        checked={copyOptions.related[field]}
                        onChange={(event) =>
                          setCopyOptions((current) => ({
                            ...current,
                            related: { ...current.related, [field]: event.target.checked },
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="duplicate-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDuplicateSourceId(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                disabled={!duplicateTargetId}
                onClick={() => copyInteraction(duplicateSourceId, duplicateTargetId, copyOptions)}
              >
                Adicionar interação
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!duplicateTargetId}
                onClick={() => duplicateNode(duplicateSourceId, duplicateTargetId)}
              >
                <Icon name="copy" size={15} /> Duplicar fluxo
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
