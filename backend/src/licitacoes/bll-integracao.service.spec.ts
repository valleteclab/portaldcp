import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BllIntegracaoService } from './bll-integracao.service';

/**
 * Exemplos literais do "Manual de Importação e Exportação de Dados" da BLL.
 */
const EXP_MANUAL = [
  '1|11|2010|1|04367473000144|CASA DO COMPUTADOR|RUA DOS ENGENHEIROS|237|PINHEIRINHO|CJ 1134|CURITIBA|PR|81280060|MARCIO|(41) 3443-8180|(41) 8762-8340|casadocomputador@hotmail.com|0',
  '2|11|2010|2|1|1|04367473000144|2976.80000000|DELL|1',
  '2|11|2010|2|1|1|11222333000181|3100.00000000|HP|0',
].join('\r\n');

function servico(mocks: Partial<Record<'lic' | 'item' | 'integracao' | 'forn' | 'fornService' | 'licService', any>> = {}) {
  return new BllIntegracaoService(
    mocks.lic || ({} as any),
    mocks.item || ({} as any),
    mocks.integracao || ({} as any),
    mocks.forn || ({} as any),
    mocks.fornService || ({} as any),
    mocks.licService || ({} as any),
  );
}

describe('BllIntegracaoService', () => {
  describe('parseExp', () => {
    it('lê fornecedores e lances do exemplo do manual', () => {
      const s = servico() as any;
      const r = s.parseExp(Buffer.from(EXP_MANUAL, 'latin1'));
      expect(r.edital).toBe(11);
      expect(r.ano).toBe(2010);
      expect(r.fornecedores).toHaveLength(1);
      expect(r.fornecedores[0]).toMatchObject({
        documento: '04367473000144', razao_social: 'CASA DO COMPUTADOR', cidade: 'CURITIBA', uf: 'PR',
        cep: '81280060', email: 'casadocomputador@hotmail.com', micro_empresa: false,
      });
      expect(r.lances).toHaveLength(2);
      expect(r.lances[0]).toMatchObject({ lote: 2, item: 1, documento: '04367473000144', preco: 2976.8, marca: 'DELL', vencedor: true });
      expect(r.lances[1].vencedor).toBe(false);
      expect(r.ignorados).toBe(0);
    });

    it('emenda registro quebrado em duas linhas (como o PDF do manual mostra)', () => {
      const quebrado = '1|11|2010|1|04367473000144|CASA DO COMPUTADOR|RUA DOS ENGENHEIROS\r\n|237|PINHEIRINHO|CJ 1134|CURITIBA|PR|81280060|MARCIO|(41) 3443-8180|(41) 8762-8340|casa@x.com|1';
      const r = (servico() as any).parseExp(Buffer.from(quebrado, 'latin1'));
      expect(r.fornecedores).toHaveLength(1);
      expect(r.fornecedores[0].numero).toBe('237');
      expect(r.fornecedores[0].micro_empresa).toBe(true);
    });
  });

  describe('exportar', () => {
    it('gera o .IMP no leiaute do manual (pipe, ASCII, #13#10)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'bll-'));
      process.env.UPLOAD_DIR = dir;
      const lic: any = {
        id: 'L1', numero_processo: '13354', numero_edital: 'PE 011/2010', ano: 2010, srp: false,
        orgao: { nome: 'Município de Telêmaco Borba' }, entrega_local: null, entrega_prazo: null, garantia_produto: null,
      };
      const itens: any[] = [
        { id: 'I1', numero_item: 1, numero_lote: 1, lote: { numero: 1, descricao: 'Lote 001' }, unidade_medida: 'UNIDADE', quantidade: 100, valor_unitario_estimado: 15.17, descricao_resumida: 'LAPTOP Pentium Core 2 Duo', descricao_detalhada: 'Com "acentuação" | e pipe\nsegunda linha' },
      ];
      const salvos: any[] = [];
      const s = servico({
        lic: { findOne: async () => lic, save: async (x: any) => x },
        item: { find: async () => itens },
        integracao: { create: (x: any) => x, save: async (x: any) => { salvos.push(x); return x; } },
      });
      const r = await s.exportar('L1', { entrega_local: 'almoxarifado', entrega_prazo: 'Ate 26/01/10', garantia_produto: '6 meses' }, 'Teste');
      const texto = r.buffer.toString('latin1');
      const linhas = texto.trim().split('\r\n');
      expect(linhas[0]).toBe('1|11|2010|13354|Municipio de Telemaco Borba|0|0');
      expect(linhas[1]).toBe('2|11|2010|1|Lote 001|almoxarifado|Ate 26/01/10|6 meses');
      expect(linhas[2]).toBe('3|11|2010|1|1|UN|100.0000|15.1700|LAPTOP Pentium Core 2 Duo - Com "acentuacao" / e pipe#13#10segunda linha');
      expect(/^[\x00-\x7f]*$/.test(texto)).toBe(true); // ASCII puro
      expect(r.nome).toMatch(/^edital-11-2010-\d+\.imp$/);
      expect(readFileSync(salvos[0].caminho_arquivo, 'latin1')).toBe(texto);
      expect(lic.entrega_local).toBe('almoxarifado'); // campos salvos na licitação
    });

    it('recusa licitação sem número de edital numérico', async () => {
      const s = servico({
        lic: { findOne: async () => ({ id: 'L2', numero_processo: 'X', numero_edital: null, sequencial: null, ano: 2026, orgao: {} }) },
        item: { find: async () => [{ id: 'I', numero_item: 1, unidade_medida: 'UNIDADE', quantidade: 1, valor_unitario_estimado: 1, descricao_resumida: 'x' }] },
      });
      await expect(s.exportar('L2', {}, 'T')).rejects.toThrow(/não está pronta/);
    });
  });

  describe('importar (prévia)', () => {
    it('casa vencedor com o item pelo lote/item e aponta fornecedor novo', async () => {
      const lic: any = { id: 'L1', numero_processo: '13354', numero_edital: '11', ano: 2010, srp: false, orgao: {}, data_homologacao: null };
      const itens: any[] = [
        { id: 'I1', numero_item: 1, numero_lote: 2, lote: { numero: 2, descricao: 'Lote 002' }, unidade_medida: 'UNIDADE', quantidade: 10, valor_unitario_estimado: 3000, descricao_resumida: 'Notebook', status: 'ATIVO' },
        { id: 'I2', numero_item: 2, numero_lote: 3, lote: { numero: 3, descricao: 'Lote 003' }, unidade_medida: 'UNIDADE', quantidade: 5, valor_unitario_estimado: 500, descricao_resumida: 'Monitor', status: 'ATIVO' },
      ];
      const s = servico({
        lic: { findOne: async () => lic },
        item: { find: async () => itens },
        forn: { findOne: async () => null },
      });
      const r = await s.importar('L1', { buffer: Buffer.from(EXP_MANUAL, 'latin1'), originalname: 'r.exp' }, false, 'T');
      expect(r.aplicado).toBe(false);
      expect(r.previa.pode_aplicar).toBe(true);
      expect(r.previa.vencedores).toHaveLength(1);
      expect(r.previa.vencedores[0]).toMatchObject({ item_id: 'I1', valor_unitario: 2976.8, valor_total: 29768, marca: 'DELL', fornecedor_novo: true, documento: '04.367.473/0001-44' });
      expect(r.previa.itens_sem_vencedor).toEqual([2]);
      expect(r.previa.fornecedores[0].situacao).toBe('NOVO');
      expect(r.previa.lances_nao_vencedores).toBe(1);
    });

    it('barra arquivo de outro edital', async () => {
      const s = servico({
        lic: { findOne: async () => ({ id: 'L1', numero_edital: '99', ano: 2010, orgao: {} }) },
        item: { find: async () => [] },
        forn: { findOne: async () => null },
      });
      const r = await s.importar('L1', { buffer: Buffer.from(EXP_MANUAL, 'latin1'), originalname: 'r.exp' }, false, 'T');
      expect(r.previa.pode_aplicar).toBe(false);
      expect(r.previa.erros.join(' ')).toMatch(/edital 11\/2010/);
    });
  });
});
