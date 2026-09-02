import React, { useEffect, useMemo, useState } from "react";

const LS_KEY = "chatbot_builder_project_v1";
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const defaultProject = () => ({
  tenant: "",
  filialId: "",
  descricao: "",
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
    mensagemInterativa: null,
    children: [],
  },
});

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
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
function buildInterativo(mensagemInterativa) {
  if (!mensagemInterativa || mensagemInterativa.tipo === undefined || mensagemInterativa.tipo === null) return null;
  const respostas = (mensagemInterativa.botoes || [])
    .map((botao) => ({
      _id: botao.comando?.trim() || botao.titulo?.trim() || "",
      titulo: botao.titulo?.trim() || botao.comando?.trim() || "",
    }))
    .filter((resp) => resp._id || resp.titulo);

  return {
    tipo: mensagemInterativa.tipo,
    botao: {
      respostas,
    },
  };
}

function buildCommandWithOrder({ _id, parentId, isRoot, node, defaults }) {
  const comandoTipo = node.comandoTipo ?? defaults.comandoTipo ?? 1;
  const transferirParaHumano = node.transferirParaHumano ?? defaults.transferirParaHumano ?? false;
  const voltarMenu = node.voltarMenu ?? defaults.voltarMenu ?? false;
  const enviaMensagemComandoInvalido =
    node.enviaMensagemComandoInvalido ?? defaults.enviaMensagemComandoInvalido ?? false;

  const mensagemInterativa =
    node.mensagemInterativa && typeof node.mensagemInterativa === "object" ? node.mensagemInterativa : null;
  const interativo = buildInterativo(mensagemInterativa);

  // statusParametroId é opcional, mas quando existir, deve ser o ÚLTIMO campo.
  const hasStatus =
    node.statusParametroId !== undefined && node.statusParametroId !== null && node.statusParametroId !== "";

  if (isRoot) {
    if (comandoTipo === 3) {
      const cmd = {
        _id,
        idMensagemPai: null,
        comando: null,
        comandoTipo,
        resposta: node.resposta ?? "",
        transferirParaHumano,
        voltarMenu,
        enviaMensagemComandoInvalido,
        statusParametroId: node.statusParametroId ?? null,
        ...(interativo ? { interativo } : {}),
      };
      return cmd;
    }

    const cmd = {
      _id,
      comandoTipo,
      resposta: node.resposta ?? "",
      transferirParaHumano,
      voltarMenu,
      enviaMensagemComandoInvalido,
      ...(hasStatus ? { statusParametroId: node.statusParametroId } : {}),
    };
    return cmd;
  }

  const cmd = {
    _id,
    idMensagemPai: parentId,
    comando: node.comando ?? "",
    comandoTipo,
    resposta: node.resposta ?? "",
    transferirParaHumano,
    voltarMenu,
    enviaMensagemComandoInvalido,
    ...(hasStatus ? { statusParametroId: node.statusParametroId } : {}),
    ...(interativo ? { interativo } : {}),
  };
  return cmd;
}

function buildChatbotJson(project) {
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

  function walk(node, parentId, isRoot) {
    const _id = nextId++;

    // validação mínima
    if (!node?.resposta || String(node.resposta).trim().length === 0) {
      errors.push(`Nó ${_id} está sem resposta.`);
    }
    if (!isRoot && (!node?.comando || String(node.comando).trim().length === 0)) {
      errors.push(`Nó ${_id} (não-root) está sem comando.`);
    }

    const cmd = buildCommandWithOrder({ _id, parentId, isRoot, node, defaults });
    comandos.push(cmd);

    // Se é template, adicionar ao array de templates
    if (node.isTemplate) {
      if (!node.templateName || String(node.templateName).trim().length === 0) {
        errors.push(`Template no nó ${_id} está sem nome.`);
      }
      if (!node.templateCategory) {
        errors.push(`Template no nó ${_id} está sem categoria.`);
      }
      templates.push({
        tipo: null,
        mensagem: node.resposta ?? "",
        nome: node.templateName ?? "",
        categoria: node.templateCategory,
        linguagem: "pt_BR",
      });
    }

    (node.children || []).forEach((child) => walk(child, _id, false));
  }

  walk(project.flow, undefined, true);

  const output = {
    tenant: project.tenant,
    filialId: Number(project.filialId),
    descricao: project.descricao,
    comandos,
    ativo: project.ativo ?? true,
    mensagemComandoInvalido: project.mensagemComandoInvalido ?? "",
    comandoVoltar: "voltar",
    tempoInatividade: project.tempoInatividade ?? {},
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

function TreeNode({ node, level, selectedId, onSelect, onAddChild, onDuplicate, onDelete, isRoot, parentLabel }) {
  const isSelected = selectedId === node.uiId;
  const label = isRoot
    ? "INICIAL"
    : node.origemButtonIndex !== undefined
    ? `Botão ${node.origemButtonIndex + 1}: ${node.comando || node.origemButtonTitulo || "(sem comando)"}`
    : node.comando || "(sem comando)";
  const indent = { paddingLeft: `${level * 14}px` };

  const showTags = parentLabel || node.origemButtonIndex !== undefined;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          ...indent,
          border: isSelected ? "1px solid #111" : "1px solid #ddd",
          borderRadius: 14,
          padding: "12px 14px",
          background: isSelected ? "#f9fbff" : "#fff",
          boxShadow: isSelected ? "0 2px 12px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button
            onClick={() => onSelect(node.uiId)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              flex: 1,
              padding: 0,
            }}
            title="Selecionar nó"
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{label}</div>
            <div style={{ fontWeight: 400, fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>
              {String(node.resposta || "").slice(0, 80)}
              {String(node.resposta || "").length > 80 ? "…" : ""}
            </div>
          </button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <button onClick={() => onAddChild(node.uiId)} title="Adicionar filho" style={btnSm}>
              + Filho
            </button>
            {!isRoot && (
              <button onClick={() => onDelete(node.uiId)} title="Excluir nó" style={{ ...btnSm, color: "#b00020", borderColor: "#f0b3be" }}>
                Excluir
              </button>
            )}
          </div>
        </div>

        {showTags && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {parentLabel && !isRoot && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  background: "#fff4cc",
                  color: "#805500",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Comando pai: {parentLabel}
              </div>
            )}
            {isRoot && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  background: "#eef7ff",
                  color: "#0366d6",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Origem: Inicial
              </div>
            )}
            {node.origemButtonIndex !== undefined && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  background: "#eef6ff",
                  color: "#0366d6",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Associado ao botão {node.origemButtonIndex + 1}
                {node.origemButtonTitulo ? `: ${node.origemButtonTitulo}` : ""}
              </div>
            )}
          </div>
        )}
      </div>

      {(node.children || []).map((ch) => (
        <TreeNode
          key={ch.uiId}
          node={ch}
          level={level + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          isRoot={false}
          parentLabel={label}
        />
      ))}
    </div>
  );
}

const btnSm = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "6px 10px",
  cursor: "pointer",
  background: "#fff",
};

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
};

const label = {
  display: "block",
  fontSize: 12,
  opacity: 0.85,
  marginBottom: 10,
};

const input = {
  width: "100%",
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  marginTop: 6,
  background: "#fff",
};

// --------
// Self-tests (sem framework): rodam uma vez e ajudam a garantir a regra de ORDEM das chaves
// --------
function runSelfTestsOnce() {
  if (typeof window === "undefined") return;
  if (window.__CHATBOT_BUILDER_TESTS_RAN__) return;
  window.__CHATBOT_BUILDER_TESTS_RAN__ = true;

  try {
    const proj = defaultProject();
    // Ensure root has a resposta for the self-test so the validation doesn't fail
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
    // Don't throw a noisy assertion in the browser console; log errors instead for diagnostics
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
    const rootExpectedStart = ["_id", "comandoTipo", "resposta"]; // root não tem idMensagemPai/comando
    console.assert(
      rootExpectedStart.every((k, i) => Object.keys(rootCmd)[i] === k),
      "Self-test: root deve iniciar com _id, comandoTipo, resposta"
    );
  } catch (e) {
    console.error("Self-tests falharam:", e);
  }
}

runSelfTestsOnce();

export default function App() {
  const [project, setProject] = useState(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return defaultProject();
      }
    }
    return defaultProject();
  });

  const [selectedUiId, setSelectedUiId] = useState(() => project.flow.uiId);
  // Mantém apenas os erros da última tentativa de exportação/validação
  const [lastErrors, setLastErrors] = useState(() => []);
  const [categoryErrorMessage, setCategoryErrorMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    setCategoryErrorMessage("");
  }, [selectedUiId]);

  const selectedNode = useMemo(() => findNode(project.flow, selectedUiId) || project.flow, [project, selectedUiId]);
  const isRootSelected = selectedNode.uiId === project.flow.uiId;

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

  function syncInteractiveChildren(node) {
    if (!FEATURE_DYNAMIC_INTERACTIVE_NODES) return;

    const shouldHaveInteractiveChildren = node.comandoTipo === 3 && node.mensagemInterativa && node.mensagemInterativa.tipo === 1;
    if (!shouldHaveInteractiveChildren) {
      if (node.children?.length) {
        node.children = node.children.filter((child) => child.origemButtonIndex === undefined);
      }
      return;
    }

    const buttons = node.mensagemInterativa.botoes || [];
    const activeButtons = buttons
      .map((button, index) => ({ button, index }))
      .filter(({ button }) => (button.titulo?.trim() || button.comando?.trim()));

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
      botoes: current.botoes && current.botoes.length > 0 ? current.botoes : [{ titulo: "", comando: "" }, { titulo: "", comando: "" }],
    }));
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
    setProject((p) => {
      const next = deepClone(p);
      const parent = findNode(next.flow, parentUiId);
      if (!parent) return p;

      parent.children = parent.children || [];
      parent.children.push({
        uiId: uid(),
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
  }

  function duplicateNode(uiIdToDup) {
    setProject((p) => {
      const next = deepClone(p);
      if (uiIdToDup === next.flow.uiId) return p;

      const parent = findParent(next.flow, uiIdToDup);
      const node = findNode(next.flow, uiIdToDup);
      if (!parent || !node) return p;

      parent.children = parent.children || [];
      parent.children.push(duplicateSubtree(node));
      return next;
    });
  }

  function deleteNode(uiIdToDelete) {
    setProject((p) => {
      const next = deepClone(p);
      if (uiIdToDelete === next.flow.uiId) return p;
      removeNode(next.flow, uiIdToDelete);
      return next;
    });

    if (uiIdToDelete === selectedUiId) setSelectedUiId(project.flow.uiId);
  }
  function resetProject() {
    const fresh = defaultProject();
    setProject(fresh);
    setSelectedUiId(fresh.flow.uiId);
    setLastErrors([]);
  }

  function generateAndDownload() {
    const res = buildChatbotJson(project);
    setLastErrors(res.errors);

    if (res.errors.length > 0) {
      alert("Existem erros de validação. Corrija antes de exportar.");
      return;
    }

    downloadJson("chatbot.json", res.output);

    if (res.templates.length > 0) {
      const templatesOutput = {
        tenant: project.tenant,
        filialId: Number(project.filialId),
        templatesTwilio: [],
        templatesDialog360: res.templates,
      };
      downloadJson("templates.json", templatesOutput);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, Arial", padding: 16, background: "#fafafa", minHeight: "100vh", color: "#213547" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Chatbot Flow</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={resetProject} style={{ ...btnSm, color: "#b00020" }}>
            Reset
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr 300px", gap: 12, marginTop: 12 }}>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Árvore de comandos</h3>
          <TreeNode
            node={project.flow}
            level={0}
            selectedId={selectedUiId}
            onSelect={setSelectedUiId}
            onAddChild={addChild}
            onDuplicate={duplicateNode}
            onDelete={deleteNode}
            isRoot={true}
          />
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Edição do nó</h3>

          {!isRootSelected && (
            <label style={label}>
              Comando (texto que o usuário escolhe)
              <input
                style={input}
                value={selectedNode.comando || ""}
                onChange={(e) => updateSelectedNodeField("comando", e.target.value)}
              />
            </label>
          )}

          {isRootSelected && (
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
              Configuração inicial
            </div>
          )}

          <label style={label}>
            Resposta
            <textarea
              style={{ ...input, minHeight: 160, fontFamily: "inherit" }}
              value={selectedNode.resposta || ""}
              onChange={(e) => updateSelectedNodeField("resposta", e.target.value)}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={label}>
              Tipo de Comando
              <input
                style={input}
                type="number"
                value={selectedNode.comandoTipo ?? 1}
                onChange={(e) => updateSelectedNodeField("comandoTipo", Number(e.target.value))}
              />
            </label>

            <label style={label}>
              statusParametroId (opcional)
              <input
                style={input}
                value={selectedNode.statusParametroId || ""}
                onChange={(e) => updateSelectedNodeField("statusParametroId", e.target.value)}
              />
            </label>
          </div>

          {selectedNode.comandoTipo === 3 && (
            <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Mensagem Interativa</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ ...label, flex: 1 }}>
                  Tipo de mensagem
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="radio"
                        name={`mensagemInterativa-${selectedNode.uiId}`}
                        value={1}
                        checked={selectedNode.mensagemInterativa?.tipo === 1}
                        onChange={() => setMensagemInterativaTipo(1)}
                      />
                      Botões
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="radio"
                        name={`mensagemInterativa-${selectedNode.uiId}`}
                        value={2}
                        checked={selectedNode.mensagemInterativa?.tipo === 2}
                        onChange={() => setMensagemInterativaTipo(2)}
                      />
                      Lista (não implementado)
                    </label>
                  </div>
                </label>
              </div>

              {selectedNode.mensagemInterativa?.tipo === 1 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Configurar botões</div>
                  <label style={label}>
                    Quantidade de botões
                    <select
                      style={input}
                      value={(selectedNode.mensagemInterativa?.botoes || []).length || 2}
                      onChange={(e) => setMensagemInterativaButtonsCount(Number(e.target.value))}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </label>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
                    Ao preencher um botão, um nó filho será criado automaticamente na árvore para configurar o comando relacionado.
                  </div>
                  {(selectedNode.mensagemInterativa?.botoes || [{ titulo: "", comando: "" }, { titulo: "", comando: "" }]).map((botao, index) => (
                    <div key={index} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Botão {index + 1}</div>
                      <label style={label}>
                        Texto do botão
                        <input
                          style={input}
                          value={botao.titulo || ""}
                          onChange={(e) => updateMensagemInterativaButton(index, "titulo", e.target.value)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {selectedNode.mensagemInterativa?.tipo === 2 && (
                <div style={{ marginTop: 16, fontSize: 12, color: "#555" }}>
                  Configuração de lista não está disponível nesta versão.
                </div>
              )}

              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
                Comando do tipo 3 será exportado como mensagem interativa. Se o campo mensagemInterativa estiver vazio, o fluxo atual permanece.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
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
              label="Enviar mensagem comando inválido"
              checked={!!selectedNode.enviaMensagemComandoInvalido}
              onChange={(v) => updateSelectedNodeField("enviaMensagemComandoInvalido", v)}
            />
          </div>

          <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

          {selectedNode.comandoTipo !== 3 && (
            <>
              <Toggle
                label="Esse comando é um template?"
                checked={!!selectedNode.isTemplate}
                onChange={(v) => updateSelectedNodeField("isTemplate", v)}
              />

              {selectedNode.isTemplate && (
                <>
                  <label style={label}>
                    Nome do template
                    <input
                      style={input}
                      value={selectedNode.templateName || ""}
                      onChange={(e) => updateSelectedNodeField("templateName", e.target.value)}
                    />
                  </label>

                  <div style={label}>
                    Categoria do template
                    <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="radio"
                          name={`category-${selectedNode.uiId}`}
                          value="Marketing"
                          checked={selectedNode.templateCategory === "Marketing"}
                          onChange={(e) => {
                            setCategoryErrorMessage("Não é permitido cadastrar templates do tipo marketing para o chatbot");
                          }}
                        />
                        Marketing
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="radio"
                          name={`category-${selectedNode.uiId}`}
                          value="Utility"
                          checked={selectedNode.templateCategory === "Utility"}
                          onChange={(e) => {
                            updateSelectedNodeField("templateCategory", e.target.value);
                            setCategoryErrorMessage("");
                          }}
                        />
                        Utility
                      </label>
                    </div>
                    {categoryErrorMessage && (
                      <div style={{ color: "red", fontSize: 12, marginTop: 4 }}>
                        {categoryErrorMessage}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {isRootSelected && (
            <>
              <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #eee" }} />

              <h3 style={{ margin: "0 0 10px" }}>Configurações globais</h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={label}>
                  tenant
                  <input style={input} value={project.tenant} onChange={(e) => updateProjectField("tenant", e.target.value)} />
                </label>

                <label style={label}>
                  filialId
                  <input
                    style={input}
                    type="number"
                    value={project.filialId}
                    onChange={(e) => updateProjectField("filialId", Number(e.target.value))}
                  />
                </label>
              </div>

              <label style={label}>
                descricao
                <input style={input} value={project.descricao} onChange={(e) => updateProjectField("descricao", e.target.value)} />
              </label>

              <label style={label}>
                Comando Invalido
                <textarea
                  style={{ ...input, minHeight: 70, fontFamily: "inherit" }}
                  value={project.mensagemComandoInvalido}
                  onChange={(e) => updateProjectField("mensagemComandoInvalido", e.target.value)}
                />
              </label>

              <Toggle label="ativo" checked={!!project.ativo} onChange={(v) => updateProjectField("ativo", v)} />

              <h4 style={{ margin: "14px 0 8px" }}>Configuração mensagem e tempo de inatividade</h4>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={label}>
                  Tempo de envio de mensagem de inatividade (min)
                  <input
                    style={input}
                    type="number"
                    value={project.tempoInatividade?.tempoEnvioInatividade ?? 60}
                    onChange={(e) => updateInatividadeField("tempoEnvioInatividade", Number(e.target.value))}
                  />
                </label>

                <label style={label}>
                  Tempo de envio de mensagem de Finalização Bot (min)
                  <input
                    style={input}
                    type="number"
                    value={project.tempoInatividade?.tempoEnvioFinalizacaoBot ?? 120}
                    onChange={(e) => updateInatividadeField("tempoEnvioFinalizacaoBot", Number(e.target.value))}
                  />
                </label>
              </div>

              <label style={label}>
                Mensagem de Inatividade
                <textarea
                  style={{ ...input, minHeight: 70, fontFamily: "inherit" }}
                  value={project.tempoInatividade?.mensagemInatividade ?? ""}
                  onChange={(e) => updateInatividadeField("mensagemInatividade", e.target.value)}
                />
              </label>

              <label style={label}>
                Mensagem de Finalização do Bot
                <textarea
                  style={{ ...input, minHeight: 70, fontFamily: "inherit" }}
                  value={project.tempoInatividade?.mensagemFinalizacaoBot ?? ""}
                  onChange={(e) => updateInatividadeField("mensagemFinalizacaoBot", e.target.value)}
                />
              </label>
            </>
          )}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Exportação</h3>

          <button onClick={generateAndDownload} style={{ ...btnSm, width: "100%", padding: "10px 12px" }}>
            Gerar e baixar JSON
          </button>

          {lastErrors.length > 0 && (
            <div style={{ marginTop: 12, background: "#fff4f4", border: "1px solid #ffd0d0", padding: 10, borderRadius: 10 }}>
              <b>Erros de validação</b>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {lastErrors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
            Após concluir a criação da Árvore de comandos, clique em "Gerar e baixar JSON" para exportar o arquivo de configuração do chatbot.
          </div>
        </div>
      </div>
    </div>
  );
}