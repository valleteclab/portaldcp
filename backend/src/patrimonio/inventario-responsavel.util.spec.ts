import { agruparPorResponsavel, chaveTelefone, mensagemConvite } from './inventario-responsavel.util';

const setor = (id: string, nome: string, tel: string | null, status = 'PENDENTE', resp: string | null = null) => ({
  id,
  setor_nome: nome,
  responsavel_nome: resp,
  responsavel_telefone: tel,
  status,
});

describe('inventario-responsavel.util', () => {
  it('chaveTelefone ignora máscara e DDI 55', () => {
    expect(chaveTelefone('(77) 9 9999-8888')).toBe('77999998888');
    expect(chaveTelefone('5577999998888')).toBe('77999998888');
    expect(chaveTelefone('')).toBe('');
    expect(chaveTelefone(null)).toBe('');
  });

  it('agrupa pelo WhatsApp, mesmo com formatos diferentes, em ordem alfabética', () => {
    const { grupos, semTelefone } = agruparPorResponsavel([
      setor('1', 'GABINETE 2', '77999998888', 'PENDENTE', 'Maria'),
      setor('2', 'ALMOXARIFADO', '5577999998888'),
      setor('3', 'JURIDICO', '77988887777', 'EM_ANDAMENTO', 'João'),
      setor('4', 'COPA', null),
    ]);
    expect(grupos.length).toBe(2);
    const maria = grupos.find((g) => g.nome === 'Maria')!;
    expect(maria.setores.map((s) => s.setor_nome)).toEqual(['ALMOXARIFADO', 'GABINETE 2']);
    expect(semTelefone.map((s) => s.setor_nome)).toEqual(['COPA']);
  });

  it('setor já finalizado não entra no convite', () => {
    const { grupos, semTelefone } = agruparPorResponsavel([
      setor('1', 'A', '77999998888', 'FECHADO'),
      setor('2', 'B', '77999998888'),
      setor('3', 'C', null, 'FECHADO'),
    ]);
    expect(grupos[0].setores.map((s) => s.id)).toEqual(['2']);
    expect(semTelefone.length).toBe(0);
  });

  it('mensagem de um setor', () => {
    const m = mensagemConvite({ ano: 2026, orgaoNome: 'Câmara', responsavelNome: 'Ana', setores: ['COPA'], link: 'https://x/inventario/t' });
    expect(m).toContain('do setor *COPA*');
    expect(m).toContain('https://x/inventario/t');
  });

  it('mensagem de vários setores lista todos e explica a troca', () => {
    const m = mensagemConvite({ ano: 2026, orgaoNome: 'Câmara', responsavelNome: null, setores: ['A', 'B', 'C'], link: 'L' });
    expect(m).toContain('*3 setores*');
    expect(m).toContain('• A\n• B\n• C');
    expect(m).toContain('troque de setor');
    expect(m.startsWith('📋 *Inventário 2026 — Câmara*')).toBe(true);
  });
});
