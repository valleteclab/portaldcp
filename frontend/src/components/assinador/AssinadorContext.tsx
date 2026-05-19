'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getAssinadorUser, assinadorGet } from '@/lib/assinador-api';

interface Kpis { sua_vez: number; aguardando_outros: number; concluidos_30d: number; }
interface AssinadorContextValue {
  user: any;
  kpis: Kpis;
  refreshKpis: () => void;
}

const AssinadorContext = createContext<AssinadorContextValue>({
  user: null,
  kpis: { sua_vez: 0, aguardando_outros: 0, concluidos_30d: 0 },
  refreshKpis: () => {},
});

export function AssinadorProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [kpis, setKpis] = useState<Kpis>({ sua_vez: 0, aguardando_outros: 0, concluidos_30d: 0 });

  const refreshKpis = useCallback(async () => {
    try {
      const data = await assinadorGet<Kpis>('/api/assinador/kpis');
      setKpis(data);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    setUser(getAssinadorUser());
    refreshKpis();
  }, [refreshKpis]);

  return (
    <AssinadorContext.Provider value={{ user, kpis, refreshKpis }}>
      {children}
    </AssinadorContext.Provider>
  );
}

export const useAssinador = () => useContext(AssinadorContext);
