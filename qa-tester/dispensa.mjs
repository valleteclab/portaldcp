/**
 * QA TESTER VISUAL — Fluxo da dispensa, Fase 0 → copiloto.
 * Abre um navegador REAL na sua tela e trabalha como um usuário:
 *   login do órgão → nova demanda → item → enviar DFD → aprovar →
 *   iniciar contratação (com copiloto) → acompanhar a preparação no cockpit.
 * Onde um clique falhar, ele PEDE SUA AJUDA (faz você a ação e aperta ENTER).
 *
 * Rodar:  cd qa-tester && npm run setup (1ª vez) && npm run dispensa
 */
import { chromium } from 'playwright'
import { loadEnv, Narrador, clicarPrimeiro } from './lib.mjs'

const env = loadEnv()
const OBJETO = `QA-ROBO ${new Date().toLocaleString('pt-BR')} — aquisição de cadeiras ergonômicas para o setor administrativo`

// Usa o navegador que já existe na máquina (Chrome → Edge → Chromium baixado);
// assim o robô roda sem depender do download do Playwright.
async function abrirNavegador() {
  const opts = { headless: false, slowMo: env.slowMo }
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch({ ...opts, ...(channel ? { channel } : {}) })
    } catch { /* tenta o próximo */ }
  }
  throw new Error('Nenhum navegador encontrado — rode: npx playwright install chromium')
}
const browser = await abrirNavegador()
const context = await browser.newContext({ viewport: { width: 1440, height: 860 } })
const page = await context.newPage()
const qa = new Narrador(page, 'dispensa')

console.log('🤖 QA Tester do Portal DCP — acompanhe o navegador que acabou de abrir.')

await qa.passo('Login do órgão', async () => {
  await page.goto(`${env.url}/orgao-login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(env.orgaoEmail)
  await page.locator('input[type="password"]').fill(env.orgaoSenha)
  await clicarPrimeiro(page, [page.getByRole('button', { name: /entrar/i })])
  await page.waitForURL(/\/orgao(\/|$)/, { timeout: 20000 })
})

await qa.passo('Abrir Demandas e criar nova demanda', async () => {
  await page.goto(`${env.url}/orgao/demandas`, { waitUntil: 'domcontentloaded' })
  await clicarPrimeiro(page, [page.getByRole('button', { name: /nova demanda/i })])
  // Modal: setor requisitante (texto livre) + descrição
  const inputSetor = page.getByPlaceholder(/departamento de ti/i)
  await inputSetor.waitFor({ state: 'visible', timeout: 8000 })
  await inputSetor.fill('Setor de Testes QA')
  const desc = page.getByPlaceholder(/aquisição de notebooks/i)
  if (await desc.isVisible().catch(() => false)) await desc.fill(OBJETO)
  await clicarPrimeiro(page, [
    page.getByRole('button', { name: /^criar/i }),
    page.getByRole('button', { name: /salvar/i }),
  ])
  await page.waitForTimeout(1500)
})

await qa.passo('Abrir a demanda criada', async () => {
  // Se o modal já navegou para a demanda, ótimo; senão clica na primeira da lista
  if (!/\/orgao\/demandas\/[0-9a-f-]{36}/.test(page.url())) {
    await clicarPrimeiro(page, [
      page.getByText('Setor de Testes QA').first(),
      page.locator('a[href*="/orgao/demandas/"]').first(),
    ])
  }
  await page.waitForURL(/\/orgao\/demandas\/[0-9a-f-]{36}/, { timeout: 15000 })
})

await qa.passo('Garantir descrição do objeto', async () => {
  const area = page.locator('textarea').first()
  await area.waitFor({ state: 'visible', timeout: 8000 })
  const atual = await area.inputValue()
  if (!atual || atual.trim().length < 10) {
    await area.fill(OBJETO)
    await area.blur()
    await page.waitForTimeout(1200)
  }
})

await qa.passo('Adicionar um item à demanda (catálogo)', async () => {
  await clicarPrimeiro(page, [
    page.getByRole('button', { name: /adicionar item/i }),
    page.getByRole('button', { name: /adicionar/i }),
  ])
  // Busca no catálogo
  const busca = page.locator('input[placeholder*="usca" i], input[type="search"]').last()
  await busca.waitFor({ state: 'visible', timeout: 8000 })
  await busca.fill('cadeira')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3500)
  // Seleciona o primeiro resultado
  await clicarPrimeiro(page, [
    page.getByRole('button', { name: /selecionar|usar|escolher/i }).first(),
    page.locator('[class*="cursor-pointer"]').filter({ hasText: /cadeira/i }).first(),
  ], 6000)
  // Formulário do item: quantidade e valor
  const numeros = page.locator('input[type="number"]')
  const qtd = numeros.first()
  await qtd.waitFor({ state: 'visible', timeout: 8000 })
  await qtd.fill('20')
  if ((await numeros.count()) > 1) await numeros.nth(1).fill('850')
  await clicarPrimeiro(page, [
    page.getByRole('button', { name: /adicionar à demanda|confirmar|adicionar$/i }).last(),
  ])
  await page.waitForTimeout(1500)
})

await qa.passo('Enviar DFD para aprovação', async () => {
  await clicarPrimeiro(page, [page.getByRole('button', { name: /enviar dfd/i })])
  await page.waitForTimeout(1500)
})

const urlDemanda = page.url()

await qa.passo('Aprovar a demanda (tela de Aprovações)', async () => {
  await page.goto(`${env.url}/orgao/aprovacoes`, { waitUntil: 'domcontentloaded' })
  // Encontra o card da nossa demanda e aprova
  await clicarPrimeiro(page, [
    page.getByText('Setor de Testes QA').first(),
    page.getByText(/QA-ROBO/).first(),
  ], 8000).catch(() => { /* pode já listar botões direto */ })
  await clicarPrimeiro(page, [page.getByRole('button', { name: /^aprovar/i }).first()], 8000)
  await page.waitForTimeout(1500)
})

await qa.passo('Iniciar contratação com o COPILOTO', async () => {
  await page.goto(urlDemanda, { waitUntil: 'domcontentloaded' })
  await clicarPrimeiro(page, [page.getByRole('button', { name: /iniciar contratação/i })], 10000)
  // Modal: Dispensa Eletrônica já vem sugerida; garante o copiloto marcado
  await page.waitForTimeout(800)
  const checkbox = page.locator('label:has-text("copiloto") input[type="checkbox"]')
  if (await checkbox.isVisible().catch(() => false)) {
    if (!(await checkbox.isChecked())) await checkbox.check()
  }
  await clicarPrimeiro(page, [page.getByRole('button', { name: /criar processo/i })])
  await page.waitForURL(/\/orgao\/processos\/[0-9a-f-]{36}/, { timeout: 30000 })
})

await qa.passo('Acompanhar o copiloto no cockpit (até 6 min)', async () => {
  await qa.banner('🤖 Copiloto trabalhando — pesquisa de preços no PNCP + rascunhos IA…', '#0c6b3d')
  const fim = Date.now() + 6 * 60 * 1000
  while (Date.now() < fim) {
    const concluido = await page
      .getByText(/preparado pelo copiloto|revise os itens sugeridos/i)
      .first()
      .isVisible()
      .catch(() => false)
    if (concluido) return
    const erro = await page.getByText(/preparação automática falhou/i).first().isVisible().catch(() => false)
    if (erro) throw new Error('copiloto reportou ERRO no cockpit')
    await page.waitForTimeout(5000)
  }
  throw new Error('copiloto não concluiu em 6 minutos (pode ainda estar rodando — veja o cockpit)')
})

await qa.passo('Conferir a instrução do art. 72 (checklist)', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(/instrução do processo/i).first().waitFor({ timeout: 10000 })
})

qa.relatorio()
await qa.banner('🏁 QA Tester concluiu — veja o relatório no terminal', '#0c6b3d')
console.log('\nO navegador fica ABERTO para você inspecionar. Feche-o (ou Ctrl+C) quando terminar.')
