import type { ReactNode } from 'react'
import { AccessibilityWidget } from '@/components/public/AccessibilityWidget'
import { VLibrasWidget } from '@/components/public/VLibrasWidget'

export default function PcaPublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AccessibilityWidget />
      <VLibrasWidget />
    </>
  )
}
