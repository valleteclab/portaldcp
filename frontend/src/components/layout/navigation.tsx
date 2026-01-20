"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
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
  Send,
  FileCheck,
  Warehouse
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useModulosOrgao, ModuloSistema } from "@/hooks/useModulosOrgao"

interface SidebarProps {
  userType: 'fornecedor' | 'orgao'
}

interface MenuLink {
  href: string
  label: string
  icon: any
  modulo?: ModuloSistema // Módulo necessário para exibir este link
}

export function Sidebar({ userType }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { modulos, loading: modulosLoading, temAcesso } = useModulosOrgao()

  const handleLogout = () => {
    if (userType === 'orgao') {
      localStorage.removeItem('orgao')
      localStorage.removeItem('usuario')
      localStorage.removeItem('orgao_token')
      localStorage.removeItem('access_token')
      router.push('/orgao-login')
    } else {
      localStorage.removeItem('fornecedor')
      localStorage.removeItem('token')
      localStorage.removeItem('access_token')
      router.push('/login')
    }
  }

  const fornecedorLinks: MenuLink[] = [
    { href: "/fornecedor", label: "Dashboard", icon: LayoutDashboard },
    { href: "/fornecedor/licitacoes", label: "Licitações Disponíveis", icon: Search },
    { href: "/fornecedor/participacoes", label: "Minhas Participações", icon: FileText },
    { href: "/fornecedor/propostas", label: "Minhas Propostas", icon: Gavel },
    { href: "/fornecedor/contratos", label: "Meus Contratos", icon: FileCheck },
    { href: "/fornecedor/cadastro-sicaf", label: "Meu Cadastro", icon: User },
  ]

  const orgaoLinks: MenuLink[] = [
    { href: "/orgao", label: "Dashboard", icon: LayoutDashboard }, // Sempre visível
    { href: "/orgao/demandas", label: "Demandas", icon: ClipboardList, modulo: ModuloSistema.DEMANDAS },
    { href: "/orgao/pca", label: "PCA", icon: Calendar, modulo: ModuloSistema.PCA },
    { href: "/orgao/licitacoes", label: "Licitações", icon: FileText, modulo: ModuloSistema.LICITACOES },
    { href: "/orgao/licitacoes/nova", label: "Nova Licitação", icon: Gavel, modulo: ModuloSistema.LICITACOES },
    { href: "/orgao/contratos", label: "Contratos", icon: FileCheck, modulo: ModuloSistema.CONTRATOS },
    { href: "/orgao/almoxarifado", label: "Almoxarifado", icon: Warehouse, modulo: ModuloSistema.ALMOXARIFADO },
    { href: "/orgao/pncp", label: "Integração PNCP", icon: Send, modulo: ModuloSistema.PNCP },
    { href: "/orgao/configuracoes", label: "Configurações", icon: Settings }, // Sempre visível
  ]

  // Debug: log dos módulos carregados
  useEffect(() => {
    console.log('[Sidebar] Estado dos módulos:', { modulos, modulosLoading, userType });
  }, [modulos, modulosLoading, userType]);

  // Filtra links baseado nos módulos habilitados
  const getFilteredLinks = (links: MenuLink[]): MenuLink[] => {
    if (userType === 'fornecedor') {
      return links // Fornecedor vê todos os links
    }
    
    // SEGURANÇA: Durante loading, mostra apenas links sem módulo (Dashboard, Configurações)
    // Isso evita mostrar links que o usuário pode não ter acesso
    if (modulosLoading) {
      console.log('[Sidebar] Carregando módulos, mostrando apenas links básicos');
      return links.filter(link => !link.modulo)
    }
    
    // SEMPRE filtra baseado nos módulos habilitados
    // Se não há módulos configurados, mostra apenas Dashboard e Configurações
    // Isso é mais seguro que mostrar tudo
    return links.filter(link => {
      // Se não tem módulo definido, sempre mostra (Dashboard, Configurações)
      if (!link.modulo) {
        return true
      }
      
      // Verifica se o órgão tem acesso ao módulo
      const hasAccess = temAcesso(link.modulo)
      console.log(`[Sidebar] Módulo ${link.modulo}: ${hasAccess ? 'permitido' : 'bloqueado'}`);
      return hasAccess
    })
  }

  const links = getFilteredLinks(userType === 'fornecedor' ? fornecedorLinks : orgaoLinks)

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <Link href="/" className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-1.5">
            <Image 
              src="/logo.png" 
              alt="Portal DCP" 
              width={50} 
              height={50}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-blue-400">Portal DCP</h1>
            <p className="text-xs text-slate-400 leading-tight">Diário de Compras Públicas</p>
          </div>
        </Link>
        <p className="text-xs text-slate-500 mt-2">
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
  const [usuario, setUsuario] = useState<{ email: string; nome?: string; tipo?: string; orgaoNome?: string } | null>(null)

  useEffect(() => {
    // Verifica se é área do órgão ou fornecedor
    const isOrgao = pathname.startsWith('/orgao')
    
    if (isOrgao) {
      // Prioriza dados do usuário logado (novo sistema)
      const usuarioStr = localStorage.getItem('usuario')
      const orgaoStr = localStorage.getItem('orgao')
      
      if (usuarioStr) {
        try {
          const user = JSON.parse(usuarioStr)
          let orgaoNome = ''
          
          // Buscar nome do órgão
          if (orgaoStr) {
            try {
              const orgao = JSON.parse(orgaoStr)
              orgaoNome = orgao.nome || ''
            } catch (e) {}
          }
          
          setUsuario({
            email: user.email,
            nome: user.nome,
            tipo: 'usuario',
            orgaoNome
          })
          return
        } catch (e) {
          console.error('Erro ao parsear usuario')
        }
      }
      
      // Fallback: dados do órgão (sistema legado)
      if (orgaoStr) {
        try {
          const orgao = JSON.parse(orgaoStr)
          setUsuario({
            email: orgao.email_login || orgao.email,
            nome: orgao.nome,
            tipo: 'orgao',
            orgaoNome: orgao.nome
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
              {usuario?.orgaoNome || usuario?.nome || 'Usuário'}
            </p>
            <p className="text-xs text-muted-foreground">
              {usuario?.email || 'Não logado'}
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
