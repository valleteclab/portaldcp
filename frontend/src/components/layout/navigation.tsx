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
  Warehouse,
  CheckCircle,
  Package,
  ClipboardCheck,
  Mail,
  BarChart3,
  FilePen,
  MessageCircle,
  Bot,
  FileSearch,
  Car,
  Fuel,
  KeyRound,
  Landmark,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useModulosOrgao, ModuloSistema } from "@/hooks/useModulosOrgao"
import { NotificacoesBadge } from "@/components/NotificacoesBadge"
import { API_URL, getAssetUrl } from "@/lib/api"

interface SidebarProps {
  userType: 'fornecedor' | 'orgao'
}

interface MenuLink {
  href: string
  label: string
  icon: any
  modulo?: ModuloSistema
  /** Se definido, link visível quando QUALQUER um dos módulos estiver ativo */
  modulos?: ModuloSistema[]
  requerAprovador?: boolean
  requerPermissao?: string
  /** Se definido, apenas usuários com este role veem o link ('ADMIN' | 'PREGOEIRO' | 'EQUIPE_APOIO') */
  requerRole?: string
}

export function Sidebar({ userType }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { modulos, loading: modulosLoading, temAcesso } = useModulosOrgao()
  const [podeAprovar, setPodeAprovar] = useState(false)
  const [permissoesUsuario, setPermissoesUsuario] = useState<Record<string, boolean>>({})
  const [roleUsuario, setRoleUsuario] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (userType === 'orgao') {
      try {
        const orgaoStr = localStorage.getItem('orgao')
        if (orgaoStr) {
          const orgao = JSON.parse(orgaoStr)
          setLogoUrl(orgao.logo_url || null)
        }
      } catch (e) {
        console.error('Erro ao verificar logo do órgão:', e)
      }
    }
  }, [userType, pathname])

  useEffect(() => {
    if (userType === 'orgao') {
      try {
        const usuarioStr = localStorage.getItem('usuario')
        if (usuarioStr) {
          const usuario = JSON.parse(usuarioStr)
          setPodeAprovar(usuario.pode_aprovar_requisicoes === true || usuario.pode_liberar_contratos === true)
          setRoleUsuario(usuario.role || null)
          setPermissoesUsuario({
            pode_aprovar_requisicoes: usuario.pode_aprovar_requisicoes === true,
            pode_liberar_contratos: usuario.pode_liberar_contratos === true,
            pode_cancelar_estornar: usuario.pode_cancelar_estornar === true,
            pode_excluir_medicao: usuario.pode_excluir_medicao === true,
            eh_fiscal_contrato: usuario.eh_fiscal_contrato === true,
            pode_gerenciar_os: usuario.pode_gerenciar_os === true,
          })
        }
      } catch (e) {
        console.error('Erro ao verificar permissões:', e)
      }
    }
  }, [userType])

  const handleLogout = () => {
    if (userType === 'orgao') {
      localStorage.removeItem('orgao')
      localStorage.removeItem('usuario')
      localStorage.removeItem('orgao_token')
      localStorage.removeItem('access_token')
      localStorage.removeItem('sessao_disputa_selecionada')
      router.push('/orgao-login')
    } else {
      localStorage.removeItem('fornecedor')
      localStorage.removeItem('token')
      localStorage.removeItem('access_token')
      localStorage.removeItem('sessao_disputa_selecionada')
      router.push('/login')
    }
  }

  const fornecedorLinks: MenuLink[] = [
    { href: "/fornecedor", label: "Dashboard", icon: LayoutDashboard },
    { href: "/fornecedor/mensagens", label: "Caixa de entrada", icon: Mail },
    { href: "/fornecedor/licitacoes", label: "Licitações Disponíveis", icon: Search },
    { href: "/fornecedor/participacoes", label: "Minhas Participações", icon: FileText },
    { href: "/fornecedor/propostas", label: "Minhas Propostas", icon: Gavel },
    { href: "/fornecedor/medicoes", label: "Medições", icon: ClipboardCheck },
    { href: "/fornecedor/contratos", label: "Meus Contratos", icon: FileCheck },
    { href: "/fornecedor/ordens", label: "Ordens de Fornecimento", icon: Send },
    { href: "/fornecedor/cadastro-sicaf", label: "Meu Cadastro", icon: User },
  ]

  const orgaoLinks: MenuLink[] = [
    { href: "/orgao", label: "Dashboard", icon: LayoutDashboard }, // Sempre visível
    { href: "/orgao/demandas", label: "Demandas", icon: ClipboardList, modulo: ModuloSistema.DEMANDAS },
    { href: "/orgao/pca", label: "PCA", icon: Calendar, modulo: ModuloSistema.PCA },
    { href: "/orgao/licitacoes", label: "Licitações", icon: FileText, modulo: ModuloSistema.LICITACOES },
    { href: "/orgao/licitacoes/nova", label: "Nova Licitação", icon: Gavel, modulo: ModuloSistema.LICITACOES },
    { href: "/orgao/fase-interna", label: "Fase Interna IA", icon: ClipboardList, modulo: ModuloSistema.LICITACOES },
    { href: "/orgao/disputa-v3", label: "Sala de Disputa V3", icon: Search, modulo: ModuloSistema.DISPUTA },
    { href: "/orgao/contratos", label: "Contratos", icon: FileCheck, modulo: ModuloSistema.CONTRATOS },
    { href: "/orgao/medicoes-v2", label: "Medições", icon: ClipboardCheck, modulo: ModuloSistema.CONTRATOS },
    { href: "/orgao/agente-contratos", label: "Verif. Aditivos", icon: Bot, modulo: ModuloSistema.IA_CONTRATOS },
    { href: "/orgao/analisar-contrato", label: "Analisar Contrato", icon: FileSearch, modulo: ModuloSistema.IA_CONTRATOS },
    { href: "/orgao/fornecedores", label: "Gestão de Fornecedores", icon: Building2, modulo: ModuloSistema.FORNECEDORES },
    { href: "/orgao/almoxarifado", label: "Almoxarifado", icon: Warehouse, modulo: ModuloSistema.ALMOXARIFADO },
    { href: "/orgao/almoxarifado/requisicoes", label: "Requisições", icon: ClipboardList, modulo: ModuloSistema.ALMOXARIFADO },
    { href: "/orgao/almoxarifado/ordens", label: "Ordens de Fornecimento", icon: Send, modulo: ModuloSistema.ALMOXARIFADO },
    { href: "/orgao/almoxarifado/recebimentos", label: "Recebimentos", icon: Package, modulo: ModuloSistema.ALMOXARIFADO },
    { href: "/orgao/fiscal/dossie", label: "Dossiê do Fiscal", icon: FileCheck, modulo: ModuloSistema.ALMOXARIFADO },
    { href: "/orgao/almoxarifado/aprovacoes", label: "Aprovações Requisições", icon: CheckCircle, modulo: ModuloSistema.ALMOXARIFADO, requerAprovador: true },
    { href: "/orgao/aprovacoes", label: "Central de Aprovações", icon: CheckCircle, requerAprovador: true },
    { href: "/orgao/relatorios", label: "Relatórios", icon: BarChart3 },
    { href: "/orgao/pncp", label: "Integração PNCP", icon: Send, modulo: ModuloSistema.PNCP },
    { href: "/orgao/portal-assinaturas", label: "Portal de Assinaturas", icon: FilePen, modulo: ModuloSistema.PORTAL_ASSINATURAS },
    { href: "/orgao/frota", label: "Frota e Combustível", icon: Car, modulo: ModuloSistema.FROTA },
    { href: "/orgao/frota/posto", label: "Painel do Posto", icon: Fuel, modulo: ModuloSistema.FROTA },
    { href: "/orgao/frota/requisicoes", label: "Requisições Combustível", icon: ClipboardList, modulo: ModuloSistema.FROTA },
    { href: "/orgao/frota/contratos", label: "Contratos Combustível", icon: FileText, modulo: ModuloSistema.FROTA },
    { href: "/orgao/frota/credenciais", label: "Acessos Frota", icon: KeyRound, modulo: ModuloSistema.FROTA },
    { href: "/orgao/patrimonio", label: "Patrimônio", icon: Landmark, modulo: ModuloSistema.PATRIMONIO },
    { href: "/orgao/patrimonio/manutencoes", label: "Manutenções", icon: Wrench, modulo: ModuloSistema.PATRIMONIO },
    { href: "/orgao/whatsapp", label: "WhatsApp Chat", icon: MessageCircle, modulo: ModuloSistema.WHATSAPP_CHAT },
    { href: "/orgao/emails", label: "Caixa de Entrada", icon: Mail, modulo: ModuloSistema.EMAILS },
    { href: "/orgao/configuracoes", label: "Configurações", icon: Settings, requerRole: 'ADMIN' },
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
      return links.filter(link => !link.modulo && !link.modulos)
    }

    // SEMPRE filtra baseado nos módulos habilitados
    // Se não há módulos configurados, mostra apenas Dashboard e Configurações
    // Isso é mais seguro que mostrar tudo
    return links.filter(link => {
      // Verifica role (ex: Configurações — apenas ADMIN)
      // null roleUsuario = login direto do órgão (sem usuário individual) → acesso total
      if (link.requerRole && roleUsuario !== null && roleUsuario !== link.requerRole) {
        return false
      }

      // Se não tem módulo definido, verifica apenas permissões especiais
      if (!link.modulo && !link.modulos) {
        // Verifica aprovador mesmo sem módulo (ex: Central de Aprovações)
        if (link.requerAprovador && !podeAprovar) {
          return false
        }
        if (link.requerPermissao && !permissoesUsuario[link.requerPermissao]) {
          return false
        }
        return true
      }

      // modulos: visível quando QUALQUER um estiver ativo
      const hasAccess = link.modulos
        ? link.modulos.some(m => temAcesso(m))
        : link.modulo
          ? temAcesso(link.modulo)
          : false
      const modLabel = link.modulos ? link.modulos.join(',') : link.modulo;
      console.log(`[Sidebar] Módulo ${modLabel}: ${hasAccess ? 'permitido' : 'bloqueado'}`);

      if (!hasAccess) {
        return false
      }

      if (link.requerAprovador && !podeAprovar) {
        return false
      }

      if (link.requerPermissao && !permissoesUsuario[link.requerPermissao]) {
        return false
      }

      return true
    })
  }

  const links = getFilteredLinks(userType === 'fornecedor' ? fornecedorLinks : orgaoLinks)

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <Link href={userType === 'orgao' ? '/orgao' : '/'} className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-1.5 flex items-center justify-center min-w-[50px] min-h-[50px]">
            {userType === 'orgao' && logoUrl ? (
              <img
                src={getAssetUrl(logoUrl)}
                alt="Logo do órgão"
                className="max-w-[50px] max-h-[50px] object-contain"
              />
            ) : (
              <Image
                src="/logo.png"
                alt="Portal DCP"
                width={50}
                height={50}
              />
            )}
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
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
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
  const [orgaoLogoUrl, setOrgaoLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (pathname.startsWith('/orgao')) {
      try {
        const orgaoStr = localStorage.getItem('orgao')
        if (orgaoStr) {
          const orgao = JSON.parse(orgaoStr)
          setOrgaoLogoUrl(orgao.logo_url || null)
        }
      } catch (e) {
        console.error('Erro ao verificar logo do órgão:', e)
      }
    } else {
      setOrgaoLogoUrl(null)
    }
  }, [pathname])

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
            } catch (e) { }
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
        {(pathname.startsWith('/orgao') || pathname.startsWith('/fornecedor')) && <NotificacoesBadge />}

        <div className="flex items-center gap-3">
          {pathname.startsWith('/orgao') && orgaoLogoUrl && (
            <img
              src={getAssetUrl(orgaoLogoUrl)}
              alt="Logo"
              className="h-10 w-10 object-contain"
            />
          )}
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
