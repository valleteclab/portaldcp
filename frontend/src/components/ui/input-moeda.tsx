'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { mascararMoeda } from '@/lib/moeda'

/**
 * Campo de valor em reais com máscara de moeda (R$ 1.234,56). Mesma interface
 * do `Input`: o `onChange` recebe o evento com o valor já mascarado.
 */
export const InputMoeda = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(function InputMoeda({ onChange, ...props }, ref) {
  return (
    <Input
      {...props}
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? 'R$ 0,00'}
      onChange={(e) => {
        e.target.value = mascararMoeda(e.target.value)
        onChange?.(e)
      }}
    />
  )
})
