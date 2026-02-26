'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AprovacoesAlmoxarifadoRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/orgao/aprovacoes');
  }, [router]);
  return null;
}
