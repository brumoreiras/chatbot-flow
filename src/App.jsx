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
function buildCommandWithOrder({ _id, parentId, isRoot, node, defaults }) {
  const comandoTipo = node.comandoTipo ?? defaults.comandoTipo ?? 1;
  const transferirParaHumano = node.transferirParaHumano ?? defaults.transferirParaHumano ?? false;
  const voltarMenu = node.voltarMenu ?? defaults.voltarMenu ?? false;
  const enviaMensagemComandoInvalido =
    node.enviaMensagemComandoInvalido ?? defaults.enviaMensagemComandoInvalido ?? false;

  // statusParametroId é opcional, mas quando existir, deve ser o ÚLTIMO campo.
  const hasStatus =
    node.statusParametroId !== undefined && node.statusParametroId !== null && node.statusParametroId !== "";

  if (isRoot) {
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
  };
  return cmd;
}

function buildChatbotJson(project) {
  let nextId = 1;
  const comandos = [];

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

  return { output, errors };
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

function TreeNode({ node, level, selectedId, onSelect, onAddChild, onDuplicate, onDelete, isRoot }) {
  const isSelected = selectedId === node.uiId;
  const label = isRoot ? "INICIAL" : node.comando || "(sem comando)";
  const indent = { paddingLeft: `${level * 14}px` };

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          ...indent,
          display: "flex",
          gap: 8,
          alignItems: "center",
          border: isSelected ? "1px solid #111" : "1px solid #ddd",
          borderRadius: 10,
          padding: "8px 10px",
          background: isSelected ? "#f3f3f3" : "#fff",
        }}
      >
        <button
          onClick={() => onSelect(node.uiId)}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontWeight: 600,
            textAlign: "left",
            flex: 1,
          }}
          title="Selecionar nó"
        >
          {label}
          <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            {String(node.resposta || "").slice(0, 55)}
            {String(node.resposta || "").length > 55 ? "…" : ""}
          </div>
        </button>

        <button onClick={() => onAddChild(node.uiId)} title="Adicionar filho" style={btnSm}>
          + Filho
        </button>
       {/*  <button onClick={() => onDuplicate(node.uiId)} title="Duplicar subárvore" style={btnSm}>
          Duplicar
        </button> */}
        {!isRoot && (
          <button onClick={() => onDelete(node.uiId)} title="Excluir nó" style={{ ...btnSm, color: "#b00020" }}>
            Excluir
          </button>
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
    proj.flow.children.push({
      uiId: uid(),
      comando: "Volta Redonda",
      resposta: "Ok",
      comandoTipo: 1,
      transferirParaHumano: false,
      voltarMenu: false,
      enviaMensagemComandoInvalido: false,
      statusParametroId: "693c190b0c3433d55d7610ab",
      children: [],
    });

    const { output, errors } = buildChatbotJson(proj);
    console.assert(errors.length === 0, "Self-test: não deveria ter erros na configuração básica");

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

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
  }, [project]);

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

  function updateSelectedNodeField(field, value) {
    setProject((p) => {
      const next = deepClone(p);
      const node = findNode(next.flow, selectedUiId);
      if (!node) return p;
      node[field] = value;
      return next;
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
  }

  return (
    <div style={{ fontFamily: "system-ui, Arial", padding: 16, background: "#fafafa", minHeight: "100vh" }}>
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
              comandoTipo
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

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
            <Toggle
              label="transferirParaHumano"
              checked={!!selectedNode.transferirParaHumano}
              onChange={(v) => updateSelectedNodeField("transferirParaHumano", v)}
            />
            <Toggle
              label="voltarMenu"
              checked={!!selectedNode.voltarMenu}
              onChange={(v) => updateSelectedNodeField("voltarMenu", v)}
            />
            <Toggle
              label="enviaMensagemComandoInvalido"
              checked={!!selectedNode.enviaMensagemComandoInvalido}
              onChange={(v) => updateSelectedNodeField("enviaMensagemComandoInvalido", v)}
            />
          </div>

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