# MVT Squad Tributos — Novas Apurações

Código do Google Apps Script vinculado à planilha **Versão 2 MVT - Entregas Mês**, com deploy automático via GitHub Actions.

O script gera o formulário mensal com as entregas do Jira, cobra quem não votou, grava os votos na aba `Historico`, apura o MVT a cada trimestre e envia os e-mails de reconhecimento.

## Central MVT

Menu **MVT Jira > 📊 Abrir Central MVT**. Uma janela com:

- **Visão geral:** rodada aberta, participação, próximos disparos automáticos, último MVT e atividade recente.
- **Respostas por mês:** votos filtrados por sprint, por pessoa votada ou por texto.
- **Quem respondeu:** responderam e pendentes de cada mês, com cobrança da rodada aberta.
- **Apurações:** ranking, votos por sprint e justificativas de qualquer trimestre, e os e-mails de reconhecimento (o oficial só libera com o trimestre fechado).
- **Ganhadores:** vencedor de cada trimestre; os oficiais ficam na aba `Ganhadores`.
- **Histórico de envios:** tudo o que foi disparado (aba `Logs`), com filtros.
- **Novos envios:** formulário mensal, cobrança, fechamento e gravação do Histórico.

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
