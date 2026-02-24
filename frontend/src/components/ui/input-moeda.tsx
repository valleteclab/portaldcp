'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatarMoedaInput, parsearMoedaInput } from '@/lib/utils'

export interface InputMoedaProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value?: number | string
  onChange?: (value: number) => void
}

function InputMoeda({ value, onChange, className, ...props }: InputMoedaProps) {
  const [displayValue, setDisplayValue] = React.useState('')
  const [isFocused, setIsFocused] = React.useState(false)

  const numValue = typeof value === 'string' ? parseFloat(value) || 0 : Number(value) || 0

  React.useEffect(() => {
    if (!isFocused) {
      setDisplayValue(numValue ? formatarMoedaInput(numValue) : '')
    }
  }, [numValue, isFocused])

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    setDisplayValue(numValue ? String(numValue) : '')
    props.onFocus?.(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    const parsed = parsearMoedaInput(displayValue)
    setDisplayValue(parsed ? formatarMoedaInput(parsed) : '')
    onChange?.(parsed)
    props.onBlur?.(e)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
    const parts = raw.split('.')
    let sanitized = raw
    if (parts.length > 2) sanitized = parts[0] + '.' + parts.slice(1).join('')
    else if (parts[1]?.length > 2) sanitized = parts[0] + '.' + parts[1].slice(0, 2)
    const parsed = parsearMoedaInput(sanitized)
    setDisplayValue(parsed ? formatarMoedaInput(parsed) : sanitized)
    onChange?.(parsed)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder="R$ 0,00"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  )
}

export { InputMoeda }
