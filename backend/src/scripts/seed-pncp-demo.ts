import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const IDS = {
  orgao: 'd0000000-0000-4000-8000-000000000001',
  fornecedor: 'd0000000-0000-4000-8000-000000000002',
  licitacao: 'd0000000-0000-4000-8000-000000000101',
  contratacaoDireta: 'd0000000-0000-4000-8000-000000000102',
  itemLicitacao: 'd0000000-0000-4000-8000-000000000201',
  itemContratacaoDireta: 'd0000000-0000-4000-8000-000000000202',
  credenciamento: 'd0000000-0000-4000-8000-000000000301',
  ata: 'd0000000-0000-4000-8000-000000000401',
  itemAta: 'd0000000-0000-4000-8000-000000000402',
  contrato: 'd0000000-0000-4000-8000-000000000501',
  termo: 'd0000000-0000-4000-8000-000000000502',
  docEdital: 'd0000000-0000-4000-8000-000000000601',
  docAnexoEdital: 'd0000000-0000-4000-8000-000000000602',
  docAviso: 'd0000000-0000-4000-8000-000000000603',
  docTermoReferencia: 'd0000000-0000-4000-8000-000000000604',
};

const DEMO_URL = '/api/demo-docs';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL não configurada');
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost')
    ? undefined
    : { rejectUnauthorized: false },
});

function documentMetadata(filename: string) {
  const filePath = join(process.cwd(), 'demo-docs', filename);
  const content = readFileSync(filePath);
  return {
    filename,
    path: join('demo-docs', filename),
    size: statSync(filePath).size,
    hash: createHash('sha256').update(content).digest('hex'),
  };
}

async function seed() {
  await client.connect();
  await client.query('BEGIN');
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('portal-dcp-pncp-demo-v1'))`,
  );

  try {
    await client.query(
      `
        INSERT INTO orgaos (
          id, codigo, nome, nome_fantasia, cnpj, tipo, esfera, logradouro,
          numero, bairro, cidade, uf, cep, telefone, email, site,
          responsavel_nome, responsavel_cargo, ativo, modulos_habilitados
        ) VALUES (
          $1, 'DEMO-PNCP-2026', 'ÓRGÃO MUNICIPAL DE DEMONSTRAÇÃO - DADOS FICTÍCIOS',
          'Órgão Demonstração Portal DCP', '99999999000191', 'PREFEITURA', 'MUNICIPAL',
          'Avenida da Homologação', '100', 'Centro', 'Cidade Demonstração', 'BA',
          '00000-000', '(00) 0000-0000', 'homologacao@exemplo.invalid',
          'https://www.portaldcp.com.br', 'Responsável Fictício', 'Autoridade de Demonstração',
          true, 'LICITACOES,PNCP,ATAS,CREDENCIAMENTO,CONTRATOS'
        )
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          nome_fantasia = EXCLUDED.nome_fantasia,
          cidade = EXCLUDED.cidade,
          uf = EXCLUDED.uf,
          ativo = true,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.orgao],
    );

    await client.query(
      `
        INSERT INTO fornecedores (
          id, tipo_pessoa, cpf_cnpj, razao_social, nome_fantasia, porte,
          logradouro, numero, bairro, cidade, uf, cep, telefone, email,
          representante_nome, representante_cpf, representante_cargo,
          nivel_atual, status, nivel_i_completo, ativo, observacoes
        ) VALUES (
          $1, 'JURIDICA', '99999999000102', 'FORNECEDOR DEMONSTRAÇÃO BRASIL LTDA.',
          'Fornecedor Fictício Portal DCP', 'EPP', 'Rua dos Testes', '200',
          'Centro', 'Cidade Demonstração', 'BA', '00000-000', '(00) 0000-0000',
          'fornecedor@exemplo.invalid', 'Representante Fictício', '00000000000',
          'Sócio Administrador', 'NIVEL_I', 'APROVADO', true, true,
          'Cadastro totalmente fictício para homologação PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          razao_social = EXCLUDED.razao_social,
          nome_fantasia = EXCLUDED.nome_fantasia,
          status = 'APROVADO',
          ativo = true,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.fornecedor],
    );

    await client.query(
      `
        INSERT INTO licitacoes (
          id, numero_processo, numero_edital, ano, sequencial, orgao_id,
          codigo_unidade_compradora, nome_unidade_compradora, objeto, objeto_detalhado,
          modalidade, tipo_contratacao, criterio_julgamento, modo_disputa, fase,
          valor_total_estimado, data_abertura_processo, data_publicacao_edital,
          data_limite_impugnacao, data_inicio_acolhimento, data_fim_acolhimento,
          data_abertura_sessao, pregoeiro_nome, fase_interna_concluida, srp,
          sigilo_orcamento, observacoes
        ) VALUES (
          $1, 'DEMO-PNCP-001/2026', 'PE-DEMO-001/2026', 2026, 1, $2,
          'DEMO-01', 'Unidade Compradora Fictícia', 
          '[DEMONSTRAÇÃO PNCP - SEM VALIDADE JURÍDICA] Registro de preços para computadores portáteis fictícios.',
          'Processo criado exclusivamente para demonstrar edital de licitação, anexos e ata de registro de preços.',
          'PREGAO_ELETRONICO', 'COMPRA', 'MENOR_PRECO', 'ABERTO', 'PUBLICADO',
          185000.00, '2026-07-30 09:00:00', '2026-08-01 09:00:00',
          '2026-08-06 18:00:00', '2026-08-01 09:00:00', '2026-08-10 08:59:00',
          '2026-08-10 09:00:00', 'Pregoeiro Fictício', true, true, 'PUBLICO',
          'DADOS TOTALMENTE FICTÍCIOS - AMBIENTE DE HOMOLOGAÇÃO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          numero_edital = EXCLUDED.numero_edital,
          objeto = EXCLUDED.objeto,
          fase = 'PUBLICADO',
          data_publicacao_edital = EXCLUDED.data_publicacao_edital,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.licitacao, IDS.orgao],
    );

    await client.query(
      `
        INSERT INTO licitacoes (
          id, numero_processo, numero_edital, ano, sequencial, orgao_id,
          codigo_unidade_compradora, nome_unidade_compradora, objeto, objeto_detalhado,
          modalidade, tipo_contratacao, criterio_julgamento, modo_disputa, fase,
          valor_total_estimado, data_abertura_processo, data_publicacao_edital,
          data_limite_impugnacao, data_inicio_acolhimento, data_fim_acolhimento,
          data_abertura_sessao, fase_interna_concluida, srp, sigilo_orcamento, observacoes
        ) VALUES (
          $1, 'DEMO-PNCP-002/2026', 'ACD-DEMO-001/2026', 2026, 2, $2,
          'DEMO-01', 'Unidade Compradora Fictícia',
          '[DEMONSTRAÇÃO PNCP - SEM VALIDADE JURÍDICA] Manutenção preventiva fictícia de aparelhos de climatização.',
          'Contratação direta simulada para validar aviso, termo de referência, contrato e termo aditivo.',
          'DISPENSA_ELETRONICA', 'SERVICO', 'MENOR_PRECO', 'ABERTO', 'PUBLICADO',
          36000.00, '2026-07-30 10:00:00', '2026-08-01 10:00:00',
          '2026-08-04 18:00:00', '2026-08-01 10:00:00', '2026-08-05 08:59:00',
          '2026-08-05 09:00:00', true, false, 'PUBLICO',
          'DADOS TOTALMENTE FICTÍCIOS - AMBIENTE DE HOMOLOGAÇÃO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          numero_edital = EXCLUDED.numero_edital,
          objeto = EXCLUDED.objeto,
          fase = 'PUBLICADO',
          data_publicacao_edital = EXCLUDED.data_publicacao_edital,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.contratacaoDireta, IDS.orgao],
    );

    await client.query(
      `
        INSERT INTO itens_licitacao (
          id, licitacao_id, numero_item, descricao_resumida, descricao_detalhada,
          quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado,
          tipo_participacao, status, sem_pca, observacoes
        ) VALUES (
          $1, $2, 1, 'Computador portátil - configuração demonstrativa',
          'Item fictício com 16 GB de memória, SSD de 512 GB e garantia simulada.',
          50, 'UNIDADE', 3700.0000, 185000.00, 'AMPLA', 'ATIVO', false,
          'Item sem existência material, criado apenas para homologação.'
        )
        ON CONFLICT (id) DO UPDATE SET
          descricao_resumida = EXCLUDED.descricao_resumida,
          quantidade = EXCLUDED.quantidade,
          valor_unitario_estimado = EXCLUDED.valor_unitario_estimado,
          valor_total_estimado = EXCLUDED.valor_total_estimado,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.itemLicitacao, IDS.licitacao],
    );

    await client.query(
      `
        INSERT INTO itens_licitacao (
          id, licitacao_id, numero_item, descricao_resumida, descricao_detalhada,
          quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado,
          tipo_participacao, status, sem_pca, observacoes
        ) VALUES (
          $1, $2, 1, 'Manutenção preventiva mensal fictícia',
          'Visita técnica simulada, limpeza, testes e relatório demonstrativo.',
          12, 'MES', 3000.0000, 36000.00, 'AMPLA', 'ATIVO', false,
          'Serviço fictício criado apenas para homologação.'
        )
        ON CONFLICT (id) DO UPDATE SET
          descricao_resumida = EXCLUDED.descricao_resumida,
          quantidade = EXCLUDED.quantidade,
          valor_unitario_estimado = EXCLUDED.valor_unitario_estimado,
          valor_total_estimado = EXCLUDED.valor_total_estimado,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.itemContratacaoDireta, IDS.contratacaoDireta],
    );

    const documents = [
      {
        id: IDS.docEdital,
        licitacaoId: IDS.licitacao,
        tipo: 'EDITAL',
        titulo: 'Edital de Pregão Eletrônico Fictício',
        numero: 'PE-DEMO-001/2026',
        ...documentMetadata('edital-pregao-eletronico-demo.pdf'),
      },
      {
        id: IDS.docAnexoEdital,
        licitacaoId: IDS.licitacao,
        tipo: 'ANEXO',
        titulo: 'Anexo I - Termo de Referência Fictício',
        numero: 'ANEXO-I-PE-DEMO-001/2026',
        ...documentMetadata('anexo-edital-pregao-demo.pdf'),
      },
      {
        id: IDS.docAviso,
        licitacaoId: IDS.contratacaoDireta,
        tipo: 'AVISO_LICITACAO',
        titulo: 'Aviso de Contratação Direta Fictício',
        numero: 'ACD-DEMO-001/2026',
        ...documentMetadata('aviso-contratacao-direta-demo.pdf'),
      },
      {
        id: IDS.docTermoReferencia,
        licitacaoId: IDS.contratacaoDireta,
        tipo: 'TERMO_REFERENCIA',
        titulo: 'Termo de Referência da Contratação Direta Fictícia',
        numero: 'TR-DEMO-002/2026',
        ...documentMetadata('termo-referencia-contratacao-direta-demo.pdf'),
      },
    ];

    for (const doc of documents) {
      await client.query(
        `
          INSERT INTO documentos_licitacao (
            id, licitacao_id, tipo, titulo, descricao, nome_arquivo, nome_original,
            caminho_arquivo, mime_type, tamanho_bytes, hash_arquivo, versao, status,
            publico, numero_documento, data_documento, data_publicacao
          ) VALUES (
            $1, $2, $3, $4,
            'DOCUMENTO FICTÍCIO - AMBIENTE DE HOMOLOGAÇÃO PNCP',
            $5, $5, $6, 'application/pdf', $7, $8, 1, 'PUBLICADO',
            true, $9, '2026-08-01 09:00:00', '2026-08-01 09:00:00'
          )
          ON CONFLICT (id) DO UPDATE SET
            titulo = EXCLUDED.titulo,
            caminho_arquivo = EXCLUDED.caminho_arquivo,
            tamanho_bytes = EXCLUDED.tamanho_bytes,
            hash_arquivo = EXCLUDED.hash_arquivo,
            status = 'PUBLICADO',
            publico = true,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          doc.id,
          doc.licitacaoId,
          doc.tipo,
          doc.titulo,
          doc.filename,
          doc.path,
          doc.size,
          doc.hash,
          doc.numero,
        ],
      );
    }

    await client.query(
      `
        INSERT INTO credenciamentos (
          id, orgao_id, numero_edital, ano, sequencial, numero_processo, tipo,
          status, objeto, objeto_detalhado, justificativa, requisitos_habilitacao,
          requisitos_tecnicos, documentos_exigidos, valor_estimado, forma_pagamento,
          data_publicacao, data_inicio_inscricoes, data_fim_inscricoes,
          inscricao_permanente, responsavel_nome, responsavel_cargo, responsavel_email,
          edital_url, anexos_url, amparo_legal, observacoes
        ) VALUES (
          $1, $2, 'CR-DEMO-001/2026', 2026, 1, 'DEMO-PNCP-003/2026',
          'CREDENCIAMENTO', 'PUBLICADO',
          '[DEMONSTRAÇÃO PNCP - SEM VALIDADE JURÍDICA] Credenciamento fictício para serviços de manutenção.',
          'Procedimento criado exclusivamente para validar a publicação de edital de credenciamento e anexos.',
          'Demonstração técnica das funcionalidades do Portal DCP.',
          'Cadastro empresarial, regularidade fiscal simulada e declarações fictícias.',
          'Atestado fictício de capacidade técnica e equipe demonstrativa.',
          'Ato constitutivo, certidões simuladas, atestado fictício e declaração de ciência.',
          120000.00, 'Pagamento fictício por demanda simulada.',
          '2026-08-01 09:00:00', '2026-08-01 09:00:00', '2026-12-31 18:00:00',
          false, 'Responsável Fictício', 'Comissão de Contratação',
          'homologacao@exemplo.invalid',
          $3, $4, 'Art. 79 da Lei Federal nº 14.133/2021',
          'DADOS TOTALMENTE FICTÍCIOS - AMBIENTE DE HOMOLOGAÇÃO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          objeto = EXCLUDED.objeto,
          status = 'PUBLICADO',
          edital_url = EXCLUDED.edital_url,
          anexos_url = EXCLUDED.anexos_url,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        IDS.credenciamento,
        IDS.orgao,
        `${DEMO_URL}/edital-credenciamento-demo.pdf`,
        `${DEMO_URL}/anexo-credenciamento-demo.pdf`,
      ],
    );

    await client.query(
      `
        INSERT INTO atas_registro_preco (
          id, numero_ata, ano, sequencial, orgao_id, licitacao_id, fornecedor_id,
          fornecedor_cnpj, fornecedor_razao_social, status, objeto, valor_total,
          valor_utilizado, valor_saldo, data_assinatura, data_vigencia_inicio,
          data_vigencia_fim, data_publicacao, prazo_vigencia_meses, permite_adesao,
          limite_adesao_percentual, arquivo_ata, observacoes
        ) VALUES (
          $1, 'ARP-DEMO-001/2026', 2026, 1, $2, $3, $4,
          '99999999000102', 'FORNECEDOR DEMONSTRAÇÃO BRASIL LTDA.', 'VIGENTE',
          '[DEMONSTRAÇÃO PNCP - SEM VALIDADE JURÍDICA] Registro fictício de preços para computadores portáteis.',
          185000.00, 0, 185000.00, '2026-08-15', '2026-08-15', '2027-08-14',
          '2026-08-15', 12, false, null, $5,
          'DADOS TOTALMENTE FICTÍCIOS - AMBIENTE DE HOMOLOGAÇÃO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          objeto = EXCLUDED.objeto,
          status = 'VIGENTE',
          arquivo_ata = EXCLUDED.arquivo_ata,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        IDS.ata,
        IDS.orgao,
        IDS.licitacao,
        IDS.fornecedor,
        `${DEMO_URL}/ata-registro-precos-demo.pdf`,
      ],
    );

    await client.query(
      `
        INSERT INTO itens_ata (
          id, ata_id, numero_item, descricao, descricao_detalhada, unidade_medida,
          quantidade_registrada, quantidade_utilizada, quantidade_saldo,
          valor_unitario, valor_total, marca, modelo, ativo
        ) VALUES (
          $1, $2, 1, 'Computador portátil fictício',
          'Configuração demonstrativa sem produto ou fornecedor real.',
          'UNIDADE', 50, 0, 50, 3700.0000, 185000.00,
          'MARCA FICTÍCIA', 'MODELO DEMO', true
        )
        ON CONFLICT (id) DO UPDATE SET
          descricao = EXCLUDED.descricao,
          quantidade_registrada = EXCLUDED.quantidade_registrada,
          quantidade_saldo = EXCLUDED.quantidade_saldo,
          valor_unitario = EXCLUDED.valor_unitario,
          valor_total = EXCLUDED.valor_total,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.itemAta, IDS.ata],
    );

    await client.query(
      `
        INSERT INTO contratos (
          id, numero_contrato, ano, sequencial, orgao_id, licitacao_id, fornecedor_id,
          fornecedor_cnpj, fornecedor_razao_social, tipo, categoria, modalidade_execucao,
          status, objeto, objeto_detalhado, valor_inicial, valor_global, valor_acrescimos,
          valor_supressoes, data_assinatura, data_vigencia_inicio, data_vigencia_fim,
          data_publicacao, prazo_vigencia_meses, amparo_legal, numero_processo,
          modalidade_licitacao, arquivo_contrato, observacoes
        ) VALUES (
          $1, 'CT-DEMO-001/2026', 2026, 1, $2, $3, $4,
          '99999999000102', 'FORNECEDOR DEMONSTRAÇÃO BRASIL LTDA.',
          'CONTRATO', 'SERVICOS', 'CONTINUADO', 'VIGENTE',
          '[DEMONSTRAÇÃO PNCP - SEM VALIDADE JURÍDICA] Manutenção preventiva fictícia de aparelhos de climatização.',
          'Contrato criado exclusivamente para demonstrar publicação de contrato e termo aditivo.',
          36000.00, 39600.00, 3600.00, 0, '2026-08-10', '2026-08-10', '2027-08-09',
          '2026-08-10', 12, 'Art. 75, II, da Lei Federal nº 14.133/2021',
          'DEMO-PNCP-002/2026', 'DISPENSA_ELETRONICA', $5,
          'DADOS TOTALMENTE FICTÍCIOS - AMBIENTE DE HOMOLOGAÇÃO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          objeto = EXCLUDED.objeto,
          status = 'VIGENTE',
          valor_global = EXCLUDED.valor_global,
          valor_acrescimos = EXCLUDED.valor_acrescimos,
          arquivo_contrato = EXCLUDED.arquivo_contrato,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        IDS.contrato,
        IDS.orgao,
        IDS.contratacaoDireta,
        IDS.fornecedor,
        `${DEMO_URL}/contrato-administrativo-demo.pdf`,
      ],
    );

    await client.query(
      `
        INSERT INTO termos_aditivos (
          id, contrato_id, numero_termo, sequencial, tipo, status, objeto,
          justificativa, valor_acrescimo, valor_supressao, percentual_acrescimo,
          prazo_acrescimo_dias, data_assinatura, data_publicacao,
          data_vigencia_inicio, data_vigencia_fim, amparo_legal, arquivo_termo,
          ajuste_itens_status, ajuste_itens_detalhes, observacoes
        ) VALUES (
          $1, $2, '1º Termo Aditivo Fictício', 1, 'ADITIVO_VALOR', 'VIGENTE',
          '[DEMONSTRAÇÃO PNCP - SEM VALIDADE JURÍDICA] Acréscimo fictício de 10% ao contrato demonstrativo.',
          'Termo criado exclusivamente para homologação do Portal DCP junto ao PNCP.',
          3600.00, 0, 10.00, 0, '2026-09-01', '2026-09-01',
          '2026-09-01', '2027-08-09', 'Art. 124, I, da Lei Federal nº 14.133/2021',
          $3, 'NAO_APLICAVEL', '[]'::jsonb,
          'DADOS TOTALMENTE FICTÍCIOS - AMBIENTE DE HOMOLOGAÇÃO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          objeto = EXCLUDED.objeto,
          status = 'VIGENTE',
          arquivo_termo = EXCLUDED.arquivo_termo,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.termo, IDS.contrato, `${DEMO_URL}/termo-aditivo-demo.pdf`],
    );

    await client.query('COMMIT');
    console.log(
      JSON.stringify({
        ok: true,
        ambiente: 'homologacao',
        orgaoId: IDS.orgao,
        licitacaoId: IDS.licitacao,
        contratacaoDiretaId: IDS.contratacaoDireta,
        credenciamentoId: IDS.credenciamento,
        ataId: IDS.ata,
        contratoId: IDS.contrato,
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error('Falha ao preparar demonstração PNCP:', error);
  process.exitCode = 1;
});
