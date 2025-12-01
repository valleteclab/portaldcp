'use client'

import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface UnidadeMedida {
  id: string
  sigla: string
  nome: string
}

interface UnidadeMedidaSelectProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

// Unidades padrão caso a API não responda
const UNIDADES_PADRAO: UnidadeMedida[] = [
  { id: '1', sigla: 'UN', nome: 'Unidade' },
  { id: '2', sigla: 'PCT', nome: 'Pacote' },
  { id: '3', sigla: 'CX', nome: 'Caixa' },
  { id: '4', sigla: 'M', nome: 'Metro' },
  { id: '5', sigla: 'M2', nome: 'Metro Quadrado' },
  { id: '6', sigla: 'M3', nome: 'Metro Cúbico' },
  { id: '7', sigla: 'KG', nome: 'Quilograma' },
  { id: '8', sigla: 'L', nome: 'Litro' },
  { id: '9', sigla: 'HR', nome: 'Hora' },
  { id: '10', sigla: 'DIA', nome: 'Diária' },
  { id: '11', sigla: 'MES', nome: 'Mensal' },
  { id: '12', sigla: 'RESMA', nome: 'Resma' },
  { id: '13', sigla: 'ROLO', nome: 'Rolo' },
  { id: '14', sigla: 'FD', nome: 'Fardo' },
  { id: '15', sigla: 'KIT', nome: 'Kit' },
  { id: '16', sigla: 'SV', nome: 'Serviço' },
]

export function UnidadeMedidaSelect({
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione a unidade',
}: UnidadeMedidaSelectProps) {
  const [unidades, setUnidades] = useState<UnidadeMedida[]>(UNIDADES_PADRAO)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const carregarUnidades = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/api/catalogo/unidades`)
        if (res.ok) {
          const data = await res.json()
          if (data.length > 0) {
            setUnidades(data)
          }
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error)
        // Mantém as unidades padrão
      } finally {
        setLoading(false)
      }
    }

    carregarUnidades()
  }, [])

  return (
    <Select
      value={value || 'placeholder'}
      onValueChange={(v) => onChange(v === 'placeholder' ? '' : v)}
      disabled={disabled || loading}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="placeholder" disabled>
          {placeholder}
        </SelectItem>
        {unidades.map((unidade) => (
          <SelectItem key={unidade.id} value={unidade.sigla}>
            {unidade.sigla} - {unidade.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
