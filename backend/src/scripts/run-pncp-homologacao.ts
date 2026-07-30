import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { PncpService } from '../pncp/pncp.service';

const IDS = {
  pca: 'e1000000-0000-4000-8000-000000000301',
  licitacao: 'e1000000-0000-4000-8000-000000000101',
};

const CNPJ_ORGAO = '64435842000159';
const CNPJ_FORNECEDOR = '29745667000103';

async function main() {
  const etapa = process.argv[2] || 'status';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const pncp = app.get(PncpService);
    const dataSource = app.get(DataSource);
    let resultado: any;

    if (etapa === 'status') {
      resultado = {
        conexao: await pncp.testPlatformConnection(),
        credenciais: pncp.getPlatformCredentials(),
        usuario: await pncp.consultarUsuario(),
        validacao: await pncp.validarLicitacaoParaPNCP(IDS.licitacao),
      };
    } else if (etapa === 'pca') {
      const itens = await dataSource.query(
        `SELECT * FROM itens_pca WHERE pca_id = $1 ORDER BY numero_item`,
        [IDS.pca],
      );
      resultado = await pncp.enviarPCA(IDS.pca, {
        codigo_unidade: '1',
        nome_unidade: 'Transparência',
        data_publicacao: '2026-07-30',
        itens,
      });
    } else if (etapa === 'compra') {
      resultado = await pncp.enviarCompraCompleta(IDS.licitacao);
    } else if (etapa === 'resultado') {
      resultado = await pncp.enviarResultadoHomologacao(IDS.licitacao);
    } else if (etapa === 'documento') {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const arquivo = readFileSync(
        join(process.cwd(), 'demo-docs', 'anexo-edital-pregao-demo.pdf'),
      );
      resultado = await pncp.enviarDocumento(
        IDS.licitacao,
        4,
        arquivo,
        'termo-referencia-homologacao-portaldcp.pdf',
      );
    } else if (etapa === 'retificar-compra') {
      resultado = await pncp.enviarCompra(IDS.licitacao);
    } else if (etapa === 'retificar-pca') {
      const [pca] = await dataSource.query(
        `SELECT ano_exercicio, sequencial_pncp FROM planos_contratacao_anual WHERE id = $1`,
        [IDS.pca],
      );
      if (!pca?.sequencial_pncp) {
        throw new Error('PCA ainda não possui sequencial no PNCP');
      }
      resultado = await pncp.retificarPCA(
        String(pca.ano_exercicio),
        String(pca.sequencial_pncp),
        {
          codigo_unidade: '1',
          data_publicacao: '2026-07-30',
        },
      );
    } else if (etapa === 'ata') {
      const [sync] = await dataSource.query(
        `SELECT ano_compra, sequencial_compra, numero_controle_pncp
           FROM pncp_sync
          WHERE licitacao_id = $1 AND tipo = 'COMPRA' AND status = 'ENVIADO'
          ORDER BY created_at DESC LIMIT 1`,
        [IDS.licitacao],
      );
      if (!sync) throw new Error('Compra ainda não foi enviada ao PNCP');
      resultado = await pncp.incluirAtaRegistroPreco(
        String(sync.ano_compra),
        String(sync.sequencial_compra),
        {
          cnpj_orgao: CNPJ_ORGAO,
          licitacao_id: IDS.licitacao,
          numero_controle_compra: sync.numero_controle_pncp,
          numero_ata: 'ARP-HOMOLOG-001/2026',
          ano_ata: 2026,
          data_assinatura: '2026-08-25',
          data_vigencia_inicio: '2026-08-25',
          data_vigencia_fim: '2027-08-24',
          codigo_unidade: '1',
          possibilidade_adesao: false,
        },
      );
    } else if (etapa === 'retificar-ata') {
      const [sync] = await dataSource.query(
        `SELECT ano_compra, sequencial_compra, resposta_pncp
           FROM pncp_sync
          WHERE licitacao_id = $1 AND tipo = 'ATA' AND status = 'ENVIADO'
          ORDER BY created_at DESC LIMIT 1`,
        [IDS.licitacao],
      );
      const sequencialAta = sync?.resposta_pncp?.sequencialAta;
      if (!sequencialAta) throw new Error('Ata ainda não foi enviada ao PNCP');
      resultado = await pncp.retificarAtaRegistroPreco(
        String(sync.ano_compra),
        String(sync.sequencial_compra),
        String(sequencialAta),
        {
          cnpj_orgao: CNPJ_ORGAO,
          numero_ata: 'ARP-HOMOLOG-001/2026',
          ano_ata: 2026,
          data_assinatura: '2026-08-25',
          data_vigencia_inicio: '2026-08-25',
          data_vigencia_fim: '2027-08-24',
          possibilidade_adesao: false,
          justificativa: 'Retificação para validação da integração PortalDCP',
        },
      );
    } else if (etapa === 'contrato') {
      resultado = await pncp.enviarContratosHomologacao(IDS.licitacao);
    } else if (etapa === 'resumo') {
      const [licitacao] = await dataSource.query(
        `SELECT numero_controle_pncp, ano_compra_pncp, sequencial_compra_pncp,
                link_pncp, enviado_pncp
           FROM licitacoes WHERE id = $1`,
        [IDS.licitacao],
      );
      const [pca] = await dataSource.query(
        `SELECT numero_controle_pncp, sequencial_pncp, enviado_pncp
           FROM planos_contratacao_anual WHERE id = $1`,
        [IDS.pca],
      );
      const syncs = await dataSource.query(
        `SELECT tipo, status, numero_controle_pncp, erro_mensagem, created_at
           FROM pncp_sync
          WHERE licitacao_id = $1 OR entidade_id = $2
          ORDER BY created_at`,
        [IDS.licitacao, IDS.pca],
      );
      resultado = { licitacao, pca, syncs };
    } else {
      throw new Error(`Etapa desconhecida: ${etapa}`);
    }

    console.log(`PNCP_HOMOLOG_RESULT=${JSON.stringify({ etapa, resultado })}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const mensagem =
    error?.response?.data ||
    error?.message ||
    String(error);
  console.error(
    `PNCP_HOMOLOG_ERROR=${JSON.stringify({ mensagem })}`,
  );
  process.exitCode = 1;
});
