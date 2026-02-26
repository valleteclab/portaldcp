'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  Package, 
  Search, 
  Building2, 
  CheckCircle, 
  XCircle,
  Loader2,
  Settings,
  FileText,
  Users,
  ShoppingCart,
  Gavel,
  Send,
  Shield,
  Warehouse,
  FilePen,
  ClipboardList,
  Bot,
  MessageCircle
} from 'lucide-react'
import { API_URL, adminFetch } from '@/lib/api'

interface Orgao {
  id: string
  nome: string
  cnpj: string
  cidade: string
  uf: string
  modulos_ativos: string[]
  status: string
  fluxo_os?: 'REQUISICAO' | 'MODULO_OS'
  envio_automatico_os?: boolean
}

const MODULOS = [
  { codigo: 'LICITACOES', nome: 'Licitações', descricao: 'Gestão completa de licitações', icon: Gavel },
  { codigo: 'CONTRATOS', nome: 'Contratos', descricao: 'Gestão de contratos administrativos', icon: FileText },
  { codigo: 'ATAS', nome: 'Atas', descricao: 'Atas de registro de preços', icon: FileText },
  { codigo: 'PCA', nome: 'PCA', descricao: 'Plano de Contratações Anual', icon: ShoppingCart },
  { codigo: 'DEMANDAS', nome: 'Demandas', descricao: 'Gestão de demandas', icon: FileText },
  { codigo: 'FORNECEDORES', nome: 'Fornecedores', descricao: 'Cadastro de fornecedores', icon: Building2 },
  { codigo: 'PNCP', nome: 'PNCP', descricao: 'Integração com Portal Nacional', icon: Send },
  { codigo: 'USUARIOS', nome: 'Usuários', descricao: 'Gestão de usuários do órgão', icon: Users },
  { codigo: 'DISPUTA', nome: 'Disputa', descricao: 'Sala de disputa online', icon: Gavel },
  { codigo: 'CREDENCIAMENTO', nome: 'Credenciamento', descricao: 'Sistema de credenciamento', icon: Shield },
  { codigo: 'ALMOXARIFADO', nome: 'Almoxarifado', descricao: 'Gestão de almoxarifado e ordens de fornecimento', icon: Warehouse },
  { codigo: 'PORTAL_ASSINATURAS', nome: 'Portal de Assinaturas', descricao: 'Assinaturas eletrônicas de documentos avulsos', icon: FilePen },
  { codigo: 'ORDENS_SERVICO', nome: 'Ordens de Serviço', descricao: 'Gestão de Ordens de Serviço para contratos', icon: ClipboardList },
  { codigo: 'IA_CONTRATOS', nome: 'IA Contratos', descricao: 'Importação de contratos via Inteligência Artificial', icon: Bot },
  { codigo: 'WHATSAPP_CHAT', nome: 'WhatsApp Chat', descricao: 'Chat integrado com WhatsApp via Z-API', icon: MessageCircle },
]

export default function AdminModulosPage() {
  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedOrgao, setSelectedOrgao] = useState<Orgao | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modulosTemp, setModulosTemp] = useState<string[]>([])
  const [fluxoOsTemp, setFluxoOsTemp] = useState<'REQUISICAO' | 'MODULO_OS'>('REQUISICAO')
  const [envioAutomaticoOsTemp, setEnvioAutomaticoOsTemp] = useState(false)

  useEffect(() => {
    carregarOrgaos()
  }, [])

  const carregarOrgaos = async () => {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos`)
      if (res.ok) {
        const data = await res.json()
        setOrgaos(data)
      } else if (res.status === 401) {
        // Token inválido ou expirado - adminFetch já redireciona
        return
      }
    } catch (error) {
      console.error('Erro ao carregar órgãos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenConfig = (orgao: Orgao) => {
    setSelectedOrgao(orgao)
    setModulosTemp(orgao.modulos_ativos || [])
    setFluxoOsTemp(orgao.fluxo_os === 'MODULO_OS' ? 'MODULO_OS' : 'REQUISICAO')
    setEnvioAutomaticoOsTemp(orgao.envio_automatico_os ?? false)
    setModalOpen(true)
  }

  const handleToggleModulo = (codigo: string) => {
    setModulosTemp(prev => 
      prev.includes(codigo) 
        ? prev.filter(m => m !== codigo)
        : [...prev, codigo]
    )
  }

  const handleSalvar = async () => {
    if (!selectedOrgao) return
    setSaving(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${selectedOrgao.id}/modulos`, {
        method: 'PUT',
        body: JSON.stringify({ modulos: modulosTemp, fluxo_os: fluxoOsTemp, envio_automatico_os: envioAutomaticoOsTemp }),
      })
      if (res.ok) {
        const data = await res.json()
        const modulosAtualizados = data.orgao?.modulos_habilitados || modulosTemp
        const fluxoOsAtualizado = data.orgao?.fluxo_os || fluxoOsTemp

        setOrgaos(prev => prev.map(o => 
          o.id === selectedOrgao.id 
            ? { ...o, modulos_ativos: modulosAtualizados, fluxo_os: fluxoOsAtualizado }
            : o
        ))
        
        // Se o órgão atualizado estiver logado, dispara evento para atualizar componentes
        // Os componentes buscarão módulos atualizados diretamente do backend
        const orgaoLogadoStr = localStorage.getItem('orgao')
        if (orgaoLogadoStr) {
          try {
            const orgaoLogado = JSON.parse(orgaoLogadoStr)
            if (orgaoLogado.id === selectedOrgao.id) {
              // Dispara evento para que componentes busquem módulos atualizados do backend
              window.dispatchEvent(new Event('modulosAtualizados'))
            }
          } catch (e) {
            console.error('Erro ao verificar órgão logado:', e)
          }
        }
        
        setModalOpen(false)
      } else if (res.status === 401) {
        // Token inválido ou expirado - adminFetch já redireciona
        return
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao salvar módulos')
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar módulos')
    } finally {
      setSaving(false)
    }
  }

  const orgaosFiltrados = orgaos.filter(o => 
    o.nome.toLowerCase().includes(search.toLowerCase()) ||
    o.cnpj.includes(search) ||
    o.cidade?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando órgãos...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-7 h-7" />
            Gestão de Módulos
          </h1>
          <p className="text-gray-600">Configure os módulos disponíveis para cada órgão</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Órgãos Cadastrados</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Buscar órgão..." 
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {orgaosFiltrados.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Nenhum órgão encontrado</p>
            ) : (
              orgaosFiltrados.map(orgao => (
                <div key={orgao.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">{orgao.nome}</h3>
                      <p className="text-sm text-gray-500">{orgao.cnpj} • {orgao.cidade}/{orgao.uf}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1">
                      {(orgao.modulos_ativos || []).slice(0, 5).map(m => (
                        <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                      {(orgao.modulos_ativos || []).length > 5 && (
                        <Badge variant="outline" className="text-xs">+{orgao.modulos_ativos.length - 5}</Badge>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleOpenConfig(orgao)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Configurar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configurar Módulos</DialogTitle>
            <DialogDescription>
              {selectedOrgao?.nome} - Selecione os módulos que este órgão terá acesso
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            {MODULOS.map(modulo => {
              const Icon = modulo.icon
              const ativo = modulosTemp.includes(modulo.codigo)
              
              return (
                <div 
                  key={modulo.codigo}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    ativo 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleToggleModulo(modulo.codigo)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        ativo ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        <Icon className={`w-5 h-5 ${ativo ? 'text-green-600' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <h4 className="font-medium">{modulo.nome}</h4>
                        <p className="text-xs text-gray-500">{modulo.descricao}</p>
                      </div>
                    </div>
                    {ativo ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {modulosTemp.includes('ORDENS_SERVICO') && (
            <div className="border-t pt-4 mt-4 space-y-3">
              <Label className="text-base font-medium">Fluxo de Ordem de Serviço</Label>
              <p className="text-sm text-gray-500">
                Quando o contrato exige OS para medição: criar via Requisição (almoxarifado) ou no módulo dedicado?
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fluxo_os"
                    value="REQUISICAO"
                    checked={fluxoOsTemp === 'REQUISICAO'}
                    onChange={() => setFluxoOsTemp('REQUISICAO')}
                    className="w-4 h-4"
                  />
                  <span>Requisição</span>
                  <span className="text-xs text-gray-500">(criar via almoxarifado)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fluxo_os"
                    value="MODULO_OS"
                    checked={fluxoOsTemp === 'MODULO_OS'}
                    onChange={() => setFluxoOsTemp('MODULO_OS')}
                    className="w-4 h-4"
                  />
                  <span>Módulo OS</span>
                  <span className="text-xs text-gray-500">(página dedicada)</span>
                </label>
              </div>
            </div>
          )}

          {modulosTemp.includes('ORDENS_SERVICO') && (
            <div className="border-t pt-4 space-y-3">
              <Label className="text-base font-medium">Envio Automático ao Fornecedor</Label>
              <p className="text-sm text-gray-500">
                Quando habilitado, ao aprovar uma OS o sistema enviará automaticamente email e WhatsApp ao fornecedor.
                Quando desabilitado, o aprovador decide manualmente.
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`relative w-12 h-6 rounded-full transition-colors ${envioAutomaticoOsTemp ? 'bg-green-500' : 'bg-gray-300'}`}
                  onClick={() => setEnvioAutomaticoOsTemp(prev => !prev)}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${envioAutomaticoOsTemp ? 'translate-x-6' : ''}`} />
                </div>
                <span className="text-sm font-medium">{envioAutomaticoOsTemp ? 'Envio automático ativado' : 'Envio automático desativado (manual)'}</span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={saving}>
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
              ) : (
                'Salvar Configuração'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

