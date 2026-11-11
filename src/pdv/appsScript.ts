/**
 * Código do Google Apps Script que fica dentro da planilha do usuário.
 * O PDV mostra este texto (com a chave já preenchida) em Config para copiar e colar.
 * Mantido como string porque roda no Google, não no navegador.
 */
export function codigoAppsScript(chave: string) {
  return `// PDV Espetinho — sincronização com esta planilha.
// Jeito mais fácil: script.google.com → Novo projeto → cole este código → Implantar como "App da Web".
// A planilha "PDV Espetinho - vendas" é criada sozinha no seu Google Drive quando o PDV se conectar.
// (Também funciona colado dentro de uma planilha, em Extensões → Apps Script.)
const CHAVE = ${JSON.stringify(chave)};
const ABA_BACKUP = '_backup';
const PEDACO = 40000; // limite de texto por célula do Google Planilhas é 50.000

function doGet(e) {
  return responder(executar(e.parameter || {}));
}

function doPost(e) {
  let req = {};
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: 'Pedido inválido' });
  }
  return responder(executar(req));
}

function executar(req) {
  if (req.chave !== CHAVE) return { ok: false, erro: 'Chave errada. Copie o código de novo em Config do PDV.' };
  const props = PropertiesService.getScriptProperties();
  const ss = planilha(props);

  if (req.acao === 'info') {
    return { ok: true, atualizadoEm: props.getProperty('ATUALIZADO') || null, aparelho: props.getProperty('APARELHO') || null, planilhaUrl: ss.getUrl() };
  }

  if (req.acao === 'carregar') {
    const aba = ss.getSheetByName(ABA_BACKUP);
    if (!aba || aba.getLastRow() === 0) return { ok: true, dados: null };
    const texto = aba.getRange(1, 1, aba.getLastRow(), 1).getValues().map(function (l) { return l[0]; }).join('');
    return { ok: true, atualizadoEm: props.getProperty('ATUALIZADO'), aparelho: props.getProperty('APARELHO'), dados: JSON.parse(texto) };
  }

  if (req.acao === 'salvar') {
    const trava = LockService.getScriptLock();
    trava.waitLock(20000);
    try {
      // abas legíveis
      (req.tabelas || []).forEach(function (t) {
        let aba = ss.getSheetByName(t.nome) || ss.insertSheet(t.nome);
        aba.clearContents();
        const linhas = [t.cabecalho].concat(t.linhas);
        aba.getRange(1, 1, linhas.length, t.cabecalho.length).setValues(linhas);
        aba.getRange(1, 1, 1, t.cabecalho.length).setFontWeight('bold');
        aba.setFrozenRows(1);
      });
      // cópia completa para restaurar
      let backup = ss.getSheetByName(ABA_BACKUP) || ss.insertSheet(ABA_BACKUP);
      backup.clearContents();
      const texto = JSON.stringify(req.dados);
      const pedacos = [];
      for (let i = 0; i < texto.length; i += PEDACO) pedacos.push([texto.slice(i, i + PEDACO)]);
      if (pedacos.length) backup.getRange(1, 1, pedacos.length, 1).setValues(pedacos);
      backup.hideSheet();
      props.setProperty('ATUALIZADO', req.atualizadoEm);
      props.setProperty('APARELHO', req.aparelho || '');
    } finally {
      trava.releaseLock();
    }
    return { ok: true, atualizadoEm: req.atualizadoEm };
  }

  return { ok: false, erro: 'Ação desconhecida' };
}

// A planilha onde o script foi colado; se foi criado em script.google.com, uma planilha própria criada no Drive.
function planilha(props) {
  try {
    const ativa = SpreadsheetApp.getActiveSpreadsheet();
    if (ativa) return ativa;
  } catch (err) {}
  const id = props.getProperty('PLANILHA_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {}
  }
  const nova = SpreadsheetApp.create('PDV Espetinho - vendas');
  props.setProperty('PLANILHA_ID', nova.getId());
  return nova;
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`
}
