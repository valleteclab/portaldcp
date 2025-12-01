# Plano de Melhorias: PCA e Integração com Catálogos

## ✅ Status de Implementação

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | Módulo de Catálogo Local | ✅ Implementado |
| 2 | Integração Compras.gov.br | ✅ Implementado |
| 3 | Atualizar ItemPCA | ✅ Implementado |
| 4 | Frontend Seletor | ✅ Implementado |
| 5 | Importação JSON com Classificação | ✅ Implementado |
| 6 | Campos para Serviços Continuados | ✅ Implementado |
| 7 | Importação CSV | ⏳ Pendente |
| 8 | Exportação PNCP | ⏳ Pendente |

### Arquivos Criados/Atualizados

```
backend/src/catalogo/
├── entities/catalogo.entity.ts    # ClasseCatalogo, ItemCatalogo, UnidadeMedida
├── catalogo.service.ts            # Busca com cache + sincronização
├── catalogo.controller.ts         # Endpoints da API
├── catalogo.module.ts             # Módulo NestJS
├── comprasgov.service.ts          # Integração API Compras.gov.br
└── catalogo.seed.ts               # Dados iniciais

backend/src/pca/entities/pca.entity.ts  # Novos campos: duracao_meses, renovacao_contrato, data_desejada_contratacao, codigo_grupo, nome_grupo

frontend/src/components/catalogo/
├── CatalogoBusca.tsx              # Modal de busca com autocomplete
├── UnidadeMedidaSelect.tsx        # Seletor de unidades de medida
├── ImportarCatalogo.tsx           # Importação básica de JSON
├── ImportarParaPCA.tsx            # Importação completa para PCA com:
│                                  #   - Busca de classificação na API Compras.gov.br
│                                  #   - Campos para serviços continuados (duração, renovação, data)
│                                  #   - Cálculo automático de valor total
│                                  #   - Importação de unidade de medida do JSON
└── index.ts                       # Exports

frontend/src/components/ui/
└── dialog.tsx                     # Componente Dialog (shadcn/ui)
```

### Funcionalidades de Importação para PCA

1. **Importação de Unidade de Medida**: Extrai automaticamente do JSON (`unidade.siglaUnidadeMedida`)
2. **Busca de Classificação**: Consulta API Compras.gov.br para obter código/nome da classe/grupo
3. **Campos para Serviços Continuados**:
   - Duração em meses (obrigatório para serviços)
   - Renovação de contrato (SIM/NAO)
   - Data desejada de contratação
4. **Cálculo de Valor Total**:
   - Materiais: `quantidade × valor_unitário`
   - Serviços: `quantidade × valor_unitário × duração_meses`

### Endpoints Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/catalogo/classes` | Listar classes |
| GET | `/api/catalogo/classes/:codigo` | Buscar classe |
| GET | `/api/catalogo/itens` | Buscar itens |
| GET | `/api/catalogo/itens/:codigo` | Buscar item por código |
| GET | `/api/catalogo/unidades` | Listar unidades de medida |
| GET | `/api/catalogo/estatisticas` | Estatísticas do catálogo |
| POST | `/api/catalogo/sincronizar` | Sincronizar com Compras.gov.br |

---

## Análise dos CSVs do PNCP

Após analisar os 4 arquivos CSV exportados do PNCP, identifiquei a estrutura completa dos itens do PCA:

### Campos do PCA no PNCP

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `Unidade Responsável` | Nome da unidade | "CÂMARA MUNICIPAL DE PACATUBA/CE" |
| `UASG` | Código da unidade | "931500" |
| `Id do item no PCA` | Sequencial do item | 1, 2, 3... |
| `Categoria do Item` | Tipo do item | Material, Serviço, Soluções de TIC |
| `Identificador da Futura Contratação` | Código único | "931500-21/2026" |
| `Nome da Futura Contratação` | Descrição resumida | "Serviços na locação de veículo" |
| `Catálogo Utilizado` | Fonte do catálogo | "Catálogo do Compras.gov.br" ou "Outros" |
| `Classificação do Catálogo` | Tipo (Material/Serviço) | "Serviço" |
| `Código da Classificação Superior` | Código da classe/grupo | "859", "831", "800" |
| `Nome da Classificação Superior` | Nome da classe/grupo | "OUTROS SERVIÇOS DE SUPORTE" |
| `Código do PDM do Item` | Código PDM (se houver) | "100844" |
| `Nome do PDM do Item` | Nome PDM | "SERVIO DE GRFICA" |
| `Código do Item` | Código CATMAT/CATSER | "100197" |
| `Descrição do Item` | Descrição detalhada | "CHOCOLATE" |
| `Unidade de Fornecimento` | Unidade de medida | "UN", "PCT", "M", "RESMAS" |
| `Quantidade Estimada` | Quantidade | "50,0000" |
| `Valor Unitário Estimado` | Preço unitário | "18,9551" |
| `Valor Total Estimado` | Valor total | "189,5517" |
| `Valor orçamentário estimado` | Valor no exercício | "0,0000" |
| `Data Desejada` | Data prevista | "27/02/2026" |

### Tipos de Catálogo Identificados

1. **Catálogo do Compras.gov.br** - Usa CATMAT/CATSER federal
2. **Outros** - Catálogo próprio do órgão

---

## Plano de Implementação

### Fase 1: Módulo de Catálogo Local (Prioridade Alta)

#### 1.1 Criar Entidades de Catálogo

```
backend/src/catalogo/
├── entities/
│   ├── classe-catalogo.entity.ts      # Classes/Grupos
│   ├── item-catalogo.entity.ts        # Itens CATMAT/CATSER
│   └── unidade-medida.entity.ts       # Unidades de medida
├── catalogo.service.ts
├── catalogo.controller.ts
└── catalogo.module.ts
```

**Entidade ClasseCatalogo:**
```typescript
@Entity('classes_catalogo')
export class ClasseCatalogo {
  id: string;
  codigo: string;           // "859", "800", "831"
  nome: string;             // "OUTROS SERVIÇOS DE SUPORTE"
  tipo: 'MATERIAL' | 'SERVICO';
  classe_pai_id?: string;   // Para hierarquia
  ativo: boolean;
}
```

**Entidade ItemCatalogo:**
```typescript
@Entity('itens_catalogo')
export class ItemCatalogo {
  id: string;
  codigo: string;           // "100844" (CATMAT/CATSER)
  descricao: string;        // "SERVIÇO DE GRÁFICA"
  descricao_detalhada?: string;
  classe_id: string;        // FK para ClasseCatalogo
  tipo: 'MATERIAL' | 'SERVICO';
  unidade_padrao: string;   // "UN", "M", "KG"
  palavras_chave?: string;  // Para busca
  ativo: boolean;
  origem: 'COMPRASGOV' | 'LOCAL';
}
```

**Entidade UnidadeMedida:**
```typescript
@Entity('unidades_medida')
export class UnidadeMedida {
  id: string;
  sigla: string;            // "UN", "PCT", "M", "KG"
  nome: string;             // "Unidade", "Pacote", "Metro"
  ativo: boolean;
}
```

#### 1.2 Importar Dados Base

Criar script de seed com:
- Classes principais do Compras.gov.br
- Unidades de medida padrão
- Itens mais comuns

---

### Fase 2: Integração com API Compras.gov.br (Prioridade Média)

#### 2.1 API de Consulta

**Endpoints da API Compras.gov.br:**
- `https://compras.dados.gov.br/materiais/v1/materiais.json` - CATMAT
- `https://compras.dados.gov.br/servicos/v1/servicos.json` - CATSER
- `https://compras.dados.gov.br/materiais/v1/classes.json` - Classes de materiais
- `https://compras.dados.gov.br/servicos/v1/classes.json` - Classes de serviços

#### 2.2 Serviço de Integração

```typescript
// backend/src/catalogo/comprasgov.service.ts
@Injectable()
export class ComprasGovService {
  private readonly baseUrl = 'https://compras.dados.gov.br';

  // Buscar materiais por descrição
  async buscarMateriais(termo: string, pagina = 1): Promise<ItemCatalogo[]>;
  
  // Buscar serviços por descrição
  async buscarServicos(termo: string, pagina = 1): Promise<ItemCatalogo[]>;
  
  // Buscar classes de materiais
  async listarClassesMateriais(): Promise<ClasseCatalogo[]>;
  
  // Buscar classes de serviços
  async listarClassesServicos(): Promise<ClasseCatalogo[]>;
  
  // Sincronizar catálogo local
  async sincronizarCatalogo(): Promise<void>;
}
```

#### 2.3 Cache Local

- Armazenar resultados em cache (Redis ou banco)
- Sincronização periódica (diária/semanal)
- Fallback para catálogo local se API offline

---

### Fase 3: Atualizar Entidade ItemPCA (Prioridade Alta)

#### 3.1 Novos Campos

```typescript
// Adicionar à entidade ItemPCA
@Entity('itens_pca')
export class ItemPCA {
  // ... campos existentes ...

  // === NOVOS CAMPOS PARA CATÁLOGO ===
  
  // Catálogo utilizado
  @Column({ default: 'COMPRASGOV' })
  catalogo_utilizado: 'COMPRASGOV' | 'OUTROS';

  // Classificação do catálogo
  @Column({ nullable: true })
  classificacao_catalogo: 'MATERIAL' | 'SERVICO';

  // Código da classe/grupo
  @Column({ nullable: true })
  codigo_classe: string;

  // Nome da classe/grupo
  @Column({ nullable: true })
  nome_classe: string;

  // Código PDM (Padrão Descritivo de Materiais)
  @Column({ nullable: true })
  codigo_pdm: string;

  // Nome PDM
  @Column({ nullable: true })
  nome_pdm: string;

  // Código do item (CATMAT/CATSER)
  @Column({ nullable: true })
  codigo_item_catalogo: string;

  // Descrição do item do catálogo
  @Column({ nullable: true })
  descricao_item_catalogo: string;

  // Valor unitário estimado
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario_estimado: number;

  // Valor orçamentário para o exercício
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_orcamentario_exercicio: number;

  // Identificador da futura contratação
  @Column({ nullable: true })
  identificador_contratacao: string;

  // Nome da futura contratação
  @Column({ nullable: true })
  nome_contratacao: string;
}
```

---

### Fase 4: Frontend - Seletor de Catálogo (Prioridade Alta)

#### 4.1 Componente de Busca no Catálogo

```
frontend/src/components/catalogo/
├── CatalogoBusca.tsx           # Busca com autocomplete
├── CatalogoModal.tsx           # Modal de seleção
├── ClasseSelector.tsx          # Seletor de classe/grupo
└── ItemCatalogoCard.tsx        # Card do item
```

**Funcionalidades:**
- Busca por texto (descrição, código)
- Filtro por tipo (Material/Serviço)
- Filtro por classe
- Autocomplete com sugestões
- Histórico de itens usados
- Favoritos do órgão

#### 4.2 Tela de Novo Item PCA

```tsx
// Fluxo de cadastro de item
1. Selecionar Categoria (Material/Serviço/TIC/Obra)
2. Escolher fonte do catálogo:
   - [ ] Catálogo Compras.gov.br (recomendado)
   - [ ] Catálogo próprio
3. Buscar item no catálogo
4. Preencher quantidade e valores
5. Definir data desejada
6. Salvar
```

---

### Fase 5: Importação de PCA via CSV (Prioridade Média)

#### 5.1 Endpoint de Importação

```typescript
// POST /api/pca/:id/importar-csv
@Post(':id/importar-csv')
@UseInterceptors(FileInterceptor('arquivo'))
async importarCSV(
  @Param('id') pcaId: string,
  @UploadedFile() arquivo: Express.Multer.File
): Promise<{ importados: number; erros: string[] }>;
```

#### 5.2 Parser de CSV

Suportar formato PNCP:
- Delimitador: `;`
- Encoding: UTF-8
- Mapeamento automático de colunas

---

### Fase 6: Exportação para PNCP (Prioridade Alta)

#### 6.1 Atualizar Mapeamento

```typescript
// Mapear ItemPCA para formato PNCP
private mapearItemParaPNCP(item: ItemPCA) {
  return {
    numeroItem: item.numero_item,
    categoriaItemPca: this.mapearCategoria(item.categoria),
    descricao: item.descricao_objeto,
    unidadeRequisitante: item.unidade_requisitante,
    valorEstimado: item.valor_estimado,
    quantidadeEstimada: item.quantidade_estimada,
    unidadeMedida: item.unidade_medida,
    dataDesejada: item.data_prevista_inicio,
    grauPrioridade: item.prioridade,
    renovacaoContrato: item.renovacao_contrato,
    // Novos campos do catálogo
    catalogoUtilizado: item.catalogo_utilizado === 'COMPRASGOV' 
      ? 'Catálogo do Compras.gov.br' 
      : 'Outros',
    codigoClassificacao: item.codigo_classe,
    nomeClassificacao: item.nome_classe,
    codigoItem: item.codigo_item_catalogo,
    descricaoItem: item.descricao_item_catalogo
  };
}
```

---

## Cronograma Sugerido

| Fase | Descrição | Esforço | Prioridade |
|------|-----------|---------|------------|
| 1 | Módulo de Catálogo Local | 3-4 dias | 🔴 Alta |
| 2 | Integração Compras.gov.br | 2-3 dias | 🟡 Média |
| 3 | Atualizar ItemPCA | 1 dia | 🔴 Alta |
| 4 | Frontend Seletor | 3-4 dias | 🔴 Alta |
| 5 | Importação CSV | 2 dias | 🟡 Média |
| 6 | Exportação PNCP | 1 dia | 🔴 Alta |

**Total estimado: 12-15 dias**

---

## Dados Base para Seed

### Classes Principais (Compras.gov.br)

**Materiais:**
| Código | Nome |
|--------|------|
| 100 | MATERIAIS DE CONSUMO |
| 300 | AUTOPEÇAS |
| 400 | MEDICAMENTOS E MATERIAIS HOSPITALARES |
| 600 | MATERIAL DE EXPEDIENTE |
| 800 | SERVIÇOS DE TERCEIROS |
| 2000 | IMOBILIZADO |
| 2015 | MATERIAL GRÁFICO |
| 2032 | GÊNEROS DE ALIMENTAÇÃO |
| 2036 | OUTROS |
| 2050 | MATERIAL DE COPA E COZINHA |
| 9999 | ITENS DIVERSOS |

**Serviços:**
| Código | Nome |
|--------|------|
| 166 | SERVIÇOS DE MANUTENÇÃO E INSTALAÇÃO DE EQUIPAMENTOS DE TIC |
| 800 | SERVIÇOS DE TERCEIROS |
| 831 | SERVIÇOS DE CONSULTORIA E DE GERÊNCIA/GESTÃO |
| 859 | OUTROS SERVIÇOS DE SUPORTE |

### Unidades de Medida

| Sigla | Nome |
|-------|------|
| UN | Unidade |
| PCT | Pacote |
| CX | Caixa |
| M | Metro |
| M2 | Metro Quadrado |
| M3 | Metro Cúbico |
| KG | Quilograma |
| L | Litro |
| HR | Hora |
| DIA | Diária |
| MES | Mensal |
| RESMA | Resma |
| ROLO | Rolo |
| FD | Fardo |

---

## API Compras.gov.br - Referência

### Endpoints Disponíveis

```
# Materiais (CATMAT)
GET https://compras.dados.gov.br/materiais/v1/materiais.json
GET https://compras.dados.gov.br/materiais/v1/materiais.json?descricao=caneta
GET https://compras.dados.gov.br/materiais/v1/classes.json

# Serviços (CATSER)
GET https://compras.dados.gov.br/servicos/v1/servicos.json
GET https://compras.dados.gov.br/servicos/v1/servicos.json?descricao=limpeza
GET https://compras.dados.gov.br/servicos/v1/classes.json

# Unidades de Fornecimento
GET https://compras.dados.gov.br/materiais/v1/unidades_fornecimento.json
```

### Parâmetros de Consulta

- `descricao` - Busca por texto
- `codigo` - Busca por código
- `classe` - Filtrar por classe
- `offset` - Paginação (início)
- `limit` - Quantidade por página (máx 500)

### Exemplo de Resposta

```json
{
  "_embedded": {
    "materiais": [
      {
        "codigo": 100197,
        "descricao": "CHOCOLATE",
        "classe": 100,
        "unidade_fornecimento": "UN",
        "status": true
      }
    ]
  },
  "page": {
    "size": 20,
    "totalElements": 150,
    "totalPages": 8,
    "number": 0
  }
}
```

---

## Próximos Passos

1. **Aprovar plano** - Revisar e ajustar conforme necessidade
2. **Criar migrations** - Novas tabelas e campos
3. **Implementar backend** - Módulo de catálogo
4. **Seed inicial** - Popular dados base
5. **Implementar frontend** - Componentes de seleção
6. **Testar integração** - API Compras.gov.br
7. **Atualizar PNCP** - Novo mapeamento de envio

---

## Decisões Pendentes

1. **Cache**: Redis ou banco de dados?
2. **Sincronização**: Frequência de atualização do catálogo?
3. **Catálogo próprio**: Permitir itens não catalogados?
4. **Validação**: Obrigar uso do catálogo Compras.gov.br?
