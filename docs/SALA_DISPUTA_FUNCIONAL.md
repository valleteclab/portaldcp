# Sala de Disputa - Especificação Funcional

## 1. Contexto Legal (Lei 14.133/2021)

### Art. 56 - Modos de Disputa

| Modo | Descrição | Quando Usar |
|------|-----------|-------------|
| **Aberto** | Lances públicos e sucessivos, com prorrogações | Pregão Eletrônico (padrão) |
| **Fechado** | Propostas sigilosas, sem lances | Concorrência, Técnica e Preço |
| **Aberto-Fechado** | Lances abertos + lance final fechado | Quando houver empate técnico |
| **Fechado-Aberto** | Proposta fechada + lances abertos | Casos específicos |

### Art. 56, §3º - Regras do Modo Aberto
- Intervalo mínimo entre lances: **definido no edital** (ex: 3 minutos)
- Tempo de inatividade: **10 minutos** sem lances → inicia tempo aleatório
- Tempo aleatório: **1 a 30 minutos** (sorteado pelo sistema)

---

## 2. Fluxo da Sessão de Disputa

### 2.1 Antes da Disputa (Preparação)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PÁGINA DA LICITAÇÃO                          │
│                                                                 │
│  Status: ACOLHIMENTO_PROPOSTAS → ANALISE_PROPOSTAS              │
│                                                                 │
│  [Botão: Iniciar Sessão de Disputa]                            │
│                                                                 │
│  Verificações automáticas:                                      │
│  ✓ Há propostas recebidas?                                     │
│  ✓ Propostas foram analisadas?                                 │
│  ✓ Há pelo menos 2 fornecedores classificados?                 │
│  ✓ Pregoeiro está designado?                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Durante a Disputa

```
FLUXO POR ITEM (Disputa por Item):

1. Pregoeiro SELECIONA item para disputa
2. Sistema CARREGA propostas classificadas do item
3. Sistema ORDENA por menor preço (ranking inicial)
4. Pregoeiro INICIA disputa do item
5. Fornecedores ENVIAM lances (tempo real)
6. Após 10 min sem lances → TEMPO ALEATÓRIO
7. Sistema SORTEIA tempo (1-30 min)
8. Ao encerrar → RANKING FINAL do item
9. Pregoeiro PASSA para próximo item ou NEGOCIA

FLUXO POR LOTE (Disputa por Lote):
- Mesmo fluxo, mas agrupa itens do lote
- Lance é sobre o VALOR TOTAL do lote
```

### 2.3 Após a Disputa

```
┌─────────────────────────────────────────────────────────────────┐
│  Item encerrado → Pregoeiro tem opções:                         │
│                                                                 │
│  [Negociar] - Solicitar redução ao 1º colocado                 │
│  [Aceitar]  - Aceitar proposta atual                           │
│  [Próximo]  - Ir para próximo item                             │
│                                                                 │
│  Após todos os itens:                                           │
│  [Convocar Habilitação] - Chama vencedores para docs           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Tela do Pregoeiro - Layout Funcional

### 3.1 Estrutura da Tela

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                       │
│ ┌─────────────────┬──────────────────────────┬─────────────────────────────┐│
│ │ Logo + Voltar   │ CRONÔMETRO GRANDE        │ Fornecedores: 5 online     ││
│ │                 │ 08:45 (ou ALEATÓRIO)     │ Conexão: ● Conectado       ││
│ └─────────────────┴──────────────────────────┴─────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────┤
│ BARRA DE INFO: PE 12/2025 - Aquisição de Equipamentos | Etapa: DISPUTA      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌────────────────────────────┐  ┌──────────────────┐│
│  │ LISTA DE ITENS   │  │    ITEM EM DISPUTA         │  │      CHAT        ││
│  │                  │  │                            │  │                  ││
│  │ Item 1 ✓        │  │ Item 3 - Notebook Dell     │  │ [Pregoeiro]      ││
│  │ Item 2 ✓        │  │ Qtd: 50 un                 │  │ Atenção ao prazo ││
│  │ Item 3 ⚡       │  │ Ref: R$ 4.500,00           │  │                  ││
│  │ Item 4 ○        │  │                            │  │ [Fornecedor A]   ││
│  │ Item 5 ○        │  │ ┌────────────────────────┐ │  │ Lance enviado    ││
│  │                  │  │ │ RANKING DE LANCES     │ │  │                  ││
│  │ ✓ = Encerrado   │  │ │                        │ │  │ [Sistema]        ││
│  │ ⚡ = Em disputa  │  │ │ 1º Forn A  R$ 4.200   │ │  │ Novo lance       ││
│  │ ○ = Aguardando  │  │ │ 2º Forn B  R$ 4.350   │ │  │                  ││
│  │                  │  │ │ 3º Forn C  R$ 4.400   │ │  │                  ││
│  │                  │  │ └────────────────────────┘ │  │                  ││
│  │                  │  │                            │  │ [Input mensagem] ││
│  └──────────────────┘  └────────────────────────────┘  └──────────────────┘│
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BARRA DE AÇÕES                                                              │
│ [Iniciar Item] [Encerrar Item] [Negociar] | [Suspender] [Encerrar Sessão]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Estados do Item

| Estado | Cor | Descrição |
|--------|-----|-----------|
| `AGUARDANDO` | Cinza ○ | Ainda não iniciou disputa |
| `EM_DISPUTA` | Amarelo ⚡ | Disputa em andamento |
| `TEMPO_ALEATORIO` | Vermelho 🔴 | Tempo aleatório ativo |
| `ENCERRADO` | Verde ✓ | Disputa finalizada |
| `NEGOCIACAO` | Azul 🤝 | Em negociação com vencedor |
| `ADJUDICADO` | Verde ✓✓ | Item adjudicado |

### 3.3 Ações do Pregoeiro

| Ação | Quando Disponível | O que faz |
|------|-------------------|-----------|
| **Iniciar Item** | Item em AGUARDANDO | Abre disputa para lances |
| **Encerrar Item** | Item em EM_DISPUTA | Inicia tempo aleatório |
| **Negociar** | Item ENCERRADO | Abre chat privado com 1º |
| **Aceitar** | Após negociação | Aceita proposta final |
| **Desclassificar** | Qualquer momento | Remove fornecedor do item |
| **Suspender** | Qualquer momento | Pausa toda a sessão |
| **Encerrar Sessão** | Todos itens encerrados | Finaliza e gera ATA |

---

## 4. Tela do Fornecedor - Layout Funcional

### 4.1 Estrutura da Tela

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                       │
│ ┌─────────────────┬──────────────────────────┬─────────────────────────────┐│
│ │ Logo + Voltar   │ MINHA POSIÇÃO: 2º LUGAR  │ Conexão: ● Conectado       ││
│ │                 │ (diferença: R$ 150,00)   │                            ││
│ └─────────────────┴──────────────────────────┴─────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────┤
│ BARRA DE INFO: PE 12/2025 - Aquisição de Equipamentos | Tempo: 08:45        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────┐  ┌────────────────────────┐│
│  │         ITEM EM DISPUTA                    │  │        CHAT            ││
│  │                                            │  │                        ││
│  │  Item 3 - Notebook Dell Latitude 5520     │  │ [Pregoeiro]            ││
│  │  Quantidade: 50 unidades                   │  │ Atenção, 5 min         ││
│  │  Valor de Referência: R$ 4.500,00          │  │ restantes              ││
│  │                                            │  │                        ││
│  │  ┌──────────────────────────────────────┐ │  │ [Sistema]              ││
│  │  │ MINHA POSIÇÃO                        │ │  │ Novo lance recebido    ││
│  │  │                                      │ │  │                        ││
│  │  │        🥈 2º LUGAR                   │ │  │                        ││
│  │  │                                      │ │  │                        ││
│  │  │  Meu lance: R$ 4.350,00              │ │  │                        ││
│  │  │  Melhor lance: R$ 4.200,00           │ │  │                        ││
│  │  │  Diferença: R$ 150,00                │ │  │                        ││
│  │  └──────────────────────────────────────┘ │  │                        ││
│  │                                            │  │                        ││
│  │  ┌──────────────────────────────────────┐ │  │                        ││
│  │  │ ENVIAR LANCE                         │ │  │                        ││
│  │  │                                      │ │  │                        ││
│  │  │  Valor: [R$ ________]  [ENVIAR]     │ │  │ [Input mensagem]       ││
│  │  │                                      │ │  │                        ││
│  │  │  Mínimo permitido: R$ 4.199,99       │ │  │                        ││
│  │  │  Sugestão: R$ 4.150,00 (-R$ 50)     │ │  │                        ││
│  │  └──────────────────────────────────────┘ │  │                        ││
│  │                                            │  │                        ││
│  │  RANKING (anonimizado)                    │  │                        ││
│  │  1º Fornecedor A - R$ 4.200,00           │  │                        ││
│  │  2º EU (destaque) - R$ 4.350,00          │  │                        ││
│  │  3º Fornecedor C - R$ 4.400,00           │  │                        ││
│  └────────────────────────────────────────────┘  └────────────────────────┘│
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ MEUS ITENS: [Item 1 ✓ 3º] [Item 2 ✓ 1º] [Item 3 ⚡ 2º] [Item 4 ○] [Item 5 ○]│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Informações Críticas para o Fornecedor

1. **Minha Posição** - DESTAQUE MÁXIMO
   - 🥇 1º Lugar (verde) - "Você está vencendo!"
   - 🥈 2º Lugar (amarelo) - "Você está em 2º"
   - 🥉 3º Lugar (laranja) - "Você está em 3º"
   - ❌ Fora (vermelho) - "Você está fora do pódio"

2. **Diferença para o 1º** - Quanto precisa reduzir

3. **Lance Mínimo** - Calculado automaticamente
   - Melhor lance atual - decremento mínimo

4. **Sugestão de Lance** - Ajuda o fornecedor
   - Melhor lance - valor arredondado

---

## 5. Tipos de Disputa (Lei 14.133/2021, Art. 56)

### 5.0 Como o Sistema Determina o Tipo de Disputa

```
┌─────────────────────────────────────────────────────────────────┐
│  LICITAÇÃO (configuração)                                       │
│                                                                 │
│  usa_lotes = false  →  DISPUTA POR ITEM                        │
│  usa_lotes = true   →  DISPUTA POR LOTE                        │
│                                                                 │
│  modo_disputa = ABERTO         →  Lances sucessivos            │
│  modo_disputa = FECHADO        →  Proposta única               │
│  modo_disputa = ABERTO_FECHADO →  Lances + lance final fechado │
│  modo_disputa = FECHADO_ABERTO →  Proposta + lances            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  SESSÃO (herda da licitação)                                    │
│                                                                 │
│  disputa_por_item = true   →  Cada item tem cronômetro próprio │
│  disputa_por_item = false  →  Cada lote tem cronômetro próprio │
│                                                                 │
│  modo_aberto = true        →  Aceita lances em tempo real      │
│  modo_aberto = false       →  Apenas propostas fechadas        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.1 Pregão Eletrônico - Disputa POR ITEM (Modo Aberto)

```
CONFIGURAÇÃO:
- usa_lotes: false
- modo_disputa: ABERTO
- Tempo inatividade: 10 minutos
- Tempo aleatório: 1-30 minutos
- Intervalo entre lances: 3 minutos (ou conforme edital)

COMPORTAMENTO:
- Cada item tem seu próprio cronômetro
- Fornecedor pode dar lance em qualquer item em disputa
- Itens encerram independentemente

FLUXO:
1. Pregoeiro clica "Iniciar Disputa (Todos os Itens)"
2. TODOS os itens entram em disputa simultaneamente
3. Cada item tem seu cronômetro de 10 minutos
4. Fornecedores enviam lances para qualquer item
5. Item sem lance por 10 min → tempo aleatório DAQUELE item
6. Tempo aleatório acaba → item encerra
7. Outros itens continuam em disputa
8. Ao final → convoca habilitação do 1º de cada item
```

### 5.2 Pregão Eletrônico - Disputa POR LOTE (Modo Aberto)

```
CONFIGURAÇÃO:
- usa_lotes: true
- modo_disputa: ABERTO
- Lotes definidos na licitação

COMPORTAMENTO:
- Cada LOTE tem seu próprio cronômetro
- Lance é sobre o VALOR TOTAL do lote
- Todos os itens do lote são disputados juntos
- Vencedor do lote leva todos os itens

FLUXO:
1. Pregoeiro clica "Iniciar Disputa (Todos os Lotes)"
2. TODOS os lotes entram em disputa simultaneamente
3. Cada lote tem seu cronômetro de 10 minutos
4. Fornecedores enviam lances para qualquer lote
5. Lote sem lance por 10 min → tempo aleatório DAQUELE lote
6. Tempo aleatório acaba → lote encerra
7. Outros lotes continuam em disputa
8. Ao final → convoca habilitação do 1º de cada lote
```

### 5.2 Pregão com Cota ME/EPP (LC 123/2006)

```
CONFIGURAÇÃO:
- Cota exclusiva ME/EPP: até R$ 80.000,00
- Cota reservada: 25% para ME/EPP
- Empate ficto: diferença ≤ 5%

FLUXO ADICIONAL:
1. Após encerrar disputa de item com cota
2. Se vencedor NÃO é ME/EPP
3. Sistema verifica empate ficto (≤ 5%)
4. Se houver ME/EPP em empate ficto:
   - Sistema notifica ME/EPP
   - ME/EPP tem 5 minutos para cobrir
   - Se cobrir → vence
   - Se não → mantém classificação
```

### 5.3 Concorrência Eletrônica (Modo Fechado)

```
CONFIGURAÇÃO:
- Modo: FECHADO
- Sem lances em tempo real
- Propostas sigilosas até abertura

FLUXO:
1. Pregoeiro abre sessão
2. Sistema revela propostas (antes sigilosas)
3. Ranking automático por menor preço
4. Pregoeiro pode negociar com 1º
5. Não há fase de lances
6. Vai direto para habilitação
```

### 5.4 Concorrência Técnica e Preço

```
CONFIGURAÇÃO:
- Modo: FECHADO ou ABERTO-FECHADO
- Critério: TECNICA_E_PRECO
- Peso técnica: 70%
- Peso preço: 30%

FLUXO:
1. Fase técnica (avaliação de propostas técnicas)
2. Fase preço (abertura de propostas de preço)
3. Cálculo da nota final:
   - Nota = (Nota Técnica × 0.7) + (Nota Preço × 0.3)
4. Ranking por nota final
5. Habilitação do 1º colocado
```

### 5.5 Disputa por Lote

```
CONFIGURAÇÃO:
- Disputa: POR_LOTE
- Lote agrupa múltiplos itens

DIFERENÇAS:
- Lance é sobre VALOR TOTAL do lote
- Fornecedor deve cotar TODOS os itens do lote
- Ranking considera soma dos valores
- Vencedor leva todos os itens do lote
```

---

## 6. Regras de Negócio Críticas

### 6.1 Validação de Lances

```typescript
function validarLance(lance: number, item: Item, fornecedor: Fornecedor): boolean {
  // 1. Lance deve ser menor que o melhor lance atual
  if (lance >= item.melhorLance) {
    return false; // "Lance deve ser menor que R$ X"
  }
  
  // 2. Respeitar decremento mínimo
  const decrementoMinimo = item.decrementoMinimo || 0.01;
  if (item.melhorLance - lance < decrementoMinimo) {
    return false; // "Decremento mínimo é R$ X"
  }
  
  // 3. Lance não pode ser menor que o próprio lance anterior
  // (evita erro de digitação)
  if (lance < fornecedor.ultimoLance * 0.5) {
    return false; // "Lance muito abaixo do seu anterior. Confirmar?"
  }
  
  // 4. Verificar intervalo entre lances (se configurado)
  const intervaloMinimo = item.intervaloEntrelances || 0;
  const tempoDesdeUltimoLance = Date.now() - fornecedor.ultimoLanceTimestamp;
  if (tempoDesdeUltimoLance < intervaloMinimo * 1000) {
    return false; // "Aguarde X segundos entre lances"
  }
  
  return true;
}
```

### 6.2 Tempo Aleatório

```typescript
function iniciarTempoAleatorio(item: Item): void {
  // Sortear tempo entre 1 e 30 minutos
  const tempoAleatorio = Math.floor(Math.random() * 30) + 1;
  
  // NÃO revelar o tempo aos participantes
  item.tempoAleatorioSegundos = tempoAleatorio * 60;
  item.emTempoAleatorio = true;
  
  // Notificar participantes (sem revelar tempo)
  broadcast('tempo_aleatorio_iniciado', {
    itemId: item.id,
    mensagem: 'Tempo aleatório iniciado. O item pode encerrar a qualquer momento.'
  });
}
```

### 6.3 Anonimização

```typescript
function anonimizarFornecedor(fornecedor: Fornecedor, etapa: EtapaSessao): string {
  const etapasReveladas = [
    'CONVOCACAO_HABILITACAO',
    'ANALISE_HABILITACAO', 
    'INTENCAO_RECURSO',
    'PRAZO_RECURSAL',
    'ANALISE_RECURSOS',
    'ADJUDICACAO',
    'ENCERRAMENTO'
  ];
  
  if (etapasReveladas.includes(etapa)) {
    return fornecedor.razaoSocial; // Nome real
  }
  
  // Durante disputa: anonimizar
  return `Fornecedor ${fornecedor.id.substring(0, 4).toUpperCase()}`;
}
```

---

## 7. Eventos WebSocket

### 7.1 Eventos do Servidor → Cliente

| Evento | Payload | Descrição |
|--------|---------|-----------|
| `sessao_iniciada` | `{ sessaoId, itens }` | Sessão foi aberta |
| `item_iniciado` | `{ itemId, propostas }` | Disputa do item começou |
| `novo_lance` | `{ itemId, posicao, valor, fornecedor }` | Lance recebido |
| `ranking_atualizado` | `{ itemId, ranking[] }` | Ranking mudou |
| `tempo_aleatorio_iniciado` | `{ itemId }` | Tempo aleatório começou |
| `item_encerrado` | `{ itemId, ranking[] }` | Disputa do item terminou |
| `nova_mensagem` | `{ remetente, mensagem, horario }` | Mensagem no chat |
| `sessao_suspensa` | `{ motivo }` | Sessão foi suspensa |
| `sessao_encerrada` | `{ }` | Sessão foi encerrada |
| `fornecedor_conectou` | `{ total }` | Fornecedor entrou |
| `fornecedor_desconectou` | `{ total }` | Fornecedor saiu |

### 7.2 Eventos do Cliente → Servidor

| Evento | Payload | Quem envia |
|--------|---------|------------|
| `entrar_sessao` | `{ sessaoId, fornecedorId }` | Fornecedor |
| `enviar_lance` | `{ itemId, valor }` | Fornecedor |
| `mensagem_chat` | `{ mensagem }` | Ambos |
| `iniciar_item` | `{ itemId }` | Pregoeiro |
| `encerrar_item` | `{ itemId }` | Pregoeiro |
| `suspender_sessao` | `{ motivo }` | Pregoeiro |
| `encerrar_sessao` | `{ }` | Pregoeiro |

---

## 8. Checklist de Implementação

### 8.1 Backend

- [ ] Endpoint para criar sessão de disputa
- [ ] Endpoint para listar itens da sessão com propostas
- [ ] WebSocket gateway com todos os eventos
- [ ] Validação de lances (regras de negócio)
- [ ] Controle de tempo (inatividade + aleatório)
- [ ] Persistência de todos os eventos (para ATA)
- [ ] Cálculo de ranking em tempo real
- [ ] Suporte a ME/EPP (empate ficto)

### 8.2 Frontend - Pregoeiro

- [ ] Header com cronômetro destacado
- [ ] Lista de itens com status visual
- [ ] Painel do item em disputa com ranking
- [ ] Chat com mensagens rápidas
- [ ] Botões de ação contextuais
- [ ] Indicador de fornecedores online
- [ ] Alerta de tempo aleatório

### 8.3 Frontend - Fornecedor

- [ ] Destaque da posição no ranking
- [ ] Campo de lance com validação
- [ ] Sugestão de lance automática
- [ ] Histórico de meus lances
- [ ] Chat com pregoeiro
- [ ] Lista de itens com minha posição
- [ ] Notificações sonoras

---

## 9. Referências

- **Lei 14.133/2021** - Nova Lei de Licitações
- **IN SEGES/ME nº 73/2022** - Pregão Eletrônico
- **ComprasNet** - Sistema do Governo Federal
- **Licitações-e** - Sistema do Banco do Brasil
- **BEC/SP** - Bolsa Eletrônica de Compras de SP
