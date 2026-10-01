import { TipoProcesso } from './entities/processo.entity';
import {
  folhasDaPeca,
  montarLinhaDoTempo,
  podeAtuar,
  situacaoDaPosse,
  temTramitacaoPropria,
  validarDespacho,
  validarDestino,
  validarPeca,
} from './processo-tramitacao-regras';
import { calcularEtapas, etapaAtual, etapasPadraoDe, sugerirSetor, temEtapasPadrao } from './tipos/etapas-padrao';

const perfil = (o: Partial<{ usuario_id: string | null; setor_id: string | null; admin_orgao: boolean }> = {}) => ({
  usuario_id: 'u1',
  nome: 'Maria',
  cargo: null,
  setor_id: 's1',
  admin_orgao: false,
  ...o,
});

describe('tramitação genérica do processo — regras puras', () => {
  it('só ADITIVO, RENOVACAO e AVULSO têm tramitação própria (a contratação segue a da licitação)', () => {
    expect(temTramitacaoPropria('ADITIVO')).toBe(true);
    expect(temTramitacaoPropria('RENOVACAO')).toBe(true);
    expect(temTramitacaoPropria('AVULSO')).toBe(true);
    expect(temTramitacaoPropria('CONTRATACAO')).toBe(false);
    expect(temTramitacaoPropria('PAGAMENTO')).toBe(false);
  });

  it('situação da posse', () => {
    expect(situacaoDaPosse(null)).toBe('SEM_TRAMITACAO');
    expect(situacaoDaPosse({ para_setor_id: 's1', para_usuario_id: null, recebida_em: null })).toBe('AGUARDANDO_RECEBIMENTO');
    expect(situacaoDaPosse({ para_setor_id: 's1', para_usuario_id: null, recebida_em: new Date() })).toBe('COM_O_RESPONSAVEL');
  });

  it('quem pode atuar: pessoa de destino, lotado no setor, chefe e administrador; os demais não', () => {
    const posse = { para_setor_id: 's1', para_usuario_id: null, recebida_em: new Date() };
    expect(podeAtuar(perfil(), posse)).toBe(true);
    expect(podeAtuar(perfil({ setor_id: 's2' }), posse)).toBe(false);
    expect(podeAtuar(perfil({ setor_id: 's2' }), posse, 'u1')).toBe(true);
    expect(podeAtuar(perfil({ setor_id: 's2', admin_orgao: true }), posse)).toBe(true);
    expect(podeAtuar(perfil({ setor_id: 's2' }), { ...posse, para_setor_id: null, para_usuario_id: 'u1' })).toBe(true);
    expect(podeAtuar(perfil({ setor_id: 's2' }), null)).toBe(false);
    expect(podeAtuar(perfil({ usuario_id: null, setor_id: null }), posse)).toBe(false);
  });

  it('destino e despacho obrigatórios', () => {
    expect(validarDestino({ despacho: 'Para parecer' })).toMatch(/destino/);
    expect(validarDestino({ para_setor_id: 's1', despacho: ' ' })).toMatch(/despacho/);
    expect(validarDestino({ para_usuario_id: 'u2', despacho: 'Segue para análise.' })).toBeNull();
    expect(validarDespacho('x'.repeat(4001))).toMatch(/passa de/);
  });

  it('peça: título + texto OU arquivo do próprio /uploads', () => {
    expect('erro' in validarPeca({ titulo: 'ab', texto: 'x' })).toBe(true);
    expect('erro' in validarPeca({ titulo: 'Parecer', texto: '' })).toBe(true);
    expect('erro' in validarPeca({ titulo: 'Parecer', arquivo_url: 'https://outro.site/x.pdf' })).toBe(true);
    expect('erro' in validarPeca({ titulo: 'Parecer', arquivo_url: '/api/uploads/processo/../../etc/passwd' })).toBe(true);
    const ok = validarPeca({ titulo: 'Parecer', arquivo_url: '/api/uploads/processo/abc123.pdf', arquivo_nome: 'parecer.pdf', paginas: 3 });
    expect('dados' in ok && ok.dados.paginas).toBe(3);
    const texto = validarPeca({ titulo: 'Pedido de aditivo', texto: 'Solicito...', paginas: 9 });
    expect('dados' in texto && texto.dados.paginas).toBe(1);
  });

  it('folhas seguem a ordem de juntada', () => {
    expect(folhasDaPeca(0, 1)).toEqual({ folha_inicial: 1, folha_final: 1 });
    expect(folhasDaPeca(1, 3)).toEqual({ folha_inicial: 2, folha_final: 4 });
  });

  it('linha do tempo: mais recente primeiro, com recebimento e encerramento', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 8, 30, 12, min));
    const linha = montarLinhaDoTempo(
      [
        { tipo: 'ABERTURA', despacho: 'Processo autuado.', created_at: t(0), de_usuario_nome: 'Maria', para_setor_nome: 'Contratos', para_usuario_nome: 'Maria', recebida_em: t(0), recebida_por_nome: 'Maria' },
        { tipo: 'ENVIO', despacho: 'Para parecer', created_at: t(10), de_usuario_nome: 'Maria', para_setor_nome: 'Jurídico', para_usuario_nome: null, recebida_em: t(20), recebida_por_nome: 'João' },
      ],
      [{ titulo: 'Pedido', folha_inicial: 1, folha_final: 2, created_at: t(5), criado_por_nome: 'Maria' }],
      { em: t(30), motivo: 'Desistência' },
    );
    expect(linha.map((e) => e.tipo)).toEqual(['ENCERRAMENTO', 'RECEBIMENTO', 'ENVIO', 'PECA', 'ABERTURA']);
    expect(linha[2].titulo).toBe('Enviado para Jurídico');
    expect(linha[3].titulo).toContain('fls. 1–2');
  });
});

describe('etapas padrão (ADITIVO/RENOVACAO)', () => {
  it('aditivo e renovação têm etapas; avulso e contratação não', () => {
    expect(temEtapasPadrao(TipoProcesso.ADITIVO)).toBe(true);
    expect(temEtapasPadrao(TipoProcesso.RENOVACAO)).toBe(true);
    expect(temEtapasPadrao(TipoProcesso.AVULSO)).toBe(false);
    expect(etapasPadraoDe(TipoProcesso.ADITIVO).map((e) => e.chave)).toEqual(['PEDIDO', 'RESERVA', 'PARECER', 'AUTORIZACAO', 'TERMO']);
    expect(etapasPadraoDe(TipoProcesso.RENOVACAO)[0].chave).toBe('VANTAJOSIDADE');
    expect(etapasPadraoDe(TipoProcesso.AVULSO)).toEqual([]);
  });

  it('a primeira etapa sem peça é a atual; peça conclui; resultado só com termo ligado', () => {
    const e0 = calcularEtapas(TipoProcesso.ADITIVO, new Set(), false);
    expect(etapaAtual(e0)?.chave).toBe('PEDIDO');
    expect(e0.slice(1).every((e) => e.estado === 'FUTURA')).toBe(true);

    const e1 = calcularEtapas(TipoProcesso.ADITIVO, new Set(['PEDIDO', 'RESERVA']), false);
    expect(e1.map((e) => e.estado)).toEqual(['CONCLUIDA', 'CONCLUIDA', 'ATUAL', 'FUTURA', 'FUTURA']);

    const e2 = calcularEtapas(TipoProcesso.ADITIVO, new Set(['PEDIDO', 'RESERVA', 'PARECER', 'AUTORIZACAO']), false);
    expect(etapaAtual(e2)?.chave).toBe('TERMO');
    expect(etapaAtual(e2)?.resultado).toBe(true);

    const e3 = calcularEtapas(TipoProcesso.ADITIVO, new Set(['PEDIDO', 'RESERVA', 'PARECER', 'AUTORIZACAO']), true);
    expect(etapaAtual(e3)).toBeNull();
  });

  it('peça fora de ordem não pula a etapa atual', () => {
    const e = calcularEtapas(TipoProcesso.ADITIVO, new Set(['PARECER']), false);
    expect(etapaAtual(e)?.chave).toBe('PEDIDO');
  });

  it('processo encerrado não tem etapa atual', () => {
    expect(etapaAtual(calcularEtapas(TipoProcesso.RENOVACAO, new Set(), false, true))).toBeNull();
  });

  it('sugere o setor pela palavra, ignorando acento e caixa', () => {
    const setores = [
      { id: 'a', nome: 'Gabinete do Prefeito' },
      { id: 'b', nome: 'Assessoria Jurídica' },
      { id: 'c', nome: 'Departamento de Orçamento' },
    ];
    expect(sugerirSetor(['juridic'], setores)?.id).toBe('b');
    expect(sugerirSetor(['orcament', 'financ'], setores)?.id).toBe('c');
    expect(sugerirSetor(['contrato'], setores)).toBeNull();
  });
});
