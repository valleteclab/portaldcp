// Parser temporário para analisar o dump do portal Fator
// Uso: node scripts/parse_fator_2023.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'fator_2023.html'), 'utf8');

const limparHtml = (t) => (t || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/<br\s*\/?>/gi, ' | ')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Extrai linhas da tabela
const linhaRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
const dialogRe = /onclick="[^"]*abrir(?:Modal|Dialog|Detalhe)[^"]*"/i;

// Match diretamente dialogs onclick
const dialogHtmlRe = /data-descricao=["']([^"']+)["']|onclick="[^"]*mostrarDetalhes\(([^)]*)\)/gi;

const linhas = [...html.matchAll(linhaRe)];
const registros = [];
for (const m of linhas) {
  const tr = m[1];
  const tds = [...tr.matchAll(tdRe)].map((x) => limparHtml(x[1]));
  if (tds.length >= 6) {
    const data = tds[0];
    const num = tds[1];
    const fase = tds[2];
    const credor = tds[3];
    const processo = tds[4];
    const valorText = tds[tds.length - 1];
    if (/\d{2}\/\d{2}\/\d{4}/.test(data)) {
      // dialog pode estar no <tr onclick=> ou botao
      const onclickMatch = /onclick="[^"]*"/i.exec(tr);
      registros.push({
        data, numero_liquidacao: num, fase, credor, processo, valor: valorText,
        onclick: onclickMatch ? onclickMatch[0].slice(0, 200) : '',
      });
    }
  }
}

// Também captura textos de dialogs (modal hidden)
const divDialog = /<div[^>]*id="dialog_(\d+)"[^>]*>([\s\S]*?)<\/div>/g;
const dialogs = {};
for (const d of html.matchAll(divDialog)) {
  dialogs[d[1]] = limparHtml(d[2]);
}

console.log('== REGISTROS ==');
console.log(`Total: ${registros.length}`);
const empenhos = registros.filter(r => /EMPENHO/i.test(r.fase));
const liqs = registros.filter(r => /LIQUIDA/i.test(r.fase));
const pags = registros.filter(r => /PAGAMENTO/i.test(r.fase));
console.log(`Empenhos: ${empenhos.length}, Liquidações: ${liqs.length}, Pagamentos: ${pags.length}`);

console.log('\n== EMPENHOS 2023 ==');
empenhos.forEach((r, i) => console.log(`${i}. ${r.data} | ${r.fase} | ${r.valor} | proc=${r.processo} | num=${r.numero_liquidacao}`));

console.log('\n== PAGAMENTOS 2023 ==');
pags.forEach((r, i) => console.log(`${i}. ${r.data} | ${r.valor} | proc=${r.processo} | nº liq=${r.numero_liquidacao}`));

console.log('\n== LIQUIDAÇÕES 2023 ==');
liqs.forEach((r, i) => console.log(`${i}. ${r.data} | ${r.valor} | proc=${r.processo} | nº liq=${r.numero_liquidacao}`));

console.log(`\n== DIALOGS (${Object.keys(dialogs).length}) ==`);
Object.keys(dialogs).slice(0, 6).forEach(k => {
  console.log(`\n-- dialog_${k} --`);
  console.log(dialogs[k].slice(0, 500));
});
