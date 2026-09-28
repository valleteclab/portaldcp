"use client"

/**
 * AVISO DA BASE EDITÁVEL (homologação E5): a versão vigente é o PDF anexado,
 * mas o conteúdo da última versão feita no sistema continua na tela, como
 * base para gerar de novo — e o usuário sabe quem anexou e o que acontece se
 * editar (versão nova em elaboração; o anexo fica no histórico).
 */
import { FileText } from "lucide-react"
import { API_URL } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { fmtDia } from "@/lib/fase-interna/telas"

export function BaseEditavelAviso({ vigente, base, titulo }: { vigente: any; base: any; titulo: string }) {
  if (!vigente || !base || vigente.id === base.id) return null
  const quem = vigente.criado_por_nome ? ` por ${vigente.criado_por_nome}` : ""
  const quando = vigente.data_importacao || vigente.created_at
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 space-y-1" role="note">
      <p>
        A peça vigente é o <b>PDF anexado</b> (versão {vigente.versao}
        {quem}
        {quando ? ` em ${fmtDia(quando)}` : ""}){" "}
        <button type="button" className="inline-flex items-center gap-1 text-blue-800 hover:underline" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${vigente.id}/arquivo`)}>
          <FileText className="w-3.5 h-3.5" aria-hidden="true" /> ver o anexo
        </button>
        .
      </p>
      <p className="text-xs">
        Abaixo, o conteúdo da <b>versão {base.versao}</b> feita no sistema — continua como base para gerar {titulo} de novo. Editar uma seção ou gerar cria a versão{" "}
        {Number(vigente.versao) + 1}, em elaboração até ser gerada; o anexo fica no histórico de versões.
      </p>
    </div>
  )
}
