const fs = require('fs');
const ano = process.argv[2] || '2024';
const idx = parseInt(process.argv[3] || '0', 10);
const h = fs.readFileSync(`fator_${ano}.html`, 'utf8');
const starts = [...h.matchAll(/<div\s+id=['"]dialog_(\d+)['"][^>]*>/g)];
if (idx >= starts.length) { console.log(`só existem ${starts.length} dialogs`); process.exit(0); }
const ini = starts[idx].index + starts[idx][0].length;
const fim = idx + 1 < starts.length ? starts[idx + 1].index : h.length;
const raw = h.slice(ini, fim);
const txt = raw
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/[ \t]+/g, ' ')
  .trim();
console.log(`=== dialog_${starts[idx][1]} ===\n`);
console.log(txt.slice(0, 3000));
