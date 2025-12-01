"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Calendar } from "lucide-react"

interface DateInputBRProps {
  id?: string
  value: string // ISO string ou datetime-local
  onChange: (value: string) => void
  showTime?: boolean
  className?: string
  placeholder?: string
}

// Converte ISO para formato de exibição PT-BR
const formatarDataBR = (isoString: string, showTime: boolean = true): string => {
  if (!isoString) return ''
  const data = new Date(isoString)
  if (isNaN(data.getTime())) return ''
  
  const dia = data.getDate().toString().padStart(2, '0')
  const mes = (data.getMonth() + 1).toString().padStart(2, '0')
  const ano = data.getFullYear()
  
  if (showTime) {
    const hora = data.getHours().toString().padStart(2, '0')
    const minuto = data.getMinutes().toString().padStart(2, '0')
    return `${dia}/${mes}/${ano} ${hora}:${minuto}`
  }
  
  return `${dia}/${mes}/${ano}`
}

// Converte formato PT-BR para datetime-local
const parseDateBR = (dataBR: string, showTime: boolean = true): string => {
  if (!dataBR) return ''
  
  try {
    if (showTime) {
      // Formato: DD/MM/YYYY HH:mm
      const match = dataBR.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
      if (match) {
        const [, dia, mes, ano, hora, minuto] = match
        return `${ano}-${mes}-${dia}T${hora}:${minuto}`
      }
    } else {
      // Formato: DD/MM/YYYY
      const match = dataBR.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      if (match) {
        const [, dia, mes, ano] = match
        return `${ano}-${mes}-${dia}`
      }
    }
  } catch (e) {
    return ''
  }
  
  return ''
}

// Aplica máscara de data
const aplicarMascara = (value: string, showTime: boolean): string => {
  // Remove tudo que não é número
  let numeros = value.replace(/\D/g, '')
  
  // Limita o tamanho
  const maxLen = showTime ? 12 : 8
  numeros = numeros.substring(0, maxLen)
  
  // Aplica a máscara
  let resultado = ''
  for (let i = 0; i < numeros.length; i++) {
    if (i === 2 || i === 4) resultado += '/'
    if (i === 8) resultado += ' '
    if (i === 10) resultado += ':'
    resultado += numeros[i]
  }
  
  return resultado
}

export function DateInputBR({ 
  id, 
  value, 
  onChange, 
  showTime = true, 
  className = "",
  placeholder
}: DateInputBRProps) {
  const [displayValue, setDisplayValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  // Atualiza o valor de exibição quando o valor externo muda
  useEffect(() => {
    if (!isFocused && value) {
      setDisplayValue(formatarDataBR(value, showTime))
    }
  }, [value, showTime, isFocused])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const maskedValue = aplicarMascara(e.target.value, showTime)
    setDisplayValue(maskedValue)
    
    // Verifica se está completo e válido
    const expectedLen = showTime ? 16 : 10 // DD/MM/YYYY HH:mm ou DD/MM/YYYY
    if (maskedValue.length === expectedLen) {
      const parsed = parseDateBR(maskedValue, showTime)
      if (parsed) {
        onChange(parsed)
      }
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    // Reformata ao sair do campo
    if (value) {
      setDisplayValue(formatarDataBR(value, showTime))
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
  }

  const defaultPlaceholder = showTime ? 'DD/MM/AAAA HH:mm' : 'DD/MM/AAAA'

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder || defaultPlaceholder}
        className={`pr-10 ${className}`}
      />
      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  )
}
