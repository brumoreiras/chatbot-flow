function uid() { return String(Date.now() + Math.random()); }

function defaultProject() {
  return {
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
  };
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

    if (!node?.resposta || String(node.resposta).trim().length === 0) {
      errors.push(`Nó ${_id} está sem resposta.`);
    }
    if (!isRoot && (!node?.comando || String(node.comando).trim().length === 0)) {
      errors.push(`Nó ${_id} (não-root) está sem comando.`);
    }

    const comandoTipo = node.comandoTipo ?? defaults.comandoTipo ?? 1;
    const transferirParaHumano = node.transferirParaHumano ?? defaults.transferirParaHumano ?? false;
    const voltarMenu = node.voltarMenu ?? defaults.voltarMenu ?? false;
    const enviaMensagemComandoInvalido = node.enviaMensagemComandoInvalido ?? defaults.enviaMensagemComandoInvalido ?? false;

    const hasStatus = node.statusParametroId !== undefined && node.statusParametroId !== null && node.statusParametroId !== "";
    const mensagemInterativa = node.mensagemInterativa && typeof node.mensagemInterativa === "object" ? node.mensagemInterativa : null;
    const hasMensagemInterativa = mensagemInterativa && mensagemInterativa.tipo !== undefined && mensagemInterativa.tipo !== null;

    const _idLocal = _id;
    if (isRoot) {
      const cmd = {
        _id: _idLocal,
        comandoTipo,
        ...(hasMensagemInterativa ? { mensagemInterativa: { tipo: mensagemInterativa.tipo } } : {}),
        resposta: node.resposta ?? "",
        transferirParaHumano,
        voltarMenu,
        enviaMensagemComandoInvalido,
        ...(hasStatus ? { statusParametroId: node.statusParametroId } : {}),
      };
      comandos.push(cmd);
    } else {
      const cmd = {
        _id: _idLocal,
        idMensagemPai: parentId,
        comando: node.comando ?? "",
        comandoTipo,
        ...(hasMensagemInterativa ? { mensagemInterativa: { tipo: mensagemInterativa.tipo } } : {}),
        resposta: node.resposta ?? "",
        transferirParaHumano,
        voltarMenu,
        enviaMensagemComandoInvalido,
        ...(hasStatus ? { statusParametroId: node.statusParametroId } : {}),
      };
      comandos.push(cmd);
    }

    (node.children || []).forEach((child) => walk(child, _idLocal, false));
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
console.log('errors:', errors);
console.log('comandos:', output.comandos);

if (errors.length !== 0) {
  console.error('Self-test: detected errors as expected for debugging');
  process.exit(1);
} else {
  console.log('Self-test: OK');
}
