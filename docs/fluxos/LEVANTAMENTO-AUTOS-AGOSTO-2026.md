# Levantamento dos autos de agosto/2026 — Câmara de Luís Eduardo Magalhães

Base dos **modelos prontos de fluxo** (`backend/src/workflow/modelos-prontos/catalogo-modelos.ts`).
Fonte: digitalização de agosto/2026 (licitação, contratos, aditivo, pareceres e pagamentos).
Peças listadas **na ordem das folhas**. As datas aparecem só como informação.

## Inexigibilidade (032 e 033/2026 — art. 74, III, "f", capacitação)

1. Capa
2. DFD (Depto. Administrativo → Presidência, pede autorização)
3. ETP
4. CI do RH com os documentos da empresa
5. Proposta, folder e beneficiários
6. Habilitação: contrato social, CNPJ, atestados, certidões e CNH
7. CI à Contabilidade (consulta de verba)
8. Dotação
9. Despacho da Mesa (autoriza)
10. Portaria do agente (cópia de 2025)
11. Relatório do agente
12. CI de pedido de parecer
13. Parecer da Procuradoria
14. Adjudicação (Mesa)
15. Ratificação/homologação (Mesa)
16. Aviso (agente)
17. Publicação no Diário do Legislativo

**Variação:** no 033 o Relatório do agente vem **antes** do Despacho da Mesa. Nenhum dos dois processos tem termo de contrato (art. 95).

## Pregão eletrônico (PA 058/2026, PE 004/2026 — fls. 1 a 1060, em 8 volumes)

**Fase interna:**
1. DFD
2. ETP, com matriz de riscos
3. CI de vistoria ao Patrimônio
4. Pesquisa de preços (Banco de Preços)
5. CI à Contabilidade e dotação
6. TR
7. Despacho da Mesa
8. Portarias do agente e dos fiscais
9. Relatório do agente
10. Minuta do edital e anexos
11. CI de pedido de parecer
12. Parecer da fase interna

**Fase externa:**
1. Aviso e edital (jornal, Diário Oficial, PNCP)
2. Impugnação e decisão (republicação)
3. Sessão na BLL
4. Habilitação
5. Recurso, contrarrazões e decisão
6. Habilitação do próximo classificado
7. Parecer da fase externa
8. Adjudicação e homologação (Mesa)
9. Aviso de resultado
10. Contratos e extratos
11. Diário Oficial

## Termo aditivo (PA 085/2026 — 4º aditivo do contrato 051/2023)

1. Solicitação
2. CI ao fiscal e manifestação do fiscal
3. Pesquisa de vantajosidade
4. Dotação
5. Aceite e certidões da contratada
6. Histórico do contrato
7. Despacho da Mesa
8. Portaria do agente
9. Justificativa do agente e minuta
10. Parecer
11. Termo assinado
12. Extrato
13. Homologação (Mesa)
14. Diário Oficial

Aqui a homologação vem **depois** da assinatura; no pregão vem antes.

## Pagamentos (orçamentário, extraorçamentário e folha)

Nas folhas, as peças contábeis vêm **primeiro**: capa, nota de solicitação de despesa, parcela, liquidação, ordem de pagamento e comprovante. Os documentos de suporte vêm depois: nota fiscal, ordem de serviço ou de fornecimento, medição, relatório do fiscal e do gestor, certidões e contrato.

Na execução, a ordem é a inversa. Por isso o modelo de pagamento segue a **ordem de execução**:
1. Nota fiscal
2. Atesto do fiscal
3. Gestor
4. Certidões
5. Liquidação
6. Ordem de pagamento (Presidente + Secretário)
7. Comprovante

**Variações por natureza da despesa:**
- **Mão de obra dedicada:** checklist trabalhista do fiscal.
- **Serviço:** boletim de medição do Portal.
- **Compra:** OF + DANFE.
- **Diárias:** concessão e prestação de contas depois do pagamento.
- **Restituições:** deferido ou indeferido.
- **Tarifas e energia:** sem fiscal e sem certidões.
- **Extraorçamentário:** sem reserva e sem liquidação; inclui guia de recolhimento.
- **Folha:**
  - analítica e sintética são o mesmo processo;
  - grupos: normal, férias e rescisão.

## Etapas (nós) que faltam no catálogo

| Prioridade | Nó | Onde aparece |
|---|---|---|
| Alta | CI (comunicação interna pergunta → resposta) | todos os tipos |
| Alta | Habilitação / regularidade (certidões com validade) | inexigibilidade, pregão, aditivo, pagamento |
| Alta | Adjudicação e homologação/ratificação (Mesa, 2 assinaturas, por lote) | inexigibilidade, pregão, aditivo |
| Alta | Contrato / termo aditivo (assinaturas, extrato) | pregão, aditivo |
| Alta | Liquidação (retenções) · Ordem de pagamento · Pagamento/baixa | pagamentos |
| Média | Atesto do fiscal · Conferência de certidões no pagamento | pagamentos |
| Média | Aviso (inexigibilidade/dispensa) gerado com a publicação | inexigibilidade |
| Fase externa | Sessão de disputa (importar BLL) · Impugnação · Recurso | pregão |
| Outros | Prestação de contas de diária · Guia de recolhimento · Anuência do fornecedor | diárias, extraorçamentário, aditivo |

Enquanto essas etapas não existem, os modelos usam as genéricas **Documento**, **Tarefa** e **Aprovação**, com o nome da peça real.
