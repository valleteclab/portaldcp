"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ListChecks,
  CheckSquare,
  ExternalLink,
  Gavel,
  BookOpen,
  ChevronRight,
} from "lucide-react"

const NAV_GROUPS = [
  {
    label: "Trabalho",
    items: [
      { href: "/orgao/fase-interna", label: "Painel", icon: LayoutDashboard, exact: true },
      { href: "/orgao/fase-interna/processos", label: "Processos", icon: ListChecks },
      { href: "/orgao/fase-interna/aprovacoes", label: "Aprovações", icon: CheckSquare },
    ],
  },
  {
    label: "Apoio",
    items: [
      { href: "/orgao/pncp", label: "PNCP / Painel Preços", icon: ExternalLink },
      { href: "#", label: "Jurisprudência", icon: Gavel },
      { href: "#", label: "Modelos e checklists", icon: BookOpen },
    ],
  },
]

export function FaseInternaNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) => {
    if (href === "#") return false
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-100 flex flex-col py-4 overflow-y-auto">
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 text-[#1351b4]">
          <div className="w-6 h-6 rounded bg-[#1351b4] flex items-center justify-center">
            <span className="text-white text-xs font-black">FI</span>
          </div>
          <div>
            <div className="text-xs font-bold text-[#1351b4] leading-none">Fase Interna</div>
            <div className="text-[10px] text-gray-400 leading-none mt-0.5">Lei 14.133/2021</div>
          </div>
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-4">
          <div className="px-4 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {group.label}
            </span>
          </div>
          <div className="px-2 space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href, item.exact)
              return (
                <Link
                  key={item.href}
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
                  {item.href !== "#" && !active && (
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </aside>
  )
}
