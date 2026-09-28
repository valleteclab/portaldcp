/**
 * SEMENTE DO MODELO DE FLUXO (F1) — o que é gravado no banco no primeiro boot
 * (idempotente) como MODELO DO SISTEMA (`orgao_id` null): "Câmara — Portaria
 * 089" (docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §4), um por tipo de processo.
 * Depois do boot a fonte é o banco; isto é só a carga inicial (e o "restaurar
 * modelo padrão" do órgão copia o modelo do sistema gravado, não este arquivo).
 *
 * É o mesmo comportamento que estava em constantes até a F1
 * (`DEPENDENCIAS_DIRETA`, `DEPENDENCIAS_RITO`, `DEFINICAO_PASSO`): as duas
 * etapas novas ("autorização de início" e "indicação da modalidade") nascem
 * DESLIGADAS e o controle interno também — nada muda para os órgãos atuais.
 */
import { CATALOGO_ETAPAS } from './catalogo-fluxo';
import { EtapaFaseInterna, PapelFaseInterna as Papel, PassoFaseInterna as P } from './codigos';
import { TITULO_ETAPA } from './catalogo-fluxo';
import { EtapaDoModelo, ModeloFluxo, RequisitoLegal, TipoProcessoFluxo, dependenciasEfetivas, ehContratacaoDireta } from './modelo-fluxo';

export const CODIGO_MODELO_SISTEMA = 'CAMARA_PORTARIA_089';

interface PadraoEtapa {
  ordem: number;
  papel: Papel;
  prazo: number | null;
  obrigatoria: boolean;
  ligada: boolean;
  depende_de: P[];
  dispensavel_por_ato?: boolean;
}

/**
 * Contratação direta (art. 72; autos da Câmara de LEM) — ORDEM DO MAPA
 * APROVADO PELO DONO (§4 do plano; homologação multiusuário, 27/09/2026):
 * … → reserva → relatório e minutas (agente) → parecer (jurídico) → controle
 * interno (opcional) → AUTORIZAÇÃO (autoridade, art. 72, VIII) → publicação.
 * Base: art. 72, VI e VII (razão da escolha e justificativa do preço antes da
 * autorização), art. 53, §4º (controle prévio de legalidade da contratação
 * direta pelo jurídico) e Portaria 089/2024 (Jurídico → Controle Interno →
 * Presidência). Vale para a dispensa e para a inexigibilidade (decisão do
 * dono, 27/09/2026).
 */
const DIRETA: Record<P, PadraoEtapa> = {
  DFD: { ordem: 10, papel: Papel.REQUISITANTE, prazo: null, obrigatoria: true, ligada: true, depende_de: [] },
  AUTORIZACAO_INICIO: { ordem: 15, papel: Papel.AUTORIDADE, prazo: 3, obrigatoria: false, ligada: false, depende_de: [P.DFD] },
  ETP: { ordem: 20, papel: Papel.REQUISITANTE, prazo: null, obrigatoria: true, ligada: true, depende_de: [P.DFD, P.AUTORIZACAO_INICIO] },
  TR: { ordem: 30, papel: Papel.REQUISITANTE, prazo: null, obrigatoria: true, ligada: true, depende_de: [P.DFD, P.AUTORIZACAO_INICIO] },
  PESQUISA: { ordem: 40, papel: Papel.COMPRAS, prazo: 30, obrigatoria: true, ligada: true, depende_de: [P.DFD, P.AUTORIZACAO_INICIO] },
  INDICACAO_MODALIDADE: { ordem: 45, papel: Papel.AGENTE_CONTRATACAO, prazo: 3, obrigatoria: false, ligada: false, depende_de: [P.PESQUISA] },
  RESERVA: { ordem: 50, papel: Papel.CONTABILIDADE, prazo: 3, obrigatoria: true, ligada: true, depende_de: [P.PESQUISA, P.INDICACAO_MODALIDADE] },
  MINUTAS: { ordem: 60, papel: Papel.AGENTE_CONTRATACAO, prazo: 5, obrigatoria: true, ligada: true, depende_de: [P.ETP, P.TR, P.RESERVA] },
  // Decisão 3 do dono (26/09/2026): parecer dispensável por ato do jurídico (art. 53, §5º)
  PARECER: { ordem: 70, papel: Papel.JURIDICO, prazo: 5, obrigatoria: true, ligada: true, depende_de: [P.MINUTAS], dispensavel_por_ato: true },
  CONTROLE_INTERNO: { ordem: 80, papel: Papel.CONTROLE_INTERNO, prazo: 3, obrigatoria: false, ligada: false, depende_de: [P.PARECER] },
  AUTORIZACAO: { ordem: 90, papel: Papel.AUTORIDADE, prazo: 3, obrigatoria: true, ligada: true, depende_de: [P.DFD, P.ETP, P.TR, P.PESQUISA, P.RESERVA, P.PARECER, P.CONTROLE_INTERNO] },
  PUBLICACAO: { ordem: 100, papel: Papel.AGENTE_CONTRATACAO, prazo: 5, obrigatoria: true, ligada: true, depende_de: [P.AUTORIZACAO, P.PARECER, P.CONTROLE_INTERNO] },
};

/**
 * Ordem ANTERIOR da contratação direta (semente da F1, até 27/09/2026):
 * autorização ANTES das minutas e do parecer. Só para a migração de boot
 * reconhecer o modelo que ninguém editou (`ordemAnteriorDaDireta`).
 */
export const DEPENDENCIAS_DIRETA_ANTERIOR: Partial<Record<P, { ordem: number; depende_de: P[] }>> = {
  AUTORIZACAO: { ordem: 60, depende_de: [P.DFD, P.ETP, P.TR, P.PESQUISA, P.RESERVA] },
  MINUTAS: { ordem: 70, depende_de: [P.AUTORIZACAO] },
  PARECER: { ordem: 80, depende_de: [P.MINUTAS] },
  CONTROLE_INTERNO: { ordem: 90, depende_de: [P.PARECER] },
  PUBLICACAO: { ordem: 100, depende_de: [P.PARECER, P.CONTROLE_INTERNO] },
};

/** As etapas do modelo estão EXATAMENTE na ordem anterior da contratação direta (nada editado nelas)? */
export function ordemAnteriorDaDireta(etapas: Array<{ codigo: string; ordem: number; depende_de: string[] }>): boolean {
  const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return Object.entries(DEPENDENCIAS_DIRETA_ANTERIOR).every(([codigo, v]) => {
    const e = etapas.find((x) => x.codigo === codigo);
    return !!e && e.ordem === v!.ordem && iguais(e.depende_de, v!.depende_de);
  });
}

/** Aplica a ordem nova da contratação direta (só dependências e ordem sugerida; o resto do órgão fica). */
export function comOrdemNovaDaDireta<T extends { codigo: string; ordem: number; depende_de: string[] }>(etapas: T[]): T[] {
  return etapas.map((e) => {
    const p = (DIRETA as Record<string, PadraoEtapa>)[e.codigo];
    return p && e.codigo in DEPENDENCIAS_DIRETA_ANTERIOR ? { ...e, ordem: p.ordem, depende_de: [...p.depende_de] } : e;
  });
}

/** Rito completo (art. 18 e 53): o parecer vem antes da autorização da abertura. */
const RITO: Record<P, PadraoEtapa> = {
  ...DIRETA,
  MINUTAS: { ordem: 60, papel: Papel.AGENTE_CONTRATACAO, prazo: 5, obrigatoria: true, ligada: true, depende_de: [P.ETP, P.TR, P.PESQUISA] },
  PARECER: { ordem: 70, papel: Papel.JURIDICO, prazo: 5, obrigatoria: true, ligada: true, depende_de: [P.MINUTAS, P.ETP, P.TR, P.PESQUISA] },
  AUTORIZACAO: { ordem: 80, papel: Papel.AUTORIDADE, prazo: 3, obrigatoria: true, ligada: true, depende_de: [P.PARECER, P.RESERVA] },
  CONTROLE_INTERNO: { ordem: 90, papel: Papel.CONTROLE_INTERNO, prazo: 3, obrigatoria: false, ligada: false, depende_de: [P.PARECER] },
  PUBLICACAO: { ordem: 100, papel: Papel.AGENTE_CONTRATACAO, prazo: 5, obrigatoria: true, ligada: true, depende_de: [P.AUTORIZACAO, P.CONTROLE_INTERNO] },
};

export function etapasSemente(tipo: TipoProcessoFluxo): EtapaDoModelo[] {
  const direta = ehContratacaoDireta(tipo);
  const padrao = direta ? DIRETA : RITO;
  return CATALOGO_ETAPAS.map((c) => {
    const p = padrao[c.codigo];
    return {
      codigo: c.codigo,
      grupo: c.grupo,
      grupo_titulo: TITULO_ETAPA[c.grupo as EtapaFaseInterna],
      titulo: c.titulo,
      ordem: p.ordem,
      tipos_peca: direta ? [...c.tipos_peca.direta] : [...c.tipos_peca.licitacao],
      tela: c.tela,
      conclusao: c.conclusao,
      fase_maquina: c.fase_maquina,
      portao: c.portao,
      fundamento: c.fundamento,
      responsavel: { papel: p.papel, setor_id: null, usuario_id: null },
      prazo_dias_uteis: p.prazo,
      obrigatoria: p.obrigatoria,
      ligada: p.ligada,
      ia_rascunho: false,
      aprovacao_interna: false,
      dispensavel_por_ato: !!p.dispensavel_por_ato && direta,
      depende_de: [...p.depende_de],
    };
  });
}

export function modeloSemente(tipo: TipoProcessoFluxo): ModeloFluxo {
  return {
    id: null,
    orgao_id: null,
    tipo_processo: tipo,
    codigo: CODIGO_MODELO_SISTEMA,
    nome: 'Câmara — Portaria 089',
    descricao:
      'Modelo da Câmara Municipal de LEM (Portaria 089/2024) com os ajustes da Lei 14.133/2021. Autorização de início, indicação da modalidade e controle interno vêm desligados (opcionais).',
    versao: 1,
    aprovacao_demanda: { exigida: true, etapa: P.DFD, aprovador: { tipo: 'PERMISSAO', valor: null }, aceita_peca_externa: true },
    exigir_posse_pecas: true,
    etapas: etapasSemente(tipo),
  };
}

/**
 * Dependências do modelo padrão (efetivas: etapa desligada é "atravessada").
 * Usado só como reserva quando não há modelo à mão (regras puras de conformidade
 * e testes) — o processo usa o modelo dele.
 */
export function dependenciasPadrao(contratacaoDireta: boolean): Map<string, string[]> {
  return dependenciasEfetivas(etapasSemente(contratacaoDireta ? 'DISPENSA' : 'LICITACAO'));
}

// ---------------------------------------------------------------------------
// Requisitos mínimos da lei
// ---------------------------------------------------------------------------

const obrig = (codigo: string, alcance: RequisitoLegal['alcance'], etapa: P, fundamento: string, mensagem: string, permite = false): RequisitoLegal => ({
  codigo,
  alcance,
  tipo: 'ETAPA_OBRIGATORIA',
  etapa,
  outra_etapa: null,
  permite_dispensa_por_ato: permite,
  fundamento,
  mensagem,
  ativo: true,
});
const dep = (codigo: string, alcance: RequisitoLegal['alcance'], etapa: P, outra: P, fundamento: string, mensagem: string): RequisitoLegal => ({
  codigo,
  alcance,
  tipo: 'DEPENDENCIA',
  etapa,
  outra_etapa: outra,
  permite_dispensa_por_ato: false,
  fundamento,
  mensagem,
  ativo: true,
});
const seg = (codigo: string, etapa: P, outra: P, mensagem: string): RequisitoLegal => ({
  codigo,
  alcance: 'TODOS',
  tipo: 'SEGREGACAO',
  etapa,
  outra_etapa: outra,
  permite_dispensa_por_ato: false,
  fundamento: 'art. 7º, §1º',
  mensagem,
  ativo: true,
});

export const REQUISITOS_SEMENTE: RequisitoLegal[] = [
  // Contratação direta — art. 72
  obrig('RL-CD-DFD', 'CONTRATACAO_DIRETA', P.DFD, 'art. 72, I', 'Falta a formalização da demanda (DFD)'),
  obrig('RL-CD-ETP', 'CONTRATACAO_DIRETA', P.ETP, 'art. 72, I', 'Falta a etapa do estudo técnico preliminar (ou da justificativa da sua dispensa, pelo "não se aplica")'),
  obrig('RL-CD-TR', 'CONTRATACAO_DIRETA', P.TR, 'art. 72, I', 'Falta o termo de referência (ou projeto básico)'),
  obrig('RL-CD-PESQUISA', 'CONTRATACAO_DIRETA', P.PESQUISA, 'art. 72, II; art. 23', 'Falta a estimativa de despesa (pesquisa de preços)'),
  obrig('RL-CD-RESERVA', 'CONTRATACAO_DIRETA', P.RESERVA, 'art. 72, IV', 'Falta a demonstração da compatibilidade da previsão de recursos orçamentários (reserva)'),
  obrig('RL-CD-MINUTAS', 'CONTRATACAO_DIRETA', P.MINUTAS, 'art. 72, VI e VII', 'Falta o relatório do agente (razão da escolha e justificativa de preço)'),
  obrig('RL-CD-PARECER', 'CONTRATACAO_DIRETA', P.PARECER, 'art. 72, III; art. 53, §4º', 'Falta o parecer jurídico (dispensável só nas hipóteses do ato da autoridade jurídica — art. 53, §5º)', true),
  obrig('RL-CD-AUTORIZACAO', 'CONTRATACAO_DIRETA', P.AUTORIZACAO, 'art. 72, VIII', 'Falta a autorização da autoridade competente'),
  obrig('RL-CD-PUBLICACAO', 'CONTRATACAO_DIRETA', P.PUBLICACAO, 'art. 72, parágrafo único; art. 75, §3º', 'Falta a divulgação do ato (publicação)'),
  dep('RL-CD-RES-PESQ', 'CONTRATACAO_DIRETA', P.RESERVA, P.PESQUISA, 'art. 72, II e IV', 'A reserva orçamentária precisa vir depois da pesquisa de preços (o valor estimado)'),
  dep('RL-CD-AUT-PESQ', 'CONTRATACAO_DIRETA', P.AUTORIZACAO, P.PESQUISA, 'art. 72, II e VIII', 'A autorização precisa vir depois da pesquisa de preços'),
  dep('RL-CD-AUT-RES', 'CONTRATACAO_DIRETA', P.AUTORIZACAO, P.RESERVA, 'art. 72, IV e VIII', 'A autorização precisa vir depois da reserva orçamentária'),
  dep('RL-CD-PAR-MIN', 'CONTRATACAO_DIRETA', P.PARECER, P.MINUTAS, 'art. 53, caput e §4º', 'O parecer jurídico precisa vir depois das minutas (é o controle prévio delas)'),
  dep('RL-CD-PUB-AUT', 'CONTRATACAO_DIRETA', P.PUBLICACAO, P.AUTORIZACAO, 'art. 72, VIII e parágrafo único', 'A publicação precisa vir depois da autorização'),
  dep('RL-CD-PUB-PAR', 'CONTRATACAO_DIRETA', P.PUBLICACAO, P.PARECER, 'art. 53, §4º', 'A publicação precisa vir depois do parecer jurídico'),
  // Licitação — art. 18 e 53
  obrig('RL-LIC-DFD', 'LICITACAO', P.DFD, 'art. 18, I', 'Falta a formalização da demanda (DFD)'),
  obrig('RL-LIC-ETP', 'LICITACAO', P.ETP, 'art. 18, I e §1º', 'Falta o estudo técnico preliminar'),
  obrig('RL-LIC-TR', 'LICITACAO', P.TR, 'art. 18, II; art. 6º, XXIII', 'Falta o termo de referência (ou projeto básico)'),
  obrig('RL-LIC-PESQUISA', 'LICITACAO', P.PESQUISA, 'art. 18, IV; art. 23', 'Falta o orçamento estimado (pesquisa de preços)'),
  obrig('RL-LIC-RESERVA', 'LICITACAO', P.RESERVA, 'art. 18, caput', 'Falta a compatibilização com a lei orçamentária (reserva)'),
  obrig('RL-LIC-MINUTAS', 'LICITACAO', P.MINUTAS, 'art. 18, V e VI', 'Falta a elaboração do edital e da minuta do contrato'),
  obrig('RL-LIC-PARECER', 'LICITACAO', P.PARECER, 'art. 53, caput', 'Falta o parecer jurídico (controle prévio de legalidade)'),
  obrig('RL-LIC-AUTORIZACAO', 'LICITACAO', P.AUTORIZACAO, 'art. 72, VIII c/c art. 18', 'Falta a autorização da autoridade competente para a abertura'),
  obrig('RL-LIC-PUBLICACAO', 'LICITACAO', P.PUBLICACAO, 'art. 54', 'Falta a publicação do edital'),
  dep('RL-LIC-PAR-MIN', 'LICITACAO', P.PARECER, P.MINUTAS, 'art. 53, caput', 'O parecer jurídico precisa vir depois das minutas'),
  dep('RL-LIC-AUT-PAR', 'LICITACAO', P.AUTORIZACAO, P.PARECER, 'art. 53, caput', 'A autorização da abertura precisa vir depois do parecer jurídico'),
  dep('RL-LIC-AUT-RES', 'LICITACAO', P.AUTORIZACAO, P.RESERVA, 'art. 18, caput', 'A autorização precisa vir depois da reserva orçamentária'),
  dep('RL-LIC-AUT-PESQ', 'LICITACAO', P.AUTORIZACAO, P.PESQUISA, 'art. 18, IV', 'A autorização precisa vir depois da pesquisa de preços'),
  dep('RL-LIC-PUB-AUT', 'LICITACAO', P.PUBLICACAO, P.AUTORIZACAO, 'art. 54', 'A publicação precisa vir depois da autorização'),
  // Segregação de funções (aviso)
  seg('RL-SEG-PESQ-AUT', P.PESQUISA, P.AUTORIZACAO, 'Segregação de funções: quem faz a pesquisa de preços também autoriza a contratação'),
  seg('RL-SEG-AGENTE-AUT', P.MINUTAS, P.AUTORIZACAO, 'Segregação de funções: o agente de contratação também é a autoridade que autoriza'),
  seg('RL-SEG-MIN-PAR', P.MINUTAS, P.PARECER, 'Segregação de funções: quem elabora as minutas também emite o parecer jurídico'),
];
