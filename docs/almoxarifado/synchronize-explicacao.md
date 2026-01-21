# ⚠️ Explicação: synchronize: true - Riscos e Soluções

## O que é `synchronize: true`?

É uma configuração do TypeORM que **automaticamente sincroniza** o esquema do banco de dados com as entidades do código toda vez que a aplicação inicia.

## Como Funciona

### 1. **Desenvolvimento (synchronize: true)**
```typescript
// Você cria uma nova entidade
@Entity('requisicoes')
export class Requisicao {
  @Column()
  numero: string;
  
  @Column()
  status: string;
}
```

**O que acontece:**
- ✅ TypeORM cria a tabela `requisicoes` automaticamente
- ✅ Cria as colunas `numero` e `status`
- ✅ Tudo funciona sem você escrever SQL

### 2. **Você adiciona um campo novo**
```typescript
@Entity('requisicoes')
export class Requisicao {
  @Column()
  numero: string;
  
  @Column()
  status: string;
  
  @Column()  // ← NOVO CAMPO
  observacoes: string;
}
```

**O que acontece:**
- ✅ TypeORM adiciona a coluna `observacoes` automaticamente
- ✅ Dados existentes ficam com `NULL` na nova coluna
- ✅ Funciona perfeitamente

## ⚠️ RISCOS EM PRODUÇÃO

### Cenário 1: Renomear uma propriedade

**ANTES:**
```typescript
@Entity('requisicoes')
export class Requisicao {
  @Column()
  numero_requisicao: string;  // ← Nome antigo
}
```

**DEPOIS (você renomeia):**
```typescript
@Entity('requisicoes')
export class Requisicao {
  @Column()
  numero: string;  // ← Novo nome
}
```

**O que o TypeORM faz:**
1. ❌ **Remove a coluna `numero_requisicao`** (com TODOS os dados!)
2. ✅ Cria a coluna `numero` (vazia)
3. 💥 **PERDA TOTAL DE DADOS** naquela coluna!

### Cenário 2: Mudar tipo de dado

**ANTES:**
```typescript
@Column()
valor_total: number;  // Tipo: DECIMAL
```

**DEPOIS:**
```typescript
@Column('text')
valor_total: string;  // Tipo: TEXT
```

**O que acontece:**
- ❌ TypeORM pode tentar converter ou **perder dados**
- ❌ Valores numéricos podem ser corrompidos

### Cenário 3: Remover uma entidade

**Você deleta o arquivo:**
```typescript
// Requisicao.entity.ts ← DELETADO
```

**O que acontece:**
- ❌ TypeORM **DROP da tabela** `requisicoes`
- 💥 **PERDA TOTAL DE TODOS OS DADOS** da tabela!

### Cenário 4: Mudança de relacionamento

**ANTES:**
```typescript
@ManyToOne(() => Contrato)
contrato: Contrato;
```

**DEPOIS:**
```typescript
@ManyToOne(() => Contrato)
@JoinColumn({ name: 'contrato_uuid' })  // ← Mudou nome da coluna
contrato: Contrato;
```

**O que acontece:**
- ❌ Remove foreign key antiga
- ❌ Pode perder integridade referencial
- ❌ Dados órfãos podem ser criados

## 📊 Comparação: synchronize vs Migrations

| Aspecto | synchronize: true | Migrations |
|---------|------------------|------------|
| **Controle** | ❌ Automático, sem revisão | ✅ Manual, revisado |
| **Segurança** | ❌ Pode perder dados | ✅ Seguro, testável |
| **Rastreabilidade** | ❌ Sem histórico | ✅ Histórico completo |
| **Rollback** | ❌ Impossível | ✅ Possível |
| **Produção** | ❌ NUNCA usar | ✅ Recomendado |
| **Desenvolvimento** | ✅ Conveniente | ⚠️ Mais trabalho |

## ✅ SOLUÇÃO: Usar Migrations

### 1. Desabilitar synchronize em produção

```typescript
// backend/src/app.module.ts
TypeOrmModule.forRoot({
  // ... outras configs
  synchronize: process.env.NODE_ENV !== 'production', // false em produção
  migrations: ['dist/migrations/*.js'],
  migrationsRun: true, // Executa migrations automaticamente
})
```

### 2. Criar Migration para mudanças

**Exemplo: Adicionar campo `observacoes`**

```bash
npm run typeorm migration:generate -- -n AddObservacoesToRequisicao
```

**Arquivo gerado:**
```typescript
export class AddObservacoesToRequisicao1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE requisicoes 
      ADD COLUMN observacoes VARCHAR(255) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE requisicoes 
      DROP COLUMN observacoes;
    `);
  }
}
```

**Vantagens:**
- ✅ Revisável antes de executar
- ✅ Testável em ambiente de staging
- ✅ Pode fazer rollback (`down()`)
- ✅ Histórico de todas as mudanças

### 3. Executar Migrations

```bash
# Desenvolvimento
npm run typeorm migration:run

# Produção (via deploy)
npm run typeorm migration:run -- -d dist/ormconfig.js
```

## 🎯 Recomendação para o Projeto

### Configuração Ideal

```typescript
// backend/src/app.module.ts
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  autoLoadEntities: true,
  
  // ✅ DESABILITAR em produção
  synchronize: process.env.NODE_ENV === 'development',
  
  // ✅ Usar migrations em produção
  migrations: ['dist/migrations/*.js'],
  migrationsRun: process.env.NODE_ENV === 'production',
  
  // ... outras configs
})
```

### Variável de Ambiente

```bash
# .env (desenvolvimento)
NODE_ENV=development
SYNCHRONIZE=true

# .env.production (produção)
NODE_ENV=production
SYNCHRONIZE=false
```

## 📝 Checklist de Migração

- [ ] Desabilitar `synchronize: true` em produção
- [ ] Criar migrations para mudanças existentes
- [ ] Testar migrations em ambiente de staging
- [ ] Documentar processo de deploy de migrations
- [ ] Configurar CI/CD para executar migrations automaticamente

## 🔗 Referências

- [TypeORM Migrations](https://typeorm.io/migrations)
- [TypeORM Synchronize](https://typeorm.io/data-source-options#synchronize-options)
