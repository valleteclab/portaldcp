"use client"

import { useState, useEffect, memo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { X, Loader2 } from "lucide-react"
import { API_URL, authFetch } from '@/lib/api'

interface Licitacao {
  id: string
  numero_processo?: string
  objeto?: string
  valor_total_estimado?: number
  pregoeiro_nome?: string
  data_publicacao_edital?: string
  data_abertura_sessao?: string
  [key: string]: any
}

interface EditarLicitacaoModalProps {
  licitacao: Licitacao
  onClose: () => void
  onSave: () => void
}

// Componente de input com estado local para evitar re-renders
const DebouncedInput = memo(function DebouncedInput({
  value: initialValue,
  onChange,
  type = "text",
  ...props
}: {
  value: string | number
  onChange: (value: string) => void
  type?: string
  [key: string]: any
}) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(e.target.value)
      }}
      {...props}
    />
  )
})

// Componente de textarea com estado local
const DebouncedTextarea = memo(function DebouncedTextarea({
  value: initialValue,
  onChange,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  [key: string]: any
}) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  return (
    <Textarea
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(e.target.value)
      }}
      {...props}
    />
  )
})

function EditarLicitacaoModal({ licitacao, onClose, onSave }: EditarLicitacaoModalProps) {
  // Estado local do formulário - não afeta o componente pai
  const [formData, setFormData] = useState({
    numero_processo: licitacao.numero_processo || '',
    objeto: licitacao.objeto || '',
    valor_total_estimado: licitacao.valor_total_estimado || 0,
    pregoeiro_nome: licitacao.pregoeiro_nome || '',
    data_publicacao_edital: licitacao.data_publicacao_edital?.split('T')[0] || '',
    data_abertura_sessao: licitacao.data_abertura_sessao?.slice(0, 16) || '',
  })
  const [saving, setSaving] = useState(false)

  const updateField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacao.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...formData,
          valor_total_estimado: parseFloat(String(formData.valor_total_estimado)) || 0
        })
      })
      if (res.ok) {
        alert('Licitação atualizada com sucesso!')
        onSave()
        onClose()
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message || 'Falha ao salvar'}`)
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Editar Licitação</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Número do Processo</label>
            <DebouncedInput 
              value={formData.numero_processo} 
              onChange={(v) => updateField('numero_processo', v)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Objeto</label>
            <DebouncedTextarea 
              value={formData.objeto} 
              onChange={(v) => updateField('objeto', v)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Valor Total Estimado</label>
              <DebouncedInput 
                type="number"
                step="0.01"
                value={formData.valor_total_estimado} 
                onChange={(v) => updateField('valor_total_estimado', v)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pregoeiro</label>
              <DebouncedInput 
                value={formData.pregoeiro_nome} 
                onChange={(v) => updateField('pregoeiro_nome', v)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Data de Publicação</label>
              <DebouncedInput 
                type="date"
                value={formData.data_publicacao_edital} 
                onChange={(v) => updateField('data_publicacao_edital', v)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data de Abertura</label>
              <DebouncedInput 
                type="datetime-local"
                value={formData.data_abertura_sessao} 
                onChange={(v) => updateField('data_abertura_sessao', v)}
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 sticky bottom-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar Alterações'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default memo(EditarLicitacaoModal)
