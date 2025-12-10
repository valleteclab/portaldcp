# Arquitetura de Integração: PCA → Licitação → Itens

## 1. Contexto e Problema

### 1.1 Situação Atual
- **PCA (Plano de Contratações Anual)**: Contém **categorias/grupos** de contratação (ex: "Equipamentos de Informática"), não itens individuais
- **Licitação**: Precisa de **itens específicos** (ex: "Notebook Dell Latitude 15", "Mouse sem fio Logitech")
- **PNCP**: Exige vinculação entre licitação e PCA quando aplicável

### 1.2 Fluxo Legal (Lei 14.133/2021)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO IDEAL (PLANEJADO)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Órgão identifica necessidade                                            │
│  2. Inclui CATEGORIA no PCA (ex: "Equipamentos de Informática - R$ 50.000") │
│  3. PCA é aprovado e enviado ao PNCP                                        │
│  4. No momento da licitação, DETALHA os itens específicos                   │
│  5. Licitação é vinculada ao item do PCA                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO EXCEPCIONAL (NÃO PLANEJADO)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Surge necessidade urgente não prevista no PCA                           │
│  2. Órgão deve JUSTIFICAR a contratação fora do PCA                         │
│  3. Licitação é criada SEM vinculação ao PCA                                │
│  4. PCA pode ser atualizado posteriormente (se necessário)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Modelo de Dados Proposto

### 2.1 Estrutura Hierárquica

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              HIERARQUIA DE ITENS                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CATÁLOGO (PNCP)                                                             │
│  └── Código: 1234                                                            │
│      └── Nome: "Material de Informática"                                     │
│                                                                              │
│  CATEGORIA DO PCA (PNCP)                                                     │
│  └── Código: 5678                                                            │
│      └── Nome: "Equipamentos de TI"                                          │
│      └── Catálogo: 1234                                                      │
│                                                                              │
│  ITEM DO PCA (nosso sistema)                                                 │
│  └── ID: uuid                                                                │
│      └── Categoria PNCP: 5678                                                │
│      └── Descrição: "Aquisição de equipamentos de informática"               │
│      └── Valor Estimado: R$ 50.000,00                                        │
│      └── Ano: 2025                                                           │
│                                                                              │
│  ITEM DA LICITAÇÃO (nosso sistema)                                           │
│  └── ID: uuid                                                                │
│      └── Item PCA (opcional): uuid                                           │
│      └── Descrição: "Notebook Dell Latitude 5540"                            │
│      └── Quantidade: 10                                                      │
│      └── Valor Unitário: R$ 4.500,00                                         │
│      └── Código CATMAT: 449052                                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Entidades do Banco de Dados

```typescript
// ============ CATÁLOGO (cache do PNCP) ============
@Entity('catalogos_pncp')
export class CatalogoPncp {
  @PrimaryColumn()
  id: number; // ID do PNCP
  
  @Column()
  nome: string;
  
  @Column({ nullable: true })
  descricao: string;
  
  @Column({ default: true })
  ativo: boolean;
  
  @UpdateDateColumn()
  sincronizado_em: Date;
}

// ============ CATEGORIA DE ITEM PCA (cache do PNCP) ============
@Entity('categorias_item_pca')
export class CategoriaItemPca {
  @PrimaryColumn()
  id: number; // ID do PNCP
  
  @Column()
  nome: string;
  
  @Column({ nullable: true })
  descricao: string;
  
  @ManyToOne(() => CatalogoPncp)
  catalogo: CatalogoPncp;
  
  @Column()
  catalogo_id: number;
  
  @Column({ default: true })
  ativo: boolean;
  
  @UpdateDateColumn()
  sincronizado_em: Date;
}

// ============ ITEM DO PCA (já existe, ajustar) ============
@Entity('pca_itens')
export class ItemPca {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @ManyToOne(() => PlanoContratacaoAnual)
  pca: PlanoContratacaoAnual;
  
  @Column()
  pca_id: string;
  
  // Vinculação com categoria do PNCP
  @ManyToOne(() => CategoriaItemPca, { nullable: true })
  categoria_pncp: CategoriaItemPca;
  
  @Column({ nullable: true })
  categoria_pncp_id: number;
  
  @Column()
  descricao: string; // "Aquisição de equipamentos de informática"
  
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_estimado: number;
  
  @Column({ nullable: true })
  unidade_requisitante: string;
  
  @Column({ type: 'date', nullable: true })
  data_desejada: Date;
  
  // Controle de uso
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_utilizado: number; // Soma dos valores das licitações vinculadas
  
  @Column({ default: false })
  esgotado: boolean; // true quando valor_utilizado >= valor_estimado
}

// ============ ITEM DA LICITAÇÃO (já existe, ajustar) ============
@Entity('itens_licitacao')
export class ItemLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @ManyToOne(() => Licitacao)
  licitacao: Licitacao;
  
  @Column()
  licitacao_id: string;
  
  // VINCULAÇÃO COM PCA (opcional)
  @ManyToOne(() => ItemPca, { nullable: true })
  item_pca: ItemPca;
  
  @Column({ nullable: true })
  item_pca_id: string;
  
  // Se não tem PCA, exigir justificativa
  @Column({ default: false })
  sem_pca: boolean;
  
  @Column({ type: 'text', nullable: true })
  justificativa_sem_pca: string;
  
  // Dados do item
  @Column()
  numero_item: number;
  
  @Column()
  descricao_resumida: string; // "Notebook Dell Latitude 5540"
  
  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;
  
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;
  
  @Column({ type: 'enum', enum: UnidadeMedida })
  unidade_medida: UnidadeMedida;
  
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario_estimado: number;
  
  // Código do catálogo de materiais/serviços (CATMAT/CATSER)
  @Column({ nullable: true })
  codigo_catalogo: string;
  
  // ... demais campos existentes
}
```

---

## 3. Fluxo de Cadastro de Licitação

### 3.1 Tela de Itens - Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ITENS DA LICITAÇÃO                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 📋 Importar do PCA                                                      ││
│  │                                                                         ││
│  │ Selecione o PCA:  [2025 ▼]                                              ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────────┐ ││
│  │ │ ☑ Equipamentos de Informática    R$ 50.000,00   Disponível: 50.000  │ ││
│  │ │ ☐ Material de Escritório         R$ 15.000,00   Disponível: 8.000   │ ││
│  │ │ ☐ Serviços de Manutenção         R$ 30.000,00   Disponível: 30.000  │ ││
│  │ └─────────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │ [Importar Selecionados]                                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ─────────────────────────── OU ───────────────────────────────────────────  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ➕ Adicionar Item Manualmente                                           ││
│  │                                                                         ││
│  │ ☐ Este item NÃO está previsto no PCA                                    ││
│  │   └── Justificativa: [________________________________]                 ││
│  │                                                                         ││
│  │ [Adicionar Item]                                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  ITENS ADICIONADOS:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ # │ Descrição              │ Qtd │ Valor Unit. │ Total    │ PCA        ││
│  ├───┼────────────────────────┼─────┼─────────────┼──────────┼────────────┤│
│  │ 1 │ Notebook Dell Lat...   │ 10  │ R$ 4.500    │ R$ 45.000│ ✓ Equip.TI ││
│  │ 2 │ Mouse sem fio Log...   │ 20  │ R$ 150      │ R$ 3.000 │ ✓ Equip.TI ││
│  │ 3 │ Serviço emergencial    │ 1   │ R$ 5.000    │ R$ 5.000 │ ⚠ Sem PCA  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Valor Total: R$ 53.000,00                                                   │
│  ⚠ 1 item sem vinculação ao PCA (justificativa obrigatória)                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Modal de Importação do PCA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IMPORTAR ITENS DO PCA                                                 [X]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PCA Selecionado: 2025 - Equipamentos de Informática                        │
│  Categoria PNCP: Tecnologia da Informação                                   │
│  Valor Disponível: R$ 50.000,00                                             │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  ADICIONAR ITENS ESPECÍFICOS:                                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Descrição: [Notebook Dell Latitude 5540, 16GB RAM, 512GB SSD_________] ││
│  │ Código CATMAT: [449052____] [🔍 Buscar no Catálogo]                     ││
│  │ Quantidade: [10___]  Unidade: [UNIDADE ▼]  Valor Unit.: [R$ 4.500,00]   ││
│  │                                                          [+ Adicionar]  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ITENS A IMPORTAR:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 1. Notebook Dell Latitude 5540 - 10 un x R$ 4.500 = R$ 45.000    [🗑]   ││
│  │ 2. Mouse sem fio Logitech M185 - 20 un x R$ 150 = R$ 3.000       [🗑]   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Subtotal: R$ 48.000,00 (de R$ 50.000,00 disponíveis)                       │
│  ✓ Dentro do limite do PCA                                                   │
│                                                                              │
│  [Cancelar]                                           [Confirmar Importação] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Modal de Item Sem PCA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠ ITEM SEM VINCULAÇÃO AO PCA                                          [X]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Conforme Art. 12, VII da Lei 14.133/2021, contratações não previstas       │
│  no PCA devem ser devidamente justificadas.                                  │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  DADOS DO ITEM:                                                              │
│  Descrição: [Serviço emergencial de reparo em servidor________________]     │
│  Quantidade: [1___]  Unidade: [SERVICO ▼]  Valor Unit.: [R$ 5.000,00___]    │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  JUSTIFICATIVA OBRIGATÓRIA: *                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Necessidade emergencial de reparo no servidor principal que            ││
│  │ apresentou falha crítica em 05/12/2025. A contratação não estava       ││
│  │ prevista no PCA 2025 devido à natureza imprevisível da falha.          ││
│  │ O servidor é essencial para a operação do órgão e sua                  ││
│  │ indisponibilidade causa prejuízo aos serviços públicos.                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ☑ Declaro que esta contratação é excepcional e está devidamente            │
│    justificada conforme legislação vigente.                                  │
│                                                                              │
│  [Cancelar]                                              [Adicionar Item]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Endpoints da API

### 4.1 Catálogos e Categorias (sincronização com PNCP)

```typescript
// Sincronizar catálogos do PNCP
GET  /api/catalogos/sincronizar
// Listar catálogos (cache local)
GET  /api/catalogos
// Buscar catálogo por ID
GET  /api/catalogos/:id

// Sincronizar categorias do PNCP
GET  /api/categorias-item-pca/sincronizar
// Listar categorias (cache local)
GET  /api/categorias-item-pca
// Buscar categoria por ID
GET  /api/categorias-item-pca/:id
// Buscar categorias por catálogo
GET  /api/categorias-item-pca/catalogo/:catalogoId
```

### 4.2 Itens do PCA

```typescript
// Listar itens do PCA com saldo disponível
GET  /api/pca/:pcaId/itens
GET  /api/pca/:pcaId/itens/disponiveis  // Apenas com saldo > 0

// Buscar item do PCA
GET  /api/pca/itens/:id

// Verificar saldo do item PCA
GET  /api/pca/itens/:id/saldo
```

### 4.3 Itens da Licitação

```typescript
// Criar item vinculado ao PCA
POST /api/itens
{
  "licitacao_id": "uuid",
  "item_pca_id": "uuid",        // Vinculação com PCA
  "numero_item": 1,
  "descricao_resumida": "Notebook Dell Latitude 5540",
  "quantidade": 10,
  "unidade_medida": "UNIDADE",
  "valor_unitario_estimado": 4500.00,
  "codigo_catalogo": "449052"
}

// Criar item SEM PCA (com justificativa)
POST /api/itens
{
  "licitacao_id": "uuid",
  "sem_pca": true,
  "justificativa_sem_pca": "Necessidade emergencial...",
  "numero_item": 3,
  "descricao_resumida": "Serviço emergencial",
  "quantidade": 1,
  "unidade_medida": "SERVICO",
  "valor_unitario_estimado": 5000.00
}

// Importar múltiplos itens do PCA
POST /api/itens/importar-pca
{
  "licitacao_id": "uuid",
  "item_pca_id": "uuid",
  "itens": [
    {
      "descricao_resumida": "Notebook Dell",
      "quantidade": 10,
      "valor_unitario_estimado": 4500.00
    },
    {
      "descricao_resumida": "Mouse Logitech",
      "quantidade": 20,
      "valor_unitario_estimado": 150.00
    }
  ]
}
```

---

## 5. Validações de Negócio

### 5.1 Ao Adicionar Item

```typescript
// Validações obrigatórias
if (item.sem_pca) {
  // Item sem PCA
  if (!item.justificativa_sem_pca || item.justificativa_sem_pca.length < 50) {
    throw new Error('Justificativa obrigatória (mínimo 50 caracteres)');
  }
} else {
  // Item com PCA
  if (!item.item_pca_id) {
    throw new Error('Selecione o item do PCA ou marque como "Sem PCA"');
  }
  
  // Verificar saldo disponível no PCA
  const itemPca = await this.itemPcaRepository.findOne(item.item_pca_id);
  const saldoDisponivel = itemPca.valor_estimado - itemPca.valor_utilizado;
  const valorItem = item.quantidade * item.valor_unitario_estimado;
  
  if (valorItem > saldoDisponivel) {
    throw new Error(`Valor excede saldo do PCA. Disponível: R$ ${saldoDisponivel}`);
  }
}
```

### 5.2 Ao Salvar Licitação

```typescript
// Verificar se todos os itens têm vinculação ou justificativa
const itensSemVinculacao = itens.filter(i => !i.item_pca_id && !i.sem_pca);
if (itensSemVinculacao.length > 0) {
  throw new Error('Todos os itens devem estar vinculados ao PCA ou ter justificativa');
}

// Alertar sobre itens sem PCA
const itensSemPca = itens.filter(i => i.sem_pca);
if (itensSemPca.length > 0) {
  // Registrar no histórico da licitação
  await this.registrarEvento(licitacao.id, 
    `${itensSemPca.length} item(s) sem vinculação ao PCA`
  );
}
```

### 5.3 Ao Enviar ao PNCP

```typescript
// Atualizar saldo utilizado no PCA
for (const item of licitacao.itens) {
  if (item.item_pca_id) {
    const valorItem = item.quantidade * item.valor_unitario_estimado;
    await this.itemPcaRepository.increment(
      { id: item.item_pca_id },
      'valor_utilizado',
      valorItem
    );
  }
}
```

---

## 6. Importação de Itens

### 6.1 Fontes de Importação

| Fonte | Descrição | Formato |
|-------|-----------|---------|
| **PCA** | Itens do Plano de Contratações | Seleção na tela |
| **Catálogo PNCP** | Consulta online ao PNCP | API REST |
| **Catálogo Próprio** | Itens salvos localmente | JSON |
| **Planilha** | Importação em lote | CSV/Excel |

### 6.2 Modelo de Planilha CSV

```csv
numero_item;descricao_resumida;descricao_detalhada;quantidade;unidade_medida;valor_unitario;codigo_catalogo
1;Notebook Dell Latitude 5540;Intel Core i7, 16GB RAM, 512GB SSD;10;UNIDADE;4500.00;449052
2;Mouse sem fio Logitech M185;Mouse óptico wireless;20;UNIDADE;150.00;449052
3;Teclado USB Dell KB216;Teclado padrão ABNT2;20;UNIDADE;120.00;449052
```

### 6.3 Catálogo Próprio (JSON)

```json
{
  "nome": "Catálogo de Informática - Prefeitura XYZ",
  "versao": "2025.1",
  "itens": [
    {
      "codigo": "INF-001",
      "descricao": "Notebook Dell Latitude 5540",
      "especificacao": "Intel Core i7-1365U, 16GB DDR5, 512GB NVMe",
      "unidade": "UNIDADE",
      "categoria": "Equipamentos de TI",
      "codigo_catmat": "449052"
    },
    {
      "codigo": "INF-002",
      "descricao": "Monitor LED 24 polegadas",
      "especificacao": "Full HD, IPS, HDMI/VGA",
      "unidade": "UNIDADE",
      "categoria": "Equipamentos de TI",
      "codigo_catmat": "449052"
    }
  ]
}
```

---

## 7. Estrutura de Lotes e Modos de Vinculação ao PCA

### 7.1 Problema: Licitações com Objetos Heterogêneos

Em licitações com objetos parcelados ou mistos, diferentes itens podem pertencer a categorias distintas do PCA:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    EXEMPLO: LICITAÇÃO COM OBJETO MISTO                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  EDITAL: "Aquisição de Computadores e Gêneros Alimentícios"                     │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ LOTE 1: Equipamentos de Informática                                     │    │
│  │ ├── Item 1: Notebook Dell - 10 un - R$ 45.000,00                        │    │
│  │ ├── Item 2: Mouse sem fio - 20 un - R$ 3.000,00                         │    │
│  │ └── Item 3: Teclado USB - 20 un - R$ 2.400,00                           │    │
│  │                                                                         │    │
│  │ 🔗 VINCULADO AO PCA: "Equipamentos de TI" (R$ 50.000,00)                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ LOTE 2: Gêneros Alimentícios                                            │    │
│  │ ├── Item 4: Arroz tipo 1 - 100 kg - R$ 500,00                           │    │
│  │ ├── Item 5: Feijão carioca - 50 kg - R$ 400,00                          │    │
│  │ └── Item 6: Óleo de soja - 50 L - R$ 350,00                             │    │
│  │                                                                         │    │
│  │ 🔗 VINCULADO AO PCA: "Alimentos e Bebidas" (R$ 10.000,00)               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Modos de Vinculação ao PCA

O sistema deve oferecer **3 modos de vinculação** ao PCA, configuráveis por licitação:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         MODOS DE VINCULAÇÃO AO PCA                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ MODO 1: POR LICITAÇÃO (Objeto Homogêneo)                                │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │ • Todos os itens vinculam ao MESMO item do PCA                          │    │
│  │ • Ideal para: Licitações com objeto único                               │    │
│  │ • Exemplo: "Aquisição de Equipamentos de Informática"                   │    │
│  │ • Configuração: Usuário seleciona PCA no cadastro do objeto             │    │
│  │ • Herança: Todos os itens herdam automaticamente o PCA da licitação     │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ MODO 2: POR LOTE (Objeto Parcelado)                                     │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │ • Cada LOTE vincula a um item do PCA diferente                          │    │
│  │ • Ideal para: Licitações com múltiplas categorias                       │    │
│  │ • Exemplo: "Computadores (Lote 1) + Alimentos (Lote 2)"                 │    │
│  │ • Configuração: Usuário seleciona PCA ao criar cada lote                │    │
│  │ • Herança: Itens do lote herdam o PCA do lote                           │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ MODO 3: POR ITEM (Granular)                                             │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │ • Cada ITEM vincula individualmente a um item do PCA                    │    │
│  │ • Ideal para: Casos especiais ou itens avulsos                          │    │
│  │ • Exemplo: Itens de diferentes categorias sem agrupamento               │    │
│  │ • Configuração: Usuário seleciona PCA para cada item                    │    │
│  │ • Sem herança: Cada item tem seu próprio PCA                            │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Entidade de Lote

```typescript
// ============ LOTE DA LICITAÇÃO ============
@Entity('lotes_licitacao')
export class LoteLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero: number; // 1, 2, 3...

  @Column()
  descricao: string; // "Equipamentos de Informática"

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  // Vinculação com PCA (quando modo = POR_LOTE)
  @ManyToOne(() => ItemPCA, { nullable: true })
  @JoinColumn({ name: 'item_pca_id' })
  item_pca: ItemPCA;

  @Column({ type: 'uuid', nullable: true })
  item_pca_id: string;

  // Itens do lote
  @OneToMany(() => ItemLicitacao, item => item.lote)
  itens: ItemLicitacao[];

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### 7.4 Atualização da Entidade Licitação

```typescript
// Adicionar na entidade Licitacao
@Entity('licitacoes')
export class Licitacao {
  // ... campos existentes ...

  // Modo de vinculação ao PCA
  @Column({
    type: 'enum',
    enum: ['POR_LICITACAO', 'POR_LOTE', 'POR_ITEM'],
    default: 'POR_ITEM'
  })
  modo_vinculacao_pca: 'POR_LICITACAO' | 'POR_LOTE' | 'POR_ITEM';

  // Vinculação com PCA (quando modo = POR_LICITACAO)
  @ManyToOne(() => ItemPCA, { nullable: true })
  @JoinColumn({ name: 'item_pca_id' })
  item_pca: ItemPCA;

  @Column({ type: 'uuid', nullable: true })
  item_pca_id: string;

  // Lotes (quando modo = POR_LOTE)
  @OneToMany(() => LoteLicitacao, lote => lote.licitacao)
  lotes: LoteLicitacao[];

  // Flag para indicar se usa lotes
  @Column({ default: false })
  usa_lotes: boolean;
}
```

### 7.5 Atualização da Entidade ItemLicitacao

```typescript
// Atualizar entidade ItemLicitacao
@Entity('itens_licitacao')
export class ItemLicitacao {
  // ... campos existentes ...

  // Vinculação com Lote (opcional)
  @ManyToOne(() => LoteLicitacao, { nullable: true })
  @JoinColumn({ name: 'lote_id' })
  lote: LoteLicitacao;

  @Column({ type: 'uuid', nullable: true })
  lote_id: string;

  // Vinculação com PCA (quando modo = POR_ITEM ou herança)
  @ManyToOne(() => ItemPCA, { nullable: true })
  @JoinColumn({ name: 'item_pca_id' })
  item_pca: ItemPCA;

  @Column({ type: 'uuid', nullable: true })
  item_pca_id: string;

  // Campos para itens sem PCA
  @Column({ default: false })
  sem_pca: boolean;

  @Column({ type: 'text', nullable: true })
  justificativa_sem_pca: string;
}
```

### 7.6 Fluxo de Configuração no Frontend

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CONFIGURAÇÃO DE VINCULAÇÃO                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PASSO 1: Cadastro da Licitação                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ Objeto: "Aquisição de Equipamentos de Informática"                      │    │
│  │                                                                         │    │
│  │ ┌─ Modo de Vinculação ao PCA ─────────────────────────────────────────┐ │    │
│  │ │ ○ Por Licitação (todos itens vinculam ao mesmo PCA)                 │ │    │
│  │ │ ○ Por Lote (cada lote vincula a um PCA)                             │ │    │
│  │ │ ● Por Item (cada item vincula individualmente)                      │ │    │
│  │ └─────────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  PASSO 2A: Se "Por Licitação"                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ Selecione o Item do PCA:                                                │    │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │    │
│  │ │ [🔍 Buscar PCA...]                                                  │ │    │
│  │ │ ┌─────────────────────────────────────────────────────────────────┐ │ │    │
│  │ │ │ ✓ Equipamentos de TI - PCA 2025 - Saldo: R$ 50.000,00           │ │ │    │
│  │ │ └─────────────────────────────────────────────────────────────────┘ │ │    │
│  │ └─────────────────────────────────────────────────────────────────────┘ │    │
│  │                                                                         │    │
│  │ ℹ️ Todos os itens serão automaticamente vinculados a este PCA          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  PASSO 2B: Se "Por Lote"                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ Configurar Lotes:                                                       │    │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │    │
│  │ │ LOTE 1: Equipamentos de Informática                                 │ │    │
│  │ │ PCA: [Equipamentos de TI - 2025 ▼]                                  │ │    │
│  │ │ [+ Adicionar Item ao Lote 1]                                        │ │    │
│  │ └─────────────────────────────────────────────────────────────────────┘ │    │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │    │
│  │ │ LOTE 2: Gêneros Alimentícios                                        │ │    │
│  │ │ PCA: [Alimentos e Bebidas - 2025 ▼]                                 │ │    │
│  │ │ [+ Adicionar Item ao Lote 2]                                        │ │    │
│  │ └─────────────────────────────────────────────────────────────────────┘ │    │
│  │ [+ Criar Novo Lote]                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  PASSO 2C: Se "Por Item"                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ Cada item será vinculado individualmente:                               │    │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │    │
│  │ │ Item 1: Notebook Dell                                               │ │    │
│  │ │ PCA: [Equipamentos de TI ▼] ou [Sem PCA - Justificar]               │ │    │
│  │ └─────────────────────────────────────────────────────────────────────┘ │    │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │    │
│  │ │ Item 2: Arroz tipo 1                                                │ │    │
│  │ │ PCA: [Alimentos ▼] ou [Sem PCA - Justificar]                        │ │    │
│  │ └─────────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.7 Regras de Negócio para Vinculação

```typescript
// Regras de vinculação ao PCA
const regrasVinculacaoPca = {
  POR_LICITACAO: {
    descricao: 'Todos os itens vinculam ao mesmo PCA',
    validacao: (licitacao) => {
      // Licitação deve ter item_pca_id OU todos itens com sem_pca=true
      if (!licitacao.item_pca_id) {
        return licitacao.itens.every(i => i.sem_pca && i.justificativa_sem_pca);
      }
      return true;
    },
    heranca: (licitacao, item) => {
      // Item herda PCA da licitação
      item.item_pca_id = licitacao.item_pca_id;
    }
  },
  
  POR_LOTE: {
    descricao: 'Cada lote vincula a um PCA diferente',
    validacao: (licitacao) => {
      // Cada lote deve ter item_pca_id OU todos itens do lote com sem_pca=true
      return licitacao.lotes.every(lote => {
        if (!lote.item_pca_id) {
          return lote.itens.every(i => i.sem_pca && i.justificativa_sem_pca);
        }
        return true;
      });
    },
    heranca: (lote, item) => {
      // Item herda PCA do lote
      item.item_pca_id = lote.item_pca_id;
    }
  },
  
  POR_ITEM: {
    descricao: 'Cada item vincula individualmente',
    validacao: (licitacao) => {
      // Cada item deve ter item_pca_id OU sem_pca=true com justificativa
      return licitacao.itens.every(item => {
        return item.item_pca_id || (item.sem_pca && item.justificativa_sem_pca);
      });
    },
    heranca: null // Sem herança, cada item é configurado individualmente
  }
};
```

### 7.8 Casos de Uso

| Cenário | Modo Recomendado | Exemplo |
|---------|------------------|---------|
| Objeto único e homogêneo | POR_LICITACAO | "Aquisição de Equipamentos de TI" |
| Objeto parcelado com categorias distintas | POR_LOTE | "Computadores + Alimentos" |
| Registro de Preços com itens variados | POR_LOTE | "RP de Material de Expediente" |
| Itens avulsos sem agrupamento lógico | POR_ITEM | Contratações emergenciais |
| Licitação com item fora do PCA | POR_ITEM | Item urgente não planejado |

### 7.9 Migração de Dados

Para licitações existentes sem configuração de modo:
1. Verificar se há lotes cadastrados → `POR_LOTE`
2. Verificar se todos itens têm mesmo PCA → `POR_LICITACAO`
3. Caso contrário → `POR_ITEM` (padrão)

---

## 8. Cronograma de Implementação

### Fase 1: Backend - Estrutura Base (CONCLUÍDO ✅)
- [x] Adicionar campos `item_pca_id`, `sem_pca`, `justificativa_sem_pca` na entidade `ItemLicitacao`
- [x] Adicionar campos `valor_utilizado`, `esgotado` na entidade `ItemPca`
- [x] Criar endpoints de busca de itens PCA disponíveis
- [x] Filtrar apenas PCAs enviados ao PNCP

### Fase 2: Frontend - Vinculação por Item (CONCLUÍDO ✅)
- [x] Modal de importação do PCA com filtros
- [x] Modal de item sem PCA com justificativa
- [x] Tags de PCA/Ano nos itens
- [x] Botão Salvar Rascunho funcional

### Fase 3: Backend - Lotes e Modos de Vinculação (PENDENTE)
- [ ] Criar entidade `LoteLicitacao`
- [ ] Adicionar campo `modo_vinculacao_pca` na entidade `Licitacao`
- [ ] Adicionar campo `lote_id` na entidade `ItemLicitacao`
- [ ] Criar endpoints CRUD para lotes
- [ ] Implementar herança de PCA (licitação → itens, lote → itens)
- [ ] Validações de negócio por modo de vinculação

### Fase 4: Frontend - Lotes e Modos de Vinculação (PENDENTE)
- [ ] Seletor de modo de vinculação ao PCA na classificação
- [ ] Interface de criação/edição de lotes
- [ ] Vinculação de PCA por lote
- [ ] Reorganização de itens entre lotes
- [ ] Totalizadores por lote

### Fase 5: Integração e Testes (2 dias)
- [ ] Testar fluxo completo PCA → Licitação com lotes
- [ ] Testar validações de saldo por modo de vinculação
- [ ] Testar envio ao PNCP com vinculação
- [ ] Documentar API de lotes

---

## 9. Considerações Finais

### 9.1 Benefícios da Arquitetura
1. **Rastreabilidade**: Todo item da licitação tem origem conhecida (PCA ou justificativa)
2. **Controle Orçamentário**: Saldo do PCA é atualizado automaticamente
3. **Conformidade Legal**: Sistema exige justificativa para itens fora do PCA
4. **Flexibilidade**: Permite tanto o fluxo ideal quanto exceções justificadas
5. **Organização por Lotes**: Facilita licitações com objetos heterogêneos
6. **Modos de Vinculação**: Adapta-se a diferentes cenários de contratação

### 9.2 Pontos de Atenção
1. **Sincronização**: Catálogos do PNCP devem ser sincronizados periodicamente
2. **Performance**: Cache local evita consultas excessivas ao PNCP
3. **Auditoria**: Todas as justificativas devem ser registradas no histórico

### 9.3 Evolução Futura
- Integração direta com CATMAT/CATSER para busca de códigos
- Sugestão automática de itens baseada no histórico
- Alertas de saldo do PCA próximo do limite
- Dashboard de execução do PCA
- Sugestão automática de modo de vinculação baseado no objeto
