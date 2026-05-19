'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { AssinadorProvider } from '@/components/assinador/AssinadorContext';
import { AssinadorSidebar } from '@/components/assinador/AssinadorSidebar';
import { AssinadorTopbar } from '@/components/assinador/AssinadorTopbar';
import { ASSINADOR_TOKEN_KEY } from '@/lib/assinador-api';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '700'],
});

function AssinadorAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(ASSINADOR_TOKEN_KEY);
    if (!token && !pathname.startsWith('/assinador/login')) {
      router.replace('/assinador/login');
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (!ready) return null;
  return <>{children}</>;
}

export default function AssinadorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/assinador/login';

  if (isLogin) {
    return (
      <div className={`${plusJakarta.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-plus-jakarta)]`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`${plusJakarta.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-plus-jakarta)]`}>
      <AssinadorAuthGuard>
        <AssinadorProvider>
          <div className="flex min-h-screen bg-[#F7F8FA]">
            <AssinadorSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <AssinadorTopbar />
              <main className="flex-1 p-7">
                {children}
              </main>
            </div>
          </div>
        </AssinadorProvider>
      </AssinadorAuthGuard>
    </div>
  );
}
