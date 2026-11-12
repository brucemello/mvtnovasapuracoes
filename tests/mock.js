// Ambiente simulado (planilha, Forms, e-mail) para os testes.
const fs=require('fs'),vm=require('vm');
const SRC=require('path').join(__dirname,'..','src');
const p=n=>('0'+n).slice(-2);
function sheet(name,rows){return {name,rows,getName:()=>name,getLastRow(){return this.rows.length},getLastColumn(){return Math.max(...this.rows.map(r=>r.length),0)},
 getRange(r,c,nr,nc){const s=this;if(typeof r==='string')return{setNumberFormat(){return this}};return{getValues:()=>s.rows.slice(r-1,r-1+nr).map(x=>{const a=x.slice(c-1,c-1+nc);while(a.length<nc)a.push('');return a}),setValues(v){v.forEach((l,i)=>{s.rows[r-1+i]=s.rows[r-1+i]||[];l.forEach((x,j)=>s.rows[r-1+i][c-1+j]=x)});return{setFontWeight(){}}}}},
 appendRow(l){this.rows.push(l)},setFrozenRows(){}}}
const D=(d,m,y,h=10)=>new Date(y,m-1,d,h);
const hist=[['Referência','Data do voto','E-mail','Votado','Justificativa','ID resposta'],
['2026-07',D(3,8,2026),'william.palves@totvs.com.br','Carlos Nonato','Comprometimento com o time e com o cliente.','L1'],
['2026-07',D(3,8,2026),'jose.riquelmo@totvs.com.br','Pâmela Bernardo','Muita dedicação em apoiar TODO o time','L2'],
['2026-07',D(7,8,2026),'evandro.italo@totvs.com.br','Yasmim Lira','Conseguiu ajudar na automação e fazer entregas consistentes.','L3'],
['2026-08',D(3,9,2026),'carla.latorre@totvs.com.br','Fabio Mendonça','Fabinho empenhado no projeto Systax.','L4'],
['2026-08',D(2,9,2026),'fabio.mendonca@totvs.com.br','Carla Blanca Santos Latorre','Essencial nos testes <script>alert(1)</script>','L5'],
['2026-08',D(2,9,2026),'caique.carlos@totvs.com.br','Jose Riquelmo','Menino Rigué, uma máquina no front.','L6'],
['2026-08',D(2,9,2026),'pamela.bsouza@totvs.com.br','Caique Henrique Carlos','Caique é um analista muito dedicado.','L7'],
['2026-08',D(3,9,2026),'yasmim.castro@totvs.com.br','Carlos Nonato','Atuando sempre com excelência.','L8'],
['2026-09',D(1,10,2026),'keilla.freitas@totvs.com.br','Evandro Italo','o Evandro esteve me auxiliando.','A1'],
['2026-09',D(5,10,2026),'pamelabds@gmail.com','Caique Henrique Carlos','Dinâmico, sempre disposto a ajudar.','A2'],
['2026-09',D(5,10,2026),'caique.hcarlos@totvs.com.br','Evandro Italo','Evandro participou de muitas frentes.','A3'],
['2026-09',D(6,10,2026),'silva.carlos@totvs.com.br','Yasmim Lira','Se destacou muito expandindo sua zona de conforto.','A4'],
['2026-09',D(6,10,2026),'fabio.mendonca@totvs.com.br','Yasmim Lira','A Yas tem mandado muito bem.','A5'],
['2026-10',D(4,11,2026),'keilla.freitas@totvs.com.br','Jose Riquelmo','Entregou o front da nova tela.','B1'],
['2026-10',D(5,11,2026),'evandro.italo@totvs.com.br','Keilla Freitas','Ajudou demais nos fechamentos.','B2'],
['2026-10',D(5,11,2026),'carla.latorre@totvs.com.br','Jose Riquelmo','Sempre disponível.','B3']];
const time=[['Emails','nome'],...[['carla.latorre','Carla Blanca Santos Latorre'],['pamela.bsouza','Pâmela Bernardo'],['silva.carlos','Carlos Nonato'],['jose.riquelmo','Jose Riquelmo'],['keilla.freitas','Keilla Freitas'],['yasmim.castro','Yasmim Lira'],['caique.hcarlos','Caique Henrique Carlos'],['evandro.italo','Evandro Italo'],['fabio.mendonca','Fabio Mendonça'],['bruce.mello','Bruce Mello']].map(([e,n])=>[e+'@totvs.com.br',n])];
const logs=[[D(1,10,2026,16),'MVT_MENSAL','TESTE','TESTE: 42 entregas encontradas. Prévia enviada.'],[D(7,10,2026,8),'MVT_APURACAO','SUCESSO','Julho, Agosto e Setembro de 2026: Vencedor: Yasmim Lira com 4 votos.'],[D(7,10,2026,17),'MVT_RECONHECIMENTO','TESTE','TESTE: 8 e-mails'],[D(7,10,2026,17,),'MVT_RECONHECIMENTO','SUCESSO','8 e-mail(s) de reconhecimento enviados.'],[D(3,11,2026,8),'MVT_MENSAL','SUCESSO','Nova rodada 2026-10 aberta com 51 entregas. 5 voto(s) da rodada 2026-09 gravado(s).'],[D(5,11,2026,8),'MVT_COBRANCA','SUCESSO','Cobrança enviada para 7 pessoa(s).'],[D(5,11,2026,8),'MVT_ROTINA','ERRO','Cobrança: exemplo de erro']];
const sheets={Historico:sheet('Historico',hist),TIME:sheet('TIME',time),Logs:sheet('Logs',logs)};
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=sheet(n,[]))};
const props={MVT_REF_ATUAL:'2026-10','MVT_RECONHECIMENTO_2026-09':'07/10/2026 17:40'};
const ctx={console,
 Utilities:{formatDate:(d,tz,f)=>f.replace('yyyy',d.getFullYear()).replace('MM',p(d.getMonth()+1)).replace('dd',p(d.getDate())).replace('HH',p(d.getHours())).replace('mm',p(d.getMinutes())).replace('ss',p(d.getSeconds()))},
 Session:{getScriptTimeZone:()=>''},
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},
 FormApp:{openById:()=>({getResponses:()=>ctx.respostasForm,getPublishedUrl:()=>'https://docs.google.com/forms/d/e/x/viewform',canEditResponse:()=>ctx.formEditavel,setAllowResponseEdits:v=>{ctx.formEditavel=v;}}),ItemType:{LIST:'LIST',MULTIPLE_CHOICE:'MC',PARAGRAPH_TEXT:'P',TEXT:'T'}},
 MailApp:{sendEmail:o=>ctx.enviados.push(o)},enviados:[],respostasForm:[],formEditavel:true,sheets,props};
vm.createContext(ctx);
ctx.Date=Date;
fs.readdirSync(SRC).filter(f=>f.endsWith('.js')).forEach(f=>vm.runInContext(fs.readFileSync(SRC+'/'+f,'utf8'),ctx,{filename:f}));
module.exports=ctx;
