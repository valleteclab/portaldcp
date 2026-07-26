/**
 * Infra do QA Tester visual: carrega .env, narra os passos NA TELA (banner
 * flutuante no navegador), tira screenshots, e permite "assistência humana"
 * (o robô pausa, você faz a ação manualmente e aperta ENTER no terminal).
 */
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import readline from 'readline'

const dir = dirname(fileURLToPath(import.meta.url))

export function loadEnv() {
  const envPath = join(dir, '.env')
  if (!existsSync(envPath)) {
    console.error('❌ Crie qa-tester/.env a partir do .env.example (URL e credenciais).')
    process.exit(1)
  }
  for (const linha of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
  return {
    url: process.env.PORTAL_URL?.replace(/\/$/, ''),
    orgaoEmail: process.env.ORGAO_EMAIL,
    orgaoSenha: process.env.ORGAO_SENHA,
    slowMo: Number(process.env.SLOWMO || 400),
  }
}

const shotsDir = join(dir, 'screenshots')
mkdirSync(shotsDir, { recursive: true })

export class Narrador {
  constructor(page, nomeFluxo) {
    this.page = page
    this.nomeFluxo = nomeFluxo
    this.n = 0
    this.resultados = []
  }

  /** Mostra o passo atual num banner flutuante dentro do navegador. */
  async banner(texto, cor = '#1351b4') {
    try {
      await this.page.evaluate(
        ({ texto, cor }) => {
          let el = document.getElementById('qa-banner')
          if (!el) {
            el = document.createElement('div')
            el.id = 'qa-banner'
            el.style.cssText =
              'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:999999;' +
              'padding:10px 18px;border-radius:10px;color:#fff;font:600 14px system-ui;' +
              'box-shadow:0 4px 20px rgba(0,0,0,.35);max-width:80vw;text-align:center;pointer-events:none'
            document.body.appendChild(el)
          }
          el.style.background = cor
          el.textContent = texto
        },
        { texto, cor },
      )
    } catch { /* página em navegação — o próximo passo remonta o banner */ }
  }

  async passo(titulo, fn) {
    this.n++
    const tag = `${String(this.n).padStart(2, '0')}. ${titulo}`
    console.log(`\n▶ ${tag}`)
    await this.banner(`🤖 QA Tester — ${tag}`)
    try {
      await fn()
      await this.shot(titulo)
      console.log(`  ✅ ok`)
      this.resultados.push({ passo: tag, ok: true })
    } catch (e) {
      await this.shot(`FALHA ${titulo}`)
      console.log(`  ❌ ${e.message?.split('\n')[0]}`)
      this.resultados.push({ passo: tag, ok: false, erro: e.message?.split('\n')[0] })
      await this.banner(`❌ ${tag} — vou pedir sua ajuda`, '#b3261e')
      await this.ajudaHumana(
        `O passo "${titulo}" falhou (${e.message?.split('\n')[0]}).\n` +
          `  Faça essa ação MANUALMENTE no navegador e aperte ENTER para o robô continuar\n` +
          `  (ou Ctrl+C para encerrar).`,
      )
      this.resultados[this.resultados.length - 1].assistido = true
    }
  }

  /** Pausa cooperativa: o humano age, o robô continua. */
  async ajudaHumana(msg) {
    console.log(`\n🤝 ${msg}`)
    await this.banner('🤝 Sua vez: faça a ação indicada no terminal e aperte ENTER lá', '#8a5a00')
    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('  [ENTER para continuar] ', () => { rl.close(); resolve() })
    })
  }

  async shot(nome) {
    const arquivo = join(
      shotsDir,
      `${this.nomeFluxo}-${String(this.n).padStart(2, '0')}-${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`,
    )
    try { await this.page.screenshot({ path: arquivo, fullPage: false }) } catch { /* segue */ }
  }

  relatorio() {
    const ok = this.resultados.filter((r) => r.ok).length
    const assistidos = this.resultados.filter((r) => r.assistido).length
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`RELATÓRIO — ${this.nomeFluxo}: ${ok}/${this.resultados.length} passos automáticos` +
      (assistidos ? ` (${assistidos} com assistência humana)` : ''))
    for (const r of this.resultados) {
      console.log(`  ${r.ok ? '✅' : r.assistido ? '🤝' : '❌'} ${r.passo}${r.erro ? ` — ${r.erro}` : ''}`)
    }
    console.log(`Screenshots em qa-tester/screenshots/`)
    console.log('═'.repeat(60))
  }
}

/** Tenta uma lista de localizadores; clica no primeiro visível. */
export async function clicarPrimeiro(page, candidatos, timeoutCada = 4000) {
  for (const loc of candidatos) {
    try {
      const el = typeof loc === 'string' ? page.locator(loc).first() : loc.first()
      await el.waitFor({ state: 'visible', timeout: timeoutCada })
      await el.click()
      return true
    } catch { /* tenta o próximo */ }
  }
  throw new Error('nenhum dos elementos candidatos ficou visível')
}
