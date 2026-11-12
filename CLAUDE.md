# Contexto para o Claude

- Projeto Apps Script vinculado (bound) à planilha "Versão 2 MVT - Entregas Mês". Deploy automático: push em `src/` na `main` → GitHub Actions faz `clasp push`.
- `clasp push --force` substitui o projeto inteiro: nunca remova `src/PainelHTML.html`, `src/ManualHTML.html` nem `src/appsscript.json`.
- Não crie arquivos de backup `.js`/`.gs` em `src/`: todos os scripts são carregados juntos e declarações duplicadas quebram o projeto (o menu some).
- Envios para a squad (squad.tributos@totvs.com.br) e para os indicados são reais. Qualquer mudança deve manter os modos de teste mandando só para o gestor.
- Regras de negócio: formulário no 1º dia útil, cobrança no 3º, apuração no 5º dia útil de jan/abr/jul/out; votos gravados na aba `Historico` por referência (yyyy-MM) antes de zerar o Forms; reconhecimento é manual, vencedor com squad em cópia, indicados em particular, gestor em cópia oculta.
- Central MVT: `src/Central.js` (servidor, uma chamada `centralCarregar`) + `src/CentralHTML.html`. Retornos para `google.script.run` não podem ter objetos Date: converta para texto. Monte o HTML com `textContent` (justificativas vêm dos usuários).
- Rode `node tests/datas.test.js` e `node tests/central.test.js` antes de commitar (o deploy também roda).
