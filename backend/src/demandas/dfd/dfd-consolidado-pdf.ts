import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { dataPorExtenso, quebrarLinhas, textoSeguroPdf } from '../../licitacoes/autos/autos-regras';
import { dataHoraBrasilia } from '../../fase-interna/tramitacao-regras';

/**
 * PDF DO DFD CONSOLIDADO (Lei 14.133, art. 12, VII, e art. 72, I): o
 * documento da unidade de planejamento que junta as demandas dos setores.
 * Lista os itens somados com a origem de cada quantidade e as demandas de
 * origem (setor, objeto, aprovação). Datas no horário de Brasília; o texto é
 * montado aqui (sem marcadores de modelo).
 */
export interface DadosDfdPdf {
  orgao_nome: string;
  cidade?: string | null;
  uf?: string | null;
  numero: number;
  ano: number;
  status: string;
  objeto: string;
  justificativa: string | null;
  unidade_planejamento: string | null;
  responsavel_nome: string | null;
  responsavel_cargo: string | null;
  /** AAAA-MM-DD. */
  data_pretendida: string | null;
  prioridade: string | null;
  pca: string | null;
  itens: Array<{
    numero: number;
    descricao: string;
    codigo: string | null;
    unidade: string;
    quantidade: number;
    quantidade_somada: number;
    valor_unitario: number;
    valor_total: number;
    origens: Array<{ setor: string; quantidade: number }>;
    ajuste: string | null;
  }>;
  valor_total: number;
  demandas: Array<{ setor: string; objeto: string | null; aprovada_em: Date | string | null; aprovado_por: string | null }>;
  aprovacao: { por_nome: string | null; em: string | null; observacao: string | null } | null;
  numero_processo: string | null;
  gerado_em: Date;
}

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 50;
const PRETO = rgb(0.1, 0.1, 0.1);
const CINZA = rgb(0.4, 0.4, 0.4);
const AZUL = rgb(0.07, 0.32, 0.71);
const LINHA = rgb(0.8, 0.8, 0.8);

const BRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const QTD = (n: number) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const dataIso = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : null);
const PRIORIDADE: Record<string, string> = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
const SITUACAO: Record<string, string> = {
  RASCUNHO: 'Em elaboração',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  EM_PROCESSO: 'Processo aberto',
  CANCELADO: 'Cancelado',
};
/** HTML simples (editor) → texto. */
const semHtml = (s: string | null | undefined) =>
  String(s ?? '')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

export async function gerarPdfDfdConsolidado(d: DadosDfdPdf): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoSeguroPdf(`DFD nº ${d.numero}/${d.ano}`));
  doc.setProducer('Portal DCP');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const [larg, alt] = A4;
  const largura = larg - 2 * MARGEM;
  let pg: PDFPage = doc.addPage(A4);
  let y = alt - 60;

  const novaPagina = () => {
    pg = doc.addPage(A4);
    y = alt - 60;
  };
  const garantir = (h: number) => {
    if (y - h < 60) novaPagina();
  };
  const centro = (txt: string, tam: number, f: PDFFont, cor = PRETO) => {
    const t = textoSeguroPdf(txt);
    const w = f.widthOfTextAtSize(t, tam);
    pg.drawText(t, { x: Math.max(MARGEM, (larg - w) / 2), y, size: tam, font: f, color: cor });
    y -= tam + 6;
  };
  const paragrafo = (txt: string, tam = 10, f: PDFFont = fonte, cor = PRETO, entre = 4) => {
    for (const bloco of String(txt ?? '').split(/\r?\n/)) {
      const linhas = bloco.trim() ? quebrarLinhas(bloco, largura, (s) => f.widthOfTextAtSize(s, tam)) : [''];
      for (const l of linhas) {
        garantir(tam + 4);
        pg.drawText(l, { x: MARGEM, y, size: tam, font: f, color: cor });
        y -= tam + 4;
      }
    }
    y -= entre;
  };
  const titulo = (txt: string) => {
    garantir(30);
    y -= 6;
    pg.drawText(textoSeguroPdf(txt), { x: MARGEM, y, size: 11, font: negrito, color: AZUL });
    y -= 16;
  };
  const campo = (rotulo: string, valor: string) => {
    const r = textoSeguroPdf(`${rotulo}: `);
    const wr = negrito.widthOfTextAtSize(r, 9.5);
    const linhas = quebrarLinhas(valor || '-', largura - wr, (s) => fonte.widthOfTextAtSize(s, 9.5));
    garantir(14);
    pg.drawText(r, { x: MARGEM, y, size: 9.5, font: negrito, color: PRETO });
    linhas.forEach((l, i) => {
      if (i > 0) {
        y -= 13;
        garantir(13);
      }
      pg.drawText(l, { x: MARGEM + wr, y, size: 9.5, font: fonte, color: PRETO });
    });
    y -= 15;
  };

  /** Tabela simples com quebra de linha por célula. */
  const tabela = (colunas: Array<{ titulo: string; largura: number; direita?: boolean }>, linhas: string[][]) => {
    const tam = 8;
    const alturaLinha = tam + 3;
    const desenharCabecalho = () => {
      garantir(alturaLinha + 6);
      let x = MARGEM;
      for (const c of colunas) {
        pg.drawText(textoSeguroPdf(c.titulo), { x: x + 2, y, size: tam, font: negrito, color: PRETO });
        x += c.largura;
      }
      y -= 4;
      pg.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + largura, y }, thickness: 0.6, color: LINHA });
      y -= alturaLinha;
    };
    desenharCabecalho();
    for (const linha of linhas) {
      const celulas = linha.map((txt, i) => quebrarLinhas(txt || '-', colunas[i].largura - 4, (s) => fonte.widthOfTextAtSize(s, tam)));
      const n = Math.max(1, ...celulas.map((c) => c.length));
      if (y - n * alturaLinha < 60) {
        novaPagina();
        desenharCabecalho();
      }
      let x = MARGEM;
      celulas.forEach((c, i) => {
        c.forEach((l, k) => {
          const w = fonte.widthOfTextAtSize(l, tam);
          const px = colunas[i].direita ? x + colunas[i].largura - 2 - w : x + 2;
          pg.drawText(l, { x: px, y: y - k * alturaLinha, size: tam, font: fonte, color: PRETO });
        });
        x += colunas[i].largura;
      });
      y -= n * alturaLinha + 2;
      pg.drawLine({ start: { x: MARGEM, y: y + alturaLinha - 3 }, end: { x: MARGEM + largura, y: y + alturaLinha - 3 }, thickness: 0.3, color: LINHA });
    }
    y -= 4;
  };

  centro(d.orgao_nome.toUpperCase(), 12, negrito);
  y -= 4;
  centro('DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA (DFD)', 13, negrito, AZUL);
  centro(`DFD consolidado nº ${d.numero}/${d.ano} — ${SITUACAO[d.status] ?? d.status}`, 10, fonte, CINZA);
  if (d.numero_processo) centro(`Processo administrativo nº ${d.numero_processo}`, 10, fonte, CINZA);
  y -= 8;

  campo('Objeto', d.objeto);
  campo('Unidade de planejamento', d.unidade_planejamento ?? '');
  campo('Responsável', [d.responsavel_nome, d.responsavel_cargo].filter(Boolean).join(' — '));
  campo('Setores demandantes', [...new Set(d.demandas.map((x) => x.setor))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')).join('; '));
  campo('Data pretendida para a contratação', dataIso(d.data_pretendida) ?? '');
  campo('Prioridade', d.prioridade ? PRIORIDADE[d.prioridade] ?? d.prioridade : '');
  campo('Plano de Contratações Anual', d.pca ?? 'Sem item do PCA comum a todas as demandas (vínculo por item no processo)');
  campo('Valor total estimado', BRL(d.valor_total));

  titulo('1. Justificativa da necessidade');
  paragrafo(semHtml(d.justificativa) || 'Não informada.', 10);

  titulo('2. Itens consolidados (quantidades somadas por item do catálogo ou por classe e descrição)');
  tabela(
    [
      { titulo: 'Nº', largura: 22 },
      { titulo: 'Descrição', largura: 170 },
      { titulo: 'Unid.', largura: 38 },
      { titulo: 'Qtd.', largura: 44, direita: true },
      { titulo: 'Valor unit.', largura: 60, direita: true },
      { titulo: 'Total', largura: 62, direita: true },
      { titulo: 'Origem (setor: qtd.)', largura: largura - 396 },
    ],
    d.itens.map((i) => [
      String(i.numero),
      `${i.descricao}${i.codigo ? ` (cód. ${i.codigo})` : ''}${i.ajuste ? ` — ${i.ajuste}` : ''}`,
      i.unidade,
      QTD(i.quantidade),
      BRL(i.valor_unitario),
      BRL(i.valor_total),
      i.origens.map((o) => `${o.setor}: ${QTD(o.quantidade)}`).join('; '),
    ]),
  );
  paragrafo(`Valor total estimado: ${BRL(d.valor_total)}.`, 9.5, negrito, PRETO, 6);

  titulo('3. Demandas de origem');
  tabela(
    [
      { titulo: 'Setor', largura: 120 },
      { titulo: 'Objeto do pedido', largura: largura - 290 },
      { titulo: 'Aprovada em', largura: 70 },
      { titulo: 'Aprovada por', largura: 100 },
    ],
    d.demandas.map((x) => [x.setor, x.objeto ?? '', x.aprovada_em ? dataHoraBrasilia(x.aprovada_em).split(' ')[0] : '', x.aprovado_por ?? '']),
  );

  titulo('4. Fundamento');
  paragrafo(
    'Consolidação das demandas dos setores pela unidade de planejamento, nos termos do art. 12, VII, da Lei nº 14.133/2021, ' +
      'para contratar em conjunto os itens da mesma natureza no exercício e evitar o fracionamento da despesa (art. 75, §1º). ' +
      'Este documento formaliza a demanda que instrui o processo de contratação (art. 72, I).',
    9.5,
  );

  if (d.aprovacao?.por_nome) {
    titulo('5. Aprovação');
    paragrafo(`Aprovado por ${d.aprovacao.por_nome}${d.aprovacao.em ? ` em ${dataHoraBrasilia(d.aprovacao.em)} (horário de Brasília)` : ''}.${d.aprovacao.observacao ? ` ${d.aprovacao.observacao}` : ''}`, 9.5);
  }

  y -= 14;
  const local = [d.cidade, d.uf].filter(Boolean).join('/');
  paragrafo(`${local ? `${local}, ` : ''}${dataPorExtenso(d.gerado_em)}.`, 10, fonte, PRETO, 22);
  if (d.responsavel_nome) {
    paragrafo(d.responsavel_nome, 10, negrito, PRETO, 0);
    paragrafo([d.responsavel_cargo, d.unidade_planejamento].filter(Boolean).join(' — '), 9, fonte, CINZA, 0);
  }
  y -= 16;
  paragrafo(`Documento gerado eletronicamente em ${dataHoraBrasilia(d.gerado_em)} (horário de Brasília).`, 8, fonte, CINZA, 0);

  return Buffer.from(await doc.save());
}
