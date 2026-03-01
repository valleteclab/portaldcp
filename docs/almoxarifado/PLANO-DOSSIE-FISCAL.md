# Plano: Dossiê de Documentos para o Fiscal

## Objetivo

O fiscal do contrato deve receber, ao final do fluxo de recebimento, todos os documentos necessários para comprovar a execução e entregar ao financeiro:

1. **Ordem de Fornecimento** autorizada (PDF assinado digitalmente)
2. **Nota Fiscal** vinculada à ordem
3. **Comprovação de Aceite do Recebimento** (novo documento assinado digitalmente — quem fez o aceite)
4. **Anexos adicionais** (documentos que eventualmente faltaram)

O fiscal imprime tudo e entrega ao financeiro.

---

## Contexto Atual

| Componente | Estado |
|------------|--------|
| OF PDF assinado | ✅ Já existe (`ordem.caminho_pdf`, assinatura digital) |
| NF vinculada | ✅ Existe (`nota_fiscal_fornecedor`, XML/PDF) |
| Aceite almoxarifado/patrimônio | ✅ Existe (dados em `recebimento`) |
| Documento de comprovação de aceite | ❌ Não existe — precisa ser criado |
| Entrega ao fiscal | ❌ Não existe — precisa ser criado |

**Fiscal**: vinculado ao contrato (`contrato.fiscal_id`, `contrato.fiscal_nome`). A ordem pertence a um contrato, então o fiscal é identificável.

---

## Fluxo Proposto

```
Requisição → Aprovada → OF gerada → Recebimento (NF → Mapeamento → Aceite)
                                                      ↓
                                    [ACEITE CONCLUÍDO = todos os grupos aceitos]
                                                      ↓
                                    1. Gera PDF "Comprovação de Aceite" (assinado)
                                    2. Cria/atualiza Dossiê da Ordem
                                    3. Notifica fiscal (se houver)
                                                      ↓
                                    Fiscal acessa "Dossiê" → Baixa OF + NF + Comprovação
                                    → Anexa docs faltantes (opcional)
                                    → Imprime e entrega ao financeiro
```

---

## 1. Novo Documento: Comprovação de Aceite do Recebimento

**Quando**: Ao concluir o aceite (almoxarifado e/ou patrimônio, conforme o caso).

**Conteúdo do PDF**:
- Cabeçalho: logo órgão, título "COMPROVAÇÃO DE ACEITE DO RECEBIMENTO"
- Dados do recebimento: número, data, ordem, fornecedor
- Itens aceitos: descrição, quantidade, valor, tipo (CONSUMO/PERMANENTE)
- Quem aceitou: almoxarifado (nome, data) e/ou patrimônio (nome, data)
- Quadro de assinaturas digitais (quem fez o aceite)
- Código de validação

**Assinatura digital**: Registrar assinatura do(s) usuário(s) que fez(eram) o aceite. Se almoxarifado e patrimônio aceitaram em momentos diferentes, pode haver duas assinaturas ou uma assinatura consolidada no momento da geração.

**EntidadeTipo**: Adicionar `COMPROVACAO_ACEITE_RECEBIMENTO` ao enum.

---

## 2. Opções de Arquitetura

### Opção A: Novo Módulo "Dossiê do Fiscal" (recomendada)

**Rota**: `/orgao/fiscal/dossie` ou `/orgao/contratos/[id]/dossie`

**Funcionalidades**:
- Lista de ordens com recebimento aceito (filtradas por contratos do fiscal)
- Para cada ordem: cards com documentos disponíveis
  - OF (PDF) — download
  - NF (XML/PDF) — download
  - Comprovação de Aceite — download
  - Anexos adicionais — upload + download
- Botão "Baixar Dossiê Completo" (ZIP com todos os PDFs)
- Botão "Marcar como entregue ao financeiro" (opcional, para controle)

**Vantagens**: Fluxo dedicado, claro, fácil de encontrar. Fiscal sabe exatamente onde ir.

### Opção B: Reaproveitar Notificações + Página de Detalhe

- Notificação ao fiscal quando aceite é concluído: "Dossiê da ordem X disponível"
- Link leva para `/orgao/almoxarifado/recebimentos/[ordemId]` ou nova rota `/orgao/almoxarifado/ordens/[id]/dossie`
- Na página de recebimento/detalhe da ordem, adicionar seção "Documentos para o Fiscal"

**Vantagens**: Reaproveita notificações existentes. Menos módulo novo.

### Opção C: Caixa de Entrada do Fiscal (estilo email)

- Similar à caixa de entrada de emails do órgão
- Cada "mensagem" = um dossiê de ordem disponível
- Ao abrir: lista de documentos para download + anexos

**Vantagens**: Conceito familiar (inbox). Desvantagem: mais complexo de implementar.

---

## 3. Recomendação: Opção A + Elementos da B

1. **Novo módulo** "Dossiê do Fiscal" em `/orgao/fiscal/dossie`
2. **Visível** apenas para usuários com `eh_fiscal_contrato` ou que sejam `fiscal_id` de algum contrato
3. **Notificação** quando aceite é concluído: "Dossiê da ordem OF-XXX disponível"
4. **Página** lista ordens (do contrato do fiscal) com recebimento ACEITO
5. **Por ordem**: download individual ou "Baixar tudo" (ZIP)
6. **Anexos**: upload de documentos adicionais por ordem

---

## 4. Modelo de Dados

### Nova entidade: `DossieOrdem` (opcional)

Se quisermos rastrear anexos e status "entregue ao financeiro":

```typescript
// dossie-ordem.entity.ts
@Entity('dossies_ordem')
export class DossieOrdem {
  id: string;
  ordem_fornecimento_id: string;
  contrato_id: string;
  fiscal_id: string | null;  // fiscal do contrato
  comprovacao_aceite_path: string | null;  // caminho do PDF gerado
  comprovacao_aceite_codigo_validacao: string | null;
  data_gerado: Date;
  entregue_financeiro_em: Date | null;
  entregue_financeiro_por: string | null;
}
```

### Anexos

```typescript
// dossie-anexo.entity.ts
@Entity('dossies_anexo')
export class DossieAnexo {
  id: string;
  dossie_ordem_id: string;
  nome_arquivo: string;
  caminho: string;
  tipo_mime: string;
  usuario_upload_id: string;
  usuario_upload_nome: string;
  created_at: Date;
}
```

**Alternativa mais simples**: usar tabela genérica de anexos por `ordem_fornecimento_id` e `tipo: 'DOSSIE_FISCAL'`, sem nova entidade `DossieOrdem` — o dossiê é "virtual", montado na hora a partir dos documentos existentes (OF, NF, Comprovação) + anexos.

---

## 5. Fases de Implementação

### Fase 1: Documento de Comprovação de Aceite
- [ ] `EntidadeTipo.COMPROVACAO_ACEITE_RECEBIMENTO`
- [ ] `GeradorPdfService.gerarPdfComprovacaoAceite(recebimento, assinaturas)`
- [ ] Ao concluir aceite (almoxarifado + patrimônio quando aplicável): gerar PDF, registrar assinatura
- [ ] Campo `recebimento.comprovacao_aceite_path` e `codigo_validacao`
- [ ] Endpoint `GET /recebimentos/:id/comprovacao-aceite` (download PDF)

### Fase 2: Página Dossiê do Fiscal
- [ ] Rota `/orgao/fiscal/dossie` (ou dentro de almoxarifado)
- [ ] API `GET /api/almoxarifado/ordens/dossie-fiscal` — ordens com recebimento ACEITO dos contratos do fiscal
- [ ] Para cada ordem: OF PDF, NF, Comprovação — links de download
- [ ] Guard/módulo: visível para fiscais

### Fase 3: Anexos e ZIP
- [ ] Upload de anexos por ordem
- [ ] Endpoint `POST /ordens/:id/dossie/anexos`
- [ ] Endpoint `GET /ordens/:id/dossie/zip` — gera ZIP com OF + NF + Comprovação + anexos

### Fase 4: Notificação e Controle
- [ ] Notificar fiscal quando dossiê fica disponível
- [ ] (Opcional) Marcar "entregue ao financeiro"

---

## 6. Detalhes Técnicos

### Geração do PDF de Comprovação

- **Trigger**: `recebimentoService.aceitarAlmoxarifado` e `aceitarPatrimonio` — ao final, quando `calcularStatus() === ACEITO`, chamar `gerarComprovacaoAceite(recebimentoId)`.
- **Assinatura**: O usuário que fez o último aceite (ou ambos, se almox e patrimônio) — registrar via `AssinaturasService.registrarAssinatura`.
- **Layout**: Similar ao OF/OS — cabeçalho órgão, tabela de itens, quadro de assinaturas.

### Permissões

- Fiscal: usuário com `eh_fiscal_contrato` OU `usuario.id` em `contrato.fiscal_id` para algum contrato.
- A rota do dossiê pode exigir `@RequireModule(ALMOXARIFADO)` + verificação de fiscal.

---

## 7. Resumo

| Item | Ação |
|------|------|
| Comprovação de Aceite | Novo PDF assinado ao concluir aceite |
| Dossiê | Nova página "Dossiê do Fiscal" com ordens aceitas |
| Documentos | OF + NF + Comprovação + anexos |
| Entrega | Fiscal baixa (individual ou ZIP), imprime, entrega ao financeiro |
| Anexos | Upload de documentos faltantes por ordem |
