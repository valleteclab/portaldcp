"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Building2, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '')

interface Orgao {
  id: string
  nome: string
  cnpj: string
}

function SelecionarOrgaoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tempToken = searchParams.get("token") || ""

  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [orgaoSelecionado, setOrgaoSelecionado] = useState("")
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")
  const [sucesso, setSucesso] = useState(false)

  // Decodifica dados do Google do token temporário
  let dadosGoogle: { email?: string; nome?: string; picture?: string } = {}
  try {
    if (tempToken) {
      dadosGoogle = JSON.parse(atob(tempToken.split(".")[1]))
    }
  } catch {
    // ignore
  }

  useEffect(() => {
    if (!tempToken) {
      router.push("/orgao-login")
      return
    }

    fetch(`${API_URL}/api/orgaos/publico`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : (data.data || [])
        setOrgaos(lista.filter((o: any) => o.ativo !== false))
      })
      .catch(() => setErro("Erro ao carregar lista de órgãos"))
      .finally(() => setCarregando(false))
  }, [tempToken, router])

  const handleSubmit = async () => {
    if (!orgaoSelecionado) {
      setErro("Selecione um órgão para continuar")
      return
    }

    setEnviando(true)
    setErro("")

    try {
      const res = await fetch(`${API_URL}/api/auth/google/completar-cadastro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, orgaoId: orgaoSelecionado }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || "Erro ao enviar solicitação")
      }

      setSucesso(true)
      setTimeout(() => {
        router.push(`/auth/google/aguardando?email=${encodeURIComponent(dadosGoogle.email || "")}`)
      }, 2000)
    } catch (err: any) {
      setErro(err.message || "Erro ao enviar solicitação")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Image src="/logo.png" alt="Portal DCP" width={40} height={40} className="rounded" />
          <div>
            <span className="font-bold text-slate-800">Portal DCP</span>
            <p className="text-xs text-slate-500">Completar cadastro</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg shadow-xl border-0">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-2" />
            <CardTitle className="text-2xl">Selecione seu Órgão</CardTitle>
            <CardDescription>
              Informe a qual órgão você pertence para completar seu cadastro
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {dadosGoogle.email && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                {dadosGoogle.picture && (
                  <img src={dadosGoogle.picture} alt="Foto" className="w-10 h-10 rounded-full" />
                )}
                <div>
                  <p className="font-medium text-slate-800">{dadosGoogle.nome}</p>
                  <p className="text-sm text-slate-500">{dadosGoogle.email}</p>
                </div>
              </div>
            )}

            {erro && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {erro}
              </div>
            )}

            {sucesso && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center flex items-center gap-2 justify-center">
                <CheckCircle className="h-5 w-5" />
                Solicitação enviada! Aguardando aprovação...
              </div>
            )}

            {!sucesso && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="orgao">Órgão *</Label>
                  {carregando ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando órgãos...
                    </div>
                  ) : (
                    <select
                      id="orgao"
                      value={orgaoSelecionado}
                      onChange={e => setOrgaoSelecionado(e.target.value)}
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Selecione um órgão...</option>
                      {orgaos.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs">
                  Após enviar a solicitação, o administrador do sistema irá analisar e aprovar seu acesso. Você receberá confirmação por email.
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={enviando || !orgaoSelecionado}
                >
                  {enviando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando solicitação...
                    </>
                  ) : (
                    "Solicitar Acesso"
                  )}
                </Button>

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => router.push("/orgao-login")}
                >
                  Cancelar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function SelecionarOrgaoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    }>
      <SelecionarOrgaoContent />
    </Suspense>
  )
}
