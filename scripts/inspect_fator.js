// Inspeciona o HTML Fator: casa cada linha da tabela com seu dialog (via id dialog_N)
const fs = require('fs');
const path = require('path');

const ano = process.argv[2] || '2024';
const html = fs.readFileSync(path.join(__dirname, '..', `fator_${ano}.html`), 'utf8');

const limpar = (t) => (t || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/<br\s*\/?>/gi, ' | ')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Extrai linhas da tabela
const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
const rows = [];
for (const m of html.matchAll(rowRe)) {
  const tr = m[1];
  const tds = [...tr.matchAll(tdRe)].map(x => limpar(x[1]));
  if (tds.length < 6) continue;
  if (!/\d{2}\/\d{2}\/\d{4}/.test(tds[0])) continue;
  // A última TD do parser continha "dialog_N" no output anterior — estava no onclick
  const dlg = /dialog_(\d+)/.exec(tr);
  rows.push({ data: tds[0], numero_liquidacao: tds[1], fase: tds[2], valor: tds[5], dialog: dlg ? dlg[1] : null, tds });
}

// Extrai dialogs usando posições de início; dialogs têm divs aninhados
const dialogs = {};
const starts = [...html.matchAll(/<div\s+id=['"]dialog_(\d+)['"][^>]*>/g)];
for (let i = 0; i < starts.length; i++) {
  const id = starts[i][1];
  const ini = starts[i].index + starts[i][0].length;
  const fim = i + 1 < starts.length ? starts[i + 1].index : html.length;
  dialogs[id] = limpar(html.slice(ini, fim));
}
console.log(`Linhas: ${rows.length}, Dialogs: ${Object.keys(dialogs).length}\n`);

rows.forEach((r) => {
  const txt = r.dialog ? (dialogs[r.dialog] || '(dialog vazio)') : '(sem dialog)';
  const hasApost = /APOSTILAMENTO/i.test(txt);
  const hasAdit = /ADITIVO/i.test(txt);
  const hasSaldo = /SALDO\s+DO\s+CONTRATO/i.test(txt);
  const marker = `${hasApost ? '[APOST]' : '      '} ${hasAdit ? '[ADIT]' : '      '} ${hasSaldo ? '[SALDO]' : '       '}`;
  console.log(`${r.data} | ${r.fase.padEnd(28)} | ${r.valor.padStart(12)} | ${marker}`);
  if (txt && txt !== '(dialog vazio)' && txt !== '(sem dialog)') {
    // Extrai "Bem/Serviço", "Histórico", "Nº Empenho", etc.
    const campos = ['Bem/Servi[çc]o', 'Hist[óo]rico', 'N[º°o]\\s*Empenho', 'Descri[çc][ãa]o'];
    for (const c of campos) {
      const re = new RegExp(`${c}[^:]*:\\s*([^|]{1,300}?)(?:\\s*\\||$)`, 'i');
      const mm = re.exec(txt);
      if (mm) console.log(`   ${c.replace(/\\\\|\[|\]|[çc]|[óo]|[ãa]|\\s\\*/g, m=>m[0])}: ${mm[1].trim().slice(0, 250)}`);
    }
  }
});
