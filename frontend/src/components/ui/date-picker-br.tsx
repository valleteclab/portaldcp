"use client"

import * as React from "react"
import { format, addDays, addBusinessDays, setHours, setMinutes } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DatePickerBRProps {
  id?: string
  value: string // ISO string
  onChange: (value: string) => void
  showTime?: boolean
  className?: string
  placeholder?: string
  minDate?: Date
  disabled?: boolean
  suggestedTimes?: string[] // Horários sugeridos para botões rápidos
}

// Formata data em horário local (Brasília) sem converter para UTC
// Isso evita o problema de +1 dia quando o horário é próximo da meia-noite
const formatarDataLocal = (date: Date): string => {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  const hora = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const seg = String(date.getSeconds()).padStart(2, '0')
  return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`
}

export function DatePickerBR({
  id,
  value,
  onChange,
  showTime = true,
  className = "",
  placeholder,
  minDate,
  disabled = false,
  suggestedTimes
}: DatePickerBRProps) {
  const [open, setOpen] = React.useState(false)
  const [hora, setHora] = React.useState("09")
  const [minuto, setMinuto] = React.useState("00")

  // Parse do valor ISO para Date - SEM conversão de fuso horário
  // Interpreta a string como horário local, não UTC
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    // Formato esperado: YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DDTHH:mm
    // Extrair componentes manualmente para evitar conversão UTC
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?:?(\d{2})?/)
    if (!match) return undefined
    const [, ano, mes, dia, hora = '00', min = '00'] = match
    // Criar Date usando componentes locais (não UTC)
    const date = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia), parseInt(hora), parseInt(min), 0)
    return isNaN(date.getTime()) ? undefined : date
  }, [value])

  // Atualiza hora/minuto quando o valor muda
  React.useEffect(() => {
    if (selectedDate) {
      setHora(selectedDate.getHours().toString().padStart(2, '0'))
      setMinuto(selectedDate.getMinutes().toString().padStart(2, '0'))
    }
  }, [selectedDate])

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      if (showTime) {
        const dateWithTime = setMinutes(setHours(date, parseInt(hora)), parseInt(minuto))
        onChange(formatarDataLocal(dateWithTime))
      } else {
        onChange(formatarDataLocal(date))
      }
    }
  }

  const handleTimeChange = (type: 'hora' | 'minuto', val: string) => {
    const numVal = val.replace(/\D/g, '').slice(0, 2)
    
    if (type === 'hora') {
      const h = Math.min(23, Math.max(0, parseInt(numVal) || 0))
      setHora(h.toString().padStart(2, '0'))
      if (selectedDate) {
        const newDate = setHours(selectedDate, h)
        onChange(formatarDataLocal(newDate))
      }
    } else {
      const m = Math.min(59, Math.max(0, parseInt(numVal) || 0))
      setMinuto(m.toString().padStart(2, '0'))
      if (selectedDate) {
        const newDate = setMinutes(selectedDate, m)
        onChange(formatarDataLocal(newDate))
      }
    }
  }

  const formatDisplayValue = () => {
    if (!selectedDate) return ""
    if (showTime) {
      return format(selectedDate, "dd/MM/yyyy HH:mm", { locale: ptBR })
    }
    return format(selectedDate, "dd/MM/yyyy", { locale: ptBR })
  }

  const defaultPlaceholder = showTime ? "DD/MM/AAAA HH:mm" : "DD/MM/AAAA"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? formatDisplayValue() : <span>{placeholder || defaultPlaceholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          locale={ptBR}
          disabled={(date) => minDate ? date < minDate : false}
          initialFocus
        />
        {showTime && (
          <div className="p-3 border-t space-y-3">
            {/* Botões de horários rápidos - UX melhorada */}
            <div className="flex flex-wrap gap-1 justify-center">
              {(suggestedTimes || ['08:00', '09:00', '10:00', '14:00', '16:00', '18:00']).map((time) => {
                const [h, m] = time.split(':')
                const isSelected = hora === h && minuto === m
                return (
                  <Button
                    key={time}
                    type="button"
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    className="text-xs px-2 py-1 h-7"
                    onClick={() => {
                      setHora(h)
                      setMinuto(m)
                      if (selectedDate) {
                        const newDate = setMinutes(setHours(selectedDate, parseInt(h)), parseInt(m))
                        onChange(formatarDataLocal(newDate))
                      }
                    }}
                  >
                    {time}
                  </Button>
                )
              })}
            </div>
            
            {/* Input manual para horário personalizado */}
            <div className="flex items-center gap-2 justify-center">
              <span className="text-xs text-muted-foreground">Outro:</span>
              <Input
                type="text"
                value={hora}
                onChange={(e) => handleTimeChange('hora', e.target.value)}
                className="w-12 text-center text-sm h-8"
                maxLength={2}
                placeholder="HH"
              />
              <span>:</span>
              <Input
                type="text"
                value={minuto}
                onChange={(e) => handleTimeChange('minuto', e.target.value)}
                className="w-12 text-center text-sm h-8"
                maxLength={2}
                placeholder="MM"
              />
              <Button 
                size="sm" 
                onClick={() => setOpen(false)}
                className="ml-2 h-8"
              >
                OK
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              💡 Recomendado: horário comercial (08h às 18h)
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
