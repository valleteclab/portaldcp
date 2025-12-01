# Plano de Integração PNCP - LicitaFácil

## 1. Visão Geral

O **Portal Nacional de Contratações Públicas (PNCP)** é o portal oficial para divulgação centralizada e obrigatória dos atos de contratação pública, conforme Lei 14.133/2021.

### 1.1 URLs da API

| Ambiente | URL Base |
|----------|----------|
| **Produção** | `https://pncp.gov.br/api/pncp/v1` |
| **Treinamento** | `https://treina.pncp.gov.br/api/pncp/v1` |

### 1.2 Documentação Oficial
- **Swagger UI**: https://pncp.gov.br/api/pncp/swagger-ui/index.html
- **Manual de Integração**: https://www.gov.br/pncp/pt-br/pncp/integre-se-ao-pncp

---

## 2. Autenticação

### 2.1 Obtenção do Token JWT

```
POST /usuarios/login
Content-Type: application/json

{
  "login": "usuario@orgao.gov.br",
  "senha": "senha123"
}
```

**Resposta**: Token JWT no header `Authorization: Bearer <token>`

### 2.2 Configuração no Sistema

O token deve ser armazenado de forma segura e renovado antes da expiração.

---

## 3. Módulos de Integração

### 3.1 Plano de Contratações Anual (PCA)

O PCA deve ser enviado antes de qualquer contratação.

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/pca` | Inserir PCA |
| PUT | `/orgaos/{cnpj}/pca/{ano}/{sequencial}` | Atualizar PCA |
| GET | `/orgaos/{cnpj}/pca/{ano}/{sequencial}` | Consultar PCA |
| DELETE | `/orgaos/{cnpj}/pca/{ano}/{sequencial}` | Excluir PCA |

#### Payload PCA:
```json
{
  "anoExercicio": 2024,
  "categoriaItemPca": 1,
  "codigoClassificacaoSuperior": "string",
  "codigoItemCatalogo": "string",
  "dataDesejada": "2024-06-01",
  "dataInclusao": "2024-01-15",
  "descricao": "Aquisição de materiais de escritório",
  "justificativa": "Necessidade de reposição de estoque",
  "orcamentoExercicio": 50000.00,
  "quantidadeEstimada": 100,
  "unidadeMedida": "UN",
  "unidadeRequisitante": "Setor Administrativo",
  "valorEstimadoTotal": 50000.00,
  "valorEstimadoUnitario": 500.00
}
```

---

### 3.2 Contratação/Compra (Licitação)

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/compras` | Inserir contratação |
| PUT | `/orgaos/{cnpj}/compras/{ano}/{sequencial}` | Atualizar contratação |
| GET | `/orgaos/{cnpj}/compras/{ano}/{sequencial}` | Consultar contratação |
| DELETE | `/orgaos/{cnpj}/compras/{ano}/{sequencial}` | Excluir contratação |

#### Payload Contratação:
```json
{
  "anoCompra": 2024,
  "codigoModalidadeContratacao": 6,
  "codigoModoDisputa": 1,
  "codigoSituacaoCompra": 1,
  "codigoTipoInstrumentoConvocatorio": 1,
  "dataAberturaProposta": "2024-03-01T09:00:00",
  "dataEncerramentoProposta": "2024-03-15T18:00:00",
  "dataInclusao": "2024-02-01",
  "dataPublicacaoPncp": "2024-02-01",
  "informacaoComplementar": "Pregão Eletrônico para aquisição de materiais",
  "linkSistemaOrigem": "https://licitafacil.com.br/licitacao/123",
  "modoDisputaDescricao": "Aberto",
  "modalidadeNome": "Pregão Eletrônico",
  "nomeResponsavel": "João da Silva",
  "numeroCompra": "001/2024",
  "numeroControlePNCP": "",
  "numeroProcesso": "2024.001.0001",
  "objetoCompra": "Aquisição de materiais de escritório",
  "orgaoEntidade": {
    "cnpj": "12345678000199",
    "razaoSocial": "Prefeitura Municipal de Exemplo"
  },
  "srp": false,
  "unidadeOrgao": {
    "codigoUnidade": "001",
    "nomeUnidade": "Secretaria de Administração"
  },
  "valorTotalEstimado": 50000.00
}
```

---

### 3.3 Itens da Contratação

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens` | Inserir itens |
| PUT | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}` | Atualizar item |
| GET | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens` | Listar itens |
| DELETE | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}` | Excluir item |

#### Payload Item:
```json
{
  "numeroItem": 1,
  "materialOuServico": "M",
  "tipoBeneficioId": 1,
  "incentivoProdutivoBasico": false,
  "descricao": "Papel A4 500 folhas",
  "quantidade": 100,
  "unidadeMedida": "RESMA",
  "valorUnitarioEstimado": 25.00,
  "valorTotal": 2500.00,
  "situacaoCompraItemId": 1,
  "criterioJulgamentoId": 1,
  "codigoItemCatalogo": "12345678",
  "itemCategoriaId": 1,
  "patrimonio": false
}
```

---

### 3.4 Documentos/Arquivos

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` | Upload de documento |
| GET | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` | Listar documentos |
| DELETE | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos/{sequencialArquivo}` | Excluir documento |

#### Tipos de Documentos:
| Código | Descrição |
|--------|-----------|
| 1 | Edital |
| 2 | Termo de Referência |
| 3 | Estudo Técnico Preliminar |
| 4 | Minuta do Contrato |
| 5 | Ata de Registro de Preços |
| 6 | Outros |

---

### 3.5 Resultado da Contratação

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados` | Inserir resultado |
| PUT | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados/{sequencialResultado}` | Atualizar resultado |

#### Payload Resultado:
```json
{
  "dataResultado": "2024-03-20",
  "niFornecedor": "98765432000188",
  "nomeRazaoSocialFornecedor": "Fornecedor Vencedor LTDA",
  "numeroControlePNCPCompra": "12345678000199-1-000001/2024",
  "quantidadeHomologada": 100,
  "valorTotalHomologado": 2300.00,
  "valorUnitarioHomologado": 23.00,
  "percentualDesconto": 8.00,
  "indicadorSubcontratacao": false,
  "tipoPessoa": "PJ",
  "porteFornecedor": "ME"
}
```

---

### 3.6 Ata de Registro de Preços

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/atas` | Inserir ata |
| PUT | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/atas/{sequencialAta}` | Atualizar ata |
| GET | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/atas` | Listar atas |

#### Payload Ata:
```json
{
  "numeroAtaRegistroPreco": "001/2024",
  "dataAssinatura": "2024-03-25",
  "dataVigenciaInicio": "2024-03-25",
  "dataVigenciaFim": "2025-03-24",
  "niFornecedor": "98765432000188",
  "nomeRazaoSocialFornecedor": "Fornecedor Vencedor LTDA",
  "situacaoAtaId": 1,
  "valorTotalAta": 50000.00
}
```

---

### 3.7 Contratos

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/contratos` | Inserir contrato |
| PUT | `/orgaos/{cnpj}/contratos/{ano}/{sequencial}` | Atualizar contrato |
| GET | `/orgaos/{cnpj}/contratos/{ano}/{sequencial}` | Consultar contrato |

#### Payload Contrato:
```json
{
  "anoContrato": 2024,
  "numeroContratoEmpenho": "001/2024",
  "tipoContratoId": 1,
  "objetoContrato": "Fornecimento de materiais de escritório",
  "niFornecedor": "98765432000188",
  "nomeRazaoSocialFornecedor": "Fornecedor Vencedor LTDA",
  "dataAssinatura": "2024-04-01",
  "dataVigenciaInicio": "2024-04-01",
  "dataVigenciaFim": "2025-03-31",
  "valorInicial": 50000.00,
  "valorGlobal": 50000.00,
  "numeroControlePNCPCompra": "12345678000199-1-000001/2024",
  "categoriaProcessoId": 1,
  "urlCipi": ""
}
```

---

### 3.8 Termos Aditivos/Apostilamentos

#### Endpoints:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/orgaos/{cnpj}/contratos/{ano}/{sequencial}/termos` | Inserir termo |
| PUT | `/orgaos/{cnpj}/contratos/{ano}/{sequencial}/termos/{sequencialTermo}` | Atualizar termo |

---

## 4. Códigos de Domínio

### 4.1 Modalidades de Contratação
| Código | Descrição |
|--------|-----------|
| 1 | Leilão - Eletrônico |
| 2 | Diálogo Competitivo |
| 3 | Concurso |
| 4 | Concorrência - Eletrônica |
| 5 | Concorrência - Presencial |
| 6 | Pregão - Eletrônico |
| 7 | Pregão - Presencial |
| 8 | Dispensa de Licitação |
| 9 | Inexigibilidade |
| 10 | Leilão - Presencial |
| 12 | Credenciamento |
| 13 | Pré-qualificação |
| 14 | Manifestação de Interesse |

### 4.2 Situação da Compra
| Código | Descrição |
|--------|-----------|
| 1 | Divulgada no PNCP |
| 2 | Revogada |
| 3 | Anulada |
| 4 | Suspensa |
| 5 | Deserta |
| 6 | Fracassada |

### 4.3 Modo de Disputa
| Código | Descrição |
|--------|-----------|
| 1 | Aberto |
| 2 | Fechado |
| 3 | Aberto-Fechado |
| 4 | Fechado-Aberto |
| 5 | Não se aplica |

### 4.4 Amparo Legal (Lei 14.133/2021)
| Código | Artigo |
|--------|--------|
| 1 | Art. 28, I (Pregão) |
| 2 | Art. 28, II (Concorrência) |
| 3 | Art. 28, III (Concurso) |
| 4 | Art. 28, IV (Leilão) |
| 5 | Art. 28, V (Diálogo Competitivo) |
| 6 | Art. 74 (Inexigibilidade) |
| 7 | Art. 75 (Dispensa) |

---

## 5. Fluxo de Integração

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE INTEGRAÇÃO PNCP                     │
└─────────────────────────────────────────────────────────────────┘

1. PLANEJAMENTO
   ├── Cadastrar PCA (Plano de Contratações Anual)
   └── Obter número de controle PNCP do PCA

2. PUBLICAÇÃO DA LICITAÇÃO
   ├── Enviar dados da Contratação/Compra
   ├── Enviar Itens da Contratação
   ├── Upload do Edital (PDF)
   ├── Upload do Termo de Referência
   └── Obter número de controle PNCP da Compra

3. FASE EXTERNA
   ├── Atualizar situação da compra (se necessário)
   ├── Enviar retificações do edital
   └── Atualizar datas de abertura/encerramento

4. RESULTADO
   ├── Enviar resultado por item
   ├── Informar fornecedor vencedor
   ├── Valores homologados
   └── Atualizar situação para "Homologada"

5. ATA DE REGISTRO DE PREÇOS (se SRP)
   ├── Cadastrar Ata
   ├── Vincular itens à Ata
   └── Upload do documento da Ata

6. CONTRATO
   ├── Cadastrar Contrato
   ├── Vincular à Compra/Ata
   ├── Upload do documento do Contrato
   └── Termos aditivos (quando houver)

7. EXECUÇÃO
   ├── Atualizar situação do contrato
   ├── Registrar apostilamentos
   └── Registrar encerramento
```

---

## 6. Implementação no Backend

### 6.1 Estrutura de Módulos

```
backend/src/pncp/
├── pncp.module.ts
├── pncp.service.ts
├── pncp.controller.ts
├── dto/
│   ├── pca.dto.ts
│   ├── compra.dto.ts
│   ├── item.dto.ts
│   ├── resultado.dto.ts
│   ├── ata.dto.ts
│   └── contrato.dto.ts
├── entities/
│   └── pncp-sync.entity.ts
└── interfaces/
    └── pncp-response.interface.ts
```

### 6.2 Entidade de Sincronização

```typescript
@Entity('pncp_sync')
export class PncpSync {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tipo: 'PCA' | 'COMPRA' | 'ITEM' | 'RESULTADO' | 'ATA' | 'CONTRATO';

  @Column()
  entidade_id: string; // ID local da entidade

  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column()
  status: 'PENDENTE' | 'ENVIADO' | 'ERRO' | 'ATUALIZADO';

  @Column({ type: 'text', nullable: true })
  erro_mensagem: string;

  @Column({ type: 'jsonb', nullable: true })
  payload_enviado: any;

  @Column({ type: 'jsonb', nullable: true })
  resposta_pncp: any;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### 6.3 Configuração de Ambiente

```env
# .env
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=usuario@orgao.gov.br
PNCP_SENHA=senha123
PNCP_CNPJ_ORGAO=12345678000199
```

---

## 7. Mapeamento de Entidades

### 7.1 Licitação → Compra PNCP

| Campo LicitaFácil | Campo PNCP |
|-------------------|------------|
| `numero_processo` | `numeroProcesso` |
| `objeto` | `objetoCompra` |
| `modalidade` | `codigoModalidadeContratacao` |
| `valor_total_estimado` | `valorTotalEstimado` |
| `data_abertura_sessao` | `dataAberturaProposta` |
| `fase` | `codigoSituacaoCompra` |

### 7.2 Item → Item PNCP

| Campo LicitaFácil | Campo PNCP |
|-------------------|------------|
| `numero` | `numeroItem` |
| `descricao` | `descricao` |
| `quantidade` | `quantidade` |
| `unidade_medida` | `unidadeMedida` |
| `valor_unitario_estimado` | `valorUnitarioEstimado` |
| `valor_total` | `valorTotal` |

---

## 8. Tratamento de Erros

### 8.1 Códigos de Erro Comuns

| Código HTTP | Descrição | Ação |
|-------------|-----------|------|
| 400 | Dados inválidos | Verificar payload |
| 401 | Token expirado | Renovar token |
| 403 | Sem permissão | Verificar credenciais |
| 404 | Recurso não encontrado | Verificar IDs |
| 409 | Conflito (duplicado) | Verificar se já existe |
| 422 | Erro de validação | Verificar campos obrigatórios |
| 500 | Erro interno PNCP | Tentar novamente |

### 8.2 Retry Strategy

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 segundos

async function enviarComRetry(payload: any, tentativa = 1): Promise<any> {
  try {
    return await enviarParaPNCP(payload);
  } catch (error) {
    if (tentativa < MAX_RETRIES && error.status >= 500) {
      await delay(RETRY_DELAY * tentativa);
      return enviarComRetry(payload, tentativa + 1);
    }
    throw error;
  }
}
```

---

## 9. Checklist de Implementação

### Fase 1: Infraestrutura
- [ ] Criar módulo PNCP no backend
- [ ] Configurar variáveis de ambiente
- [ ] Implementar serviço de autenticação
- [ ] Criar entidade de sincronização
- [ ] Implementar fila de envio (Bull/Redis)

### Fase 2: PCA
- [ ] Criar DTO do PCA
- [ ] Implementar envio do PCA
- [ ] Implementar atualização do PCA
- [ ] Criar tela de gestão do PCA no frontend

### Fase 3: Contratação/Compra
- [ ] Mapear campos Licitação → Compra
- [ ] Implementar envio automático ao publicar
- [ ] Implementar envio de itens
- [ ] Implementar upload de documentos

### Fase 4: Resultado
- [ ] Implementar envio de resultado por item
- [ ] Vincular fornecedor vencedor
- [ ] Atualizar situação da compra

### Fase 5: Ata e Contrato
- [ ] Implementar cadastro de Ata
- [ ] Implementar cadastro de Contrato
- [ ] Implementar termos aditivos

### Fase 6: Monitoramento
- [ ] Dashboard de sincronização
- [ ] Alertas de erro
- [ ] Logs detalhados
- [ ] Relatórios de envio

---

## 10. Considerações Importantes

### 10.1 Prazos Legais
- **Publicação**: Deve ocorrer antes da abertura das propostas
- **Resultado**: Até 2 dias úteis após homologação
- **Contrato**: Até 10 dias úteis após assinatura

### 10.2 Validações Obrigatórias
- CNPJ do órgão deve estar cadastrado no PNCP
- Usuário deve ter permissão de integração
- Documentos devem estar em formato PDF
- Tamanho máximo de arquivo: 50MB

### 10.3 Ambiente de Treinamento
Sempre testar primeiro no ambiente de treinamento antes de enviar para produção.

---

## 11. Referências

- [Portal PNCP](https://pncp.gov.br)
- [Swagger API PNCP](https://pncp.gov.br/api/pncp/swagger-ui/index.html)
- [Lei 14.133/2021](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm)
- [Decreto 10.024/2019](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/decreto/d10024.htm)
