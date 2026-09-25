import { criarCalendario } from '../common/prazos/calendario';
import {
  etapaEfetiva,
  minimoFaseCompetitiva,
  motivoDecisaoPreSelecaoInvalida,
  pendenciasComissao,
  pendenciasConclusaoDialogo,
  pendenciasFaseCompetitiva,
  pendenciasInicioDialogo,
  pendenciasReconsideracao,
  motivoPedidoReconsideracaoInvalido,
  prazoPedidoReconsideracao,
  validarConfiguracaoDialogo,
} from './regras-dialogo';

const semFeriados = criarCalendario([]);

describe('Diálogo competitivo — regras puras (Lei 14.133 art. 32)', () => {
  const cfg = {
    hipoteses: ['I_A', 'I_B', 'I_C'],
    justificativa_hipotese: 'Solução inovadora de mobilidade',
    necessidades: 'Reduzir o tempo de deslocamento',
    exigencias_definidas: 'Integração com o sistema atual',
    criterios_preselecao: [{ id: 'C1', descricao: 'Atestado de solução similar' }],
  };

  test('edital: hipótese (inciso I exige a, b e c), necessidades, exigências e critérios de pré-seleção (§1º I e II)', () => {
    expect(validarConfiguracaoDialogo(cfg)).toEqual([]);
    expect(validarConfiguracaoDialogo({ ...cfg, hipoteses: ['I_A'] }).join()).toMatch(/TRÊS condições/);
    expect(validarConfiguracaoDialogo({ ...cfg, hipoteses: ['II_B'] })).toEqual([]);
    expect(validarConfiguracaoDialogo({ ...cfg, hipoteses: [] }).join()).toMatch(/hipótese legal/);
    expect(validarConfiguracaoDialogo({ ...cfg, criterios_preselecao: [] }).join()).toMatch(/§1º, II/);
    expect(validarConfiguracaoDialogo({ ...cfg, necessidades: ' ' }).join()).toMatch(/necessidades/);
  });

  test('pré-seleção: todos os que atendem são admitidos; não selecionado exige motivo (§1º II)', () => {
    const base = { criteriosDoEdital: ['C1', 'C2'] };
    expect(motivoDecisaoPreSelecaoInvalida({ ...base, decisao: 'PRE_SELECIONADO', criteriosAtendidos: ['C1', 'C2'] })).toBeNull();
    expect(motivoDecisaoPreSelecaoInvalida({ ...base, decisao: 'PRE_SELECIONADO', criteriosAtendidos: ['C1'] })).toMatch(/todos os critérios/);
    expect(motivoDecisaoPreSelecaoInvalida({ ...base, decisao: 'NAO_SELECIONADO', criteriosAtendidos: ['C1', 'C2'], motivo: 'x'.repeat(20) })).toMatch(/deve ser admitido/);
    expect(motivoDecisaoPreSelecaoInvalida({ ...base, decisao: 'NAO_SELECIONADO', criteriosAtendidos: ['C1'], motivo: 'curto' })).toMatch(/motivo/);
    expect(motivoDecisaoPreSelecaoInvalida({ ...base, decisao: 'NAO_SELECIONADO', criteriosAtendidos: ['C1'], motivo: 'Sem atestado C2 válido' })).toBeNull();
  });

  test('comissão: ≥ 3 servidores efetivos/empregados permanentes; assessor com termo de confidencialidade (§1º XI e §2º)', () => {
    const efetivo = { vinculo: 'EFETIVO' };
    expect(pendenciasComissao([efetivo, efetivo]).join()).toMatch(/pelo menos 3/);
    expect(pendenciasComissao([efetivo, efetivo, { vinculo: 'EMPREGADO_PERMANENTE' }])).toEqual([]);
    expect(pendenciasComissao([efetivo, efetivo, { vinculo: 'ASSESSOR_CONTRATADO' }]).join()).toMatch(/pelo menos 3/);
    expect(pendenciasComissao([efetivo, efetivo, efetivo, { vinculo: 'ASSESSOR_CONTRATADO', nome: 'Consultor' }]).join()).toMatch(/§2º/);
  });

  test('etapas: manifestação → pré-seleção (fim do prazo) → diálogo → conclusão (§1º V e VI)', () => {
    expect(etapaEfetiva('MANIFESTACAO', 'ACOLHIMENTO_PROPOSTAS')).toBe('MANIFESTACAO');
    expect(etapaEfetiva('MANIFESTACAO', 'ANALISE_PROPOSTAS')).toBe('PRE_SELECAO');
    const comissao = [{ vinculo: 'EFETIVO' }, { vinculo: 'EFETIVO' }, { vinculo: 'EFETIVO' }];
    expect(pendenciasInicioDialogo({ etapa: 'PRE_SELECAO', participantes: [{ situacao: 'INTERESSADO' }], comissao }).join()).toMatch(/sem decisão/);
    expect(pendenciasInicioDialogo({ etapa: 'PRE_SELECAO', participantes: [{ situacao: 'NAO_SELECIONADO' }], comissao }).join()).toMatch(/Nenhum licitante pré-selecionado/);
    expect(pendenciasInicioDialogo({ etapa: 'PRE_SELECAO', participantes: [{ situacao: 'PRE_SELECIONADO' }], comissao })).toEqual([]);
    const semGravacao = pendenciasConclusaoDialogo({ etapa: 'DIALOGO', comissao, reunioes: [{ status: 'REALIZADA', ata_texto: 'ata', rotulo: 'R1' }], solucaoIdentificada: 'S' });
    expect(semGravacao.join()).toMatch(/gravação em áudio e vídeo/);
    const agendada = pendenciasConclusaoDialogo({ etapa: 'DIALOGO', comissao, reunioes: [{ status: 'REALIZADA', ata_texto: 'a', gravacao_link: 'https://x' }, { status: 'AGENDADA' }], solucaoIdentificada: 'S' });
    expect(agendada.join()).toMatch(/sem registro/);
    expect(pendenciasConclusaoDialogo({ etapa: 'DIALOGO', comissao, reunioes: [{ status: 'REALIZADA', ata_texto: 'a', gravacao_link: 'https://x' }], solucaoIdentificada: 'S' })).toEqual([]);
    expect(pendenciasConclusaoDialogo({ etapa: 'DIALOGO', comissao, reunioes: [{ status: 'REALIZADA', ata_texto: 'a', gravacao_link: 'https://x' }], solucaoIdentificada: '' }).join()).toMatch(/§1º, V/);
  });

  test('fase competitiva: 60 dias úteis contados da divulgação (art. 183), critério válido, edital (§1º VIII)', () => {
    const agora = new Date('2026-10-01T12:00:00Z'); // quinta
    const minimo = minimoFaseCompetitiva(agora, semFeriados);
    // 60 dias úteis sem feriados a partir de 02/10 → 24/12/2026 (00:00 Brasília)
    expect(minimo.toISOString()).toBe('2026-12-24T03:00:00.000Z');
    const ok = {
      especificacao_solucao: 'Plataforma X',
      criterios_selecao: 'Técnica 60% e preço 40%',
      criterio_julgamento: 'TECNICA_E_PRECO',
      modo_disputa: 'FECHADO',
      data_inicio_acolhimento: agora.toISOString(),
      data_fim_acolhimento: '2026-12-24T12:00:00Z',
      data_abertura_sessao: '2026-12-24T13:00:00Z',
    };
    expect(pendenciasFaseCompetitiva({ etapa: 'CONCLUIDO', dados: ok, agora, cal: semFeriados, temEdital: true })).toEqual([]);
    const curto = pendenciasFaseCompetitiva({ etapa: 'CONCLUIDO', dados: { ...ok, data_fim_acolhimento: '2026-12-23T12:00:00Z', data_abertura_sessao: '2026-12-23T13:00:00Z' }, agora, cal: semFeriados, temEdital: true });
    expect(curto.join()).toMatch(/60 dias úteis/);
    expect(pendenciasFaseCompetitiva({ etapa: 'DIALOGO', dados: ok, agora, cal: semFeriados, temEdital: true }).join()).toMatch(/conclusão motivada/);
    expect(pendenciasFaseCompetitiva({ etapa: 'CONCLUIDO', dados: { ...ok, criterio_julgamento: 'MAIOR_LANCE' }, agora, cal: semFeriados, temEdital: true }).join()).toMatch(/exclusivo do leilão/);
    expect(pendenciasFaseCompetitiva({ etapa: 'CONCLUIDO', dados: { ...ok, modo_disputa: 'ABERTO' }, agora, cal: semFeriados, temEdital: true }).join()).toMatch(/art. 56 §2º/);
    expect(pendenciasFaseCompetitiva({ etapa: 'CONCLUIDO', dados: ok, agora, cal: semFeriados, temEdital: false }).join()).toMatch(/Anexe o edital/);
  });

  test('pedido de reconsideração da não seleção: 3 dias úteis da intimação (art. 165, II); só do não selecionado; uma vez', () => {
    const intimacao = new Date('2026-10-01T15:00:00Z'); // quinta
    expect(prazoPedidoReconsideracao(intimacao, semFeriados).toISOString()).toBe('2026-10-07T02:59:59.999Z'); // fim de ter 06/10 (Brasília)
    const base = { situacao: 'NAO_SELECIONADO', etapa: 'PRE_SELECAO', jaPediu: false, intimacao, agora: new Date('2026-10-05T12:00:00Z'), razoes: 'Atendo o critério C2 com a equipe informada', cal: semFeriados };
    expect(motivoPedidoReconsideracaoInvalido(base)).toBeNull();
    expect(motivoPedidoReconsideracaoInvalido({ ...base, situacao: 'PRE_SELECIONADO' })).toMatch(/NÃO seleção/);
    expect(motivoPedidoReconsideracaoInvalido({ ...base, jaPediu: true })).toMatch(/já apresentado/);
    expect(motivoPedidoReconsideracaoInvalido({ ...base, agora: new Date('2026-10-08T12:00:00Z') })).toMatch(/encerrado/);
    expect(motivoPedidoReconsideracaoInvalido({ ...base, etapa: 'CONCLUIDO' })).toMatch(/concluída/);
    expect(motivoPedidoReconsideracaoInvalido({ ...base, razoes: 'curta' })).toMatch(/razões/);
  });

  test('conclusão do diálogo espera o pedido pendente e o prazo do pedido em curso', () => {
    const agora = new Date('2026-10-02T12:00:00Z');
    expect(pendenciasReconsideracao([{ situacao: 'NAO_SELECIONADO', reconsideracao_status: 'PENDENTE', rotulo: 'F3' }], agora, semFeriados).join()).toMatch(/aguardando decisão/);
    expect(pendenciasReconsideracao([{ situacao: 'NAO_SELECIONADO', decidido_em: '2026-10-01T15:00:00Z', rotulo: 'F3' }], agora, semFeriados).join()).toMatch(/prazo do pedido/);
    expect(pendenciasReconsideracao([{ situacao: 'NAO_SELECIONADO', decidido_em: '2026-09-01T15:00:00Z', rotulo: 'F3' }], agora, semFeriados)).toEqual([]);
    expect(pendenciasReconsideracao([{ situacao: 'NAO_SELECIONADO', reconsideracao_status: 'IMPROVIDA' }], agora, semFeriados)).toEqual([]);
  });
});
