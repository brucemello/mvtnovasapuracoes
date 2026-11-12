# MVT Squad Tributos — Novas Apurações

Código do Google Apps Script vinculado à planilha **Versão 2 MVT - Entregas Mês**, com deploy automático via GitHub Actions.

O script gera o formulário mensal com as entregas do Jira, cobra quem não votou, grava os votos na aba `Historico`, apura o MVT a cada trimestre e envia os e-mails de reconhecimento.

## Como funciona

| Workflow | Quando roda | O que faz |
|---|---|---|
| **Deploy Apps Script** | Todo push na `main` que mexa em `src/` ou `tests/` (ou manualmente) | Valida a sintaxe, roda os testes, faz `clasp push` e confere se o Apps Script ficou idêntico ao repositório |
| **Importar do Apps Script** | Na primeira configuração e manualmente (aba Actions) | `clasp pull` do editor do Google para `src/` e faz commit |
| **Verificar Apps Script** | Manual | Compara o que está publicado com o repositório |

## Fluxo de trabalho

1. Edite os arquivos em `src/` (ou peça ao Claude).
2. Commit/push na `main`.
3. Em cerca de 1 minuto a planilha já usa a nova versão (recarregue para atualizar o menu).

> Evite editar direto no editor do Apps Script: o próximo deploy sobrescreve. Se editar, rode **Importar do Apps Script** antes.

## Secrets

- `CLASPRC_JSON` — conteúdo do `~/.clasprc.json` (login do clasp)
- `SCRIPT_ID` — ID do projeto Apps Script da planilha
- `DEPLOYMENT_ID` — opcional; o script é da planilha, então menu e gatilhos usam o código enviado mesmo sem implantação

## O que não fica no repositório

Token do Jira (Propriedades do script), gatilhos (`rotinaDiariaMVT`) e a referência da rodada atual ficam no próprio Apps Script e não mudam com o deploy.
