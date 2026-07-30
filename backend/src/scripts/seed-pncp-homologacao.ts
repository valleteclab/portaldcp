import { Client } from 'pg';

const IDS = {
  orgao: 'e1000000-0000-4000-8000-000000000001',
  fornecedor: 'e1000000-0000-4000-8000-000000000002',
  licitacao: 'e1000000-0000-4000-8000-000000000101',
  itemLicitacao: 'e1000000-0000-4000-8000-000000000201',
  pca: 'e1000000-0000-4000-8000-000000000301',
  itemPca: 'e1000000-0000-4000-8000-000000000302',
  contrato: 'e1000000-0000-4000-8000-000000000501',
};

const CNPJ_ORGAO = '64435842000159';
const CNPJ_FORNECEDOR = '29745667000103';
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

async function seed() {
  await client.connect();
  await client.query('BEGIN');
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('portal-dcp-pncp-homologacao-3087-v1'))`,
  );

  try {
    await client.query(
      `
        INSERT INTO orgaos (
          id, codigo, nome, nome_fantasia, cnpj, tipo, esfera, logradouro,
          numero, bairro, cidade, uf, cep, telefone, email, site,
          responsavel_nome, responsavel_cargo, ativo, modulos_habilitados,
          pncp_codigo_unidade, pncp_vinculado, pncp_data_vinculacao, pncp_status
        ) VALUES (
          $1, 'HOMOLOG-PNCP-3087',
          'ENTE FICTÍCIO AUTORIZADO - HOMOLOGAÇÃO PNCP',
          'Unidade de Testes PortalDCP', $2, 'AUTARQUIA', 'FEDERAL',
          'Endereço fictício de homologação', '1', 'Centro', 'Barreiras', 'BA',
          '47800-000', '(77) 0000-0000', 'homologacao@exemplo.invalid',
          'https://www.portaldcp.com.br', 'Responsável Fictício',
          'Responsável por Homologação', true,
          'LICITACOES,PNCP,PCA,ATAS,CONTRATOS',
          '1', true, CURRENT_TIMESTAMP, 'VINCULADO'
        )
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          nome_fantasia = EXCLUDED.nome_fantasia,
          cnpj = EXCLUDED.cnpj,
          pncp_codigo_unidade = '1',
          pncp_vinculado = true,
          pncp_data_vinculacao = CURRENT_TIMESTAMP,
          pncp_status = 'VINCULADO',
          ativo = true,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.orgao, CNPJ_ORGAO],
    );

    await client.query(
      `
        INSERT INTO fornecedores (
          id, tipo_pessoa, cpf_cnpj, razao_social, nome_fantasia, porte,
          logradouro, numero, bairro, cidade, uf, cep, telefone, email,
          representante_nome, representante_cpf, representante_cargo,
          nivel_atual, status, nivel_i_completo, ativo, observacoes
        ) VALUES (
          $1, 'JURIDICA', $2, 'FORNECEDOR FICTÍCIO - HOMOLOGAÇÃO PNCP',
          'Fornecedor Teste PortalDCP', 'EPP', 'Endereço fictício', '10',
          'Centro', 'Barreiras', 'BA', '47800-000', '(77) 0000-0000',
          'fornecedor-homologacao@exemplo.invalid', 'Representante Fictício',
          '00000000000', 'Representante de Teste', 'NIVEL_I', 'APROVADO',
          true, true, 'Dado exclusivamente fictício para homologação no PNCP Treinamento.'
        )
        ON CONFLICT (id) DO UPDATE SET
          cpf_cnpj = EXCLUDED.cpf_cnpj,
          razao_social = EXCLUDED.razao_social,
          status = 'APROVADO',
          ativo = true,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.fornecedor, CNPJ_FORNECEDOR],
    );

    await client.query(
      `
        INSERT INTO planos_contratacao_anual (
          id, orgao_id, codigo_unidade, nome_unidade, ano_exercicio, numero_pca,
          status, data_aprovacao, data_publicacao, responsavel_nome,
          responsavel_cargo, valor_total_estimado, quantidade_itens,
          enviado_pncp, observacoes
        ) VALUES (
          $1, $2, '1', 'Transparência', 2026, 'PCA-HOMOLOG-3087/2026',
          'APROVADO', '2026-07-30', '2026-07-30', 'Responsável Fictício',
          'Responsável por Homologação', 25000.00, 1, false,
          'PLANO FICTÍCIO SEM VALIDADE JURÍDICA - PNCP TREINAMENTO.'
        )
        ON CONFLICT (id) DO UPDATE SET
          orgao_id = EXCLUDED.orgao_id,
          codigo_unidade = '1',
          nome_unidade = 'Transparência',
          status = CASE
            WHEN planos_contratacao_anual.enviado_pncp THEN planos_contratacao_anual.status
            ELSE 'APROVADO'
          END,
          valor_total_estimado = 25000.00,
          quantidade_itens = 1,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.pca, IDS.orgao],
    );

    await client.query(
      `
        INSERT INTO itens_pca (
          id, pca_id, numero_item, categoria, status, descricao_objeto,
          justificativa, catalogo_utilizado, classificacao_catalogo,
          codigo_classe, nome_classe, valor_unitario_estimado,
          valor_orcamentario_exercicio, unidade_requisitante, valor_estimado,
          quantidade_estimada, unidade_medida, data_prevista_inicio,
          data_prevista_conclusao, modalidade_prevista, srp, prioridade,
          codigo_grupo, nome_grupo, renovacao_contrato,
          data_desejada_contratacao, observacoes
        ) VALUES (
          $1, $2, 1, 'MATERIAL', 'PLANEJADO',
          'Aquisição fictícia de estações de trabalho para homologação PNCP',
          'Item criado exclusivamente para testar a integração do PortalDCP.',
          'OUTROS', 'MATERIAL', '7010', 'EQUIPAMENTOS DE INFORMÁTICA',
          5000.0000, 25000.00, 'Transparência', 25000.00, 5, 'UNIDADE',
          '2026-10-01', '2026-12-31', 'PREGAO_ELETRONICO', true, 3,
          'TI-2026', 'Equipamentos de Tecnologia', 'NAO', '2026-10-01',
          'ITEM FICTÍCIO SEM VALIDADE JURÍDICA - PNCP TREINAMENTO.'
        )
        ON CONFLICT (id) DO UPDATE SET
          descricao_objeto = EXCLUDED.descricao_objeto,
          valor_unitario_estimado = 5000.0000,
          valor_orcamentario_exercicio = 25000.00,
          valor_estimado = 25000.00,
          quantidade_estimada = 5,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.itemPca, IDS.pca],
    );

    await client.query(
      `
        INSERT INTO licitacoes (
          id, numero_processo, numero_edital, ano, sequencial, orgao_id,
          codigo_unidade_compradora, nome_unidade_compradora, objeto,
          objeto_detalhado, modalidade, tipo_contratacao, criterio_julgamento,
          modo_disputa, fase, valor_total_estimado, valor_homologado,
          data_abertura_processo, data_publicacao_edital, data_limite_impugnacao,
          data_inicio_acolhimento, data_fim_acolhimento, data_abertura_sessao,
          data_homologacao, pregoeiro_nome, fase_interna_concluida, srp,
          sigilo_orcamento, observacoes
        ) VALUES (
          $1, 'HOMOLOG-PNCP-3087-001/2026', 'PE-HOMOLOG-001/2026',
          2026, 1, $2, '1', 'Transparência',
          '[TESTE DE HOMOLOGAÇÃO - SEM VALIDADE JURÍDICA] Aquisição fictícia de estações de trabalho.',
          'Processo criado exclusivamente para comprovar a integração do PortalDCP com o PNCP Treinamento.',
          'PREGAO_ELETRONICO', 'COMPRA', 'MENOR_PRECO', 'ABERTO',
          'PUBLICADO', 25000.00, 24000.00, '2026-07-30 09:00:00',
          '2026-08-01 09:00:00', '2026-08-06 18:00:00',
          '2026-08-01 09:00:00', '2026-08-12 08:59:00',
          '2026-08-12 09:00:00', '2026-08-20 10:00:00',
          'Pregoeiro Fictício', true, true, 'PUBLICO',
          'DADOS FICTÍCIOS - AMBIENTE DE TREINAMENTO DO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          orgao_id = EXCLUDED.orgao_id,
          codigo_unidade_compradora = '1',
          nome_unidade_compradora = 'Transparência',
          objeto = EXCLUDED.objeto,
          fase_interna_concluida = true,
          srp = true,
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.licitacao, IDS.orgao],
    );

    await client.query(
      `
        INSERT INTO itens_licitacao (
          id, licitacao_id, item_pca_id, numero_item, descricao_resumida,
          descricao_detalhada, quantidade, unidade_medida,
          valor_unitario_estimado, valor_total_estimado,
          valor_unitario_homologado, valor_total_homologado,
          fornecedor_vencedor_id, fornecedor_vencedor_nome,
          tipo_participacao, status, sem_pca, observacoes
        ) VALUES (
          $1, $2, $3, 1, 'Estação de trabalho - configuração fictícia',
          'Equipamento fictício para teste de publicação, resultado, ata e contrato.',
          5, 'UNIDADE', 5000.0000, 25000.00, 4800.0000, 24000.00,
          $4, 'FORNECEDOR FICTÍCIO - HOMOLOGAÇÃO PNCP',
          'AMPLA', 'HOMOLOGADO', false,
          'ITEM FICTÍCIO - AMBIENTE DE TREINAMENTO DO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          fornecedor_vencedor_id = EXCLUDED.fornecedor_vencedor_id,
          fornecedor_vencedor_nome = EXCLUDED.fornecedor_vencedor_nome,
          valor_unitario_homologado = 4800.0000,
          valor_total_homologado = 24000.00,
          status = 'HOMOLOGADO',
          updated_at = CURRENT_TIMESTAMP
      `,
      [IDS.itemLicitacao, IDS.licitacao, IDS.itemPca, IDS.fornecedor],
    );

    await client.query(
      `
        INSERT INTO contratos (
          id, numero_contrato, ano, sequencial, orgao_id, licitacao_id,
          fornecedor_id, fornecedor_cnpj, fornecedor_razao_social, tipo,
          categoria, modalidade_execucao, status, objeto, objeto_detalhado,
          valor_inicial, valor_global, valor_acrescimos, valor_supressoes,
          data_assinatura, data_vigencia_inicio, data_vigencia_fim,
          data_publicacao, prazo_vigencia_meses, amparo_legal,
          numero_processo, modalidade_licitacao, observacoes
        ) VALUES (
          $1, 'CT-HOMOLOG-001/2026', 2026, 1, $2, $3, $4, $5,
          'FORNECEDOR FICTÍCIO - HOMOLOGAÇÃO PNCP', 'CONTRATO', 'COMPRAS',
          'ITEM_QUANTIDADE', 'VIGENTE',
          '[TESTE DE HOMOLOGAÇÃO - SEM VALIDADE JURÍDICA] Aquisição fictícia de estações de trabalho.',
          'Contrato criado exclusivamente para testar a integração com o PNCP.',
          24000.00, 24000.00, 0, 0, '2026-08-25', '2026-08-25',
          '2027-08-24', '2026-08-25', 12,
          'Lei nº 14.133/2021, art. 28, I',
          'HOMOLOG-PNCP-3087-001/2026', 'PREGAO_ELETRONICO',
          'CONTRATO FICTÍCIO - AMBIENTE DE TREINAMENTO DO PNCP.'
        )
        ON CONFLICT (id) DO UPDATE SET
          orgao_id = EXCLUDED.orgao_id,
          licitacao_id = EXCLUDED.licitacao_id,
          fornecedor_id = EXCLUDED.fornecedor_id,
          fornecedor_cnpj = EXCLUDED.fornecedor_cnpj,
          valor_global = 24000.00,
          status = 'VIGENTE',
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        IDS.contrato,
        IDS.orgao,
        IDS.licitacao,
        IDS.fornecedor,
        CNPJ_FORNECEDOR,
      ],
    );

    await client.query('COMMIT');
    console.log(
      JSON.stringify({
        ok: true,
        ambiente: 'PNCP Treinamento',
        cnpjOrgao: CNPJ_ORGAO,
        codigoUnidade: '1',
        orgaoId: IDS.orgao,
        pcaId: IDS.pca,
        licitacaoId: IDS.licitacao,
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
  console.error('Falha ao preparar homologação PNCP:', error);
  process.exitCode = 1;
});
