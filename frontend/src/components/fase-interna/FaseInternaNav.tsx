"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  CheckSquare,
  FileText,
  TriangleAlert,
  DollarSign,
  ExternalLink,
  Gavel,
  BookOpen,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { API_URL, authFetch } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
};

const FASES_INTERNAS = [
  "PLANEJAMENTO",
  "TERMO_REFERENCIA",
  "PESQUISA_PRECOS",
  "ANALISE_JURIDICA",
  "APROVACAO_INTERNA",
];

const SUPPORT_NAV: NavItem[] = [
  { href: "/orgao/pncp", label: "PNCP / Painel Preços", icon: ExternalLink },
  { href: "#", label: "Jurisprudência", icon: Gavel },
  { href: "#", label: "Modelos e checklists", icon: BookOpen },
];

function NavGroup({
  label,
  items,
  isActive,
}: {
  label: string;
  items: NavItem[];
  isActive: (href: string, exact?: boolean) => boolean;
}) {
  return (
    <div className="mb-4">
      <div className="px-4 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {label}
        </span>
      </div>
      <div className="px-2 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);

          return (
            <Link
              key={`${label}-${item.label}`}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative group ${
                active
                  ? "bg-[#ecf3fc] text-[#1351b4]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#1351b4] rounded-r" />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center bg-[#1351b4] text-white">
                  {item.badge}
                </span>
              )}
              {item.href !== "#" && !active && item.badge === undefined && (
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function FaseInternaNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [procCount, setProcCount] = useState<number | undefined>(undefined);
  const [aprovCount, setAprovCount] = useState<number | undefined>(undefined);
  const processoPathId = pathname.match(
    /\/orgao\/fase-interna\/processos\/([^/]+)/,
  )?.[1];
  const processoQueryId = searchParams.get("id");
  const processoId =
    processoPathId === "novo" ? processoQueryId : processoPathId;
  const processoBase = processoId
    ? `/orgao/fase-interna/processos/${processoId}`
    : "/orgao/fase-interna/processos";
  const isWizardFlow = pathname === "/orgao/fase-interna/processos/novo";
  const currentWizardStep = searchParams.get("step") || "dfd";
  const wizardHref = (step: string) =>
    processoId
      ? `/orgao/fase-interna/processos/novo?id=${processoId}&step=${step}`
      : processoBase;

  useEffect(() => {
    let isMounted = true;
    const carregar = async () => {
      try {
        const licRes = await authFetch(`${API_URL}/api/licitacoes?limit=100`);
        if (licRes.ok) {
          const data = await licRes.json();
          const lista: any[] = Array.isArray(data)
            ? data
            : data.data || data.items || [];
          const internas = lista.filter((l) => FASES_INTERNAS.includes(l.fase));
          if (isMounted) setProcCount(internas.length);
        } else {
          if (isMounted) setProcCount(0);
        }

        const meRes = await authFetch(`${API_URL}/api/auth/me`);
        let orgaoId: string | undefined;
        if (meRes.ok) {
          const meData = await meRes.json();
          orgaoId = meData?.orgao?.id || meData?.orgaoId;
        }
        if (!orgaoId) {
          if (isMounted) setAprovCount(0);
        } else {
          const apRes = await authFetch(
            `${API_URL}/api/fase-interna/aprovacoes?orgao_id=${orgaoId}`,
          );
          if (apRes.ok) {
            const apData = await apRes.json();
            const len = Array.isArray(apData)
              ? apData.length
              : apData?.data?.length || apData?.items?.length || 0;
            if (isMounted) setAprovCount(len);
          } else {
            if (isMounted) setAprovCount(0);
          }
        }
      } catch {
        if (isMounted) {
          setProcCount(0);
          setAprovCount(0);
        }
      }
    };
    carregar();
    return () => {
      isMounted = false;
    };
  }, []);

  const documentNav: NavItem[] = [
    {
      href: isWizardFlow
        ? wizardHref("riscos")
        : processoId
          ? `${processoBase}/riscos`
          : processoBase,
      label: "Mapa de Riscos",
      icon: TriangleAlert,
    },
    {
      href: processoId ? `${processoBase}/precos` : processoBase,
      label: "Pesquisa de Preços",
      icon: DollarSign,
    },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (href === "#") return false;
    if (isWizardFlow && href.includes("/processos/novo")) {
      const hrefStep = href.match(/[?&]step=([^&]+)/)?.[1];
      if (hrefStep === "dfd") {
        return ["dfd", "etp", "tr"].includes(currentWizardStep);
      }
      return hrefStep === currentWizardStep;
    }
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const WORK_NAV: NavItem[] = [
    {
      href: "/orgao/fase-interna",
      label: "Painel",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/orgao/fase-interna/processos",
      label: "Processos",
      icon: ListChecks,
      badge: typeof procCount === "number" ? procCount : undefined,
    },
    ...(processoId
      ? [{ href: processoBase, label: "Dossiê do processo", icon: FileText }]
      : []),
    {
      href: "/orgao/fase-interna/aprovacoes",
      label: "Aprovações",
      icon: CheckSquare,
      badge: typeof aprovCount === "number" ? aprovCount : undefined,
    },
  ];

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-100 flex flex-col py-4 overflow-y-auto">
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 text-[#1351b4]">
          <div className="w-6 h-6 rounded bg-[#1351b4] flex items-center justify-center">
            <span className="text-white text-xs font-black">FI</span>
          </div>
          <div>
            <div className="text-xs font-bold text-[#1351b4] leading-none">
              Fase Interna
            </div>
            <div className="text-[10px] text-gray-400 leading-none mt-0.5">
              Lei 14.133/2021
            </div>
          </div>
        </div>
      </div>

      <NavGroup label="Trabalho" items={WORK_NAV} isActive={isActive} />
      <NavGroup
        label="Documentos da fase interna"
        items={documentNav}
        isActive={isActive}
      />
      <NavGroup label="Apoio" items={SUPPORT_NAV} isActive={isActive} />
    </aside>
  );
}
