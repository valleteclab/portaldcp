/**
 * Fuso do processo. As datas do sistema são gravadas e lidas como hora de parede
 * (colunas `timestamp` sem fuso, formatadas com getHours): só fecham se o Node
 * rodar no horário de Brasília. Na VPS isso vem do docker-compose; no Railway
 * dependia de uma variável configurada à mão — sem ela, o detalhe da licitação
 * do fornecedor mostrava a abertura 3 h adiantada (ensaio de 08/11/2026).
 * Este arquivo é o PRIMEIRO import do main.ts.
 */
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
