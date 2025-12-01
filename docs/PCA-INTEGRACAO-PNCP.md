# PCA - Plano de Contratações Anual

## O que é o PCA?

O **Plano de Contratações Anual (PCA)** é um documento obrigatório previsto no Art. 12 da Lei 14.133/2021 (Nova Lei de Licitações). Todo órgão público deve elaborar e publicar seu PCA no PNCP.

O PCA consolida todas as contratações que o órgão pretende realizar no exercício seguinte, permitindo:
- Planejamento orçamentário
- Transparência pública
- Racionalização de compras
- Ganhos de escala

---

## Configuração do Backend

### 1. Variáveis de Ambiente

Configure as seguintes variáveis no arquivo `.env` do backend:

```env
# === PNCP - Portal Nacional de Contratações Públicas ===

# URL da API (use treina para testes, pncp para produção)
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1

# Credenciais de acesso (obtidas no portal PNCP)
PNCP_LOGIN=seu_usuario@orgao.gov.br
PNCP_SENHA=sua_senha_segura

# CNPJ do órgão (apenas números)
PNCP_CNPJ_ORGAO=12345678000190
```

### 2. Ambientes PNCP

| Ambiente | URL | Uso |
|----------|-----|-----|
| **Treinamento** | `https://treina.pncp.gov.br/api/pncp/v1` | Testes e homologação |
| **Produção** | `https://pncp.gov.br/api/pncp/v1` | Dados reais |

⚠️ **IMPORTANTE**: Sempre teste no ambiente de treinamento antes de enviar para produção!

---

## Fluxo de Uso do PCA

### 1. Criar o PCA

```
POST /api/pca
{
  "orgao_id": "uuid-do-orgao",
  "ano_exercicio": 2025,
  "descricao": "Plano de Contratações Anual 2025"
}
```

### 2. Adicionar Itens ao PCA

```
POST /api/pca/:id/itens
{
  "descricao_objeto": "Aquisição de computadores",
  "categoria": "MATERIAL",
  "valor_estimado": 150000.00,
  "quantidade_estimada": 50,
  "unidade_medida": "UN",
  "unidade_requisitante": "Setor de TI",
  "data_prevista_inicio": "2025-03-01",
  "prioridade": 1,
  "renovacao_contrato": false
}
```

### 3. Aprovar o PCA

```
PATCH /api/pca/:id/aprovar
```

### 4. Publicar e Enviar ao PNCP

```
PATCH /api/pca/:id/publicar
```

Ao publicar, o sistema automaticamente envia o PCA ao PNCP.

---

## Categorias de Itens do PCA

| Categoria | Código PNCP | Descrição |
|-----------|-------------|-----------|
| `MATERIAL` | 1 | Materiais de consumo e permanente |
| `SERVICO` | 2 | Serviços em geral |
| `OBRA` | 3 | Obras de engenharia |
| `SERVICO_ENGENHARIA` | 4 | Serviços de engenharia |
| `SOLUCAO_TIC` | 5 | Soluções de TI e comunicação |
| `LOCACAO_IMOVEL` | 6 | Locação de imóveis |
| `ALIENACAO` | 7 | Alienação de bens |

---

## Status do PCA

| Status | Descrição |
|--------|-----------|
| `RASCUNHO` | Em elaboração, pode ser editado |
| `APROVADO` | Aprovado pela autoridade competente |
| `PUBLICADO` | Publicado e enviado ao PNCP |
| `REVISADO` | Sofreu alterações após publicação |

---

## Endpoints da API

### PCA

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/pca` | Criar novo PCA |
| `GET` | `/api/pca` | Listar PCAs do órgão |
| `GET` | `/api/pca/:id` | Obter PCA específico |
| `PUT` | `/api/pca/:id` | Atualizar PCA |
| `PATCH` | `/api/pca/:id/aprovar` | Aprovar PCA |
| `PATCH` | `/api/pca/:id/publicar` | Publicar e enviar ao PNCP |
| `POST` | `/api/pca/:id/duplicar` | Duplicar para próximo ano |
| `GET` | `/api/pca/:id/estatisticas` | Estatísticas do PCA |

### Itens do PCA

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/pca/:id/itens` | Adicionar item |
| `GET` | `/api/pca/:id/itens` | Listar itens |
| `PUT` | `/api/pca/itens/:itemId` | Atualizar item |
| `DELETE` | `/api/pca/itens/:itemId` | Remover item |

---

## Integração com PNCP

### Autenticação

O sistema usa autenticação OAuth2 com o PNCP:

1. Faz login com usuário/senha
2. Recebe token JWT
3. Usa token em todas as requisições
4. Renova automaticamente quando expira

### Envio do PCA

Quando você publica um PCA, o sistema:

1. Valida os dados obrigatórios
2. Mapeia os campos para o formato PNCP
3. Envia via POST para `/orgaos/{cnpj}/pca`
4. Registra o `numeroControlePNCP` retornado
5. Salva o status da sincronização

### Formato de Envio ao PNCP

```json
{
  "anoExercicio": 2025,
  "dataPublicacao": "2024-12-15",
  "itens": [
    {
      "numeroItem": 1,
      "categoriaItemPca": 1,
      "descricao": "Aquisição de computadores",
      "unidadeRequisitante": "Setor de TI",
      "valorEstimado": 150000.00,
      "quantidadeEstimada": 50,
      "unidadeMedida": "UN",
      "dataDesejada": "2025-03-01",
      "grauPrioridade": 1,
      "renovacaoContrato": false
    }
  ]
}
```

---

## Monitoramento de Sincronização

### Verificar Status

```
GET /api/pncp/sync?tipo=PCA&entidadeId={pcaId}
```

### Status Possíveis

| Status | Descrição |
|--------|-----------|
| `PENDENTE` | Aguardando envio |
| `ENVIANDO` | Em processo de envio |
| `ENVIADO` | Enviado com sucesso |
| `ERRO` | Falha no envio |
| `ATUALIZADO` | Atualização enviada |

### Reenviar em Caso de Erro

```
POST /api/pncp/reenviar/:syncId
```

---

## Página de Gestão (Frontend)

Acesse `/orgao/pca` para:

- ✅ Visualizar PCAs existentes
- ✅ Criar novo PCA
- ✅ Adicionar/editar itens
- ✅ Aprovar PCA
- ✅ Publicar e enviar ao PNCP
- ✅ Duplicar para próximo ano
- ✅ Ver estatísticas

---

## Obtenção de Credenciais PNCP

### Passo a Passo

1. **Acesse o Portal PNCP**: https://www.gov.br/pncp
2. **Cadastre o Órgão**: Se ainda não cadastrado
3. **Solicite Acesso à API**: No menu "Integrações"
4. **Aguarde Aprovação**: O PNCP valida o cadastro
5. **Receba as Credenciais**: Login e senha por email
6. **Configure no Sistema**: Adicione ao `.env`

### Requisitos para Cadastro

- CNPJ do órgão ativo
- Responsável legal designado
- Email institucional válido
- Certificado digital (para produção)

---

## Troubleshooting

### Erro: "Credenciais PNCP não configuradas"

**Causa**: Variáveis de ambiente não definidas.

**Solução**: Verifique o arquivo `.env`:
```env
PNCP_LOGIN=seu_usuario
PNCP_SENHA=sua_senha
PNCP_CNPJ_ORGAO=12345678000190
```

### Erro: "CNPJ do órgão não configurado"

**Causa**: `PNCP_CNPJ_ORGAO` não definido.

**Solução**: Adicione o CNPJ (apenas números) ao `.env`.

### Erro: "Token expirado"

**Causa**: Token JWT expirou.

**Solução**: O sistema renova automaticamente. Se persistir, verifique as credenciais.

### Erro: "PCA não foi enviado ao PNCP ainda"

**Causa**: Tentou enviar item antes do PCA.

**Solução**: Publique o PCA primeiro, depois adicione itens.

---

## Exemplo Completo

```typescript
// 1. Criar PCA
const pca = await fetch('/api/pca', {
  method: 'POST',
  body: JSON.stringify({
    orgao_id: 'uuid-orgao',
    ano_exercicio: 2025,
    descricao: 'PCA 2025'
  })
});

// 2. Adicionar itens
await fetch(`/api/pca/${pca.id}/itens`, {
  method: 'POST',
  body: JSON.stringify({
    descricao_objeto: 'Computadores',
    categoria: 'MATERIAL',
    valor_estimado: 150000,
    quantidade_estimada: 50
  })
});

// 3. Aprovar
await fetch(`/api/pca/${pca.id}/aprovar`, { method: 'PATCH' });

// 4. Publicar (envia ao PNCP)
await fetch(`/api/pca/${pca.id}/publicar`, { method: 'PATCH' });
```

---

## Referências

- [Lei 14.133/2021 - Art. 12](http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14133.htm)
- [Decreto 10.947/2022 - PCA](http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/D10947.htm)
- [Manual PNCP](https://www.gov.br/pncp/pt-br/acesso-a-informacao/manuais)
- [API PNCP - Swagger](https://pncp.gov.br/api/pncp/swagger-ui.html)
