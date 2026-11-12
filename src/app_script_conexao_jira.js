/************************************************************
 * AGENTE MVT - SQUAD TRIBUTOS (VERSÃO 2)
 * Formulário mensal (Jira) + Histórico de votos + Cobrança
 * + Apuração trimestral por referência de sprint
 *
 * Mudanças principais em relação à versão anterior:
 *  - Todo voto é gravado na aba "Historico" com a referência
 *    da sprint (ex.: 2026-09) ANTES de o formulário ser zerado.
 *  - A apuração soma pelas 3 referências do trimestre fechado
 *    e roda depois do prazo da última votação.
 *  - Modo teste não altera o formulário nem apaga respostas.
 *  - Empate, voto duplicado e autovoto são tratados.
 *  - Feriados nacionais entram no cálculo de dia útil.
 *  - Um único gatilho diário (rotinaDiariaMVT) cuida de tudo.
 ************************************************************/

const CONFIG = {
  JIRA_BASE_URL: 'https://jiraproducao.totvs.com.br',
  ABA_LOG: 'Logs',
  ABA_TIME: 'TIME',            // Coluna A = e-mail | Coluna B = nome como aparece no formulário (opcional)
  ABA_HISTORICO: 'Historico',
  PROJETOS_PADRAO: ['dtripro', 'dtripro_capex', 'dsertaf4'],

  GOOGLE_FORM_ID: '1VITo2E6Js1_reOMhdxch_dsiPEOTb_pQmTNnIG9UzE8',
  PLANILHA_RESPOSTAS_ID: '1rBbQtJwo25lExfoYqThcTsSAi_epZ4-G0rldwcfk2R8', // usada só na importação do histórico antigo

  EMAIL_GESTOR: 'bruce.mello@totvs.com.br',
  EMAIL_SQUAD: 'squad.tributos@totvs.com.br',

  // Calendário (em dias úteis do mês)
  DIA_UTIL_ENVIO: 1,      // envia o formulário
  DIA_UTIL_COBRANCA: 3,   // cobra quem não votou
  DIA_UTIL_APURACAO: 5,   // apura o trimestre (só em jan/abr/jul/out)
  PRAZO_DIAS_UTEIS: 3,    // prazo de resposta informado no e-mail
  HORA_GATILHO: 8,

  MAX_ISSUES: 1000,
  LIMITE_TEXTO_FORMS: 11500,
  BLOQUEAR_AUTOVOTO: true, // exige nome na coluna B da aba TIME
  COPIAR_SQUAD_NO_VENCEDOR: true, // e-mail do vencedor vai com a squad em cópia

  // Deixe vazio para detecção automática (lista/múltipla escolha = voto; texto = justificativa).
  // Se a detecção errar, informe um trecho do título da pergunta.
  PERGUNTA_VOTO_CONTEM: '',
  PERGUNTA_JUSTIFICATIVA_CONTEM: '',

  // Feriados locais ou pontes, formato 'yyyy-MM-dd'
  FERIADOS_EXTRAS: [],

  // Posição das colunas na planilha antiga de respostas (0 = coluna A)
  LEGADO_COLUNAS: { data: 0, email: 1, votado: 2, justificativa: 3 }
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CABECALHO_HISTORICO = ['Referência', 'Data do voto', 'E-mail', 'Votado', 'Justificativa', 'ID resposta'];
const PROP_REF_ATUAL = 'MVT_REF_ATUAL';
const PROP_REF_INICIO = 'MVT_REF_INICIO'; // quando a rodada atual foi aberta (ISO)

/************************************************************
 * MENU
 ************************************************************/
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('MVT Jira')
    .addItem('📊 Abrir Central MVT', 'abrirCentralMVT')
    .addItem('🎛️ Abrir Painel de Controle', 'abrirPainelMVT')
    .addItem('📖 Abrir Manual de Uso', 'abrirManualMVT')
    .addSeparator()
    .addSubMenu(ui.createMenu('🚀 Disparos do Formulário Mensal')
      .addItem('📤 Executar Disparo Mensal Oficial (Para a Squad)', 'forcarDisparoMensalProducao')
      .addItem('🧪 Executar Disparo Mensal (Modo Teste - Só Gestor)', 'forcarDisparoMensalTeste'))
    .addSubMenu(ui.createMenu('🔔 Cobranças e Lembretes')
      .addItem('✉️ Disparar Lembrete Oficial (Squad + Meu Relatório)', 'forcarCobrancaProducao')
      .addItem('🧪 Testar Lembrete (Visualizar Pendentes)', 'enviarLembreteQuemNaoRespondeuManual'))
    .addSubMenu(ui.createMenu('🏆 Fechamento Trimestral')
      .addItem('🏆 Executar Fechamento Trimestral Oficial', 'forcarApuracaoTrimestralProducao')
      .addItem('🧪 Testar Fechamento Trimestral (Modo Teste)', 'testarApuracaoTrimestralManual'))
    .addSubMenu(ui.createMenu('💌 E-mails de Reconhecimento')
      .addItem('💌 Enviar ao Vencedor e aos Indicados (Oficial)', 'enviarReconhecimentosOficial')
      .addItem('🧪 Testar E-mails de Reconhecimento (Só Gestor)', 'testarReconhecimentos'))
    .addSeparator()
    .addItem('💾 Gravar respostas atuais no Histórico', 'gravarRespostasAgora')
    .addItem('🔑 Configurar Token Jira', 'configurarTokenJira')
    .addItem('⚙️ Implantar / Reinstalar automações', 'implantarMVT')
    .addToUi();
}

function abrirPainelMVT() {
  const html = HtmlService.createHtmlOutputFromFile('PainelHTML').setTitle('Filtros da Votação MVT');
  SpreadsheetApp.getUi().showSidebar(html);
}

function abrirManualMVT() {
  const html = HtmlService.createHtmlOutputFromFile('ManualHTML').setWidth(950).setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'Manual de Operação - MVT Squad Tributos');
}

function configurarTokenJira() {
  const token = Browser.inputBox('Informe o Personal Access Token do Jira');
  if (!token || token === 'cancel') return;
  PropertiesService.getScriptProperties().setProperty('JIRA_TOKEN', token.trim());
  SpreadsheetApp.getUi().alert('Token Jira gravado com segurança.');
}

function confirmar_(mensagem) {
  const ui = SpreadsheetApp.getUi();
  return ui.alert('Atenção', mensagem, ui.ButtonSet.YES_NO) === ui.Button.YES;
}

function mostrarResultado_(resultado) {
  SpreadsheetApp.getUi().alert((resultado.sucesso ? '✅ ' : '❌ ') + resultado.msg);
}

/************************************************************
 * AÇÕES MANUAIS DO MENU
 ************************************************************/
function forcarDisparoMensalProducao() {
  if (!confirmar_('Deseja atualizar o formulário e enviar o e-mail oficial para a Squad Tributos?\n\nAs respostas atuais serão gravadas no Histórico antes de o formulário ser zerado.')) return;
  mostrarResultado_(executarGeracaoMensalCore_(false));
}

function forcarDisparoMensalTeste() {
  mostrarResultado_(executarGeracaoMensalCore_(true));
}

function forcarCobrancaProducao() {
  if (!confirmar_('Deseja disparar os e-mails individuais de cobrança para quem não votou e gerar o seu relatório?')) return;
  mostrarResultado_(verificarEEnviarLembretes_(false));
}

function enviarLembreteQuemNaoRespondeuManual() {
  mostrarResultado_(verificarEEnviarLembretes_(true));
}

function forcarApuracaoTrimestralProducao() {
  if (!confirmar_('Deseja rodar o fechamento trimestral oficial?')) return;
  mostrarResultado_(processarApuracaoTrimestral_(false));
}

function testarApuracaoTrimestralManual() {
  mostrarResultado_(processarApuracaoTrimestral_(true));
}

function gravarRespostasAgora() {
  try {
    const r = arquivarRespostasAtuais_();
    mostrarResultado_({ sucesso: true, msg: `Histórico atualizado: ${r.novas} voto(s) novo(s), ${r.atualizadas} atualizado(s). Referência: ${refAtual_()}.` });
  } catch (e) {
    mostrarResultado_({ sucesso: false, msg: e.message });
  }
}

/************************************************************
 * IMPLANTAÇÃO (rodar uma vez)
 ************************************************************/
function implantarMVT() {
  if (!confirmar_('Isto vai:\n1) criar a aba Historico;\n2) gravar nela as respostas atuais do formulário;\n3) importar os votos antigos da planilha de respostas;\n4) remover os gatilhos de horário antigos e criar o gatilho diário único.\n\nContinuar?')) return;
  try {
    obterAbaHistorico_();
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty(PROP_REF_ATUAL)) {
      props.setProperty(PROP_REF_ATUAL, refMesAnterior_(new Date()));
    }
    const arq = arquivarRespostasAtuais_();
    const importadas = importarHistoricoLegado_();
    instalarGatilhos_();
    const msg = `Implantação concluída.\n\nRodada atual (referência): ${refAtual_()}\nVotos da rodada atual gravados: ${arq.novas}\nVotos antigos importados: ${importadas}\nGatilho diário criado: rotinaDiariaMVT às ${CONFIG.HORA_GATILHO}h.`;
    registrarLog_('MVT_IMPLANTACAO', 'SUCESSO', msg);
    mostrarResultado_({ sucesso: true, msg: msg });
  } catch (e) {
    registrarLog_('MVT_IMPLANTACAO', 'ERRO', e.message);
    mostrarResultado_({ sucesso: false, msg: e.message });
  }
}

function instalarGatilhos_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getEventType() === ScriptApp.EventType.CLOCK) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rotinaDiariaMVT').timeBased().everyDays(1).atHour(CONFIG.HORA_GATILHO).create();
}

/************************************************************
 * ROTINA DIÁRIA (único gatilho)
 ************************************************************/
function rotinaDiariaMVT() {
  const hoje = new Date();
  const n = numeroDiaUtilNoMes_(hoje);
  if (n === 0) return; // fim de semana ou feriado

  if (n === CONFIG.DIA_UTIL_ENVIO) {
    executarEtapaAutomatica_('Geração mensal do formulário', () => executarGeracaoMensalCore_(false));
  }
  if (n === CONFIG.DIA_UTIL_COBRANCA) {
    executarEtapaAutomatica_('Cobrança de pendentes', () => verificarEEnviarLembretes_(false));
  }
  if (n === CONFIG.DIA_UTIL_APURACAO && hoje.getMonth() % 3 === 0) {
    executarEtapaAutomatica_('Apuração trimestral', () => processarApuracaoTrimestral_(false));
  }
}

function executarEtapaAutomatica_(nomeEtapa, fn) {
  let resultado;
  try {
    resultado = fn();
  } catch (e) {
    resultado = { sucesso: false, msg: e.message };
  }
  if (!resultado.sucesso) {
    registrarLog_('MVT_ROTINA', 'ERRO', `${nomeEtapa}: ${resultado.msg}`);
    try {
      MailApp.sendEmail({
        to: CONFIG.EMAIL_GESTOR,
        subject: `[MVT - FALHA] ${nomeEtapa}`,
        body: `A etapa automática "${nomeEtapa}" não foi concluída.\n\nMotivo: ${resultado.msg}\n\nVocê pode reexecutar pelo menu MVT Jira da planilha.`
      });
    } catch (e2) {}
  }
}

/************************************************************
 * GERAÇÃO MENSAL (JIRA -> FORMS -> E-MAIL)
 ************************************************************/
function executarGeracaoMensalCore_(modoTeste) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  return processarVotacaoMVT({
    tituloSprint: `Sprint ${MESES[inicio.getMonth()]}`,
    projetos: CONFIG.PROJETOS_PADRAO,
    dataInicio: formatarData_(inicio, 'yyyy-MM-dd'),
    dataFim: formatarData_(fim, 'yyyy-MM-dd'),
    modoTeste: modoTeste
  });
}

// Também é chamada pelo PainelHTML
function processarVotacaoMVT(dadosForm) {
  const modoTeste = dadosForm && dadosForm.modoTeste === true;
  try {
    const projetos = (dadosForm.projetos || []).map(p => String(p).trim());
    const dataInicio = dadosForm.dataInicio;
    const dataFim = dadosForm.dataFim;
    const tituloSprint = dadosForm.tituloSprint || 'Período Selecionado';

    if (projetos.length === 0) throw new Error('Selecione ao menos um projeto.');
    if (projetos.some(p => !/^[A-Za-z0-9_]+$/.test(p))) throw new Error('Nome de projeto inválido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim || '')) throw new Error('Selecione o período.');
    if (dataInicio > dataFim) throw new Error('A data de início é maior que a data fim.');

    const novaRef = dataInicio.substring(0, 7); // ex.: 2026-09

    // 1) Jira primeiro: se falhar, nada é alterado
    const jql = `project in (${projetos.join(', ')}) AND issuetype not in subTaskIssueTypes() AND issuetype not in ("Lição Aprendida", Gestão) AND resolved >= "${dataInicio} 00:00" AND resolved <= "${dataFim} 23:59" AND status not in (Cancelado) ORDER BY issuetype DESC, key ASC, resolved DESC`;
    const busca = buscarEntregasJira_(jql);
    if (busca.issues.length === 0) throw new Error('Nenhuma entrega encontrada no Jira para o período.');
    const entregas = montarTextoEntregas_(busca.issues);

    // 2) Prazo
    let dataEnvio = new Date();
    if (dadosForm.dataEnvioSimulada) dataEnvio = new Date(dadosForm.dataEnvioSimulada + 'T12:00:00');
    const dataLimiteStr = formatarData_(calcularPrazoDiasUteis_(dataEnvio, CONFIG.PRAZO_DIAS_UTEIS), 'dd/MM');

    const dataRef = new Date(dataInicio + 'T12:00:00');
    const nomeMes = MESES[dataRef.getMonth()];
    const ano = dataRef.getFullYear();
    const avisoCorte = busca.total > busca.issues.length ? ` Atenção: o Jira tem ${busca.total} itens e só ${busca.issues.length} foram lidos.` : '';
    const avisoTexto = entregas.omitidas > 0 ? ` ${entregas.omitidas} entrega(s) não couberam no texto do formulário.` : '';

    // 3) Modo teste: não toca no formulário nem nas respostas
    if (modoTeste) {
      enviarEmailMvt_(nomeMes, ano, dataLimiteStr, true, `Título da seção: ${tituloSprint}\n\n${entregas.texto}`);
      const msgTeste = `TESTE: ${busca.issues.length} entregas encontradas. Prévia enviada para ${CONFIG.EMAIL_GESTOR}. O formulário e as respostas NÃO foram alterados.${avisoCorte}${avisoTexto}`;
      registrarLog_('MVT_MENSAL', 'TESTE', msgTeste);
      return { sucesso: true, msg: msgTeste };
    }

    // 4) Produção: grava o histórico ANTES de zerar o formulário
    const refAnterior = refAtual_();
    const arq = arquivarRespostasAtuais_();
    const novaRodada = novaRef !== refAnterior;
    atualizarSecaoFormulario_(tituloSprint, entregas.texto, novaRodada);
    PropertiesService.getScriptProperties().setProperty(PROP_REF_ATUAL, novaRef);
    if (novaRodada) PropertiesService.getScriptProperties().setProperty(PROP_REF_INICIO, new Date().toISOString());

    enviarEmailMvt_(nomeMes, ano, dataLimiteStr, false, '');

    const msg = novaRodada
      ? `Nova rodada ${novaRef} aberta com ${busca.issues.length} entregas. ${arq.novas} voto(s) da rodada ${refAnterior} gravado(s) no Histórico e formulário zerado. E-mail enviado à squad.${avisoCorte}${avisoTexto}`
      : `Rodada ${novaRef} já estava aberta: formulário atualizado com ${busca.issues.length} entregas, respostas mantidas e e-mail reenviado.${avisoCorte}${avisoTexto}`;
    registrarLog_('MVT_MENSAL', 'SUCESSO', msg);
    return { sucesso: true, msg: msg };
  } catch (error) {
    registrarLog_('MVT_MENSAL', modoTeste ? 'ERRO_TESTE' : 'ERRO', error.message);
    return { sucesso: false, msg: error.message };
  }
}

function buscarEntregasJira_(jql) {
  let startAt = 0, total = 0;
  const todas = [];
  do {
    const resp = chamarJiraApi_(`/rest/api/2/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=50&fields=summary`, 'get');
    const issues = resp.issues || [];
    total = resp.total || 0;
    if (issues.length === 0) break;
    issues.forEach(issue => todas.push({ key: issue.key || '', titulo: (issue.fields && issue.fields.summary) || '' }));
    startAt += issues.length;
  } while (startAt < total && todas.length < CONFIG.MAX_ISSUES);
  return { issues: todas, total: total };
}

function chamarJiraApi_(endpoint, method) {
  const token = PropertiesService.getScriptProperties().getProperty('JIRA_TOKEN');
  if (!token) throw new Error('Token Jira não configurado (menu MVT Jira > Configurar Token Jira).');
  const response = UrlFetchApp.fetch(CONFIG.JIRA_BASE_URL + endpoint, {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const codigo = response.getResponseCode();
  if (codigo === 401 || codigo === 403) throw new Error(`Jira recusou o acesso (HTTP ${codigo}). Verifique se o token expirou.`);
  if (codigo < 200 || codigo >= 300) throw new Error(`Jira respondeu HTTP ${codigo}.`);
  return JSON.parse(response.getContentText());
}

// Monta o texto sem cortar uma entrega no meio
function montarTextoEntregas_(issues) {
  let texto = 'JIRA\n';
  let incluidas = 0;
  for (let i = 0; i < issues.length; i++) {
    const bloco = `${issues[i].key}\n${issues[i].titulo}\n`;
    if (texto.length + bloco.length > CONFIG.LIMITE_TEXTO_FORMS) break;
    texto += bloco;
    incluidas++;
  }
  const omitidas = issues.length - incluidas;
  if (omitidas > 0) texto += `\n... (+${omitidas} entregas não listadas)`;
  return { texto: texto, omitidas: omitidas };
}

function atualizarSecaoFormulario_(novoTituloSecao, textoEntregas, apagarRespostas) {
  const form = FormApp.openById(CONFIG.GOOGLE_FORM_ID);
  const itens = form.getItems();
  let secaoAlvo = null;
  for (let i = 0; i < itens.length && !secaoAlvo; i++) {
    if (itens[i].getType() === FormApp.ItemType.PAGE_BREAK) secaoAlvo = itens[i].asPageBreakItem();
  }
  for (let i = 0; i < itens.length && !secaoAlvo; i++) {
    if (itens[i].getType() === FormApp.ItemType.SECTION_HEADER) secaoAlvo = itens[i].asSectionHeaderItem();
  }
  if (!secaoAlvo) throw new Error('Seção não localizada no Forms.');

  // Só zera depois de localizar a seção (as respostas já estão no Histórico)
  if (apagarRespostas) form.deleteAllResponses();
  secaoAlvo.setTitle(novoTituloSecao);
  secaoAlvo.setHelpText(textoEntregas);
}

function enviarEmailMvt_(nomeMes, ano, dataLimiteStr, modoTeste, previa) {
  const form = FormApp.openById(CONFIG.GOOGLE_FORM_ID);
  const opcoes = {
    to: modoTeste ? CONFIG.EMAIL_GESTOR : CONFIG.EMAIL_SQUAD,
    subject: `${modoTeste ? '[TESTE] ' : ''}MVT Squad Tributos - ${nomeMes} / ${ano}`,
    body: `Olá, pessoal!\n\nSegue o link para votação do MVT:\n\n${form.getPublishedUrl()}\n\nResponder até ${dataLimiteStr}. Obrigado, conto com a participação de vocês!`
  };
  if (!modoTeste) opcoes.cc = CONFIG.EMAIL_GESTOR;
  if (modoTeste && previa) {
    opcoes.body += `\n\n----- PRÉVIA DO QUE SERIA GRAVADO NO FORMULÁRIO -----\n\n${previa}`;
  }
  MailApp.sendEmail(opcoes);
}

/************************************************************
 * HISTÓRICO DE VOTOS
 ************************************************************/
function obterAbaHistorico_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(CONFIG.ABA_HISTORICO);
  if (!aba) {
    aba = ss.insertSheet(CONFIG.ABA_HISTORICO);
    aba.getRange('A:A').setNumberFormat('@'); // referência como texto (evita virar data)
    aba.getRange('F:F').setNumberFormat('@');
    aba.getRange(1, 1, 1, CABECALHO_HISTORICO.length).setValues([CABECALHO_HISTORICO]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

function lerHistorico_() {
  const aba = obterAbaHistorico_();
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, 6).getValues().map((l, i) => ({
    linha: i + 2,
    ref: refDeCelula_(l[0]),
    data: l[1] instanceof Date ? l[1] : new Date(l[1]),
    email: String(l[2] || '').toLowerCase().trim(),
    votado: String(l[3] || '').trim(),
    justificativa: String(l[4] || '').trim(),
    id: String(l[5] || '').trim()
  }));
}

// Copia as respostas que estão no Forms para a aba Historico. Não apaga nada.
// Pode rodar quantas vezes for preciso: usa o ID da resposta para não duplicar.
function arquivarRespostasAtuais_() {
  const form = FormApp.openById(CONFIG.GOOGLE_FORM_ID);
  const respostas = form.getResponses();
  const resultado = { novas: 0, atualizadas: 0 };
  if (respostas.length === 0) return resultado;

  // Quem edita uma resposta antiga pelo link "Editar resposta" mantém o mesmo ID no Forms.
  // Por isso a edição de respostas fica desligada e, mais abaixo, um ID só atualiza a linha
  // da MESMA rodada: votos de rodadas anteriores nunca são sobrescritos.
  try { if (form.canEditResponse()) form.setAllowResponseEdits(false); } catch (e) {}

  const ref = refAtual_();
  const inicio = inicioRodada_(ref);
  const aba = obterAbaHistorico_();
  const existentes = {};
  lerHistorico_().forEach(h => { if (h.id) existentes[h.ref + '|' + h.id] = h; });

  const novas = [];
  respostas.forEach(resp => {
    const voto = extrairVoto_(resp);
    if (!voto.votado) return;
    const id = resp.getId();
    const email = String(resp.getRespondentEmail() || '').toLowerCase().trim();
    const antigo = existentes[ref + '|' + id];
    // Resposta anterior à abertura da rodada: pertence à rodada passada e já está no Histórico
    if (!antigo && resp.getTimestamp() < inicio) return;
    if (antigo) {
      // resposta editada pelo votante dentro da mesma rodada: atualiza a linha existente
      if (antigo.votado !== voto.votado || antigo.justificativa !== voto.justificativa) {
        aba.getRange(antigo.linha, 2, 1, 4).setValues([[resp.getTimestamp(), email, voto.votado, voto.justificativa]]);
        resultado.atualizadas++;
      }
      return;
    }
    novas.push([ref, resp.getTimestamp(), email, voto.votado, voto.justificativa, id]);
  });

  if (novas.length > 0) {
    aba.getRange(aba.getLastRow() + 1, 1, novas.length, 6).setValues(novas);
    resultado.novas = novas.length;
  }
  return resultado;
}

function extrairVoto_(resp) {
  const itens = resp.getItemResponses();
  const alvoVoto = normalizar_(CONFIG.PERGUNTA_VOTO_CONTEM);
  const alvoJust = normalizar_(CONFIG.PERGUNTA_JUSTIFICATIVA_CONTEM);
  const T = FormApp.ItemType;
  let votado = '', justificativa = '';

  itens.forEach(ir => {
    const item = ir.getItem();
    const titulo = normalizar_(item.getTitle());
    const tipo = item.getType();
    const valor = textoResposta_(ir.getResponse());
    if (!valor) return;
    const ehVoto = alvoVoto ? titulo.indexOf(alvoVoto) !== -1 : (tipo === T.LIST || tipo === T.MULTIPLE_CHOICE);
    const ehJust = alvoJust ? titulo.indexOf(alvoJust) !== -1 : (tipo === T.PARAGRAPH_TEXT || tipo === T.TEXT);
    if (ehVoto && !votado) votado = valor;
    else if (ehJust && !justificativa) justificativa = valor;
  });

  // Reserva: 1ª pergunta = voto, 2ª = justificativa (mesma ordem da planilha antiga)
  if (!votado && itens.length > 0) {
    votado = textoResposta_(itens[0].getResponse());
    justificativa = itens.length > 1 ? textoResposta_(itens[1].getResponse()) : '';
  }
  return { votado: votado, justificativa: justificativa };
}

// Importa os votos antigos da planilha de respostas do Forms (uma vez).
// A referência é o mês anterior à data do voto (voto em agosto = sprint de julho).
function importarHistoricoLegado_() {
  let ssLegado;
  try {
    ssLegado = SpreadsheetApp.openById(CONFIG.PLANILHA_RESPOSTAS_ID);
  } catch (e) {
    registrarLog_('MVT_LEGADO', 'AVISO', 'Planilha antiga de respostas inacessível: ' + e.message);
    return 0;
  }
  let abaLegado = ssLegado.getSheetByName('Respostas ao formulário 1');
  if (!abaLegado) {
    const abas = ssLegado.getSheets();
    for (let i = 0; i < abas.length && !abaLegado; i++) {
      const nome = abas[i].getName().toLowerCase();
      if (nome.indexOf('log') !== -1 || nome === 'time') continue;
      if (nome.indexOf('resposta') !== -1 || nome.indexOf('form') !== -1) abaLegado = abas[i];
    }
  }
  if (!abaLegado || abaLegado.getLastRow() < 2) return 0;

  const dados = abaLegado.getRange(2, 1, abaLegado.getLastRow() - 1, abaLegado.getLastColumn()).getValues();
  const ids = {}, chavesTempo = {}, chavesEmail = {};
  lerHistorico_().forEach(h => {
    ids[h.id] = true;
    chavesTempo[chaveTempo_(h.data, h.votado)] = true;
    if (h.email) chavesEmail[h.ref + '|' + h.email] = true;
  });

  const c = CONFIG.LEGADO_COLUNAS;
  const novas = [];
  dados.forEach((l, i) => {
    if (!l[c.data]) return;
    const data = l[c.data] instanceof Date ? l[c.data] : new Date(l[c.data]);
    if (isNaN(data.getTime())) return;
    const votado = String(l[c.votado] || '').trim();
    if (!votado) return;
    const id = 'LEGADO-' + (i + 2);
    let email = String(l[c.email] || '').toLowerCase().trim();
    if (email.indexOf('@') === -1) email = '';
    const ref = refMesAnterior_(data);
    // pula o que já foi importado ou já veio direto do Forms
    if (ids[id] || chavesTempo[chaveTempo_(data, votado)] || (email && chavesEmail[ref + '|' + email])) return;
    novas.push([ref, data, email, votado, String(l[c.justificativa] || '').trim(), id]);
  });

  if (novas.length > 0) {
    const aba = obterAbaHistorico_();
    aba.getRange(aba.getLastRow() + 1, 1, novas.length, 6).setValues(novas);
  }
  return novas.length;
}

/************************************************************
 * COBRANÇA DE QUEM NÃO VOTOU
 ************************************************************/
function lerTime_() {
  const time = { emails: [], nomePorEmail: {} };
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_TIME);
  if (!aba || aba.getLastRow() < 2) return time;
  const colunas = Math.min(2, aba.getLastColumn());
  aba.getRange(2, 1, aba.getLastRow() - 1, colunas).getValues().forEach(l => {
    const email = String(l[0] || '').toLowerCase().trim();
    if (!email || email.indexOf('@') === -1 || time.emails.indexOf(email) !== -1) return;
    time.emails.push(email);
    const nome = colunas > 1 ? String(l[1] || '').trim() : '';
    if (nome) time.nomePorEmail[email] = nome;
  });
  return time;
}

function verificarEEnviarLembretes_(modoTeste) {
  try {
    const time = lerTime_();
    if (time.emails.length === 0) return { sucesso: false, msg: 'Aba TIME não encontrada ou sem e-mails na coluna A.' };

    const form = FormApp.openById(CONFIG.GOOGLE_FORM_ID);
    const respostas = form.getResponses(); // o formulário é zerado a cada rodada: tudo aqui é da rodada atual
    const responderam = {};
    let semEmail = 0;
    respostas.forEach(r => {
      const e = String(r.getRespondentEmail() || '').toLowerCase().trim();
      if (e) responderam[e] = true; else semEmail++;
    });
    if (respostas.length > 0 && semEmail === respostas.length) {
      return { sucesso: false, msg: 'O formulário não está coletando e-mails, então não dá para saber quem votou. Ative "Coletar endereços de e-mail" nas configurações do Forms. Nenhuma cobrança foi enviada.' };
    }

    const pendentes = time.emails.filter(e => !responderam[e]);
    if (pendentes.length === 0) return { sucesso: true, msg: 'Todo o time já respondeu nesta rodada. Nenhuma cobrança enviada.' };

    const assunto = 'Lembrete: Votação MVT Squad Tributos';
    const corpo = `Olá!\n\nNotamos que você ainda não votou no MVT. Por favor, responda no link:\n\n${form.getPublishedUrl()}\n\nContamos com você!`;

    if (modoTeste) {
      MailApp.sendEmail({
        to: CONFIG.EMAIL_GESTOR,
        subject: '[TESTE] ' + assunto,
        body: `[TESTE DE LEMBRETE - ${pendentes.length} pendente(s)]\n• ${pendentes.join('\n• ')}\n\n----- TEXTO QUE SERIA ENVIADO -----\n\n${corpo}`
      });
      return { sucesso: true, msg: `TESTE: ${pendentes.length} pendente(s). Lista enviada para ${CONFIG.EMAIL_GESTOR}; ninguém da squad foi cobrado.` };
    }

    const falhas = [];
    pendentes.forEach(email => {
      try { MailApp.sendEmail({ to: email, subject: assunto, body: corpo }); }
      catch (e) { falhas.push(email); }
    });

    MailApp.sendEmail({
      to: CONFIG.EMAIL_GESTOR,
      subject: '[RELATÓRIO DE COBRANÇA] Lembretes MVT Disparados',
      body: `Olá,\n\nA cobrança do MVT (rodada ${refAtual_()}) foi disparada.\n\n` +
            `📊 RESPONDERAM: ${time.emails.length - pendentes.length} de ${time.emails.length}\n` +
            `📊 PENDENTES: ${pendentes.length}\n\n` +
            `✉️ E-MAILS COBRADOS:\n• ${pendentes.join('\n• ')}\n\n` +
            (falhas.length ? `⚠️ FALHA NO ENVIO PARA:\n• ${falhas.join('\n• ')}\n\n` : '') +
            `Atenciosamente,\nAgente MVT`
    });
    const msg = `Cobrança enviada para ${pendentes.length - falhas.length} pessoa(s)${falhas.length ? `, ${falhas.length} falha(s)` : ''}. Relatório enviado para ${CONFIG.EMAIL_GESTOR}.`;
    registrarLog_('MVT_COBRANCA', 'SUCESSO', msg);
    return { sucesso: true, msg: msg };
  } catch (e) {
    registrarLog_('MVT_COBRANCA', 'ERRO', e.message);
    return { sucesso: false, msg: e.message };
  }
}

/************************************************************
 * APURAÇÃO TRIMESTRAL
 ************************************************************/
// Último trimestre fechado em relação a hoje (em qualquer mês do ano)
function trimestreFechado_(hoje) {
  let ano = hoje.getFullYear();
  let tri = Math.floor(hoje.getMonth() / 3) - 1;
  if (tri < 0) { tri = 3; ano--; }
  return trimestrePorIndice_(ano, tri);
}

// tri = 0 (jan-mar) a 3 (out-dez)
function trimestrePorIndice_(ano, tri) {
  const indices = [tri * 3, tri * 3 + 1, tri * 3 + 2];
  return {
    chave: ano + '-T' + (tri + 1),
    refs: indices.map(m => ano + '-' + ('0' + (m + 1)).slice(-2)),
    rotulo: `${MESES[indices[0]]}, ${MESES[indices[1]]} e ${MESES[indices[2]]} de ${ano}`
  };
}

// Trimestre ao qual uma referência yyyy-MM pertence
function trimestreDaRef_(ref) {
  return trimestrePorIndice_(parseInt(ref.substring(0, 4), 10), Math.floor((parseInt(ref.substring(5, 7), 10) - 1) / 3));
}

// Calcula o resultado do último trimestre fechado. Usada pelo fechamento e pelos e-mails de reconhecimento.
function apurarTrimestre_(hoje) {
  // Garante que a rodada em andamento também esteja no Histórico (não apaga nada)
  arquivarRespostasAtuais_();
  return apurarPeriodo_(trimestreFechado_(hoje), lerHistorico_(), lerTime_());
}

// Cálculo puro de um trimestre qualquer (usado também pela Central MVT)
function apurarPeriodo_(tri, historico, time) {
  const votosPeriodo = historico
    .filter(v => tri.refs.indexOf(v.ref) !== -1 && v.votado)
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  if (votosPeriodo.length === 0) {
    throw new Error(`Nenhum voto no Histórico para ${tri.rotulo} (referências ${tri.refs.join(', ')}).`);
  }

  // Regras: 1 voto por pessoa por sprint (vale o mais recente) e sem autovoto
  const porPessoa = {};
  const anonimos = [];
  let duplicados = 0, autovotos = 0;
  votosPeriodo.forEach(v => {
    const nomeDoVotante = v.email ? time.nomePorEmail[v.email] : '';
    if (CONFIG.BLOQUEAR_AUTOVOTO && nomeDoVotante && normalizar_(nomeDoVotante) === normalizar_(v.votado)) { autovotos++; return; }
    if (!v.email) { anonimos.push(v); return; }
    const chave = v.ref + '|' + v.email;
    if (porPessoa[chave]) duplicados++;
    porPessoa[chave] = v;
  });
  const validos = Object.keys(porPessoa).map(k => porPessoa[k]).concat(anonimos);
  if (validos.length === 0) throw new Error('Todos os votos do período foram descartados pelas regras (autovoto/duplicidade).');

  // Contagem
  const placar = {};
  const votosPorRef = {};
  tri.refs.forEach(r => { votosPorRef[r] = 0; });
  validos.forEach(v => {
    const chave = normalizar_(v.votado);
    if (!placar[chave]) placar[chave] = { nome: v.votado, votos: 0, depoimentos: [] };
    placar[chave].votos++;
    votosPorRef[v.ref]++;
    if (v.justificativa.length > 2) placar[chave].depoimentos.push(v.justificativa);
  });
  const ranking = Object.keys(placar).map(k => placar[k])
    .sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome));
  const lideres = ranking.filter(p => p.votos === ranking[0].votos);
  const empate = lideres.length > 1;
  return { tri: tri, time: time, validos: validos, anonimos: anonimos, duplicados: duplicados, autovotos: autovotos,
           votosPorRef: votosPorRef, ranking: ranking, lideres: lideres, empate: empate };
}

function processarApuracaoTrimestral_(modoTeste) {
  try {
    const hoje = new Date();
    const ap = apurarTrimestre_(hoje);
    const tri = ap.tri, validos = ap.validos, anonimos = ap.anonimos, duplicados = ap.duplicados;
    const autovotos = ap.autovotos, votosPorRef = ap.votosPorRef, ranking = ap.ranking;
    const lideres = ap.lideres, empate = ap.empate;

    // Avisos
    const avisos = [];
    tri.refs.forEach(r => { if (votosPorRef[r] === 0) avisos.push(`Sem votos registrados para a sprint ${r}.`); });
    if (hoje.getMonth() % 3 === 0 && diasUteisDecorridos_(hoje) < CONFIG.DIA_UTIL_APURACAO) {
      avisos.push(`A votação da sprint ${tri.refs[2]} ainda pode estar aberta: este resultado é parcial.`);
    }
    if (anonimos.length > 0) avisos.push(`${anonimos.length} voto(s) sem e-mail: não foi possível checar duplicidade/autovoto neles.`);
    if (empate) avisos.push('Houve empate: o desempate precisa ser decidido manualmente.');

    // E-mail
    let corpo = `Olá,\n\nApuração do MVT - ${tri.rotulo}\n\n`;
    corpo += empate
      ? `⚠️ EMPATE entre: ${lideres.map(p => p.nome.toUpperCase()).join(' e ')} (${ranking[0].votos} votos cada)\n\n`
      : `⭐ VENCEDOR: ${ranking[0].nome.toUpperCase()} (${ranking[0].votos} votos)\n\n`;
    corpo += `📊 VOTOS VÁLIDOS: ${validos.length}\n`;
    tri.refs.forEach(r => { corpo += `   • Sprint ${r}: ${votosPorRef[r]}\n`; });
    corpo += `   • Descartados: ${duplicados} duplicado(s), ${autovotos} autovoto(s)\n\n`;
    corpo += `🏅 RANKING COMPLETO:\n`;
    ranking.forEach((p, i) => { corpo += `   ${i + 1}. ${p.nome} - ${p.votos}\n`; });
    corpo += `\n💬 JUSTIFICATIVAS:\n\n`;
    lideres.forEach(p => {
      if (empate) corpo += `${p.nome}:\n`;
      const msgs = p.depoimentos.slice(0, 5);
      corpo += msgs.length ? msgs.map(m => `• "${m}"`).join('\n\n') + '\n\n' : 'Nenhuma justificativa cadastrada.\n\n';
    });
    if (avisos.length > 0) corpo += `⚠️ AVISOS:\n• ${avisos.join('\n• ')}\n\n`;
    corpo += `Atenciosamente,\nAgente MVT`;

    MailApp.sendEmail({
      to: CONFIG.EMAIL_GESTOR,
      subject: `${modoTeste ? '[TESTE] ' : '[FECHAMENTO] '}🏆 Resultado MVT Trimestral - ${tri.rotulo}`,
      body: corpo
    });

    const resumo = empate
      ? `Empate entre ${lideres.map(p => p.nome).join(' e ')} com ${ranking[0].votos} votos.`
      : `Vencedor: ${ranking[0].nome} com ${ranking[0].votos} votos.`;
    const msg = `${tri.rotulo}: ${resumo} ${validos.length} votos válidos. Detalhes enviados para ${CONFIG.EMAIL_GESTOR}.`;
    registrarLog_('MVT_APURACAO', modoTeste ? 'TESTE' : 'SUCESSO', msg);
    return { sucesso: true, msg: msg };
  } catch (e) {
    registrarLog_('MVT_APURACAO', 'ERRO', e.message);
    return { sucesso: false, msg: e.message };
  }
}

/************************************************************
 * E-MAILS DE RECONHECIMENTO (VENCEDOR + INDICADOS)
 * As mensagens são enviadas sem identificar quem votou.
 * O e-mail de cada pessoa vem da aba TIME (A = e-mail, B = nome
 * igual ao do formulário).
 ************************************************************/
function testarReconhecimentos() {
  try {
    const ap = apurarTrimestre_(new Date());
    // No teste, em caso de empate, todos os líderes recebem o layout de vencedor
    mostrarResultado_(enviarReconhecimentos_(ap, ap.lideres.map(p => normalizar_(p.nome)), true));
  } catch (e) {
    mostrarResultado_({ sucesso: false, msg: e.message });
  }
}

function enviarReconhecimentosOficial() {
  const ui = SpreadsheetApp.getUi();
  try {
    const hoje = new Date();
    const ap = apurarTrimestre_(hoje);
    let vencedor = ap.lideres[0];

    if (ap.empate) {
      const lista = ap.lideres.map((p, i) => `${i + 1}. ${p.nome}`).join('\n');
      const resp = ui.prompt('Empate', `Houve empate com ${ap.lideres[0].votos} votos entre:\n\n${lista}\n\nDigite o número de quem será o vencedor:`, ui.ButtonSet.OK_CANCEL);
      if (resp.getSelectedButton() !== ui.Button.OK) return;
      vencedor = ap.lideres[parseInt(resp.getResponseText(), 10) - 1];
      if (!vencedor) { mostrarResultado_({ sucesso: false, msg: 'Número inválido. Nada foi enviado.' }); return; }
    }

    const emailPorNome = mapaEmailPorNome_(ap.time);
    const semEmail = ap.ranking.filter(p => !emailPorNome[normalizar_(p.nome)]).map(p => p.nome);
    const props = PropertiesService.getScriptProperties();
    const chaveEnvio = 'MVT_RECONHECIMENTO_' + ap.tri.refs[2];

    let aviso = `Trimestre: ${ap.tri.rotulo}\nVencedor: ${vencedor.nome} (${vencedor.votos} votos)\nIndicados que também receberão e-mail: ${ap.ranking.length - 1}\n`;
    if (semEmail.length) aviso += `\n⚠️ Sem e-mail na aba TIME (não receberão): ${semEmail.join(', ')}\n`;
    if (hoje.getMonth() % 3 === 0 && diasUteisDecorridos_(hoje) < CONFIG.DIA_UTIL_APURACAO) aviso += `\n⚠️ A votação da sprint ${ap.tri.refs[2]} ainda pode estar aberta: o resultado pode mudar.\n`;
    if (props.getProperty(chaveEnvio)) aviso += `\n⚠️ Estes e-mails JÁ foram enviados em ${props.getProperty(chaveEnvio)}.\n`;
    if (!confirmar_(aviso + '\nEnviar os e-mails agora para as pessoas?')) return;

    const resultado = enviarReconhecimentos_(ap, [normalizar_(vencedor.nome)], false);
    if (resultado.sucesso) {
      props.setProperty(chaveEnvio, formatarData_(hoje, 'dd/MM/yyyy HH:mm'));
      registrarGanhador_(ap.tri, vencedor, ap.empate);
    }
    mostrarResultado_(resultado);
  } catch (e) {
    registrarLog_('MVT_RECONHECIMENTO', 'ERRO', e.message);
    mostrarResultado_({ sucesso: false, msg: e.message });
  }
}

function mapaEmailPorNome_(time) {
  const mapa = {};
  Object.keys(time.nomePorEmail).forEach(email => { mapa[normalizar_(time.nomePorEmail[email])] = email; });
  return mapa;
}

function enviarReconhecimentos_(ap, vencedoresNorm, modoTeste) {
  const emailPorNome = mapaEmailPorNome_(ap.time);
  const nomesVencedores = ap.ranking.filter(p => vencedoresNorm.indexOf(normalizar_(p.nome)) !== -1).map(p => p.nome);
  const enviados = [], semEmail = [], falhas = [];

  ap.ranking.forEach(p => {
    const ehVencedor = vencedoresNorm.indexOf(normalizar_(p.nome)) !== -1;
    const emailReal = emailPorNome[normalizar_(p.nome)] || '';
    if (!emailReal && !modoTeste) { semEmail.push(p.nome); return; }
    const email = montarEmailReconhecimento_(p, ap.tri, ehVencedor, nomesVencedores);
    try {
      const copiaSquad = ehVencedor && CONFIG.COPIAR_SQUAD_NO_VENCEDOR;
      const opcoes = {
        to: modoTeste ? CONFIG.EMAIL_GESTOR : emailReal,
        subject: modoTeste ? `[TESTE → ${emailReal || 'SEM E-MAIL NA ABA TIME'}${copiaSquad ? ' + cópia squad' : ''}] ${email.assunto}` : email.assunto,
        body: email.texto,
        htmlBody: email.html,
        name: 'MVT Squad Tributos'
      };
      // O vencedor é anunciado com a squad em cópia; os demais indicados recebem em particular
      if (copiaSquad && !modoTeste) opcoes.cc = CONFIG.EMAIL_SQUAD;
      // Cópia oculta para o gestor acompanhar o que cada pessoa recebeu
      if (!modoTeste && emailReal !== CONFIG.EMAIL_GESTOR.toLowerCase()) opcoes.bcc = CONFIG.EMAIL_GESTOR;
      MailApp.sendEmail(opcoes);
      enviados.push(`${p.nome}${ehVencedor ? ' (vencedor)' : ''}`);
      if (!emailReal) semEmail.push(p.nome);
    } catch (e) {
      falhas.push(p.nome);
    }
  });

  if (!modoTeste) {
    MailApp.sendEmail({
      to: CONFIG.EMAIL_GESTOR,
      subject: `[MVT] E-mails de reconhecimento enviados - ${ap.tri.rotulo}`,
      body: `Enviados (${enviados.length}):\n• ${enviados.join('\n• ') || '-'}\n\n` +
            (semEmail.length ? `Sem e-mail na aba TIME (não enviados):\n• ${semEmail.join('\n• ')}\n\n` : '') +
            (falhas.length ? `Falha no envio:\n• ${falhas.join('\n• ')}\n\n` : '') +
            `Agente MVT`
    });
  }

  let msg = modoTeste
    ? `TESTE: ${enviados.length} e-mail(s) enviados só para ${CONFIG.EMAIL_GESTOR}. O destinatário real aparece no assunto.`
    : `${enviados.length} e-mail(s) de reconhecimento enviados.`;
  if (semEmail.length) msg += `\n\nSem e-mail na aba TIME: ${semEmail.join(', ')}. Preencha a coluna B com o nome igual ao do formulário.`;
  if (falhas.length) msg += `\n\nFalha no envio: ${falhas.join(', ')}.`;
  registrarLog_('MVT_RECONHECIMENTO', modoTeste ? 'TESTE' : 'SUCESSO', msg);
  return { sucesso: enviados.length > 0, msg: msg };
}

function escaparHtml_(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function montarEmailReconhecimento_(pessoa, tri, ehVencedor, nomesVencedores) {
  const primeiroNome = pessoa.nome.split(' ')[0];
  const qtd = pessoa.votos;
  const tema = ehVencedor
    ? { topo: '#1f4e78', destaque: '#f5b301', fundoCard: '#fff8e1', emoji: '🏆', selo: 'MVT DO TRIMESTRE' }
    : { topo: '#1f4e78', destaque: '#2a9d8f', fundoCard: '#eef8f6', emoji: '🌟', selo: 'VOCÊ FOI INDICADO(A)' };

  const assunto = ehVencedor
    ? `🏆 Parabéns, ${primeiroNome}! O MVT do trimestre é seu`
    : `🌟 ${primeiroNome}, você foi lembrado(a) no MVT do trimestre`;

  const abertura = ehVencedor
    ? `Você recebeu o maior número de votos da Squad Tributos em <b>${escaparHtml_(tri.rotulo)}</b>: foram <b>${qtd} ${qtd === 1 ? 'voto' : 'votos'}</b> dos seus colegas. Esse reconhecimento vem de quem trabalha com você todos os dias.`
    : `Na votação do MVT de <b>${escaparHtml_(tri.rotulo)}</b>, você recebeu <b>${qtd} ${qtd === 1 ? 'indicação' : 'indicações'}</b> dos seus colegas da Squad Tributos. O seu trabalho foi notado e fez diferença para o time.`;

  const tituloCards = ehVencedor ? 'O que disseram sobre você' : 'O que escreveram para você';
  const cards = pessoa.depoimentos.length
    ? pessoa.depoimentos.map(m =>
        `<tr><td style="padding:0 32px 14px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tema.fundoCard};border-left:5px solid ${tema.destaque};border-radius:8px;">
            <tr><td style="padding:16px 20px;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#333333;">
              <div style="font-family:Georgia,serif;font-size:34px;line-height:24px;color:${tema.destaque};">&ldquo;</div>
              ${escaparHtml_(m)}
            </td></tr>
          </table>
        </td></tr>`).join('')
    : `<tr><td style="padding:0 32px 14px 32px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#666666;">Os colegas votaram em você, mas não deixaram mensagem escrita desta vez.</td></tr>`;

  const fechamento = ehVencedor
    ? 'Parabéns pela conquista e obrigado por tudo o que você entrega!'
    : `O MVT deste trimestre ficou com <b>${escaparHtml_(nomesVencedores.join(' e '))}</b>, mas estas mensagens são suas. Obrigado por tudo o que você entrega!`;

  const html =
    `<div style="margin:0;padding:24px 0;background:#f2f4f7;">
      <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td align="center" style="background:${tema.topo};padding:36px 32px 30px 32px;font-family:Segoe UI,Arial,sans-serif;">
          <div style="font-size:56px;line-height:60px;">${tema.emoji}</div>
          <div style="display:inline-block;margin-top:12px;padding:5px 14px;background:${tema.destaque};border-radius:20px;font-size:12px;font-weight:bold;letter-spacing:1.5px;color:#ffffff;">${tema.selo}</div>
          <div style="margin-top:14px;font-size:28px;font-weight:bold;color:#ffffff;">${escaparHtml_(pessoa.nome)}</div>
          <div style="margin-top:6px;font-size:14px;color:#c9d8e6;">Squad Tributos &middot; ${escaparHtml_(tri.rotulo)}</div>
        </td></tr>
        <tr><td style="padding:28px 32px 8px 32px;font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;">
          Olá, ${escaparHtml_(primeiroNome)}!<br><br>${abertura}
        </td></tr>
        <tr><td style="padding:18px 32px 14px 32px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${tema.topo};">${tituloCards}</td></tr>
        ${cards}
        <tr><td style="padding:12px 32px 28px 32px;font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;">${fechamento}</td></tr>
        <tr><td align="center" style="background:#f7f9fb;padding:16px 32px;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#8a94a0;">
          As mensagens são compartilhadas sem identificar quem escreveu.<br>MVT &middot; Squad Tributos
        </td></tr>
      </table>
    </div>`;

  const texto = `Olá, ${primeiroNome}!\n\n` +
    (ehVencedor
      ? `Você é o MVT da Squad Tributos em ${tri.rotulo}, com ${qtd} voto(s).\n\n`
      : `Você recebeu ${qtd} indicação(ões) no MVT da Squad Tributos em ${tri.rotulo}.\n\n`) +
    (pessoa.depoimentos.length ? 'Mensagens dos colegas:\n\n' + pessoa.depoimentos.map(m => `• "${m}"`).join('\n\n') + '\n\n' : '') +
    'Obrigado por tudo o que você entrega!\nMVT - Squad Tributos';

  return { assunto: assunto, html: html, texto: texto };
}

/************************************************************
 * DATAS, DIAS ÚTEIS E FERIADOS
 ************************************************************/
function formatarData_(data, formato) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), formato);
}

function refMesAnterior_(data) {
  return formatarData_(new Date(data.getFullYear(), data.getMonth() - 1, 1, 12), 'yyyy-MM');
}

// Referência da rodada que está aberta no formulário
function refAtual_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_REF_ATUAL) || refMesAnterior_(new Date());
}

// Início da rodada atual: gravado no envio oficial; sem registro, 1º dia do mês seguinte à sprint
function inicioRodada_(ref) {
  const salvo = PropertiesService.getScriptProperties().getProperty(PROP_REF_INICIO);
  const ano = parseInt(ref.substring(0, 4), 10), mes = parseInt(ref.substring(5, 7), 10);
  const padrao = new Date(ano, mes, 1);
  if (!salvo) return padrao;
  const d = new Date(salvo);
  // O registro só vale se for da rodada atual (posterior ao fim da sprint)
  return isNaN(d.getTime()) || d < padrao ? padrao : d;
}

function refDeCelula_(valor) {
  return valor instanceof Date ? formatarData_(valor, 'yyyy-MM') : String(valor || '').trim();
}

function chaveTempo_(data, votado) {
  const d = data instanceof Date && !isNaN(data.getTime()) ? formatarData_(data, 'yyyy-MM-dd HH:mm:ss') : '';
  return d + '|' + normalizar_(votado);
}

function calcularPascoa_(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12);
}

function feriadosDoAno_(ano) {
  // Nacionais fixos
  const lista = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(d => ano + '-' + d);
  // Móveis: Carnaval (seg e ter), Sexta-feira Santa, Corpus Christi
  const pascoa = calcularPascoa_(ano);
  [-48, -47, -2, 60].forEach(deslocamento => {
    const d = new Date(pascoa.getTime());
    d.setDate(d.getDate() + deslocamento);
    lista.push(formatarData_(d, 'yyyy-MM-dd'));
  });
  return lista;
}

function ehDiaUtil_(data) {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  const chave = formatarData_(data, 'yyyy-MM-dd');
  return feriadosDoAno_(data.getFullYear()).indexOf(chave) === -1 && CONFIG.FERIADOS_EXTRAS.indexOf(chave) === -1;
}

// Quantos dias úteis o mês já teve até a data (inclusive)
function diasUteisDecorridos_(data) {
  let n = 0;
  for (let dia = 1; dia <= data.getDate(); dia++) {
    if (ehDiaUtil_(new Date(data.getFullYear(), data.getMonth(), dia, 12))) n++;
  }
  return n;
}

// 1 = primeiro dia útil do mês, 2 = segundo... 0 = hoje não é dia útil
function numeroDiaUtilNoMes_(data) {
  const hojeMeioDia = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 12);
  return ehDiaUtil_(hojeMeioDia) ? diasUteisDecorridos_(data) : 0;
}

function calcularPrazoDiasUteis_(dataEnvio, quantidade) {
  const resultado = new Date(dataEnvio.getFullYear(), dataEnvio.getMonth(), dataEnvio.getDate(), 12);
  while (!ehDiaUtil_(resultado)) resultado.setDate(resultado.getDate() + 1);
  let adicionados = 0;
  while (adicionados < quantidade) {
    resultado.setDate(resultado.getDate() + 1);
    if (ehDiaUtil_(resultado)) adicionados++;
  }
  return resultado;
}

/************************************************************
 * UTILITÁRIOS
 ************************************************************/
function normalizar_(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function textoResposta_(valor) {
  if (Array.isArray(valor)) return valor.join(', ').trim();
  return String(valor || '').trim();
}

function registrarLog_(acao, status, detalhe) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let aba = ss.getSheetByName(CONFIG.ABA_LOG);
    if (!aba) aba = ss.insertSheet(CONFIG.ABA_LOG);
    aba.appendRow([new Date(), acao, status, String(detalhe || '').substring(0, 1000)]);
  } catch (e) {}
}