"use client"

import { useState } from "react"
import { BarChart3, Plus, Trash2, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BalancoPatrimonial } from "./types"
import { FileUpload } from "./FileUpload"

interface QualificacaoEconomicaTabProps {
  balancos: BalancoPatrimonial[]
  setBalancos: (balancos: BalancoPatrimonial[]) => void
  onNext?: () => void
  onBack?: () => void
}

// Gera lista de anos (últimos 5 anos)
const gerarAnos = () => {
  const anoAtual = new Date().getFullYear()
  return Array.from({ length: 5 }, (_, i) => (anoAtual - i).toString())
}

export function QualificacaoEconomicaTab({ balancos, setBalancos, onNext, onBack }: QualificacaoEconomicaTabProps) {
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear().toString())
  const anos = gerarAnos()

  // Calcula a validade do balanço (30 de abril do ano seguinte ao exercício)
  const calcularValidade = (ano: string) => {
    const anoNum = parseInt(ano)
    // Balanço deve ser apresentado até 30/04 do ano seguinte
    return `${anoNum + 1}-04-30`
  }

  const adicionarBalanco = () => {
    setBalancos([
      ...balancos,
      {
        id: Date.now().toString(),
        ano: anoSelecionado,
        tipo: 'ANUAL',
        demonstracaoContabil: `01/${anoSelecionado}`,
        exercicioFinanceiro: `01/${anoSelecionado} a 12/${anoSelecionado}`,
        validade: calcularValidade(anoSelecionado),
        arquivo: null,
      }
    ])
  }

  const removerBalanco = (id: string) => {
    setBalancos(balancos.filter(b => b.id !== id))
  }

  const atualizarBalanco = (id: string, field: keyof BalancoPatrimonial, value: any) => {
    setBalancos(balancos.map(b => 
      b.id === id ? { ...b, [field]: value } : b
    ))
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Lei nº 14.133/2021</AlertTitle>
        <AlertDescription>
          A apresentação do balanço patrimonial, demonstração de resultado de exercício e demais demonstrações 
          contábeis dos dois últimos exercícios é obrigatória para fins de qualificação econômico-financeira, 
          nos termos do inciso I do art. 69 da Lei nº 14.133, de 1º de abril de 2021.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Balanços Patrimoniais
              </CardTitle>
              <CardDescription>
                Cadastre os balanços patrimoniais dos últimos exercícios
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {anos.map(ano => (
                    <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={adicionarBalanco}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Balanço
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {balancos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum balanço patrimonial cadastrado.</p>
              <p className="text-sm">Selecione o ano e clique em "Adicionar Balanço" para incluir.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {balancos.map((balanco) => (
                <div key={balanco.id} className="p-4 border rounded-lg space-y-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-blue-800 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      Balanço {balanco.ano}
                    </h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removerBalanco(balanco.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Ano do Balanço</Label>
                      <Select 
                        value={balanco.ano}
                        onValueChange={(v) => atualizarBalanco(balanco.id, 'ano', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {anos.map(ano => (
                            <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de Balanço</Label>
                      <Select 
                        value={balanco.tipo}
                        onValueChange={(v) => atualizarBalanco(balanco.id, 'tipo', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANUAL">Balanço Anual</SelectItem>
                          <SelectItem value="INTERMEDIARIO">Balanço Intermediário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Exercício Financeiro</Label>
                      <Input
                        value={balanco.exercicioFinanceiro}
                        onChange={(e) => atualizarBalanco(balanco.id, 'exercicioFinanceiro', e.target.value)}
                        placeholder="01/2024 a 12/2024"
                      />
                    </div>

                  </div>

                  {/* Upload do arquivo */}
                  <FileUpload
                    label="Arquivo do Balanço (PDF)"
                    file={balanco.arquivo || null}
                    onFileChange={(file, uploadInfo) => {
                      setBalancos(balancos.map(b => 
                        b.id === balanco.id ? { ...b, arquivo: file, arquivoInfo: uploadInfo } : b
                      ))
                    }}
                    onRemove={() => {
                      setBalancos(balancos.map(b => 
                        b.id === balanco.id ? { ...b, arquivo: null, arquivoInfo: undefined } : b
                      ))
                    }}
                    accept=".pdf"
                    tipo="qualificacao-economica"
                    savedFilename={balanco.arquivoInfo?.originalname}
                    savedUrl={balanco.arquivoInfo?.url}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botões de Navegação */}
      <div className="flex justify-between">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={onNext}>
          Finalizar Cadastro <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
