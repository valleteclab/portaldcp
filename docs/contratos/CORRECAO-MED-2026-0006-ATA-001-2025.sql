-- ============================================================================
-- CORREÇÃO DA MED-2026-0006 — Contrato 001/2025 ATA REGISTRO DE PREÇO
-- Câmara / APS BUFE E EVENTOS LTDA — competência JULHO/2026, NF nº 15
--
-- DIAGNÓSTICO (28/07/2026):
--   A medição foi feita pelo chat assistido por IA. A IA leu a NF
--   corretamente (R$ 15.040,00), mas a quantidade foi registrada como
--   "1 mês" em vez de 320 unidades (15.040 ÷ 47 = 320). Com isso a trava
--   corrigirNotaFiscalValorIncoerente() sobrescreveu a NF pelo valor dos
--   itens (1 × R$ 47,00) e a quantidade foi recalculada como 0,32.
--
--   Gravado (ERRADO):  quantidade 0,32 · valor R$ 15,04 · NF R$ 47,00
--   Correto:           quantidade  320 · valor R$ 15.040,00 · NF R$ 15.040,00
--
-- BACKUP JÁ REALIZADO em 28/07/2026 nas tabelas:
--   backup_med6_ata001_antes_correcao_20260728   (medicoes)
--   backup_med6_itens_antes_correcao_20260728    (itens_medicao_item)
--   backup_med6_discrim_antes_correcao_20260728  (discriminacoes)
--   backup_med6_itemcron_antes_correcao_20260728 (itens_cronograma)
--
-- COMO EXECUTAR (na VPS):
--   docker cp CORRECAO-MED-2026-0006-ATA-001-2025.sql portaldcp-postgres-1:/tmp/fix.sql
--   docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp \
--     -v ON_ERROR_STOP=1 -f /tmp/fix.sql
-- ============================================================================

BEGIN;

-- 1) Execução do item: 0,32 un -> 320 un ; R$ 15,04 -> R$ 15.040,00
UPDATE itens_medicao_item
   SET quantidade_medida = 320.0000,
       valor_medido      = 15040.00
 WHERE medicao_id        = 'e0e46515-fae3-4df7-b401-bb13ed01f402'
   AND item_cronograma_id = 'a78eb517-3c89-4dc8-8b9a-6f839878b6ad';

-- 2) Medição: valor medido, NF e acumulado
--    percentual_fisico_medido = 15040 / 155100 * 100 = 9,70
--      (155.100 = valor total do item 1, base usada nas medições 1 a 5)
--    percentual_fisico_acumulado = 14,70 (M5) + 9,70 = 24,40
--    valor_acumulado_atual = 61.335,00 (anterior) + 15.040,00 = 76.375,00
UPDATE medicoes
   SET valor_medido                = 15040.00,
       nota_fiscal_valor           = 15040.00,
       valor_acumulado_atual       = 76375.00,
       percentual_fisico_medido    = 9.70,
       percentual_fisico_acumulado = 24.40
 WHERE id = 'e0e46515-fae3-4df7-b401-bb13ed01f402';

-- 3) Discriminação da despesa: SERVIÇOS 100% -> R$ 15.040,00
UPDATE discriminacoes_despesa_medicao
   SET valor      = 15040.00,
       percentual = 100.0000
 WHERE medicao_id = 'e0e46515-fae3-4df7-b401-bb13ed01f402';

-- 4) Saldo consumido do item na ATA: retira a contribuição errada (0,32)
--    e soma a correta (320). 730,32 -> 1.050,00
UPDATE itens_cronograma
   SET quantidade_medida = quantidade_medida - 0.32 + 320
 WHERE id = 'a78eb517-3c89-4dc8-8b9a-6f839878b6ad';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (esperado após o COMMIT)
--   medicao:    valor_medido 15040.00 | nf 15040.00 | acum 76375.00 | 9.70 | 24.40
--   item medido: quantidade 320.0000  | valor 15040.00
--   discrim:    SERVIÇOS 100% | 15040.00
--   item ATA:   quantidade_medida 1050.0000 (de 3300 contratadas)
-- ============================================================================
SELECT m.valor_medido, m.nota_fiscal_valor, m.valor_acumulado_atual,
       m.percentual_fisico_medido, m.percentual_fisico_acumulado,
       i.quantidade_medida AS qtd_item_medido, i.valor_medido AS valor_item,
       d.descricao, d.percentual, d.valor AS valor_discriminacao,
       c.quantidade_medida AS qtd_acumulada_ata
  FROM medicoes m
  JOIN itens_medicao_item i ON i.medicao_id = m.id
  JOIN discriminacoes_despesa_medicao d ON d.medicao_id = m.id
  JOIN itens_cronograma c ON c.id = i.item_cronograma_id
 WHERE m.id = 'e0e46515-fae3-4df7-b401-bb13ed01f402';

-- ============================================================================
-- ETAPA 2 (aplicada em 28/07/2026) — contador do boletim
--
-- ACHADO: o boletim (colunas ACUMULADO ANTERIOR / ATÉ O PERÍODO / A EXECUTAR)
-- NÃO usa medicoes.valor_acumulado_*. Ele recalcula a partir de
-- itens_cronograma.quantidade_medida × valor_unitário
-- (medicao.service.ts ~3784, fallback "centMigracao"), porque este contrato
-- não tem snapshot de execução fiscal (medicoes.execucao_fiscal = NULL em
-- TODAS as 6 medições).
--
-- Esse contador estava furado: nunca recebeu as medições 1, 2 e 4 (575 un).
-- Com 1.050 o boletim exibia "até o período" R$ 64.390,00 (errado).
--
-- Valor aplicado: 1.305 un = 230+260+330+85+400 (acumulado ANTERIOR à MED-6).
-- Resultado no boletim: anterior R$ 61.335,00 | até o período R$ 76.375,00 |
-- a executar 1.675 un (R$ 78.725,00).  ✔ correto
--
-- ⚠️ PENDÊNCIA DE CÓDIGO: para medição APROVADA o boletim deveria usar
-- medicao.valor_acumulado_anterior (fonte correta) em vez do contador
-- denormalizado. Enquanto isso não for corrigido, o contador precisa ficar
-- SEM a quantidade da última medição aprovada, o que faz a validação de saldo
-- de uma futura medição liberar 320 un a mais que o real (3.300-1.305=1.995
-- em vez de 1.675). Corrigir o código e então setar o contador para 1.625.
-- ============================================================================
-- UPDATE itens_cronograma SET quantidade_medida = 1305.0000
--  WHERE id = 'a78eb517-3c89-4dc8-8b9a-6f839878b6ad';

-- ============================================================================
-- ROLLBACK (se necessário, restaura a partir do backup)
-- ============================================================================
-- BEGIN;
-- UPDATE medicoes m SET valor_medido = b.valor_medido,
--        nota_fiscal_valor = b.nota_fiscal_valor,
--        valor_acumulado_atual = b.valor_acumulado_atual,
--        percentual_fisico_medido = b.percentual_fisico_medido,
--        percentual_fisico_acumulado = b.percentual_fisico_acumulado
--   FROM backup_med6_ata001_antes_correcao_20260728 b WHERE m.id = b.id;
-- UPDATE itens_medicao_item i SET quantidade_medida = b.quantidade_medida,
--        valor_medido = b.valor_medido
--   FROM backup_med6_itens_antes_correcao_20260728 b WHERE i.id = b.id;
-- UPDATE discriminacoes_despesa_medicao d SET valor = b.valor, percentual = b.percentual
--   FROM backup_med6_discrim_antes_correcao_20260728 b WHERE d.id = b.id;
-- UPDATE itens_cronograma c SET quantidade_medida = b.quantidade_medida
--   FROM backup_med6_itemcron_antes_correcao_20260728 b WHERE c.id = b.id;
-- COMMIT;
