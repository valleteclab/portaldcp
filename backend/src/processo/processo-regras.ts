import { SituacaoProcesso, TipoProcesso } from './entities/processo.entity';

/**
 * REGRAS PURAS do processo eletrônico (sem I/O; testadas em processo-regras.spec.ts).
 */

/** Situações da licitação que encerram o processo de CONTRATACAO (espelho de SITUACOES_TERMINAIS + CONCLUIDA). */
export const SITUACOES_LICITACAO_QUE_ENCERRAM = ['REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA', 'CONCLUIDA'] as const;

/** Situação do processo derivada da situação da licitação que ele referencia. */
export function situacaoDoProcessoPelaLicitacao(situacaoLicitacao: string | null | undefined): SituacaoProcesso {
  return (SITUACOES_LICITACAO_QUE_ENCERRAM as ReadonlyArray<string>).includes(String(situacaoLicitacao ?? '')) ? 'ENCERRADO' : 'ABERTO';
}

export const TIPOS_PROCESSO: ReadonlyArray<TipoProcesso> = Object.values(TipoProcesso);

export function tipoProcessoValido(v: unknown): v is TipoProcesso {
  return typeof v === 'string' && (TIPOS_PROCESSO as ReadonlyArray<string>).includes(v);
}

/** Tipos de processo que nascem ligados a um contrato (exigem `contrato_id` na abertura). */
export const TIPOS_COM_CONTRATO: ReadonlyArray<TipoProcesso> = [TipoProcesso.ADITIVO, TipoProcesso.RENOVACAO];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recusa (mensagem) se o termo a cadastrar não serve de resultado ao tipo de processo; null = serve. */
export function erroTermoParaProcesso(tipo: TipoProcesso, renovacaoCiclo: unknown): string | null {
  if (tipo === TipoProcesso.RENOVACAO) {
    return renovacaoCiclo === true || renovacaoCiclo === 'true' ? null : 'O processo é de renovação: cadastre o termo como renovação de ciclo.';
  }
  if (tipo === TipoProcesso.ADITIVO) return null;
  return 'O processo informado não é de termo aditivo nem de renovação.';
}

export interface AberturaDireta {
  tipo: TipoProcesso;
  contrato_id: string | null;
  objeto: string;
  numero: string | null;
  setor_origem_id: string | null;
}

const OBJETO_MIN = 5;
const OBJETO_MAX = 4000;

/**
 * Normaliza e valida o corpo de `POST /processos` (abertura direta).
 * Devolve `{ erro }` com a mensagem para 400, ou os dados prontos.
 * Nesta etapa só o AVULSO abre direto; CONTRATACAO nasce do próprio módulo de
 * licitações (assistente, DFD, demanda, feita fora, importação, credenciamento).
 */
export function validarAberturaDireta(
  corpo: any,
  tiposComAberturaDireta: ReadonlyArray<TipoProcesso>,
): { erro: string } | { dados: AberturaDireta } {
  const tipo = String(corpo?.tipo ?? TipoProcesso.AVULSO).trim().toUpperCase();
  if (!tipoProcessoValido(tipo)) return { erro: `Tipo de processo inválido: ${tipo}` };
  if (!tiposComAberturaDireta.includes(tipo)) {
    return {
      erro:
        tipo === TipoProcesso.CONTRATACAO
          ? 'Processo de contratação nasce pelo módulo de licitações (assistente, DFD, demanda, importação ou credenciamento).'
          : `O tipo ${tipo} ainda não pode ser aberto diretamente.`,
    };
  }
  const objeto = String(corpo?.objeto ?? '').trim();
  if (objeto.length < OBJETO_MIN) return { erro: `Informe o objeto do processo (mínimo ${OBJETO_MIN} caracteres).` };
  if (objeto.length > OBJETO_MAX) return { erro: `Objeto longo demais (máximo ${OBJETO_MAX} caracteres).` };
  const setor = corpo?.setor_origem_id;
  const setor_origem_id = typeof setor === 'string' && setor.trim() ? setor.trim() : null;
  const numeroBruto = corpo?.numero ?? corpo?.numero_processo;
  const numero = typeof numeroBruto === 'string' && numeroBruto.trim() ? numeroBruto.trim() : null;
  const contratoBruto = typeof corpo?.contrato_id === 'string' ? corpo.contrato_id.trim() : '';
  if (TIPOS_COM_CONTRATO.includes(tipo) && !UUID.test(contratoBruto)) return { erro: 'Informe o contrato (contrato_id) do processo.' };
  const contrato_id = TIPOS_COM_CONTRATO.includes(tipo) ? contratoBruto : null;
  return { dados: { tipo, contrato_id, objeto, numero, setor_origem_id } };
}

/** Filtros da listagem (`GET /processos`): valores fora do domínio são ignorados. */
export function normalizarFiltrosListagem(q: any): { tipo: TipoProcesso | null; situacao: SituacaoProcesso | null; busca: string | null; contrato_id: string | null; limite: number } {
  const tipo = String(q?.tipo ?? '').trim().toUpperCase();
  const situacao = String(q?.situacao ?? '').trim().toUpperCase();
  const busca = String(q?.q ?? q?.busca ?? '').trim();
  const limiteBruto = Number(q?.limit ?? q?.limite);
  const limite = Number.isFinite(limiteBruto) && limiteBruto > 0 ? Math.min(Math.floor(limiteBruto), 500) : 100;
  return {
    tipo: tipoProcessoValido(tipo) ? tipo : null,
    situacao: situacao === 'ABERTO' || situacao === 'ENCERRADO' ? situacao : null,
    busca: busca ? busca.slice(0, 200) : null,
    contrato_id: UUID.test(String(q?.contrato_id ?? '').trim()) ? String(q.contrato_id).trim() : null,
    limite,
  };
}

/** Texto do termo de autuação de um processo aberto (sem folha — vai à capa/termo de abertura). */
export function textoDeAutuacao(p: { numero: string; objeto: string; aberto_por_nome?: string | null; setor_nome?: string | null }): string {
  const quem = [p.aberto_por_nome, p.setor_nome].filter(Boolean).join(' — ');
  return `Autue-se o Processo Administrativo nº ${p.numero}, cujo objeto é ${p.objeto.trim()}.${quem ? ` Autuação: ${quem}.` : ''}`;
}
