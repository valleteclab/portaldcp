# Portal DCP — Instruções para o Claude

## Fluxo de desenvolvimento

- Branch de trabalho: sempre desenvolver na branch designada pela sessão (ex: `claude/...`)
- Após cada `git push`, **sempre criar a PR automaticamente** para o repositório `valleteclab/portaldcp` com base `main`
- A PR deve ter título descritivo, resumo das mudanças e plano de testes

## Convenções do projeto

- Frontend: Next.js 16 + React 19 + TypeScript, em `frontend/`
- Backend: NestJS + TypeORM, em `backend/`
- Commits em português com mensagens descritivas
- Não usar empenho/empenhos — o sistema não realiza empenhos; usar "solicitado/solicitação"
