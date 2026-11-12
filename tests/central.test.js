// Testa o servidor da Central MVT com planilha, Forms e e-mail simulados.
const ctx=require('./mock');
const assert=require('assert');
const r=ctx.centralCarregar();
assert.strictEqual(r.refAtual,'2026-10');
assert.strictEqual(JSON.stringify(r.trimestres.map(t=>[t.chave,t.status])),JSON.stringify([['2026-T4','andamento'],['2026-T3','fechado']]));
assert.strictEqual(r.trimestres[1].ranking[0].nome,'Yasmim Lira');
assert.strictEqual(r.envios.length,7,'logs lidos');
assert.strictEqual(r.proximas.envio,'01/12/2026');
assert.doesNotThrow(()=>JSON.stringify(r));
assert.ok(!JSON.stringify(r).includes('"data":{}'),'datas convertidas em texto');
console.log('  ✓ carga da Central');
// reconhecimento oficial: bloqueado em trimestre aberto e sem reenvio acidental
let x=ctx.centralReconhecimento({chave:'2026-T4',modoTeste:false,vencedor:'Jose Riquelmo'});
assert.ok(!x.sucesso && /andamento/.test(x.msg)); console.log('  ✓ oficial bloqueado em trimestre em andamento');
x=ctx.centralReconhecimento({chave:'2026-T3',modoTeste:false});
assert.ok(!x.sucesso && x.jaEnviado); console.log('  ✓ reenvio exige confirmação');
assert.strictEqual(ctx.enviados.length,0,'nenhum e-mail real nesses casos');
// teste manda tudo só para o gestor
x=ctx.centralReconhecimento({chave:'2026-T3',modoTeste:true});
assert.ok(x.sucesso && ctx.enviados.length>0 && ctx.enviados.every(e=>e.to==='bruce.mello@totvs.com.br' && !e.cc && !e.bcc));
console.log('  ✓ modo teste envia só para o gestor');
// reenvio oficial confirmado: vencedor com squad em cópia, gestor em cópia oculta, ganhador registrado
ctx.enviados.length=0;
x=ctx.centralReconhecimento({chave:'2026-T3',modoTeste:false,reenviar:true});
assert.ok(x.sucesso);
const venc=ctx.enviados.find(e=>/Parabéns/.test(e.subject));
assert.strictEqual(venc.to,'yasmim.castro@totvs.com.br'); assert.strictEqual(venc.cc,'squad.tributos@totvs.com.br'); assert.strictEqual(venc.bcc,'bruce.mello@totvs.com.br');
assert.ok(ctx.enviados.filter(e=>/lembrado/.test(e.subject)).every(e=>!e.cc));
assert.strictEqual(ctx.centralCarregar().trimestres[1].oficial.vencedor,'Yasmim Lira');
console.log('  ✓ envio oficial e registro na aba Ganhadores');
