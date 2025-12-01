"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2,
  ArrowRight,
  Shield,
  FileCheck,
  Users
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function CadastroPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [confirmarSenha, setConfirmarSenha] = useState("")
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validações
    if (!email || !senha || !confirmarSenha) {
      setError("Preencha todos os campos")
      return
    }

    if (senha !== confirmarSenha) {
      setError("As senhas não coincidem")
      return
    }

    if (senha.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("http://localhost:3001/api/fornecedores/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || "Erro ao criar cadastro")
      }

      // Salva token e dados no localStorage
      localStorage.setItem("token", data.token)
      localStorage.setItem("fornecedor", JSON.stringify(data.fornecedor))

      setSuccess(true)

      // Redireciona para o cadastro completo após 2 segundos
      setTimeout(() => {
        router.push("/fornecedor/cadastro-sicaf")
      }, 2000)

    } catch (err: any) {
      setError(err.message || "Erro ao criar cadastro")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Portal DCP" width={40} height={40} className="rounded" />
            <div>
              <span className="text-xl font-bold text-slate-800">Portal DCP</span>
              <p className="text-xs text-slate-500">Diário de Compras Públicas</p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Já tem cadastro?</span>
            <Link href="/login">
              <Button variant="outline">Entrar</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          {/* Lado esquerdo - Informações */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-slate-800 mb-4">
                Cadastre sua empresa e participe de licitações públicas
              </h1>
              <p className="text-lg text-muted-foreground">
                Plataforma completa para fornecedores participarem de processos licitatórios 
                de forma simples, segura e transparente.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Cadastro Unificado</h3>
                  <p className="text-sm text-muted-foreground">
                    Sistema completo com todos os níveis de habilitação para participação em licitações.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <FileCheck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Consulta Automática de CNPJ</h3>
                  <p className="text-sm text-muted-foreground">
                    Dados da empresa preenchidos automaticamente através da consulta à Receita Federal.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Acesso a Múltiplos Órgãos</h3>
                  <p className="text-sm text-muted-foreground">
                    Participe de licitações de diversos órgãos públicos em uma única plataforma.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Lado direito - Formulário */}
          <div>
            <Card className="shadow-xl border-0">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">Criar Conta</CardTitle>
                <CardDescription>
                  Comece informando seu email e criando uma senha
                </CardDescription>
              </CardHeader>
              <CardContent>
                {success ? (
                  <div className="text-center py-8">
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-2">
                      Cadastro criado com sucesso!
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Redirecionando para completar seu cadastro...
                    </p>
                    <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="seu@email.com"
                          className="pl-10"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="senha">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="senha"
                          type={showSenha ? "text" : "password"}
                          placeholder="Mínimo 6 caracteres"
                          className="pl-10 pr-10"
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSenha(!showSenha)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600"
                        >
                          {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmarSenha">Confirmar Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="confirmarSenha"
                          type={showSenha ? "text" : "password"}
                          placeholder="Repita a senha"
                          className="pl-10"
                          value={confirmarSenha}
                          onChange={(e) => setConfirmarSenha(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full" size="lg" disabled={loading}>
                      {loading ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                          Criando conta...
                        </>
                      ) : (
                        <>
                          Criar Conta
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-center text-muted-foreground pt-4">
                      Ao criar sua conta, você concorda com nossos{" "}
                      <Link href="/termos" className="text-blue-600 hover:underline">
                        Termos de Uso
                      </Link>{" "}
                      e{" "}
                      <Link href="/privacidade" className="text-blue-600 hover:underline">
                        Política de Privacidade
                      </Link>
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          © 2025 Portal DCP. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  )
}
