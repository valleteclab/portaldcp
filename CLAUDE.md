# Portal DCP — Instruções para o Claude

## Fluxo de desenvolvimento

- Branch de trabalho: sempre desenvolver na branch designada pela sessão (ex: `claude/...`)
- Após cada `git push`, **sempre criar a PR automaticamente** para o repositório `valleteclab/portaldcp` com base `main`
- A PR deve ter título descritivo, resumo das mudanças e plano de testes

## Deploy: dois ambientes, dois branches

| Branch | Vai para | Como |
|---|---|---|
| `main` | Railway (`www.portaldcp.com.br`) — homologação | automático a cada merge |
| `producao` | VPS (`compras.cmlem.ba.gov.br`) — a Câmara | `bash deploy-vps.sh`, só quando o dono mandar |

**Nada chega à VPS sem passar pelo Railway e ser promovido para `producao`.**
O `main` recebe tudo que se desenvolve, validado ou não; por isso nunca sobe
direto para a VPS. O `deploy-vps.sh` usa `producao` por padrão e **recusa**
`BRANCH=main` sem `CONFIRMO_MAIN=sim`.

Promover = levar para `producao` só o que o dono validou no Railway. Antes de
qualquer deploy, conferir o que vai junto
(`git log --oneline <HEAD da VPS>..origin/producao`) — o próprio script mostra
essa lista antes de subir.

Por que existe: em 04/10/2026 um deploy do `main` levou de uma vez 204 commits
não validados — onze dias de trabalho de várias frentes — para a produção da
Câmara.

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
