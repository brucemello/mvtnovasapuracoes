// Reproduz o caso de nov/2026: votantes editaram a resposta de setembro pelo link
// "Editar resposta" (mesmo ID no Forms) depois que a rodada de outubro abriu.
const assert = require('assert');
const ctx = require('./mock');
const linhas = () => ctx.sheets.Historico.rows.slice(1);
const resp = (id, email, votado, motivo, data) => ({
  getId: () => id, getTimestamp: () => data, getRespondentEmail: () => email,
  getItemResponses: () => [
    { getItem: () => ({ getTitle: () => 'Indicação', getType: () => 'LIST' }), getResponse: () => votado },
    { getItem: () => ({ getTitle: () => 'Motivo', getType: () => 'P' }), getResponse: () => motivo }
  ]
});

// rodada aberta: 2026-10 (sem registro de início -> 01/11/2026)
const setembroAntes = JSON.stringify(linhas().filter(l => l[0] === '2026-09'));
ctx.respostasForm = [
  resp('A1', 'keilla.freitas@totvs.com.br', 'Caique Henrique Carlos', 'voto de outubro editado', new Date(2026, 10, 5, 8)), // mesmo ID do voto de setembro
  resp('A3', 'caique.hcarlos@totvs.com.br', 'Evandro Italo', 'resposta antiga ainda no Forms', new Date(2026, 9, 5, 10)), // anterior à rodada
  resp('N1', 'eduardo.cirqueira@totvs.com.br', 'Carla Blanca Santos Latorre', 'voto novo', new Date(2026, 10, 4, 8))
];
let r = ctx.arquivarRespostasAtuais_();
assert.strictEqual(JSON.stringify(linhas().filter(l => l[0] === '2026-09')), setembroAntes, 'votos de setembro intactos');
assert.strictEqual(r.novas, 2);
assert.strictEqual(r.atualizadas, 0);
const out = linhas().filter(l => l[0] === '2026-10');
assert.ok(out.some(l => l[5] === 'A1' && l[3] === 'Caique Henrique Carlos'), 'edição vira voto de outubro');
assert.ok(!out.some(l => l[5] === 'A3'), 'resposta anterior à rodada ignorada');
assert.strictEqual(ctx.formEditavel, false, 'edição de respostas desligada no Forms');
console.log('  ✓ edição de resposta antiga não sobrescreve a rodada anterior');

r = ctx.arquivarRespostasAtuais_();
assert.strictEqual(r.novas + r.atualizadas, 0);
console.log('  ✓ gravar de novo não duplica');

ctx.respostasForm[0] = resp('A1', 'keilla.freitas@totvs.com.br', 'Jose Riquelmo', 'mudou de ideia', new Date(2026, 10, 6, 8));
r = ctx.arquivarRespostasAtuais_();
assert.strictEqual(r.atualizadas, 1);
assert.ok(linhas().some(l => l[0] === '2026-10' && l[5] === 'A1' && l[3] === 'Jose Riquelmo'));
assert.strictEqual(JSON.stringify(linhas().filter(l => l[0] === '2026-09')), setembroAntes);
console.log('  ✓ edição dentro da mesma rodada atualiza só a linha da rodada');

// resultado oficial divulgado vale mesmo se o Histórico mudar depois
ctx.sheets.Logs.rows.push([new Date(2026, 9, 7, 8, 6), 'MVT_APURACAO', 'SUCESSO', 'Julho, Agosto e Setembro de 2026: Vencedor: Pâmela Bernardo com 9 votos. 17 votos válidos.']);
const t3 = ctx.centralCarregar().trimestres.find(t => t.chave === '2026-T3');
assert.strictEqual(t3.oficial.vencedor, 'Pâmela Bernardo');
assert.strictEqual(t3.oficial.votos, 9);
console.log('  ✓ trimestre divulgado mostra o vencedor oficial');
