import * as fs from 'fs';
import * as path from 'path';
import {
  EmpenhoFator,
  FatorTransparenciaService,
  ResumoEmpenhos,
} from './fator-transparencia.service';

/**
 * Testes do parser/classificador do Portal da Transparência (Fator) usando
 * HTMLs reais capturados do portal:
 *
 * - claudiana-2025.html → contrato comum: o dialog traz "Nº Contrato: 019-2025"
 * - aps-2026.html / aps-2025.html → ata de registro de preços: o dialog traz
 *   "Nº Contrato: -" (vazio) e só cita a ata no histórico da despesa.
 *
 * Os HTMLs sao fixtures reais do portal, em backend/test/fixtures/fator.
 */
const DIR_FIXTURES =
  process.env.FATOR_FIXTURES_DIR ??
  path.join(__dirname, '..', '..', 'test', 'fixtures', 'fator');

function lerFixture(nome: string): string {
  return fs.readFileSync(path.join(DIR_FIXTURES, nome), 'utf8');
}

/** Acesso aos métodos privados do serviço (parser + classificador) */
interface ServicoInterno {
  parsearHtml(html: string): EmpenhoFator[];
  calcularResumo(
    empenhos: EmpenhoFator[],
    opts?: { valor_global?: number; ano_contrato?: number },
  ): ResumoEmpenhos;
  chaveContrato(numero?: string): string;
  chaveNumeroAno(numero?: string): string;
  normalizarNumeroContrato(numero?: string): string;
  classificarConfirmacao(
    e: EmpenhoFator,
    alvo: { chaveContrato: string; chaveTexto: string; chaveProcesso: string },
  ): string;
  anoDoNumeroContrato(numero?: string): number | null;
  extrairOsCitada(texto: string): string;
}

/**
 * Reproduz o que `buscarEmpenhos` faz depois de baixar o HTML: parseia e
 * classifica cada registro contra o contrato alvo.
 */
function classificarHtml(
  servico: ServicoInterno,
  html: string,
  alvo: { numeroContrato: string; processoLicitatorioPortal?: string },
): EmpenhoFator[] {
  const normalizado = servico.normalizarNumeroContrato(alvo.numeroContrato);
  const chaves = {
    chaveContrato: servico.chaveContrato(normalizado),
    chaveTexto: servico.chaveNumeroAno(normalizado),
    chaveProcesso: (alvo.processoLicitatorioPortal ?? '').replace(/\D/g, ''),
  };
  const registros = servico.parsearHtml(html);
  for (const r of registros) {
    r.confirmacao = servico.classificarConfirmacao(r, chaves) as any;
  }
  return registros;
}

describe('FatorTransparenciaService', () => {
  const servico = new FatorTransparenciaService({
    getValue: async () => '1',
  } as any) as unknown as ServicoInterno;

  describe('contrato comum (portal informa o Nº Contrato)', () => {
    it('confirma os empenhos do contrato 019/2025 por CONTRATO', () => {
      const registros = classificarHtml(servico, lerFixture('claudiana-2025.html'), {
        numeroContrato: '019/2025',
      });

      const empenhos = registros.filter((r) => r.fase_tipo === 'EMPENHO');
      const confirmadosPorContrato = empenhos.filter(
        (r) => r.confirmacao === 'CONTRATO',
      );

      expect(confirmadosPorContrato.length > 0).toBe(true);
      for (const e of confirmadosPorContrato) {
        expect(e.numero_contrato).toMatch(/019[-/]2025/);
      }
    });

    it('não confirma empenhos de outro contrato do mesmo fornecedor', () => {
      const registros = classificarHtml(servico, lerFixture('claudiana-2025.html'), {
        numeroContrato: '019/2025',
      });

      const deOutroContrato = registros.filter(
        (r) => r.numero_contrato === '007-2024',
      );
      expect(deOutroContrato.length > 0).toBe(true);
      for (const e of deOutroContrato) {
        expect(e.confirmacao).toBe('NAO_CONFIRMADO');
      }
    });
  });

  describe('ata de registro de preços (portal não informa o Nº Contrato)', () => {
    const alvo = { numeroContrato: '001/2025 1ªAD' };

    it('o dialog realmente não traz o número do contrato', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2026.html'), alvo);
      for (const r of registros) {
        expect(servico.chaveContrato(r.numero_contrato)).toBe('');
      }
    });

    it('confirma os 12 empenhos de 2026 pelo HISTORICO, total R$ 156.745,00', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2026.html'), alvo);
      const empenhos = registros.filter((r) => r.fase_tipo === 'EMPENHO');

      expect(empenhos).toHaveLength(12);
      for (const e of empenhos) {
        expect(e.confirmacao).toBe('HISTORICO');
      }

      const total = empenhos.reduce((s, e) => s + e.valor, 0);
      expect(Math.round(total * 100) / 100).toBe(156745);
    });

    it('nenhum registro é descartado silenciosamente', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2026.html'), alvo);
      // 12 empenhos + liquidações + pagamentos, todos presentes na lista
      expect(registros.length > 12).toBe(true);
      expect(registros.filter((r) => r.fase_tipo === 'LIQUIDACAO').length).toBe(12);
      expect(registros.filter((r) => r.fase_tipo === 'PAGAMENTO').length).toBe(12);
    });

    it('extrai a OS citada no histórico do pagamento', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2026.html'), alvo);
      const comOs = registros.filter((r) => !!r.os_citada);
      expect(comOs.length > 0).toBe(true);
      const os0224 = registros.find((r) => r.os_citada === 'OS-0224/2026');
      expect(!!os0224).toBe(true);
    });

    it('em 2025 sobra o empenho de outro processo como NAO_CONFIRMADO', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2025.html'), alvo);
      const empenhos = registros.filter((r) => r.fase_tipo === 'EMPENHO');

      expect(empenhos).toHaveLength(10);
      const porHistorico = empenhos.filter((e) => e.confirmacao === 'HISTORICO');
      const naoConfirmados = empenhos.filter(
        (e) => e.confirmacao === 'NAO_CONFIRMADO',
      );
      expect(porHistorico).toHaveLength(9);
      expect(naoConfirmados).toHaveLength(1);
      // O registro solto é de outro processo licitatório
      expect(naoConfirmados[0].processo_licitatorio).toBe('027-2025-D');
    });

    it('confirma pelo PROCESSO quando o contrato tem o processo do portal', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2025.html'), {
        numeroContrato: '999/2099', // número que não aparece em lugar nenhum
        processoLicitatorioPortal: '006-2025-PE',
      });
      const empenhos = registros.filter((r) => r.fase_tipo === 'EMPENHO');
      const porProcesso = empenhos.filter((e) => e.confirmacao === 'PROCESSO');
      expect(porProcesso).toHaveLength(9);
    });
  });

  describe('resumo', () => {
    it('ignora os não confirmados nos totais e os reporta à parte', () => {
      const registros = classificarHtml(servico, lerFixture('aps-2025.html'), {
        numeroContrato: '001/2025 1ªAD',
      });
      const resumo = servico.calcularResumo(registros, {
        valor_global: 500000,
        ano_contrato: 2025,
      });

      // Lista completa preservada (inclui os não confirmados)
      expect(resumo.empenhos).toHaveLength(registros.length);
      expect(resumo.resumo.quantidade_empenhos).toBe(9);
      expect(resumo.resumo.quantidade_nao_confirmada).toBe(1);
      expect(resumo.resumo.total_nao_confirmado > 0).toBe(true);

      const totalTodos = registros
        .filter((r) => r.fase_tipo === 'EMPENHO')
        .reduce((s, e) => s + e.valor, 0);
      expect(
        Math.round(
          (resumo.resumo.total_empenhado + resumo.resumo.total_nao_confirmado) *
            100,
        ) / 100,
      ).toBe(Math.round(totalTodos * 100) / 100);
    });
  });

  describe('helpers', () => {
    it('extrai o ano do número do contrato', () => {
      expect(servico.anoDoNumeroContrato('001/2025')).toBe(2025);
      expect(servico.anoDoNumeroContrato('019-2025')).toBe(2025);
      expect(servico.anoDoNumeroContrato('')).toBe(null);
    });

    it('normaliza a chave NNNAAAA com zeros à esquerda', () => {
      expect(servico.chaveNumeroAno('1/2025')).toBe('0012025');
      expect(servico.chaveNumeroAno('001/2025')).toBe('0012025');
      expect(servico.chaveNumeroAno('019-2025')).toBe('0192025');
    });

    it('reconhece a OS por extenso e abreviada', () => {
      expect(servico.extrairOsCitada('CONFORME ORDEM DE SERVIÇO OS-0224/2026')).toBe(
        'OS-0224/2026',
      );
      expect(servico.extrairOsCitada('CONFORME ORDEM DE SERVIÇO Nº 003')).toBe(
        'OS-003',
      );
      expect(servico.extrairOsCitada('SEM REFERÊNCIA')).toBe('');
    });
  });
});
