import { authFetch } from './api'
import { toast } from "sonner"

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
 */
export async function abrirArquivoAutenticado(url: string): Promise<void> {
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const res = await authFetch(url)
    if (!res.ok) {
      aba?.close()
      const erro = await res.json().catch(() => null)
      toast.error(erro?.message || 'Não foi possível abrir o arquivo.')
      return
    }
    const blobUrl = URL.createObjectURL(await res.blob())
    if (aba) {
      aba.location.href = blobUrl
    } else {
      window.location.href = blobUrl
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch {
    aba?.close()
    toast.error('Não foi possível abrir o arquivo.')
  }
}
