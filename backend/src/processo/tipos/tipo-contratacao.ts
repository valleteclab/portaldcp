import { CATALOGO_ETAPAS } from '../../fase-interna/fluxo/catalogo-fluxo';
import { CAMPOS_CONDICAO } from '../../fase-interna/fluxo/motor-grafo';
import { TITULO_DOCUMENTO } from '../../fase-interna/documentos-obrigatorios';
import { REFERENCIA_LICITACAO, TipoProcesso } from '../entities/processo.entity';
import { CampoCondicao, DefinicaoTipoProcesso, DocumentoDoCatalogo, RequisitoDoTipo } from './tipo-processo';

/**
 * TIPO CONTRATACAO — delega ao que já existe na fase interna:
 *  - catálogo de documentos = peças do catálogo de etapas (`catalogo-fluxo.ts`);
 *  - campos de condição = os do construtor de fluxo (`motor-grafo.ts`);
 *  - requisitos legais = `requisitos_legais_fluxo` (art. 72 etc.), lidos pelo
 *    ModeloFluxoService (injetado pelo ProcessoTiposService);
 *  - gancho da última etapa: NADA aqui nesta etapa — a conclusão da fase
 *    interna continua sendo o ato CONCLUIR_FASE_INTERNA da máquina de estados
 *    da licitação (acoplado por compatibilidade; ver PLANO-PROCESSO-ELETRONICO.md).
 */
export function catalogoDocumentosContratacao(): DocumentoDoCatalogo[] {
  const vistos = new Set<string>();
  const lista: DocumentoDoCatalogo[] = [];
  for (const etapa of CATALOGO_ETAPAS) {
    const codigos = [...etapa.tipos_peca.direta, ...etapa.tipos_peca.licitacao];
    for (const codigo of codigos) {
      if (vistos.has(codigo)) continue;
      vistos.add(codigo);
      lista.push({
        codigo,
        titulo: (TITULO_DOCUMENTO as Record<string, string | undefined>)[codigo] ?? codigo,
        etapa: etapa.codigo,
        fundamento: etapa.fundamento,
      });
    }
  }
  return lista;
}

export function camposCondicaoContratacao(): CampoCondicao[] {
  return CAMPOS_CONDICAO.map((c) => ({
    campo: c.campo,
    rotulo: c.rotulo,
    operadores: c.operadores,
    valor: c.valor,
    ...('opcoes' in c && c.opcoes ? { opcoes: c.opcoes } : {}),
  }));
}

export function definicaoContratacao(fontes: { requisitos: () => Promise<RequisitoDoTipo[]> }): DefinicaoTipoProcesso {
  return {
    tipo: TipoProcesso.CONTRATACAO,
    rotulo: 'Contratação (licitação ou contratação direta)',
    descricao: 'Fase interna (planejamento, pesquisa, reserva, minutas, parecer, autorização), publicação, disputa e resultado — Lei nº 14.133/2021.',
    referencia_tipo: REFERENCIA_LICITACAO,
    implementado: true,
    abertura_direta: false,
    tem_fluxo: true,
    catalogoDocumentos: catalogoDocumentosContratacao,
    camposCondicao: camposCondicaoContratacao,
    requisitosLegais: fontes.requisitos,
    // A licitação já conclui a fase interna pelo seu próprio ato; nada a fazer aqui (compatibilidade).
    aoConcluirUltimaEtapa: async () => undefined,
  };
}
