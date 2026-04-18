// Script de debug: chama portal Fator direto e mostra o que foi retornado.
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

// Extrai linhas da tabela
const rowPattern =
  /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(dialog_\d+)<\/td>\s*<\/tr>/gs;

// Extrai dialogs
const dialogPattern =
  /<div id='(dialog_\d+)'\s+title='Detalhe da Despesa'[^>]*>([\s\S]*?)(?=<div id='dialog_\d+'|$)/g;

const dialogs = new Map();
let dm;
while ((dm = dialogPattern.exec(html)) !== null) {
  dialogs.set(dm[1], dm[2]);
}

const resultados = [];
let m;
while ((m = rowPattern.exec(html)) !== null) {
  const [, data, nproc, fase, credor, valor, dialogId] = m;
  const dialogContent = dialogs.get(dialogId) || '';

  const nContratoMatch = dialogContent.match(/<strong>Nº Contrato:<\/strong>\s*([^<]+?)(?:<|&nbsp;|$)/);
  const numLiqMatch = dialogContent.match(/Nº Liquidação:&nbsp;<\/strong>(\d+)/);
  const cnpjMatch = dialogContent.match(/<strong>CNPJ:<\/strong>\s*([\d.\/\-]+)/);

  resultados.push({
    data: data.trim(),
    nproc: nproc.trim(),
    fase: fase.trim(),
    credor: credor.replace(/<[^>]+>/g, '').trim(),
    valor: valor.trim(),
    dialogId,
    numero_liquidacao: numLiqMatch ? numLiqMatch[1] : '-',
    cnpj_dialog: cnpjMatch ? cnpjMatch[1] : '-',
    numero_contrato: nContratoMatch ? nContratoMatch[1].trim() : '(sem contrato no dialog)',
  });
}

console.log(`✅ Encontrados ${resultados.length} registros no portal\n`);

console.log('┌──────────┬──────────────┬──────────────┬─────────────┬──────────────┐');
console.log('│ Data     │ Fase         │ Valor        │ Nº Contrato │ Nº Liquidação│');
console.log('├──────────┼──────────────┼──────────────┼─────────────┼──────────────┤');
for (const r of resultados) {
  console.log(
    '│ ' +
      r.data.padEnd(8) +
      ' │ ' +
      r.fase.padEnd(12).slice(0, 12) +
      ' │ ' +
      r.valor.padEnd(12).slice(0, 12) +
      ' │ ' +
      r.numero_contrato.padEnd(11).slice(0, 11) +
      ' │ ' +
      r.numero_liquidacao.padEnd(12).slice(0, 12) +
      ' │',
  );
}
console.log('└──────────┴──────────────┴──────────────┴─────────────┴──────────────┘');

// Salva HTML para inspeção
const fs = await import('node:fs');
const outPath = `scripts/debug-fator-${cnpj}-${ano}.html`;
fs.writeFileSync(outPath, html);
console.log(`\n💾 HTML completo salvo em: ${outPath}`);

// Mostra o primeiro dialog completo para inspeção
if (resultados.length > 0) {
  const firstId = resultados[0].dialogId;
  console.log(`\n🔎 Primeiro dialog (${firstId}):`);
  console.log('─'.repeat(80));
  console.log(dialogs.get(firstId));
  console.log('─'.repeat(80));
}
