# QA Tester visual (RPA) — Portal DCP

Um robô que **abre um navegador de verdade na sua tela** e executa o fluxo
como um usuário: você vê cada clique, com um banner narrando o passo atual.
Onde um clique falhar, ele **pede a sua ajuda**: você faz a ação manualmente
no navegador e aperta ENTER no terminal — o robô continua de onde parou
(e o relatório marca o passo como "assistido", ótimo para achar atritos de UX).

## Como usar

```bash
cd qa-tester
npm run setup        # 1ª vez: instala playwright + chromium
copy .env.example .env
# edite o .env com a URL do ambiente e as credenciais do órgão de teste
npm run dispensa     # roda o fluxo da dispensa (Fase 0 → copiloto)
```

## O que o fluxo `dispensa` cobre hoje

1. Login do órgão (`/orgao-login`)
2. Nova demanda (setor + descrição do objeto)
3. Item da demanda pelo catálogo (busca "cadeira", 20 un × R$ 850)
4. Enviar DFD → aprovar na tela de Aprovações
5. **Iniciar contratação** com o 🤖 copiloto marcado (Dispensa Eletrônica)
6. Acompanhar a preparação automática no cockpit (pesquisa de preços real +
   rascunhos IA) até o card verde "revise os itens sugeridos"

Ao final: relatório no terminal (passos automáticos × assistidos × falhas) e
screenshots de cada passo em `qa-tester/screenshots/`.

## Dicas

- `SLOWMO` no `.env` controla a velocidade (400ms é bom para acompanhar;
  100 para rodar rápido).
- Rode contra o **ambiente de testes** (Railway) — o robô cria dados reais
  (demanda, processo, documentos).
- Passos "assistidos" são feedback de UX: se o robô não achou o botão,
  talvez um usuário novo também não ache.
