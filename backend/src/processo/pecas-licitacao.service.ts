import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Ator } from '../auth/acesso/ator';
import { Processo } from './entities/processo.entity';
import { htmlDaPecaSeguro, htmlDoModelo, temLacuna, textoDaPeca } from './peca-documento';

/**
 * PEÇAS DA LICITAÇÃO NO EDITOR NOVO (fatia 2 — decisão do dono, 02/10/2026):
 * Autorização (AA), Parecer jurídico (PJ) e Manifestação do controle interno
 * (MCI) são ESCRITAS no editor da tela do processo (modelo, IA, lacunas), mas
 * gravadas pela máquina da fase interna que já existe — emissão, assinatura
 * pelo portal, análise jurídica, tarefas e juntada — por adaptadores. A
 * Dotação (DO) fica na tela própria (é formulário, não texto).
 */
type TipoPeca = 'AA' | 'PJ' | 'MCI';

interface Definicao {
  titulo: string;
  secao: string;
  /** Campo extra em texto (ressalvas do parecer, apontamentos do controle interno). */
  extra: { id: 'ressalvas' | 'apontamentos'; rotulo: string } | null;
  conclusoes: Array<{ valor: string; rotulo: string }> | null;
  acao: string;
  /** PJ/MCI: a fase interna compõe o documento e só aceita texto corrido na seção. */
  textoCorrido: boolean;
}

const DEFINICOES: Record<TipoPeca, Definicao> = {
  AA: { titulo: 'Autorização da autoridade competente', secao: 'autorizacao', extra: null, conclusoes: null, acao: 'Salvar e enviar para assinatura da autoridade', textoCorrido: false },
  PJ: {
    titulo: 'Parecer jurídico',
    secao: 'parecer',
    extra: { id: 'ressalvas', rotulo: 'Ressalvas (quando houver)' },
    conclusoes: [
      { valor: 'FAVORAVEL', rotulo: 'Favorável' },
      { valor: 'FAVORAVEL_COM_RESSALVAS', rotulo: 'Favorável, condicionado ao saneamento das ressalvas' },
      { valor: 'DESFAVORAVEL', rotulo: 'Desfavorável' },
    ],
    acao: 'Emitir e assinar o parecer',
    textoCorrido: true,
  },
  MCI: {
    titulo: 'Manifestação do controle interno',
    secao: 'manifestacao',
    extra: { id: 'apontamentos', rotulo: 'Apontamentos (quando houver)' },
    conclusoes: [
      { valor: 'FAVORAVEL', rotulo: 'Favorável' },
      { valor: 'COM_APONTAMENTOS', rotulo: 'Com apontamentos' },
    ],
    acao: 'Manifestar e assinar',
    textoCorrido: true,
  },
};

export function tipoDePecaLicitacao(v: unknown): TipoPeca {
  const t = String(v ?? '').toUpperCase();
  if (t === 'AA' || t === 'PJ' || t === 'MCI') return t;
  throw new BadRequestException('Esta peça não é escrita no editor: use "Fazer aqui".');
}

const paragrafos = (texto: string) =>
  texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!).replace(/\n/g, '<br/>')}</p>`)
    .join('');

@Injectable()
export class PecasLicitacaoService {
  private readonly logger = new Logger(PecasLicitacaoService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  private servico<T>(caminho: string, nome: string): T {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(caminho);
    const s = this.moduleRef.get(mod[nome], { strict: false }) as T;
    if (!s) throw new BadRequestException('A fase interna não está disponível neste servidor.');
    return s;
  }

  private licId(p: Processo): string {
    if (p.tipo !== 'CONTRATACAO' || p.referencia_tipo !== 'LICITACAO' || !p.referencia_id) throw new BadRequestException('Este processo não é uma licitação.');
    return p.referencia_id;
  }

  private async autor(ator: Ator) {
    return this.servico<any>('../fase-interna/tarefas/tarefas.service', 'TarefasService').autor(ator);
  }

  /** Estado da peça + modelo com as variáveis da licitação aplicadas (ponto de partida do editor). */
  async obter(p: Processo, ator: Ator, tipoParam: unknown) {
    const tipo = tipoDePecaLicitacao(tipoParam);
    const def = DEFINICOES[tipo];
    const licId = this.licId(p);
    const minutas = this.servico<any>('../fase-interna/telas/minutas-tela.service', 'MinutasTelaService');
    const modelos = this.servico<any>('../fase-interna/modelo-documento.service', 'ModeloDocumentoService');
    const [doc, modelo] = await Promise.all([minutas.docAtual(licId, tipo), modelos.resolverModelo(p.orgao_id, tipo)]);
    let html = '';
    if (modelo) {
      const inst = await modelos.instanciarConteudo(modelo, licId);
      html = htmlDoModelo((modelo.secoes || []).map((s: any) => ({ titulo: s.titulo, texto_padrao: inst.dados?.[s.id] ?? '' })));
    }
    // AA já gerada no sistema e ainda não assinada: o editor abre com o texto atual
    const textoAtual = doc && doc.origem === 'INTERNO' && doc.status !== 'ASSINADO' && doc.status !== 'AGUARDANDO_ASSINATURA' ? doc.dados_estruturados?.[def.secao] : null;
    if (tipo === 'AA' && textoAtual) html = String(textoAtual);
    if (def.textoCorrido) html = paragrafos(textoDaPeca(html));
    let iaDisponivel = false;
    try {
      iaDisponivel = !!(await this.servico<any>('../fase-interna/ia-rascunho/rascunho-ia.service', 'RascunhoIaService').disponivel())?.ok;
    } catch {
      iaDisponivel = false;
    }
    return {
      tipo,
      titulo: def.titulo,
      html,
      texto_corrido: def.textoCorrido,
      extra: def.extra,
      conclusoes: def.conclusoes,
      acao: def.acao,
      status_atual: doc?.status ?? null,
      origem_atual: doc?.origem ?? null,
      ia_disponivel: iaDisponivel,
    };
  }

  /** Rascunho pela IA da fase interna (contexto da licitação: processo, itens, reserva, DFD/ETP/TR). Nada é gravado. */
  async rascunho(p: Processo, ator: Ator, tipoParam: unknown) {
    const tipo = tipoDePecaLicitacao(tipoParam);
    const def = DEFINICOES[tipo];
    const licId = this.licId(p);
    const ia = this.servico<any>('../fase-interna/ia-rascunho/rascunho-ia.service', 'RascunhoIaService');
    const r = await ia.gerarManual(licId, { peca: tipo }, await this.autor(ator));
    const secoes: Array<{ id: string; texto: string }> = r?.rascunho?.secoes ?? [];
    const texto = (id: string) => String(secoes.find((s) => s.id === id)?.texto ?? '').trim();
    let html = '';
    let extra: string | null = null;
    if (tipo === 'AA') html = htmlDaPecaSeguro(texto('autorizacao'));
    else if (tipo === 'PJ') {
      html = paragrafos([texto('relatorio'), texto('fundamentacao')].filter(Boolean).join('\n\n'));
      extra = texto('ressalvas') || null;
    } else {
      html = paragrafos(texto('texto'));
      extra = texto('apontamentos') || null;
    }
    if (!html) throw new BadRequestException('A IA não devolveu texto aproveitável. Tente de novo ou escreva no editor.');
    return { tipo, html, extra_id: def.extra?.id ?? null, extra, conclusao_sugerida: (r?.rascunho?.conclusao_sugerida ?? texto('conclusao')) || null, ia_modelo: r?.rascunho?.modelo ?? 'IA', lacunas: (html.match(/<mark>/g) || []).length };
  }

  /** Grava pela máquina da fase interna: AA gera e envia à autoridade; PJ emite e assina; MCI manifesta e assina. */
  async emitir(p: Processo, ator: Ator, tipoParam: unknown, body: any, rede: { ip?: string; userAgent?: string }) {
    const tipo = tipoDePecaLicitacao(tipoParam);
    const def = DEFINICOES[tipo];
    const licId = this.licId(p);
    const html = htmlDaPecaSeguro(body?.texto_html);
    if (!html) throw new BadRequestException('Escreva o texto da peça.');
    if (temLacuna(html)) throw new BadRequestException('A peça ainda tem lacunas em destaque. Preencha-as antes de emitir.');
    const autor = await this.autor(ator);
    if (tipo === 'AA') {
      const minutas = this.servico<any>('../fase-interna/telas/minutas-tela.service', 'MinutasTelaService');
      const autorizacao = this.servico<any>('../fase-interna/telas/autorizacao-tela.service', 'AutorizacaoTelaService');
      await minutas.gerarPorModelo(licId, 'AA', autor, { substituirSecoes: { [def.secao]: html } });
      await autorizacao.enviar(licId, {}, ator, autor);
      this.logger.log(`Autorização da licitação ${licId} escrita no editor e enviada à autoridade por ${autor.nome ?? ator.id}`);
      return { ok: true, mensagem: 'Autorização gerada e enviada para a assinatura da autoridade.' };
    }
    const texto = textoDaPeca(html);
    if (tipo === 'PJ') {
      const parecer = this.servico<any>('../fase-interna/telas/parecer-tela.service', 'ParecerTelaService');
      await parecer.emitir(licId, { fase: 'PREVIA', conclusao: body?.conclusao, fundamentacao: texto, ressalvas: String(body?.ressalvas ?? '').trim() }, ator, autor, rede);
      return { ok: true, mensagem: 'Parecer emitido e assinado.' };
    }
    const controle = this.servico<any>('../fase-interna/telas/controle-interno-tela.service', 'ControleInternoTelaService');
    await controle.manifestar(licId, { conclusao: body?.conclusao, texto, apontamentos: String(body?.apontamentos ?? '').trim() }, ator, autor, rede);
    return { ok: true, mensagem: 'Manifestação emitida e assinada.' };
  }
}
