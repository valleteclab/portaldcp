/**
 * QA TESTER VISUAL — Fluxo da dispensa, Fase 0 → copiloto.
 * Abre um navegador REAL na sua tela e trabalha como um usuário:
 *   login do órgão → nova demanda → item → enviar DFD → aprovar →
 *   iniciar contratação (com copiloto) → acompanhar a preparação no cockpit.
 *
 * ESTADO-ADAPTATIVO: cada passo confere o estado da tela (ex.: demanda já
 * aprovada não tem edição) e se marca como ⏭️ pulado quando não se aplica.
 * Onde um clique falhar de verdade, ele PEDE SUA AJUDA (você faz e dá ENTER).
 *
 * Rodar:  cd qa-tester && npm run setup (1ª vez) && npm run dispensa
 */
import { chromium } from 'playwright'
import { loadEnv, Narrador, clicarPrimeiro } from './lib.mjs'

const env = loadEnv()
const SETOR = `Setor QA ${Date.now().toString().slice(-5)}`
const OBJETO = `QA-ROBO — aquisição de cadeiras ergonômicas para o ${SETOR}`

// Usa o navegador que já existe na máquina (Chrome → Edge → Chromium baixado)
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

/** Chama a API do portal COM O TOKEN DA SESSÃO logada (fallback confiável). */
async function api(caminho) {
  return page.evaluate(async (caminho) => {
    const token = localStorage.getItem('access_token') || localStorage.getItem('orgao_token')
    const res = await fetch(`/api${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.ok ? res.json() : null
  }, caminho)
}

/** Status atual da demanda aberta (badge do cabeçalho). */
async function statusDemanda() {
  for (const s of ['Rascunho', 'Enviada', 'Em Análise', 'Aprovada', 'Consolidada', 'Rejeitada']) {
    if (await page.getByText(s, { exact: true }).first().isVisible().catch(() => false)) return s.toUpperCase()
  }
  return null
}

console.log('🤖 QA Tester do Portal DCP — acompanhe o navegador que acabou de abrir.')

await qa.passo('Login do órgão', async () => {
  await page.goto(`${env.url}/orgao-login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(env.orgaoEmail)
  await page.locator('input[type="password"]').fill(env.orgaoSenha)
  await clicarPrimeiro(page, [page.getByRole('button', { name: /entrar/i })])
  await page.waitForURL(/\/orgao(\/|$)/, { timeout: 20000 })
})

await qa.passo('Criar nova demanda (o modal navega para ela)', async () => {
  await page.goto(`${env.url}/orgao/demandas`, { waitUntil: 'domcontentloaded' })
  await clicarPrimeiro(page, [page.getByRole('button', { name: /nova demanda/i })])
  const inputSetor = page.getByPlaceholder(/departamento de ti/i)
  await inputSetor.waitFor({ state: 'visible', timeout: 8000 })
  await inputSetor.fill(SETOR)
  const desc = page.getByPlaceholder(/aquisição de notebooks/i)
  if (await desc.isVisible().catch(() => false)) await desc.fill(OBJETO)
  await clicarPrimeiro(page, [
    page.getByRole('button', { name: 'Criar Demanda' }),
    page.getByRole('button', { name: /criar demanda/i }),
  ])
  // Ao criar, a tela navega direto para a demanda
  await page.waitForURL(/\/orgao\/demandas\/[0-9a-f-]{36}/, { timeout: 20000 })
})

await qa.passo('Garantir que estamos na demanda certa', async () => {
  if (/\/orgao\/demandas\/[0-9a-f-]{36}/.test(page.url())) return
  // Fallback confiável: acha a demanda pela API usando o token da sessão
  const orgao = await page.evaluate(() => JSON.parse(localStorage.getItem('orgao') || '{}'))
  const lista = await api(`/demandas?orgaoId=${orgao?.id || ''}`)
  const minha = (Array.isArray(lista) ? lista : lista?.data || []).find(
    (d) => d.unidade_requisitante === SETOR,
  )
  if (!minha) throw new Error('demanda criada não foi encontrada na lista')
  await page.goto(`${env.url}/orgao/demandas/${minha.id}`, { waitUntil: 'domcontentloaded' })
})

const urlDemanda = () => page.url().match(/\/orgao\/demandas\/[0-9a-f-]{36}/) ? page.url() : null

await qa.passo('Preencher descrição do objeto', async () => {
  const st = await statusDemanda()
  if (st && st !== 'RASCUNHO') return { pular: `demanda está ${st} (sem edição)` }
  const area = page.locator('textarea').first()
  await area.waitFor({ state: 'visible', timeout: 8000 })
  if (((await area.inputValue()) || '').trim().length < 10) {
    await area.fill(OBJETO)
    await area.blur()
    await page.waitForTimeout(1200)
  }
})

await qa.passo('Adicionar um item à demanda (catálogo)', async () => {
  const st = await statusDemanda()
  if (st && st !== 'RASCUNHO') return { pular: `demanda está ${st} (sem edição)` }
  // Vai à seção Materiais/Serviços e abre o diálogo
  await clicarPrimeiro(page, [page.getByText(/materiais\/serviços/i).first()], 4000).catch(() => {})
  await clicarPrimeiro(page, [page.getByRole('button', { name: /^adicionar$/i }), page.getByRole('button', { name: /adicionar item/i })])
  // Busca no catálogo (federal) e seleciona o primeiro resultado
  const busca = page.locator('div[role="dialog"] input').first()
  await busca.waitFor({ state: 'visible', timeout: 8000 })
  await busca.fill('cadeira')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(4000)
  await clicarPrimeiro(page, [
    page.locator('div[role="dialog"]').getByRole('button', { name: /selecionar|usar|escolher/i }).first(),
    page.locator('div[role="dialog"] [class*="cursor-pointer"]').filter({ hasText: /cadeira/i }).first(),
  ], 6000)
  // Formulário: quantidade e valor
  const numeros = page.locator('div[role="dialog"] input[type="number"]')
  await numeros.first().waitFor({ state: 'visible', timeout: 8000 })
  await numeros.first().fill('20')
  if ((await numeros.count()) > 1) await numeros.nth(1).fill('850')
  await clicarPrimeiro(page, [page.getByRole('button', { name: /adicionar à demanda/i })])
  await page.waitForTimeout(1500)
})

await qa.passo('Enviar DFD para aprovação', async () => {
  const st = await statusDemanda()
  if (st && st !== 'RASCUNHO') return { pular: `demanda está ${st}` }
  await clicarPrimeiro(page, [page.getByRole('button', { name: /enviar dfd/i })])
  await page.waitForTimeout(1500)
})

const demandaUrl = urlDemanda()

await qa.passo('Aprovar a demanda (tela de Aprovações)', async () => {
  const st = await statusDemanda()
  if (st === 'APROVADA' || st === 'CONSOLIDADA') return { pular: `demanda já está ${st}` }
  await page.goto(`${env.url}/orgao/aprovacoes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  // Expande o card da nossa demanda, se necessário, e aprova
  await clicarPrimeiro(page, [page.getByText(SETOR).first()], 6000).catch(() => {})
  await clicarPrimeiro(page, [page.getByRole('button', { name: /^aprovar/i }).first()], 8000)
  await page.waitForTimeout(1500)
})

await qa.passo('Iniciar contratação com o COPILOTO', async () => {
  await page.goto(demandaUrl || `${env.url}/orgao/demandas`, { waitUntil: 'domcontentloaded' })
  // Se já existe processo, o botão vira "Ver processo NNN"
  const verProcesso = page.getByRole('button', { name: /ver processo/i })
  if (await verProcesso.isVisible().catch(() => false)) {
    await verProcesso.click()
    await page.waitForURL(/\/orgao\/processos\/[0-9a-f-]{36}/, { timeout: 20000 })
    return { pular: 'processo já existia — abri o cockpit' }
  }
  await clicarPrimeiro(page, [page.getByRole('button', { name: /iniciar contratação/i })], 10000)
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
      .first().isVisible().catch(() => false)
    if (concluido) return
    const semCopiloto = !(await page.getByText(/copiloto/i).first().isVisible().catch(() => false))
    const prontaDivulgar = await page.getByRole('button', { name: /divulgar aviso/i }).isEnabled().catch(() => false)
    if (semCopiloto && prontaDivulgar) return { pular: 'instrução já estava pronta (sem copiloto em execução)' }
    const erro = await page.getByText(/preparação automática falhou/i).first().isVisible().catch(() => false)
    if (erro) throw new Error('copiloto reportou ERRO no cockpit')
    await page.waitForTimeout(5000)
  }
  throw new Error('copiloto não concluiu em 6 minutos (veja o cockpit)')
})

await qa.passo('Conferir a instrução do art. 72 (checklist)', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(/instrução do processo/i).first().waitFor({ timeout: 10000 })
})

qa.relatorio()
await qa.banner('🏁 QA Tester concluiu — veja o relatório no terminal', '#0c6b3d')
console.log('\nO navegador fica ABERTO para você inspecionar. Feche-o (ou Ctrl+C) quando terminar.')
