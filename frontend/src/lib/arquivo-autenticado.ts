import { authFetch } from './api'
import { toast } from "sonner"

/** Tempo máximo esperando o arquivo antes de desistir (a aba não fica em branco para sempre). */
const TEMPO_MAXIMO_MS = 90_000
/**
 * O endereço blob: vale por este tempo. O visor de PDF do navegador lê o blob
 * enquanto abre; revogar cedo demais (antes: 60 s) deixava a aba sem conteúdo
 * quando o PDF era grande ou a aba demorava a carregar.
 */
const VIDA_DO_BLOB_MS = 10 * 60_000

/** Clique repetido no mesmo arquivo enquanto ele carrega: não abre outra aba nem baixa de novo. */
const emAndamento = new Map<string, Window | null>()

function mensagemDeEspera(aba: Window) {
  try {
    aba.document.title = 'Abrindo o arquivo…'
    aba.document.body.style.cssText = 'font-family:system-ui,sans-serif;color:#334155;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'
    aba.document.body.textContent = 'Abrindo o arquivo… (esta aba mostra o PDF assim que o download terminar)'
  } catch {
    /* aba de outra origem ou já navegando: sem mensagem */
  }
}

/**
 * Abre em nova aba um arquivo servido por rota AUTENTICADA da API.
 *
 * Link simples (<a href> / window.open) não envia o token Bearer, e as rotas
 * de arquivo não públicas (documento interno da licitação, anexo de
 * impugnação/esclarecimento) exigem login. Aqui o arquivo é baixado com o
 * token e aberto como blob.
 *
 * A aba é aberta ANTES do download (ainda no clique) para não cair no
 * bloqueador de pop-up.
 *
 * Homologação 26/09/2026 (E8 — "Ver PDF" do mapa da pesquisa travou o
 * navegador): o mecanismo é o mesmo dos outros "Ver PDF"; ficou mais robusto
 * para arquivo grande/lento e clique repetido — a aba mostra "Abrindo…" em vez
 * de ficar em branco, é desligada da tela de origem (`opener = null`), o
 * download tem tempo máximo, o mesmo arquivo não é baixado duas vezes ao mesmo
 * tempo, uma resposta que não é arquivo (HTML/JSON de erro) vira mensagem, e o
 * blob vive o bastante para o visor terminar de ler.
 */
export async function abrirArquivoAutenticado(url: string): Promise<void> {
  if (emAndamento.has(url)) {
    try {
      emAndamento.get(url)?.focus()
    } catch {
      /* aba fechada */
    }
    return
  }
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null
  if (aba) {
    mensagemDeEspera(aba)
    try {
      // A aba nova não precisa (nem deve) acessar a tela de origem
      aba.opener = null
    } catch {
      /* navegador não permite: segue */
    }
  }
  emAndamento.set(url, aba)
  const aviso = toast.loading('Abrindo o arquivo…')
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS)
  try {
    const res = await authFetch(url, { signal: controle.signal })
    if (!res.ok) {
      aba?.close()
      const erro = await res.json().catch(() => null)
      toast.error(erro?.message || 'Não foi possível abrir o arquivo.', { id: aviso })
      return
    }
    const tipo = (res.headers.get('Content-Type') || '').toLowerCase()
    if (tipo.includes('text/html') || tipo.includes('application/json')) {
      aba?.close()
      const corpo = tipo.includes('json') ? await res.json().catch(() => null) : null
      toast.error(corpo?.message || 'O servidor não devolveu um arquivo.', { id: aviso })
      return
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    if (aba && !aba.closed) {
      aba.location.href = blobUrl
    } else {
      window.location.href = blobUrl
    }
    toast.dismiss(aviso)
    setTimeout(() => URL.revokeObjectURL(blobUrl), VIDA_DO_BLOB_MS)
  } catch (e) {
    aba?.close()
    const abortado = e instanceof DOMException && e.name === 'AbortError'
    toast.error(abortado ? 'O arquivo demorou demais para chegar. Tente de novo em instantes.' : 'Não foi possível abrir o arquivo.', { id: aviso })
  } finally {
    clearTimeout(relogio)
    emAndamento.delete(url)
  }
}
