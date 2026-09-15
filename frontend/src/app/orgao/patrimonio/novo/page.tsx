"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { criarBem, listarCategorias, listarSetores, proximaPlaqueta } from "@/services/patrimonio.service"
import BemForm from "../BemForm"

export default function NovoBemPage() {
  const router = useRouter()
  const [categorias, setCategorias] = useState<any[]>([])
  const [setores, setSetores] = useState<{ id: string; nome: string; codigo: string }[]>([])
  const [sugestaoPlaqueta, setSugestaoPlaqueta] = useState("")

  useEffect(() => {
    listarCategorias().then(setCategorias).catch(console.error)
    listarSetores().then(setSetores).catch(() => setSetores([]))
    proximaPlaqueta().then(setSugestaoPlaqueta).catch(() => {})
  }, [])

  const handleSubmit = async (payload: Record<string, any>) => {
    try {
      await criarBem(payload)
      toast.success("Bem cadastrado")
      router.push("/orgao/patrimonio")
    } catch (error: any) {
      console.error("Erro ao criar bem:", error)
      toast.error(error?.message || "Erro ao criar bem")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cadastrar Novo Bem</h1>
        <p className="text-muted-foreground">Preencha os dados do bem patrimonial. Só a descrição é obrigatória; o restante pode ser completado depois na página do bem.</p>
      </div>

      <BemForm
        modo="criar"
        categorias={categorias}
        setores={setores}
        sugestaoPlaqueta={sugestaoPlaqueta}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </div>
  )
}
