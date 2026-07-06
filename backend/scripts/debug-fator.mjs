// Script de debug: chama portal Fator direto e mostra o que foi retornado.
// Replica o parser de fator-transparencia.service.ts (novo formato + fallback antigo).
// Uso: node scripts/debug-fator.mjs [cnpj] [ano]
// Ex:  node scripts/debug-fator.mjs 24393499000102 2026

const ORG_ID = 'cmlem';
const BASE_URL = 'https://transparencia.fatorsistemas.com.br/dados/carregaDespesa.php';

const cnpj = process.argv[2] || '24393499000102';
const ano = parseInt(process.argv[3] || '2026', 10);

const params = new URLSearchParams({
  id: ORG_ID,
  unidade_gestora: '1',
  tipo: '-1',
  fornecedor: '',
  cpfcnpj: cnpj.replace(/\D/g, ''),
  data_publicacao: `01/01/${ano}`,
  data_publicacao_fim: `31/12/${ano}`,
  Numero: '',
  NProcesso: '',
  funcao: '-1',
  subfuncao: '-1',
  Despesa: '',
  Historico: '',
  fonte: '-1',
  acao: '-1',
  Valor: '',
  modalidade: '-1',
  Categoria_Economica: '-1',
  Grupo_Despesa: '-1',
  Modalidade_Aplicacao: '-1',
  Elemento: '-1',
  Subelemento: '-1',
  nContrato: '',
  ano: String(ano),
});

const url = `${BASE_URL}?${params.toString()}`;
console.log('🌐 URL:', url);
console.log('');

const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; PortalDCP-Debug/1.0)',
    'Accept': 'text/html,application/xhtml+xml',
  },
});

console.log('📡 Status:', res.status, res.statusText);
const html = await res.text();
console.log('📦 Tamanho HTML:', html.length, 'bytes');
console.log('');

const parseValor = (v) => parseFloat(v.trim().replace(/\./g, '').replace(',', '.')) || 0;

// Dialogs brutos (aceita atributos extras como data-chave)
const dialogPattern =
  /<div id='(dialog_\d+)'[^>]*title='Detalhe da Despesa'[^>]*>([\s\S]*?)(?=<div id='dialog_\d+'|$)/g;
const dialogs = new Map();
let dm;
while ((dm = dialogPattern.exec(html)) !== null) {
  dialogs.set(dm[1], dm[2]);
}

const extrairMovimentos = (conteudo, tipo) => {
  const prefixo = tipo === 'liquidacao' ? 'liq' : 'pag';
  const pattern = new RegExp(
    `class='linha-${tipo}'[\\s\\S]*?class='${prefixo}-data'[^>]*>\\s*([\\d/]+)\\s*<[\\s\\S]*?class='${prefixo}-sub'[^>]*>\\s*([^<]*?)\\s*<[\\s\\S]*?class='${prefixo}-valor'[^>]*>\\s*R\\$\\s*([-\\d.,]+)`,
    'g',
  );
  const movimentos = [];
  let m;
  while ((m = pattern.exec(conteudo)) !== null) {
    movimentos.push({ data: m[1].trim(), subempenho: m[2].trim(), valor: parseValor(m[3]) });
  }
  return movimentos;
};

// ── NOVO FORMATO: linha com 8 <td> (data, nº empenho, tipo, credor, empenhado, liquidado, pago, dialog)
const rowPatternNovo =
  /<tr data-dialog-id='\d+'[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(dialog_\d+)<\/td>\s*<\/tr>/gs;

const resultados = [];
let m;
while ((m = rowPatternNovo.exec(html)) !== null) {
  const [, data, numEmp, tipoEmp, credor, vlEmp, vlLiq, vlPago, dialogId] = m;
  const conteudo = dialogs.get(dialogId) || '';

  const nContratoMatch = conteudo.match(/<strong>Nº Contrato:<\/strong>\s*([^<]+?)(?:<|&nbsp;|$)/);
  const numEmpDialog = conteudo.match(/Nº Empenho:<\/strong>\s*(\d+)/);
  const numProc = conteudo.match(/Nº do Processo:<\/strong>\s*(\d+)/);
  const cnpjMatch = conteudo.match(/<strong>CNPJ:<\/strong>\s*([\d.\/\-]+)/);

  const liquidacoes = extrairMovimentos(conteudo, 'liquidacao');
  const pagamentos = extrairMovimentos(conteudo, 'pagamento');

  resultados.push({
    data: data.trim(),
    numero_empenho: numEmpDialog ? numEmpDialog[1] : numEmp.trim(),
    tipo: tipoEmp.trim(),
    credor: credor.replace(/<[^>]+>/g, '').trim(),
    vl_empenhado: parseValor(vlEmp),
    vl_liquidado: parseValor(vlLiq),
    vl_pago: parseValor(vlPago),
    numero_processo: numProc ? numProc[1] : '-',
    cnpj_dialog: cnpjMatch ? cnpjMatch[1] : '-',
    numero_contrato: nContratoMatch ? nContratoMatch[1].trim() : '(sem contrato no dialog)',
    liquidacoes,
    pagamentos,
    dialogId,
  });
}

if (resultados.length > 0) {
  console.log(`✅ NOVO FORMATO: ${resultados.length} empenho(s) encontrado(s)\n`);
  for (const r of resultados) {
    console.log(`📌 Empenho ${r.numero_empenho} (${r.tipo}) — ${r.data} — Contrato ${r.numero_contrato} — Proc. ${r.numero_processo}`);
    console.log(`   Credor: ${r.credor} (${r.cnpj_dialog})`);
    console.log(`   Empenhado: R$ ${r.vl_empenhado.toFixed(2)} | Liquidado: R$ ${r.vl_liquidado.toFixed(2)} | Pago: R$ ${r.vl_pago.toFixed(2)}`);
    console.log(`   Liquidações (${r.liquidacoes.length}):`);
    for (const l of r.liquidacoes) console.log(`     - ${l.data} sub ${l.subempenho}: R$ ${l.valor.toFixed(2)}`);
    console.log(`   Pagamentos (${r.pagamentos.length}):`);
    for (const p of r.pagamentos) console.log(`     - ${p.data} sub ${p.subempenho}: R$ ${p.valor.toFixed(2)}`);

    const somaLiq = r.liquidacoes.reduce((s, l) => s + l.valor, 0);
    const somaPag = r.pagamentos.reduce((s, p) => s + p.valor, 0);
    const okLiq = Math.abs(somaLiq - r.vl_liquidado) < 0.01 ? '✅' : '⚠️ DIVERGE';
    const okPag = Math.abs(somaPag - r.vl_pago) < 0.01 ? '✅' : '⚠️ DIVERGE';
    console.log(`   Conferência: Σliq=${somaLiq.toFixed(2)} ${okLiq} | Σpag=${somaPag.toFixed(2)} ${okPag}`);
    console.log('');
  }
} else {
  // ── FORMATO ANTIGO: linha com 6 <td>
  const rowPatternAntigo =
    /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(dialog_\d+)<\/td>\s*<\/tr>/gs;

  const antigos = [];
  while ((m = rowPatternAntigo.exec(html)) !== null) {
    const [, data, nproc, fase, credor, valor, dialogId] = m;
    const conteudo = dialogs.get(dialogId) || '';
    const nContratoMatch = conteudo.match(/<strong>Nº Contrato:<\/strong>\s*([^<]+?)(?:<|&nbsp;|$)/);
    antigos.push({
      data: data.trim(),
      fase: fase.trim(),
      valor: valor.trim(),
      numero_contrato: nContratoMatch ? nContratoMatch[1].trim() : '-',
    });
  }
  console.log(`FORMATO ANTIGO: ${antigos.length} registro(s)`);
  for (const r of antigos) {
    console.log(`  ${r.data} | ${r.fase} | ${r.valor} | contrato ${r.numero_contrato}`);
  }
}

// Salva HTML para inspeção
const fs = await import('node:fs');
const outPath = `scripts/debug-fator-${cnpj}-${ano}.html`;
fs.writeFileSync(outPath, html);
console.log(`💾 HTML completo salvo em: ${outPath}`);
