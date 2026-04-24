'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function MedicaoIaLegadoPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/fornecedor/medicoes')
  }, [router])

  return (
    <div className="p-8 text-center">
      <Loader2 className="w-10 h-10 animate-spin mx-auto text-purple-600" />
      <p className="mt-4 text-gray-600">
        Redirecionando para a nova experiência de medição assistida...
      </p>
    </div>
  )
}
