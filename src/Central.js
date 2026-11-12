/************************************************************
 * CENTRAL MVT - servidor da interface (CentralHTML)
 * Consulta de envios, respostas por mês, participação,
 * apurações por trimestre, ganhadores e novos envios.
 ************************************************************/

const ABA_GANHADORES = 'Ganhadores';
const CABECALHO_GANHADORES = ['Trimestre', 'Período', 'Vencedor', 'Votos', 'Empate', 'Reconhecimento enviado em'];

function abrirCentralMVT() {
  const html = HtmlService.createHtmlOutputFromFile('CentralHTML').setWidth(1280).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'Central MVT · Squad Tributos');
}

/************************************************************
 * LEITURA (uma chamada carrega tudo)
 ************************************************************/
function centralCarregar() {
  let avisoArquivo = '';
  try {
    arquivarRespostasAtuais_(); // traz a rodada em andamento para o Histórico (não apaga nada)
  } catch (e) {
    avisoArquivo = 'Não foi possível ler as respostas atuais do formulário: ' + e.message;
  }

  const historico = lerHistorico_();
  const time = lerTime_();
  const refAtual = refAtual_();
  const hoje = new Date();

  // Trimestres: todos os que têm votos + o trimestre da rodada atual
  const chaves = {};
  historico.forEach(v => { if (v.ref && /^\d{4}-\d{2}$/.test(v.ref)) chaves[trimestreDaRef_(v.ref).chave] = trimestreDaRef_(v.ref); });
  chaves[trimestreDaRef_(refAtual).chave] = trimestreDaRef_(refAtual);
  const chaveAndamento = trimestreDaRef_(refAtual).chave;
  const oficiais = lerGanhadores_();
  const props = PropertiesService.getScriptProperties();
  const envios = lerLogsEnvios_();
  const apuracoesOficiais = vencedoresDosLogs_(envios);

  const trimestres = Object.keys(chaves).sort().reverse().map(chave => {
    const tri = chaves[chave];
    const item = {
      chave: chave, rotulo: tri.rotulo, refs: tri.refs,
      status: chave >= chaveAndamento ? 'andamento' : 'fechado',
      ranking: [], votosPorRef: {}, validos: 0, duplicados: 0, autovotos: 0,
      empate: false, lideres: [], erro: '',
      oficial: oficiais[chave] || null,
      reconhecimentoEnviadoEm: props.getProperty('MVT_RECONHECIMENTO_' + tri.refs[2]) || ''
    };
    // Trimestre divulgado antes da aba Ganhadores existir: usa o vencedor do fechamento oficial (Logs)
    if (!item.oficial && item.reconhecimentoEnviadoEm && apuracoesOficiais[tri.rotulo]) {
      const a = apuracoesOficiais[tri.rotulo];
      item.oficial = { vencedor: a.vencedor, votos: a.votos, empate: false, enviadoEm: item.reconhecimentoEnviadoEm, fonte: 'Fechamento oficial de ' + a.data };
    }
    try {
      const ap = apurarPeriodo_(tri, historico, time);
      item.ranking = ap.ranking.map(p => ({ nome: p.nome, votos: p.votos, depoimentos: p.depoimentos }));
      item.votosPorRef = ap.votosPorRef;
      item.validos = ap.validos.length;
      item.duplicados = ap.duplicados;
      item.autovotos = ap.autovotos;
      item.empate = ap.empate;
      item.lideres = ap.lideres.map(p => p.nome);
    } catch (e) {
      item.erro = e.message;
    }
    return item;
  });

  let formUrl = '';
  try { formUrl = FormApp.openById(CONFIG.GOOGLE_FORM_ID).getPublishedUrl(); } catch (e) {}

  return {
    geradoEm: formatarData_(hoje, 'dd/MM/yyyy HH:mm'),
    refAtual: refAtual,
    formUrl: formUrl,
    avisoArquivo: avisoArquivo,
    emailGestor: CONFIG.EMAIL_GESTOR,
    projetos: CONFIG.PROJETOS_PADRAO,
    time: time.emails.map(e => ({ email: e, nome: time.nomePorEmail[e] || '' })),
    historico: historico.map(v => ({
      ref: v.ref,
      data: v.data instanceof Date && !isNaN(v.data.getTime()) ? formatarData_(v.data, 'dd/MM/yyyy HH:mm') : '',
      ordem: v.data instanceof Date && !isNaN(v.data.getTime()) ? v.data.getTime() : 0,
      email: v.email, votado: v.votado, justificativa: v.justificativa
    })),
    trimestres: trimestres,
    envios: envios,
    proximas: {
      envio: proximaDataDiaUtil_(hoje, CONFIG.DIA_UTIL_ENVIO, false),
      cobranca: proximaDataDiaUtil_(hoje, CONFIG.DIA_UTIL_COBRANCA, false),
      apuracao: proximaDataDiaUtil_(hoje, CONFIG.DIA_UTIL_APURACAO, true)
    }
  };
}

// "Julho, Agosto e Setembro de 2026: Vencedor: Yasmim Lira com 4 votos..." -> { rótulo: vencedor }
function vencedoresDosLogs_(envios) {
  const mapa = {};
  envios.slice().reverse().forEach(e => {
    if (e.tipo !== 'Apuração' || e.modo !== 'Oficial') return;
    const m = /^(.+?): Vencedor: (.+?) com (\d+) votos/.exec(e.detalhe);
    if (m) mapa[m[1]] = { vencedor: m[2], votos: parseInt(m[3], 10), data: e.data.split(' ')[0] };
  });
  return mapa;
}

function ehData_(v) {
  return !!v && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

function proximaDataDiaUtil_(aPartirDe, n, soTrimestral) {
  const d = new Date(aPartirDe.getFullYear(), aPartirDe.getMonth(), aPartirDe.getDate(), 12);
  for (let i = 0; i < 130; i++) {
    if ((!soTrimestral || d.getMonth() % 3 === 0) && numeroDiaUtilNoMes_(d) === n) return formatarData_(d, 'dd/MM/yyyy');
    d.setDate(d.getDate() + 1);
  }
  return '';
}

function lerLogsEnvios_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_LOG);
  if (!aba || aba.getLastRow() < 1) return [];
  const tipos = {
    MVT_MENSAL: 'Formulário mensal', MVT_COBRANCA: 'Cobrança', MVT_APURACAO: 'Apuração',
    MVT_RECONHECIMENTO: 'Reconhecimento', MVT_ROTINA: 'Rotina automática', MVT_IMPLANTACAO: 'Implantação'
  };
  return aba.getRange(1, 1, aba.getLastRow(), 4).getValues()
    .filter(l => ehData_(l[0]) && tipos[String(l[1])])
    .map(l => {
      const status = String(l[2] || '');
      return {
        data: formatarData_(l[0], 'dd/MM/yyyy HH:mm'),
        ordem: l[0].getTime(),
        tipo: tipos[String(l[1])],
        modo: /ERRO/.test(status) ? 'Erro' : /TESTE/.test(status) ? 'Teste' : status === 'AVISO' ? 'Aviso' : 'Oficial',
        detalhe: String(l[3] || '')
      };
    })
    .sort((a, b) => b.ordem - a.ordem)
    .slice(0, 500);
}

/************************************************************
 * GANHADORES OFICIAIS
 ************************************************************/
function obterAbaGanhadores_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_GANHADORES);
  if (!aba) {
    aba = ss.insertSheet(ABA_GANHADORES);
    aba.getRange('A:A').setNumberFormat('@');
    aba.getRange(1, 1, 1, CABECALHO_GANHADORES.length).setValues([CABECALHO_GANHADORES]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

function lerGanhadores_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_GANHADORES);
  const mapa = {};
  if (!aba || aba.getLastRow() < 2) return mapa;
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_GANHADORES.length).getValues().forEach(l => {
    const chave = String(l[0] || '').trim();
    if (!chave) return;
    mapa[chave] = {
      vencedor: String(l[2] || ''), votos: Number(l[3]) || 0, empate: String(l[4]) === 'Sim',
      enviadoEm: ehData_(l[5]) ? formatarData_(l[5], 'dd/MM/yyyy HH:mm') : String(l[5] || '')
    };
  });
  return mapa;
}

// Grava (ou substitui) o vencedor oficial do trimestre
function registrarGanhador_(tri, vencedor, empate) {
  try {
    const aba = obterAbaGanhadores_();
    const linha = [tri.chave || trimestreDaRef_(tri.refs[0]).chave, tri.rotulo, vencedor.nome, vencedor.votos, empate ? 'Sim' : 'Não', new Date()];
    const ultima = aba.getLastRow();
    if (ultima >= 2) {
      const chaves = aba.getRange(2, 1, ultima - 1, 1).getValues().map(l => String(l[0]));
      const i = chaves.indexOf(linha[0]);
      if (i !== -1) { aba.getRange(i + 2, 1, 1, linha.length).setValues([linha]); return; }
    }
    aba.appendRow(linha);
  } catch (e) {
    registrarLog_('MVT_RECONHECIMENTO', 'AVISO', 'Falha ao gravar a aba Ganhadores: ' + e.message);
  }
}

/************************************************************
 * AÇÕES
 ************************************************************/
function centralDispararFormulario(dados) {
  return processarVotacaoMVT(dados);
}

function centralCobranca(modoTeste) {
  return verificarEEnviarLembretes_(modoTeste === true);
}

function centralApuracao(modoTeste) {
  return processarApuracaoTrimestral_(modoTeste === true);
}

function centralGravarHistorico() {
  try {
    const r = arquivarRespostasAtuais_();
    return { sucesso: true, msg: `Histórico atualizado: ${r.novas} voto(s) novo(s), ${r.atualizadas} atualizado(s). Rodada ${refAtual_()}.` };
  } catch (e) {
    return { sucesso: false, msg: e.message };
  }
}

// opcoes: { chave: '2026-T3', modoTeste: bool, vencedor: 'Nome' (obrigatório no oficial com empate), reenviar: bool }
function centralReconhecimento(opcoes) {
  try {
    const m = /^(\d{4})-T([1-4])$/.exec(String(opcoes.chave || ''));
    if (!m) throw new Error('Trimestre inválido.');
    const tri = trimestrePorIndice_(parseInt(m[1], 10), parseInt(m[2], 10) - 1);
    arquivarRespostasAtuais_();
    const ap = apurarPeriodo_(tri, lerHistorico_(), lerTime_());
    ap.tri = tri;

    if (opcoes.modoTeste === true) {
      return enviarReconhecimentos_(ap, ap.lideres.map(p => normalizar_(p.nome)), true);
    }

    // Oficial só depois que a votação da última sprint do trimestre terminou
    if (tri.chave >= trimestreDaRef_(refAtual_()).chave) {
      throw new Error(`O trimestre ${tri.rotulo} ainda está em andamento: o envio oficial fica liberado depois que a votação da sprint ${tri.refs[2]} terminar. Use o teste para conferir.`);
    }

    let vencedor = ap.lideres[0];
    if (ap.empate) {
      vencedor = ap.lideres.filter(p => normalizar_(p.nome) === normalizar_(opcoes.vencedor))[0];
      if (!vencedor) throw new Error('Houve empate: escolha o vencedor entre ' + ap.lideres.map(p => p.nome).join(', ') + '.');
    }

    const props = PropertiesService.getScriptProperties();
    const chaveEnvio = 'MVT_RECONHECIMENTO_' + tri.refs[2];
    if (props.getProperty(chaveEnvio) && opcoes.reenviar !== true) {
      return { sucesso: false, jaEnviado: true, msg: `Os e-mails deste trimestre já foram enviados em ${props.getProperty(chaveEnvio)}.` };
    }

    const resultado = enviarReconhecimentos_(ap, [normalizar_(vencedor.nome)], false);
    if (resultado.sucesso) {
      props.setProperty(chaveEnvio, formatarData_(new Date(), 'dd/MM/yyyy HH:mm'));
      registrarGanhador_(tri, vencedor, ap.empate);
    }
    return resultado;
  } catch (e) {
    registrarLog_('MVT_RECONHECIMENTO', 'ERRO', e.message);
    return { sucesso: false, msg: e.message };
  }
}
