"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { 
  Building2, 
  FileText, 
  Gavel, 
  LayoutDashboard, 
  LogOut, 
  Settings, 
  User,
  Bell,
  Search,
  Calendar,
  ClipboardList,
  Send
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface SidebarProps {
  userType: 'fornecedor' | 'orgao'
}

export function Sidebar({ userType }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = () => {
    if (userType === 'orgao') {
      localStorage.removeItem('orgao')
      localStorage.removeItem('orgao_token')
      router.push('/orgao-login')
    } else {
      localStorage.removeItem('fornecedor')
      localStorage.removeItem('token')
      router.push('/login')
    }
  }

  const fornecedorLinks = [
    { href: "/fornecedor", label: "Dashboard", icon: LayoutDashboard },
    { href: "/fornecedor/licitacoes", label: "Licitações Disponíveis", icon: Search },
    { href: "/fornecedor/participacoes", label: "Minhas Participações", icon: FileText },
    { href: "/fornecedor/propostas", label: "Minhas Propostas", icon: Gavel },
    { href: "/fornecedor/cadastro-sicaf", label: "Meu Cadastro", icon: User },
  ]

  const orgaoLinks = [
    { href: "/orgao", label: "Dashboard", icon: LayoutDashboard },
    { href: "/orgao/demandas", label: "Demandas", icon: ClipboardList },
    { href: "/orgao/pca", label: "PCA", icon: Calendar },
    { href: "/orgao/licitacoes", label: "Licitações", icon: FileText },
    { href: "/orgao/licitacoes/nova", label: "Nova Licitação", icon: Gavel },
    { href: "/orgao/pncp", label: "Integração PNCP", icon: Send },
    { href: "/orgao/configuracoes", label: "Configurações", icon: Settings },
  ]

  const links = userType === 'fornecedor' ? fornecedorLinks : orgaoLinks

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold text-blue-400">LicitaFácil</h1>
        <p className="text-xs text-slate-400 mt-1">
          {userType === 'fornecedor' ? 'Portal do Fornecedor' : 'Portal do Órgão'}
        </p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {links.map((link) => {
            const isActive = pathname === link.href
            const Icon = link.icon
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-700">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Sair
        </Button>
      </div>
    </aside>
  )
}

export function Header() {
  const pathname = usePathname()
  const [usuario, setUsuario] = useState<{ email: string; nome?: string; tipo?: string } | null>(null)

  useEffect(() => {
    // Verifica se é área do órgão ou fornecedor
    const isOrgao = pathname.startsWith('/orgao')
    
    if (isOrgao) {
      const orgaoStr = localStorage.getItem('orgao')
      if (orgaoStr) {
        try {
          const orgao = JSON.parse(orgaoStr)
          setUsuario({
            email: orgao.email_login || orgao.email,
            nome: orgao.nome,
            tipo: 'orgao'
          })
        } catch (e) {
          console.error('Erro ao parsear orgao')
        }
      }
    } else {
      const fornecedorStr = localStorage.getItem('fornecedor')
      if (fornecedorStr) {
        try {
          const fornecedor = JSON.parse(fornecedorStr)
          setUsuario({
            email: fornecedor.email,
            nome: fornecedor.razao_social,
            tipo: 'fornecedor'
          })
        } catch (e) {
          console.error('Erro ao parsear fornecedor')
        }
      }
    }
  }, [pathname])

  const getInitials = () => {
    if (usuario?.nome) {
      return usuario.nome.substring(0, 2).toUpperCase()
    }
    if (usuario?.email) {
      return usuario.email.substring(0, 2).toUpperCase()
    }
    return '?'
  }

  return (
    <header className="h-16 bg-white border-b flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Input 
          placeholder="Buscar licitações..." 
          className="w-80"
        />
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">
              {usuario?.nome || usuario?.email || 'Usuário'}
            </p>
            <p className="text-xs text-muted-foreground">
              {usuario ? usuario.email : 'Não logado'}
            </p>
          </div>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${usuario ? 'bg-blue-600' : 'bg-slate-400'}`}>
            {getInitials()}
          </div>
        </div>
      </div>
    </header>
  )
}
