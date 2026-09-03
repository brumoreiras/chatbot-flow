# Chatbot Flow Builder Unified

Aplicacao anfitria que permite escolher entre o editor V1 e o editor V2 sem remover as implementacoes originais.

## Executar

```bash
npm install
npm run dev
```

Abra `http://127.0.0.1:5173/`. Na primeira visita, escolha uma versao. Tambem e possivel abrir diretamente:

- `/?version=v1`
- `/?version=v2`

A ultima versao escolhida fica salva em `chatbot_builder_selected_version`.

## Persistencia

Os projetos permanecem isolados:

- V1: `chatbot_builder_project_v1`
- V2: `chatbot_builder_project_v2`

A V1 e a V2 continuam sendo implementacoes independentes para preservar os formatos de exportacao existentes.
