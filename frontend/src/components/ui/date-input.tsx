"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface DateInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: string // formato ISO: YYYY-MM-DD
  onChange?: (value: string) => void // retorna formato ISO: YYYY-MM-DD
}

// Converte ISO (YYYY-MM-DD) para brasileiro (DD/MM/YYYY)
function isoToBr(iso: string): string {
  if (!iso) return ""
  const parts = iso.split("-")
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// Converte brasileiro (DD/MM/YYYY) para ISO (YYYY-MM-DD)
function brToIso(br: string): string {
  if (!br) return ""
  const clean = br.replace(/\D/g, "")
  if (clean.length !== 8) return ""
  const day = clean.substring(0, 2)
  const month = clean.substring(2, 4)
  const year = clean.substring(4, 8)
  return `${year}-${month}-${day}`
}

// Formata enquanto digita
function formatDateInput(value: string): string {
  const clean = value.replace(/\D/g, "")
  if (clean.length <= 2) return clean
  if (clean.length <= 4) return `${clean.slice(0, 2)}/${clean.slice(2)}`
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, placeholder = "DD/MM/AAAA", ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => isoToBr(value || ""))

    // Atualiza quando o valor externo muda
    React.useEffect(() => {
      setDisplayValue(isoToBr(value || ""))
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatDateInput(e.target.value)
      setDisplayValue(formatted)

      // Se tem 10 caracteres (DD/MM/YYYY), converte para ISO e notifica
      if (formatted.length === 10) {
        const iso = brToIso(formatted)
        if (iso && onChange) {
          onChange(iso)
        }
      } else if (formatted.length === 0 && onChange) {
        onChange("")
      }
    }

    const handleBlur = () => {
      // Valida a data no blur
      if (displayValue.length === 10) {
        const iso = brToIso(displayValue)
        const [year, month, day] = iso.split("-").map(Number)
        const date = new Date(year, month - 1, day)
        
        // Verifica se a data é válida
        if (
          date.getFullYear() !== year ||
          date.getMonth() !== month - 1 ||
          date.getDate() !== day
        ) {
          setDisplayValue("")
          if (onChange) onChange("")
        }
      }
    }

    return (
      <input
        type="text"
        inputMode="numeric"
        maxLength={10}
        placeholder={placeholder}
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
DateInput.displayName = "DateInput"

export { DateInput }
