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

## Módulos: toda funcionalidade nova tem que poder ser desligada

Cada órgão contrata o que usa, e tela que o cliente não contratou não pode
aparecer para ele. Funcionalidade nova **nasce** atrás de um módulo — não se
deixa para depois.

Ao criar um conjunto novo de telas, os quatro passos são obrigatórios:

1. **Enum do backend** — valor novo em `backend/src/orgaos/enums/modulos.enum.ts`,
   com o rótulo em `MODULOS_DESCRICAO`.
2. **Enum do frontend** — o mesmo valor em `frontend/src/hooks/useModulosOrgao.ts`
   (tipo, constante e `MODULOS_INFO`). São duas listas separadas; esquecer uma
   quebra o build ou deixa o menu sem trava.
3. **Admin** — entrada em `frontend/src/app/admin/modulos/page.tsx`, senão
   ninguém consegue ligar ou desligar para o cliente.
4. **As duas travas** — `modulo:` no item do menu
   (`frontend/src/components/layout/navigation.tsx`) **e**
   `@RequireModule(...)` no controller. Só o menu não basta: a rota continua
   aberta para quem souber a URL.

Acesso efetivo = módulos do órgão ∩ módulos do usuário (`modulo.guard.ts`).
Usuário sem lista própria herda tudo do órgão — por isso um módulo faltando
fica visível para a maioria das pessoas, não para a minoria.
