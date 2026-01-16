# Redesign da Sala de Disputa - Pregão Eletrônico

## 1. Visão Geral

A sala de disputa é o **módulo principal** do sistema de licitações. Deve seguir rigorosamente as regras da **Lei 14.133/2021** e proporcionar uma experiência profissional similar ao **Licitações-e** do Banco do Brasil e **ComprasNet**.

## 2. Fluxo do Pregão Eletrônico (Lei 14.133/2021, Art. 56)

### 2.1 Etapas da Sessão Pública

```
1. ABERTURA_SESSAO
   └── Pregoeiro abre a sessão, fornecedores entram na sala

2. ANALISE_PROPOSTAS
   └── Pregoeiro analisa propostas recebidas
   └── Pode desclassificar propostas inexequíveis ou acima do orçamento

3. DISPUTA_LANCES (Modo Aberto)
   └── Fornecedores enviam lances em tempo real
   └── Tempo de inatividade: 10 minutos (configurável)
   └── Após inatividade: tempo aleatório de 2 a 30 minutos

4. NEGOCIACAO
   └── Pregoeiro negocia com o melhor classificado
   └── Pode solicitar redução de preço

5. CONVOCACAO_HABILITACAO
   └── Vencedor é convocado para enviar documentos
   └── Prazo: 2 horas (prorrogável)

6. ANALISE_HABILITACAO
   └── Pregoeiro analisa documentos
   └── Pode aprovar, reprovar ou solicitar diligência

7. BENEFICIO_MPE (se aplicável)
   └── Empate ficto: diferença ≤ 5%
   └── ME/EPP tem 5 minutos para cobrir o lance

8. INTENCAO_RECURSO
   └── Prazo de 10 minutos para manifestar intenção
   └── Fornecedores podem registrar intenção

9. ADJUDICACAO
   └── Pregoeiro adjudica o item ao vencedor

10. ENCERRAMENTO
    └── Sessão é encerrada, ATA é gerada
```

### 2.2 Modos de Disputa (Art. 56, §1º)

| Modo | Descrição | Uso |
|------|-----------|-----|
| **Aberto** | Lances públicos e sucessivos | Pregão padrão |
| **Fechado** | Lance único e sigiloso | Concorrência |
| **Aberto-Fechado** | Lances abertos + lance final fechado | Híbrido |
| **Fechado-Aberto** | Lance fechado + lances abertos | Híbrido |

## 3. Problemas Atuais

### 3.1 Sala do Pregoeiro
- [ ] Layout desorganizado, sem hierarquia visual clara
- [ ] Falta controle de etapas (não há botões para avançar etapas)
- [ ] Não mostra claramente qual item está em disputa
- [ ] Chat misturado com controles
- [ ] Falta painel de ações por etapa
- [ ] Não tem visão de ranking de fornecedores
- [ ] Falta cronômetro destacado
- [ ] Não tem indicador de tempo aleatório

### 3.2 Sala do Fornecedor
- [ ] Não mostra claramente minha posição no ranking
- [ ] Falta indicador visual de "vencendo" ou "perdendo"
- [ ] Campo de lance não é intuitivo
- [ ] Falta sugestão de lance (próximo valor válido)
- [ ] Não tem histórico de meus lances
- [ ] Chat pouco visível

## 4. Novo Layout - Sala do Pregoeiro

### 4.1 Estrutura de 3 Colunas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER: Licitação + Status + Etapa Atual + Cronômetro                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────────────┐  ┌──────────────────┐  │
│  │                  │  │                          │  │                  │  │
│  │  PAINEL ESQUERDO │  │     PAINEL CENTRAL       │  │  PAINEL DIREITO  │  │
│  │                  │  │                          │  │                  │  │
│  │  - Lista Itens   │  │  - Item em Disputa       │  │  - Chat          │  │
│  │  - Status cada   │  │  - Ranking de Lances     │  │  - Mensagens     │  │
│  │  - Progresso     │  │  - Gráfico de evolução   │  │  - Atalhos       │  │
│  │                  │  │  - Ações do Pregoeiro    │  │                  │  │
│  │                  │  │                          │  │                  │  │
│  └──────────────────┘  └──────────────────────────┘  └──────────────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ FOOTER: Controles da Sessão (Suspender, Encerrar, Avançar Etapa)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Componentes Detalhados

#### Header (Fixo)
- Logo + Nome do Sistema
- **Número da Licitação** (destaque)
- **Etapa Atual** com badge colorido
- **Cronômetro** grande e visível
- Indicador de fornecedores online
- Botão de configurações

#### Painel Esquerdo - Lista de Itens (25% largura)
- Lista vertical de todos os itens
- Cada item mostra:
  - Número + Descrição resumida
  - Status (🔴 Em Disputa, 🟡 Aguardando, 🟢 Encerrado)
  - Melhor lance atual
  - Quantidade de participantes
- Item em disputa destacado com borda colorida
- Clique para ver detalhes no painel central

#### Painel Central - Área Principal (50% largura)
- **Card do Item em Disputa**
  - Descrição completa
  - Quantidade e unidade
  - Valor de referência (se não sigiloso)
  - Cronômetro específico do item
  - Indicador de tempo aleatório (piscando em vermelho)

- **Ranking de Lances** (Tabela)
  - Posição (1º, 2º, 3º...)
  - Fornecedor (anonimizado até habilitação)
  - Valor unitário
  - Valor total
  - Horário do lance
  - Diferença para o 1º lugar

- **Ações do Pregoeiro** (por etapa)
  - DISPUTA: Encerrar item, Iniciar tempo aleatório
  - NEGOCIACAO: Solicitar redução, Aceitar, Recusar
  - HABILITACAO: Aprovar, Reprovar, Diligência
  - ADJUDICACAO: Adjudicar item

#### Painel Direito - Comunicação (25% largura)
- **Chat da Sessão**
  - Mensagens do sistema (cinza)
  - Mensagens do pregoeiro (azul)
  - Mensagens dos fornecedores (verde)
  - Botão toggle habilitar/desabilitar

- **Mensagens Rápidas**
  - "Aguardem, analisando propostas"
  - "Atenção: tempo aleatório iniciado"
  - "Fornecedor convocado para habilitação"
  - Customizáveis

- **Notificações**
  - Novos lances
  - Fornecedor entrou/saiu
  - Documentos enviados

### 4.3 Footer - Controles da Sessão
- Barra fixa na parte inferior
- Botões de ação principal:
  - **Avançar Etapa** (verde) - muda para próxima etapa
  - **Suspender Sessão** (amarelo) - pausa temporária
  - **Encerrar Sessão** (vermelho) - finaliza

## 5. Novo Layout - Sala do Fornecedor

### 5.1 Estrutura de 2 Colunas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER: Licitação + Minha Posição Geral + Status                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │                                    │  │                              │  │
│  │       PAINEL PRINCIPAL             │  │      PAINEL LATERAL          │  │
│  │                                    │  │                              │  │
│  │  - Item em Disputa (destaque)      │  │  - Meus Lances (histórico)   │  │
│  │  - MINHA POSIÇÃO (grande)          │  │  - Chat                      │  │
│  │  - Campo de Lance                  │  │  - Notificações              │  │
│  │  - Sugestão de lance               │  │                              │  │
│  │  - Ranking (minha posição)         │  │                              │  │
│  │                                    │  │                              │  │
│  └────────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ FOOTER: Lista de Itens (horizontal, scrollável)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Componentes Detalhados

#### Header
- Nome da licitação
- **Minha Posição Geral** (grande, colorido)
  - 🏆 1º Lugar (verde)
  - 🥈 2º Lugar (prata)
  - 🥉 3º Lugar (bronze)
  - ⚠️ Fora do pódio (vermelho)
- Cronômetro
- Status da sessão

#### Painel Principal (70% largura)
- **Card do Item em Disputa**
  - Número + Descrição
  - Quantidade e unidade
  - Valor de referência

- **Minha Posição no Item** (DESTAQUE MÁXIMO)
  - Número grande (1º, 2º, 3º...)
  - Cor indicativa (verde = vencendo, vermelho = perdendo)
  - Diferença para o 1º lugar

- **Campo de Lance**
  - Input grande e claro
  - Valor mínimo permitido (calculado)
  - Botão "ENVIAR LANCE" destacado
  - Sugestão: "Lance sugerido: R$ X.XXX,XX"

- **Ranking Simplificado**
  - Apenas posição + valor
  - Minha linha destacada
  - Máximo 5 posições visíveis

#### Painel Lateral (30% largura)
- **Meus Lances** (histórico)
  - Lista dos meus lances neste item
  - Horário + Valor + Posição na época

- **Chat**
  - Mensagens do pregoeiro (destaque)
  - Mensagens do sistema
  - Campo para enviar mensagem

#### Footer - Lista de Itens
- Barra horizontal com todos os itens
- Cada item mostra:
  - Número
  - Status (ícone colorido)
  - Minha posição naquele item
- Clique para trocar de item

## 6. Regras de Negócio Importantes

### 6.1 Lances
- Lance deve ser **menor** que o melhor lance atual
- Decremento mínimo configurável (ex: R$ 0,01 ou 0,5%)
- Intervalo mínimo entre lances: 3 minutos (Art. 56, §3º)
- Lance não pode ser cancelado após enviado

### 6.2 Tempo
- **Tempo de inatividade**: 10 minutos sem lances → inicia tempo aleatório
- **Tempo aleatório**: 2 a 30 minutos (sorteado pelo sistema)
- **Prorrogação**: cada lance no tempo aleatório prorroga por 2 minutos

### 6.3 Anonimização
- Durante disputa: "Fornecedor XXXX" (4 chars do ID)
- Após habilitação: nome real revelado
- Na ATA: nome real de todos

### 6.4 ME/EPP (LC 123/2006)
- Empate ficto: diferença ≤ 5% do melhor lance
- ME/EPP tem 5 minutos para cobrir
- Se não cobrir, passa para próxima ME/EPP
- Se nenhuma cobrir, mantém classificação original

## 7. Implementação - Prioridades

### Fase 1 - Estrutura Base
1. [ ] Criar novo layout do pregoeiro (3 colunas)
2. [ ] Criar novo layout do fornecedor (2 colunas)
3. [ ] Implementar cronômetro destacado
4. [ ] Implementar indicador de etapa atual

### Fase 2 - Controles de Etapa
1. [ ] Botão "Avançar Etapa" funcional
2. [ ] Ações específicas por etapa
3. [ ] Validações de transição de etapa
4. [ ] Notificações de mudança de etapa

### Fase 3 - UX do Fornecedor
1. [ ] Destaque da posição no ranking
2. [ ] Campo de lance intuitivo
3. [ ] Sugestão de lance automática
4. [ ] Histórico de meus lances

### Fase 4 - Funcionalidades Avançadas
1. [ ] Gráfico de evolução de lances
2. [ ] Exportar ranking para Excel
3. [ ] Notificações sonoras
4. [ ] Modo tela cheia

## 8. Referências

- Lei 14.133/2021 - Nova Lei de Licitações
- IN SEGES/ME nº 73/2022 - Pregão Eletrônico
- Licitações-e (Banco do Brasil) - Referência de UX
- ComprasNet - Referência de funcionalidades
