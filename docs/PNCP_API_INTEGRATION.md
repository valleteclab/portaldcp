# Documentação de Integração PNCP - LicitaFácil

## Índice
1. [Visão Geral](#visão-geral)
2. [Configuração](#configuração)
3. [Endpoints Disponíveis](#endpoints-disponíveis)
4. [PCA - Plano de Contratação Anual](#pca---plano-de-contratação-anual)
5. [Compras/Editais](#compraseditais)
6. [Resultado de Itens](#resultado-de-itens)
7. [Ata de Registro de Preço](#ata-de-registro-de-preço)
8. [Contratos](#contratos)
9. [Tabelas de Domínio](#tabelas-de-domínio)
10. [Exemplos de Uso no Frontend](#exemplos-de-uso-no-frontend)

---

## Visão Geral

A integração com o Portal Nacional de Contratações Públicas (PNCP) permite:
- Publicar e gerenciar Planos de Contratação Anual (PCA)
- Publicar e gerenciar Compras/Editais
- Registrar resultados de itens homologados
- Gerenciar Atas de Registro de Preço
- Gerenciar Contratos

**Ambiente de Treinamento**: https://treina.pncp.gov.br
**Ambiente de Produção**: https://pncp.gov.br

---

## Configuração

### Variáveis de Ambiente (.env)
```env
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=seu_login
PNCP_SENHA=sua_senha
PNCP_CNPJ_ORGAO=64435842000159
```

---

## Endpoints Disponíveis

### Base URL: `/api/pncp`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| **PCA** |
| POST | `/pca` | Incluir PCA |
| PUT | `/pca/:ano/:sequencial` | Retificar PCA |
| DELETE | `/pca/:ano/:sequencial` | Excluir PCA |
| GET | `/pca/:ano/:sequencial` | Consultar PCA |
| POST | `/pca/:ano/:sequencial/itens` | Incluir Item do PCA |
| PUT | `/pca/:ano/:sequencial/itens/:numeroItem` | Retificar Item do PCA |
| DELETE | `/pca/:ano/:sequencial/itens/:numeroItem` | Excluir Item do PCA |
| **COMPRAS** |
| POST | `/compras` | Incluir Compra/Edital |
| PUT | `/compras/:ano/:sequencial` | Retificar Compra |
| DELETE | `/compras/:ano/:sequencial` | Excluir Compra |
| GET | `/compras/:ano/:sequencial` | Consultar Compra |
| **RESULTADO DE ITENS** |
| POST | `/compras/:ano/:seq/itens/:item/resultado` | Incluir Resultado |
| PUT | `/compras/:ano/:seq/itens/:item/resultado` | Retificar Resultado |
| **ATA DE REGISTRO DE PREÇO** |
| POST | `/compras/:ano/:seq/atas` | Incluir Ata |
| PUT | `/compras/:ano/:seq/atas/:seqAta` | Retificar Ata |
| DELETE | `/compras/:ano/:seq/atas/:seqAta` | Excluir Ata |
| **CONTRATOS** |
| POST | `/contratos` | Incluir Contrato |
| PUT | `/contratos/:ano/:sequencial` | Retificar Contrato |
| DELETE | `/contratos/:ano/:sequencial` | Excluir Contrato |
| GET | `/contratos/:ano/:sequencial` | Consultar Contrato |

---

## PCA - Plano de Contratação Anual

### Incluir PCA
```typescript
// POST /api/pncp/pca
const pca = {
  ano_pca: 2025,
  itens: [
    {
      numero_item: 1,
      categoria_item_pca: 1,           // 1=Bens, 2=Serviços, 3=Obras
      descricao: "Aquisição de notebooks",
      unidade_fornecimento: "Unidade",
      quantidade: 50,
      valor_unitario: 5000,
      valor_total: 250000,
      valor_orcamento_exercicio: 250000,
      unidade_requisitante: "Departamento de TI",
      data_desejada: "2025-06-01",
      classificacao_catalogo_id: 1,    // 1=CATMAT, 2=Outros
      codigo_classe: "26212",          // Código CATMAT/OUTROS
      descricao_classe: "Equipamentos de processamento de dados"
    }
  ]
};
```

### Retificar Item do PCA
```typescript
// PUT /api/pncp/pca/:ano/:sequencial/itens/:numeroItem
const itemRetificado = {
  descricao: "Aquisição de notebooks Dell",
  quantidade: 60,
  valor_unitario: 4800,
  valor_total: 288000
};
```

### Excluir PCA
```typescript
// DELETE /api/pncp/pca/:ano/:sequencial
const body = {
  justificativa: "Motivo da exclusão do PCA"
};
```

---

## Compras/Editais

### Incluir Compra
```typescript
// POST /api/pncp/compras
const compra = {
  codigo_unidade: "1",                    // Código da unidade compradora
  ano_compra: 2025,
  numero_processo: "001/2025",
  objeto: "Aquisição de equipamentos de informática",
  modalidade_id: 6,                       // 6=Pregão Eletrônico
  modo_disputa_id: 1,                     // 1=Aberto
  tipo_instrumento_id: 1,                 // 1=Edital
  amparo_legal_id: 1,                     // Lei 14.133/2021
  srp: false,                             // Sistema de Registro de Preços
  data_abertura_proposta: "2025-01-20T09:00:00",
  data_encerramento_proposta: "2025-01-25T18:00:00",
  informacao_complementar: "Informações adicionais",
  titulo_documento: "Edital de Pregão 001/2025",
  itens: [
    {
      numero_item: 1,
      descricao: "Notebook Dell Inspiron 15",
      tipo: "MATERIAL",                   // MATERIAL ou SERVICO
      quantidade: 10,
      unidade_medida: "Unidade",
      valor_unitario: 5000,
      valor_total: 50000
    }
  ]
};
```

### Campos Obrigatórios por Item (gerados automaticamente)
- `aplicabilidadeMargemPreferenciaNormal`: boolean
- `aplicabilidadeMargemPreferenciaAdicional`: boolean
- `orcamentoSigiloso`: boolean
- `itemCategoriaId`: 3 (Não se aplica)
- `criterioJulgamentoId`: 1 (Menor Preço)
- `tipoBeneficioId`: 1
- `incentivoProdutivoBasico`: boolean

### Retificar Compra
```typescript
// PUT /api/pncp/compras/:ano/:sequencial
const compraRetificada = {
  objeto: "Objeto retificado",
  informacao_complementar: "Nova informação"
};
```

### Excluir Compra
```typescript
// DELETE /api/pncp/compras/:ano/:sequencial
const body = {
  justificativa: "Motivo da exclusão"
};
```

---

## Resultado de Itens

### Incluir Resultado
```typescript
// POST /api/pncp/compras/:ano/:seq/itens/:item/resultado
const resultado = {
  data_resultado: "2025-01-26",
  cnpj_fornecedor: "33014556000196",      // CNPJ válido
  nome_fornecedor: "Empresa Vencedora LTDA",
  quantidade_homologada: 10,
  valor_unitario_homologado: 4800,
  valor_total_homologado: 48000,
  percentual_desconto: 4                   // Opcional
};
```

### Campos Gerados Automaticamente
- `tipoPessoaId`: "PJ", "PF" ou "PE" (detectado pelo CNPJ/CPF)
- `codigoPais`: "BRA" (ISO Alpha-3)
- `porteFornecedorId`: 3 (Demais)
- `aplicacaoMargemPreferencia`: false
- `aplicacaoBeneficioMeEpp`: false
- `aplicacaoCriterioDesempate`: false

### Retificar Resultado
```typescript
// PUT /api/pncp/compras/:ano/:seq/itens/:item/resultado
const resultadoRetificado = {
  cnpj_fornecedor: "33014556000196",
  nome_fornecedor: "Empresa Vencedora LTDA - Retificado",
  quantidade_homologada: 10,
  valor_unitario_homologado: 4500,
  valor_total_homologado: 45000,
  percentual_desconto: 10,
  situacao_id: 1,                          // Obrigatório para retificação
  data_resultado: "2025-01-27"
};
```

---

## Ata de Registro de Preço

### Incluir Ata
```typescript
// POST /api/pncp/compras/:ano/:seq/atas
const ata = {
  numero_ata: "001/2025",
  ano_ata: 2025,
  data_assinatura: "2025-02-15",
  data_vigencia_inicio: "2025-02-15",
  data_vigencia_fim: "2026-02-14",
  cnpj_fornecedor: "33014556000196",
  nome_fornecedor: "Empresa Fornecedora LTDA",
  itens: [
    {
      numero_item: 1,
      quantidade: 100,
      valor_unitario: 24,
      valor_total: 2400
    }
  ]
};
```

### Retificar Ata
```typescript
// PUT /api/pncp/compras/:ano/:seq/atas/:seqAta
const ataRetificada = {
  numero_ata: "001/2025",
  ano_ata: 2025,
  data_assinatura: "2025-02-15",
  data_vigencia_inicio: "2025-02-15",
  data_vigencia_fim: "2026-06-14",         // Nova data
  justificativa: "Prorrogação de vigência" // Obrigatório
};
```

### Excluir Ata
```typescript
// DELETE /api/pncp/compras/:ano/:seq/atas/:seqAta
const body = {
  justificativa: "Motivo da exclusão"
};
```

---

## Contratos

### Incluir Contrato
```typescript
// POST /api/pncp/contratos
const contrato = {
  ano_compra: 2025,
  sequencial_compra: 1,
  tipo_contrato_id: 1,
  numero_contrato: "001/2025",
  ano_contrato: 2025,
  objeto: "Fornecimento de equipamentos",
  cnpj_fornecedor: "33014556000196",
  nome_fornecedor: "Empresa Contratada LTDA",
  valor_inicial: 50000,
  data_assinatura: "2025-02-01",
  data_vigencia_inicio: "2025-02-01",
  data_vigencia_fim: "2026-01-31"
};
```

---

## Tabelas de Domínio

### Modalidade de Contratação
| ID | Descrição |
|----|-----------|
| 1 | Leilão - Eletrônico |
| 2 | Diálogo Competitivo |
| 3 | Concurso |
| 4 | Concorrência - Eletrônica |
| 5 | Concorrência - Presencial |
| 6 | Pregão - Eletrônico |
| 7 | Pregão - Presencial |
| 8 | Dispensa de Licitação |
| 9 | Inexigibilidade |
| 12 | Leilão - Presencial |
| 13 | Pré-qualificação |

### Tipo de Instrumento Convocatório
| ID | Descrição |
|----|-----------|
| 1 | Edital |
| 2 | Aviso de Contratação Direta |
| 3 | Ato que autoriza a contratação direta |

### Modo de Disputa
| ID | Descrição |
|----|-----------|
| 1 | Aberto |
| 2 | Fechado |
| 3 | Aberto-Fechado |
| 4 | Fechado-Aberto |
| 5 | Não se aplica |

### Tipo de Pessoa
| ID | Descrição |
|----|-----------|
| PF | Pessoa Física |
| PJ | Pessoa Jurídica |
| PE | Pessoa Estrangeira |

### Porte do Fornecedor
| ID | Descrição |
|----|-----------|
| 1 | ME (Microempresa) |
| 2 | EPP (Empresa de Pequeno Porte) |
| 3 | Demais |
| 4 | Não se aplica |
| 5 | Não Informado |

### Categoria do Item PCA
| ID | Descrição |
|----|-----------|
| 1 | Bens |
| 2 | Serviços |
| 3 | Obras |

---

## Exemplos de Uso no Frontend

### Service Angular/React
```typescript
// pncp.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PncpService {
  private baseUrl = '/api/pncp';

  constructor(private http: HttpClient) {}

  // === PCA ===
  incluirPca(pca: PcaDto): Observable<PncpResponse> {
    return this.http.post<PncpResponse>(`${this.baseUrl}/pca`, pca);
  }

  retificarPca(ano: number, seq: number, pca: Partial<PcaDto>): Observable<PncpResponse> {
    return this.http.put<PncpResponse>(`${this.baseUrl}/pca/${ano}/${seq}`, pca);
  }

  excluirPca(ano: number, seq: number, justificativa: string): Observable<PncpResponse> {
    return this.http.delete<PncpResponse>(`${this.baseUrl}/pca/${ano}/${seq}`, {
      body: { justificativa }
    });
  }

  // === COMPRAS ===
  incluirCompra(compra: CompraDto): Observable<PncpResponse> {
    return this.http.post<PncpResponse>(`${this.baseUrl}/compras`, compra);
  }

  retificarCompra(ano: number, seq: number, compra: Partial<CompraDto>): Observable<PncpResponse> {
    return this.http.put<PncpResponse>(`${this.baseUrl}/compras/${ano}/${seq}`, compra);
  }

  excluirCompra(ano: number, seq: number, justificativa: string): Observable<PncpResponse> {
    return this.http.delete<PncpResponse>(`${this.baseUrl}/compras/${ano}/${seq}`, {
      body: { justificativa }
    });
  }

  // === RESULTADO ===
  incluirResultado(ano: number, seq: number, item: number, resultado: ResultadoDto): Observable<PncpResponse> {
    return this.http.post<PncpResponse>(
      `${this.baseUrl}/compras/${ano}/${seq}/itens/${item}/resultado`, 
      resultado
    );
  }

  retificarResultado(ano: number, seq: number, item: number, resultado: ResultadoDto): Observable<PncpResponse> {
    return this.http.put<PncpResponse>(
      `${this.baseUrl}/compras/${ano}/${seq}/itens/${item}/resultado`, 
      resultado
    );
  }

  // === ATA ===
  incluirAta(ano: number, seq: number, ata: AtaDto): Observable<PncpResponse> {
    return this.http.post<PncpResponse>(`${this.baseUrl}/compras/${ano}/${seq}/atas`, ata);
  }

  retificarAta(ano: number, seq: number, seqAta: number, ata: AtaRetificacaoDto): Observable<PncpResponse> {
    return this.http.put<PncpResponse>(`${this.baseUrl}/compras/${ano}/${seq}/atas/${seqAta}`, ata);
  }

  excluirAta(ano: number, seq: number, seqAta: number, justificativa: string): Observable<PncpResponse> {
    return this.http.delete<PncpResponse>(`${this.baseUrl}/compras/${ano}/${seq}/atas/${seqAta}`, {
      body: { justificativa }
    });
  }
}
```

### Interfaces TypeScript
```typescript
// pncp.interfaces.ts

export interface PncpResponse {
  sucesso: boolean;
  mensagem: string;
  numeroControlePNCP?: string;
  dados?: any;
  link?: string;
}

export interface ItemPcaDto {
  numero_item: number;
  categoria_item_pca: number;
  descricao: string;
  unidade_fornecimento: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  valor_orcamento_exercicio: number;
  unidade_requisitante: string;
  data_desejada: string;
  classificacao_catalogo_id?: number;
  codigo_classe?: string;
  descricao_classe?: string;
}

export interface PcaDto {
  ano_pca: number;
  itens: ItemPcaDto[];
}

export interface ItemCompraDto {
  numero_item: number;
  descricao: string;
  tipo: 'MATERIAL' | 'SERVICO';
  quantidade: number;
  unidade_medida: string;
  valor_unitario: number;
  valor_total: number;
}

export interface CompraDto {
  codigo_unidade: string;
  ano_compra: number;
  numero_processo: string;
  objeto: string;
  modalidade_id: number;
  modo_disputa_id: number;
  tipo_instrumento_id: number;
  amparo_legal_id: number;
  srp: boolean;
  data_abertura_proposta: string;
  data_encerramento_proposta: string;
  informacao_complementar?: string;
  titulo_documento: string;
  itens: ItemCompraDto[];
}

export interface ResultadoDto {
  data_resultado: string;
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  quantidade_homologada: number;
  valor_unitario_homologado: number;
  valor_total_homologado: number;
  percentual_desconto?: number;
  situacao_id?: number;
}

export interface ItemAtaDto {
  numero_item: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

export interface AtaDto {
  numero_ata: string;
  ano_ata: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  itens: ItemAtaDto[];
}

export interface AtaRetificacaoDto {
  numero_ata: string;
  ano_ata: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  justificativa: string;
}
```

---

## Links de Referência

- **Portal PNCP**: https://pncp.gov.br
- **Ambiente de Treinamento**: https://treina.pncp.gov.br
- **Swagger API**: https://pncp.gov.br/api/pncp/swagger-ui/index.html
- **Manual de Integração**: https://www.gov.br/pncp/pt-br/central-de-conteudo/manuais

---

## Histórico de Testes Realizados

### Ambiente: treina.pncp.gov.br
### CNPJ Órgão: 64.435.842/0001-59

| Data | Operação | Status | Link |
|------|----------|--------|------|
| 01/12/2025 | Inclusão PCA | ✅ Sucesso | - |
| 01/12/2025 | Retificação Item PCA | ✅ Sucesso | - |
| 01/12/2025 | Exclusão PCA | ✅ Sucesso | - |
| 01/12/2025 | Inclusão Compra | ✅ Sucesso | /editais/64435842000159/2025/3 |
| 01/12/2025 | Inclusão Compra SRP | ✅ Sucesso | /editais/64435842000159/2025/4 |
| 01/12/2025 | Inclusão Resultado | ✅ Sucesso | /editais/64435842000159/2025/3 |
| 01/12/2025 | Inclusão Ata | ✅ Sucesso | /atas/64435842000159/2025/4/1 |
| 01/12/2025 | Retificação Compra | ✅ Sucesso | - |
| 01/12/2025 | Retificação Resultado | ✅ Sucesso | - |
| 01/12/2025 | Retificação Ata | ✅ Sucesso | - |
| 01/12/2025 | Exclusão Ata | ✅ Sucesso | - |
| 01/12/2025 | Exclusão Compra | ✅ Sucesso | - |

---

*Documentação gerada em 01/12/2025*
*Versão: 1.0.0*
