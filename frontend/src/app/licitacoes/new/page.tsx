"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { Loader2, Save, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

// Enums espelhados do Backend
enum ModalidadeLicitacao {
  PREGAO_ELETRONICO = 'PREGAO_ELETRONICO',
  CONCORRENCIA = 'CONCORRENCIA',
  CONCURSO = 'CONCURSO',
  LEILAO = 'LEILAO',
  DIALOGO_COMPETITIVO = 'DIALOGO_COMPETITIVO',
  DISPENSA_ELETRONICA = 'DISPENSA_ELETRONICA',
}

enum CriterioJulgamento {
  MENOR_PRECO = 'MENOR_PRECO',
  MAIOR_DESCONTO = 'MAIOR_DESCONTO',
  MELHOR_TECNICA = 'MELHOR_TECNICA',
  TECNICA_E_PRECO = 'TECNICA_E_PRECO',
  MAIOR_LANCE = 'MAIOR_LANCE',
  MAIOR_RETORNO_ECONOMICO = 'MAIOR_RETORNO_ECONOMICO',
}

enum ModoDisputa {
  ABERTO = 'ABERTO',
  ABERTO_FECHADO = 'ABERTO_FECHADO',
  FECHADO = 'FECHADO',
}

// Schema de Validação (Zod)
const formSchema = z.object({
  numero_processo: z.string().min(1, "Número do processo é obrigatório"),
  objeto: z.string().min(10, "O objeto deve ter pelo menos 10 caracteres"),
  modalidade: z.nativeEnum(ModalidadeLicitacao),
  criterio_julgamento: z.nativeEnum(CriterioJulgamento),
  modo_disputa: z.nativeEnum(ModoDisputa),
  valor_total_estimado: z.string().min(1, "Valor é obrigatório"),
  data_inicio_acolhimento: z.string().min(1, "Data de início é obrigatória"),
  data_fim_acolhimento: z.string().min(1, "Data de fim é obrigatória"),
})

type FormData = z.infer<typeof formSchema>

export default function NovaLicitacaoPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      modalidade: ModalidadeLicitacao.PREGAO_ELETRONICO,
      criterio_julgamento: CriterioJulgamento.MENOR_PRECO,
      modo_disputa: ModoDisputa.ABERTO,
    }
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    try {
      // Formatando datas para ISO String se necessário, mas o input datetime-local já manda algo próximo.
      // O Backend espera ISO-8601 completo.
      
      const payload = {
        ...data,
        valor_total_estimado: parseFloat(data.valor_total_estimado),
        data_inicio_acolhimento: new Date(data.data_inicio_acolhimento).toISOString(),
        data_fim_acolhimento: new Date(data.data_fim_acolhimento).toISOString(),
      }

      const response = await fetch('http://localhost:3000/api/licitacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(`Erro ao criar: ${error.message || 'Erro desconhecido'}`)
        return
      }

      alert('Licitação criada com sucesso!')
      router.push('/licitacoes') // Redirecionar para listagem (ainda não criada, mas ok)
    } catch (error) {
      console.error(error)
      alert('Erro de conexão com o servidor')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <Button variant="ghost" className="mb-4" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>
      
      <Card>
        <CardHeader>
          <CardTitle>Nova Licitação</CardTitle>
          <CardDescription>Preencha os dados do edital para iniciar o processo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero_processo">Número do Processo</Label>
                <Input 
                  id="numero_processo" 
                  placeholder="ex: 001/2025" 
                  {...register("numero_processo")} 
                />
                {errors.numero_processo && <span className="text-sm text-red-500">{errors.numero_processo.message}</span>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor_total_estimado">Valor Estimado (R$)</Label>
                <Input 
                  id="valor_total_estimado" 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  {...register("valor_total_estimado")} 
                />
                {errors.valor_total_estimado && <span className="text-sm text-red-500">{errors.valor_total_estimado.message}</span>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="objeto">Objeto da Licitação</Label>
              <Input 
                id="objeto" 
                placeholder="Descreva o objeto resumido..." 
                {...register("objeto")} 
              />
              {errors.objeto && <span className="text-sm text-red-500">{errors.objeto.message}</span>}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Modalidade</Label>
                <Select onValueChange={(v) => setValue("modalidade", v as ModalidadeLicitacao)} defaultValue={ModalidadeLicitacao.PREGAO_ELETRONICO}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ModalidadeLicitacao).map((mod) => (
                      <SelectItem key={mod} value={mod}>{mod.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Critério de Julgamento</Label>
                <Select onValueChange={(v) => setValue("criterio_julgamento", v as CriterioJulgamento)} defaultValue={CriterioJulgamento.MENOR_PRECO}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CriterioJulgamento).map((crit) => (
                      <SelectItem key={crit} value={crit}>{crit.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modo de Disputa</Label>
                <Select onValueChange={(v) => setValue("modo_disputa", v as ModoDisputa)} defaultValue={ModoDisputa.ABERTO}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ModoDisputa).map((modo) => (
                      <SelectItem key={modo} value={modo}>{modo.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data_inicio">Início Acolhimento</Label>
                <Input 
                  id="data_inicio" 
                  type="datetime-local" 
                  {...register("data_inicio_acolhimento")} 
                />
                {errors.data_inicio_acolhimento && <span className="text-sm text-red-500">{errors.data_inicio_acolhimento.message}</span>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="data_fim">Fim Acolhimento</Label>
                <Input 
                  id="data_fim" 
                  type="datetime-local" 
                  {...register("data_fim_acolhimento")} 
                />
                {errors.data_fim_acolhimento && <span className="text-sm text-red-500">{errors.data_fim_acolhimento.message}</span>}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="mr-2 h-4 w-4" /> Cadastrar Licitação</>}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  )
}
