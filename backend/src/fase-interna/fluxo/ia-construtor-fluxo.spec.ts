import { PAPEIS_FASE_INTERNA } from './codigos';
import { grafoDaRespostaIa, pedidoAoConstrutor } from './ia-construtor-fluxo';
import { conferirGrafo } from './motor-grafo';
import { REQUISITOS_SEMENTE } from './semente-fluxo';

const ctx = { tipo: 'DISPENSA' as const, setores: [{ id: 's-fin', nome: 'Secretaria de Finanças' }], usuarios: [] };

describe('montar com IA (funções puras)', () => {
  it('o pedido leva os setores do órgão, os papéis, os códigos das peças e as regras da lei', () => {
    const p = pedidoAoConstrutor(ctx, 'Acima de 80 mil, Finanças aprova.');
    expect(p.sistema).toMatch(/"Secretaria de Finanças"/);
    expect(p.sistema).toMatch(/AGENTE_CONTRATACAO/);
    expect(p.sistema).toMatch(/PP \(Pesquisa de preços e mapa\)/);
    expect(p.sistema).toMatch(/a pesquisa, a reserva e o parecer vêm antes da autorização/);
    expect(p.usuario).toMatch(/Acima de 80 mil/);
  });

  it('resposta → grafo: setor pelo nome (sem acento/caixa), papel pelo nome, peças do catálogo, aviso de setor inexistente; resposta sem grafo → null', () => {
    const r = grafoDaRespostaIa(
      {
        nos: [
          { id: 'i', tipo: 'inicio' },
          { id: 'f', tipo: 'aprovacao', nome: 'Finanças aprova', setor: 'secretaria de financas' },
          { id: 'p', tipo: 'etapa', nome: 'Pesquisa', setor: 'Compras', pecas: ['PP'] },
          { id: 'x', tipo: 'etapa', nome: 'Almoxarifado confere', setor: 'Almoxarifado' },
          { id: 'z', tipo: 'fim' },
        ],
        arestas: [
          { de: 'i', para: 'p' },
          { de: 'p', para: 'f' },
          { de: 'f', para: 'x' },
          { de: 'x', para: 'z' },
        ],
      },
      ctx,
    )!;
    const no = (id: string) => r.grafo.nos.find((n) => n.id === id)!;
    expect(no('f').responsavel).toEqual({ setor_id: 's-fin', papel: null, usuario_id: null });
    expect(no('p')).toMatchObject({ codigo: 'PESQUISA', responsavel: { papel: 'COMPRAS' } });
    expect(no('x').responsavel).toEqual({ papel: null, setor_id: null, usuario_id: null });
    expect(r.ajustes.map((a) => a.mensagem)).toEqual(expect.arrayContaining([expect.stringMatching(/Setor "Almoxarifado" não existe no órgão/)]));
    // A conferência aponta o que falta (lei e quem faz), sem quebrar
    const c = conferirGrafo(r.grafo, { tipo: 'DISPENSA', requisitos: REQUISITOS_SEMENTE, papeis: PAPEIS_FASE_INTERNA });
    expect(c.ok).toBe(false);
    expect(c.erros.map((e) => e.codigo)).toEqual(expect.arrayContaining(['GRAFO_SEM_RESPONSAVEL', 'RL-CD-AUTORIZACAO']));
    expect(grafoDaRespostaIa({ texto: 'não sei' }, ctx)).toBeNull();
  });
});
