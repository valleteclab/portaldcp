# Agente Autônomo de Contratos

Módulo do PortalDCP que automatiza a gestão de contratos através de um ciclo diário de busca, importação e extração de itens.

## Funcionalidades

- **Busca Automática**: Busca contratos no Portal da Transparência diariamente
- **Download de PDF**: Baixa automaticamente o PDF do contrato
- **Extração via IA**: Extrai itens do PDF usando OpenAI
- **Importação Completa**: Cadastra contrato + itens no sistema
- **Logs Detalhados**: Registra todas as ações do agente

## Ciclo Diário

```
06:00 - Executa automaticamente (Cron job)
    ↓
Busca contratos vigentes no Portal da Transparência
    ↓
Para cada contrato novo:
    → Importa fornecedor
    → Cadastra contrato
    → Baixa PDF
    → Extrai itens via IA
    → Cria itens no cronograma
    → Log de sucesso
```

## API Endpoints

### Executar ciclo manualmente
```bash
POST /api/agente-contratos/executar
Body: { "orgao_id": "uuid-do-orgao" }
```

### Consultar logs
```bash
GET /api/agente-contratos/logs?orgao_id=uuid&limite=50
```

### Estatísticas
```bash
GET /api/agente-contratos/estatisticas?orgao_id=uuid
```

## Estrutura de Arquivos

```
backend/src/agente-contratos/
├── agente-contratos.module.ts          # Módulo NestJS
├── agente-contratos.service.ts         # Orquestrador principal
├── agente-contratos.scheduler.ts       # Agendador Cron
├── agente-contratos.controller.ts      # API REST
├── entities/
│   └── agente-log.entity.ts            # Entidade de logs
├── dto/                                 # DTOs (futuro)
└── services/                            # Serviços auxiliares (futuro)
```

## Configuração

### Variáveis de Ambiente
```bash
# ID do órgão padrão para execução automática
AGENTE_ORGAO_ID=uuid-do-orgao-padrao
```

### Agendamento
- **Ciclo Diário**: Todos os dias às 06:00 (timezone: America/Sao_Paulo)
- **Monitoramento**: A cada hora (placeholder para futuras funcionalidades)

## Banco de Dados

Tabela: `agente_logs`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | ID único |
| tipo_acao | varchar | Tipo: BUSCA_PORTAL, IMPORTACAO_CONTRATO, etc. |
| orgao_id | varchar | ID do órgão |
| contrato_numero | varchar | Número do contrato |
| contrato_id | uuid | ID do contrato no sistema |
| status | varchar | SUCESSO, ERRO, PENDENTE |
| mensagem | text | Mensagem descritiva |
| detalhes | jsonb | Dados adicionais |
| created_at | timestamptz | Data de criação |

## Reaproveitamento de Código

O agente reaproveita serviços existentes:

- `PortalTransparenciaService` - Busca e importação de contratos
- `ImportarContratoIaService` - Extração de itens via IA
- `MedicaoService` - Criação de itens no cronograma
- `FornecedoresService` - Cadastro de fornecedores
- `NotificacoesService` - Notificações (futuro)

## Próximas Fases (Roadmap)

- **Fase 2**: Análise de pendências e notificação de gestores
- **Fase 3**: Monitoramento de NFs/medições e cobrança automática
- **Fase 4**: Validação de medições e envio para aprovação
- **Fase 5**: Dashboard e relatórios do agente

## Testes

```bash
# Executar ciclo manualmente
curl -X POST https://seu-dominio/api/agente-contratos/executar \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orgao_id": "seu-orgao-uuid"}'
```
