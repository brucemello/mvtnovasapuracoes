// Testa as regras de calendário do MVT (dias úteis, feriados, trimestre e prazo)
// carregando os arquivos de src/ com stubs mínimos dos serviços do Google.
// Executado a cada deploy; uma falha aqui impede o clasp push.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const p = n => ('0' + n).slice(-2);
const contexto = {
  Utilities: {
    formatDate: (d, tz, f) => f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1))
      .replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()))
  },
  Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
  console
};
vm.createContext(contexto);
const dir = path.join(__dirname, '..', 'src');
fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), contexto, { filename: f }));

const run = codigo => vm.runInContext(codigo, contexto);
const existe = nome => run(`typeof ${nome} === 'function'`);
let total = 0;
const caso = (nome, fn) => { fn(); total++; console.log('  ✓ ' + nome); };

if (existe('numeroDiaUtilNoMes_')) {
  caso('03/11/2026 é o 1º dia útil (01 é domingo, 02 é Finados)', () => {
    assert.strictEqual(run('numeroDiaUtilNoMes_(new Date(2026,10,2,8))'), 0);
    assert.strictEqual(run('numeroDiaUtilNoMes_(new Date(2026,10,3,8))'), 1);
  });
  caso('07/10/2026 é o 5º dia útil (apuração)', () => assert.strictEqual(run('numeroDiaUtilNoMes_(new Date(2026,9,7,8))'), 5));
  caso('01/01 não é dia útil', () => assert.strictEqual(run('numeroDiaUtilNoMes_(new Date(2027,0,1,8))'), 0));
}
if (existe('feriadosDoAno_')) {
  caso('feriados móveis de 2026', () => {
    const f = run('feriadosDoAno_(2026)');
    ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04'].forEach(d => assert.ok(f.indexOf(d) !== -1, d));
  });
}
if (existe('trimestreFechado_')) {
  caso('trimestre fechado em outubro = jul/ago/set', () => assert.deepStrictEqual(Array.from(run('trimestreFechado_(new Date(2026,9,7)).refs')), ['2026-07', '2026-08', '2026-09']));
  caso('trimestre fechado em janeiro = out/nov/dez do ano anterior', () => assert.deepStrictEqual(Array.from(run('trimestreFechado_(new Date(2027,0,8)).refs')), ['2026-10', '2026-11', '2026-12']));
}
if (existe('calcularPrazoDiasUteis_')) {
  caso('prazo de 3 dias úteis a partir de 03/11/2026 = 06/11', () => assert.strictEqual(run("Utilities.formatDate(calcularPrazoDiasUteis_(new Date(2026,10,3,8),3),'','dd/MM')"), '06/11'));
}
if (existe('escaparHtml_')) {
  caso('mensagens dos cards são escapadas', () => assert.strictEqual(run("escaparHtml_('<b>&\"')"), '&lt;b&gt;&amp;&quot;'));
}
console.log(total ? `${total} teste(s) ok` : 'Nenhuma função de calendário encontrada; testes ignorados.');
