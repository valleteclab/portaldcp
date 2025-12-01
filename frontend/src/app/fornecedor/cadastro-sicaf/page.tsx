"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Building2, Scale, Landmark, MapPin, Briefcase, BarChart3, Save, Loader2, AlertCircle, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  DadosCnpj, Representante, Procurador, FiscalFederal, FiscalEstadual,
  HabilitacaoJuridica, AtestadoTecnico, BalancoPatrimonial, NIVEIS_SICAF, NivelSicaf,
  CredenciamentoTab, HabilitacaoJuridicaTab, FiscalFederalTab,
  FiscalEstadualTab, QualificacaoTecnicaTab, QualificacaoEconomicaTab
} from "@/components/cadastro-sicaf"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const ICONS = {
  credenciamento: Building2,
  habilitacao: Scale,
  'fiscal-federal': Landmark,
  'fiscal-estadual': MapPin,
  tecnica: Briefcase,
  economica: BarChart3,
}

type StatusAba = 'pendente' | 'incompleto' | 'completo'

export default function CadastroSicafPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<NivelSicaf>('credenciamento')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailUsuario, setEmailUsuario] = useState<string>('')
  const [fornecedorId, setFornecedorId] = useState<string | null>(null)
  
  // Busca dados do usuário logado do banco
  useEffect(() => {
    const carregarDados = async () => {
      const fornecedorStr = localStorage.getItem('fornecedor')
      if (!fornecedorStr) return

      try {
        const fornecedorLocal = JSON.parse(fornecedorStr)
        if (fornecedorLocal.email) {
          setEmailUsuario(fornecedorLocal.email)
          
          // Busca dados atualizados do banco
          const res = await fetch(`${API_URL}/api/fornecedores/por-email/${encodeURIComponent(fornecedorLocal.email)}`)
          if (res.ok) {
            const fornecedorDb = await res.json()
            
            // Se já tem CNPJ cadastrado (não é temporário), carrega os dados
            if (fornecedorDb && fornecedorDb.cpf_cnpj && !fornecedorDb.cpf_cnpj.startsWith('TEMP_')) {
              // Monta objeto de dados do CNPJ a partir dos dados do banco
              const dadosCnpjFromDb: DadosCnpj = {
                cnpj: fornecedorDb.cpf_cnpj,
                razao_social: fornecedorDb.razao_social,
                nome_fantasia: fornecedorDb.nome_fantasia,
                natureza_juridica: fornecedorDb.natureza_juridica || '',
                capital_social: fornecedorDb.capital_social || 0,
                data_inicio_atividade: fornecedorDb.data_inicio_atividade || '',
                porte: fornecedorDb.porte || '',
                tipo_estabelecimento: fornecedorDb.tipo_estabelecimento || '',
                telefone: fornecedorDb.telefone,
                telefone_secundario: fornecedorDb.telefone_secundario,
                email: fornecedorDb.email,
                situacao: {
                  nome: fornecedorDb.situacao_cadastral || 'Ativa',
                  data: fornecedorDb.data_situacao_cadastral || '',
                  motivo: fornecedorDb.motivo_situacao_cadastral || '',
                },
                endereco: {
                  tipo_logradouro: fornecedorDb.tipo_logradouro || '',
                  logradouro: fornecedorDb.logradouro || '',
                  numero: fornecedorDb.numero || '',
                  complemento: fornecedorDb.complemento,
                  bairro: fornecedorDb.bairro || '',
                  cep: fornecedorDb.cep || '',
                  uf: fornecedorDb.uf || '',
                  cidade: fornecedorDb.cidade || '',
                },
                simples: {
                  optante: fornecedorDb.optante_simples || false,
                  data_opcao: fornecedorDb.data_opcao_simples,
                  data_exclusao: fornecedorDb.data_exclusao_simples,
                },
                mei: {
                  optante: fornecedorDb.optante_mei || false,
                  data_opcao: fornecedorDb.data_opcao_mei,
                  data_exclusao: fornecedorDb.data_exclusao_mei,
                },
                socios: fornecedorDb.socios || [],
                atividade_principal: fornecedorDb.atividades?.find((a: any) => a.principal) || { codigo: '', descricao: '' },
                atividades_secundarias: fornecedorDb.atividades?.filter((a: any) => !a.principal) || [],
              }
              
              setDadosCnpj(dadosCnpjFromDb)
              setRepresentante({
                nome: fornecedorDb.representante_nome || '',
                cpf: fornecedorDb.representante_cpf || '',
                cargo: fornecedorDb.representante_cargo || '',
                email: fornecedorDb.representante_email || fornecedorDb.email || '',
                telefone: fornecedorDb.representante_telefone || '',
              })
              setFiscalEstadual(prev => ({
                ...prev,
                inscricaoEstadual: fornecedorDb.inscricao_estadual || '',
                inscricaoMunicipal: fornecedorDb.inscricao_municipal || '',
              }))
              
              // Salva o ID do fornecedor
              setFornecedorId(fornecedorDb.id)
              
              // Carrega documentos salvos
              console.log('Documentos do fornecedor:', fornecedorDb.documentos)
              if (fornecedorDb.documentos && fornecedorDb.documentos.length > 0) {
                const docs = fornecedorDb.documentos
                
                // Helper para criar info do arquivo
                const criarArquivoInfo = (doc: any) => doc?.caminho_arquivo ? {
                  filename: doc.caminho_arquivo.split('/').pop(),
                  originalname: doc.nome_arquivo || doc.caminho_arquivo.split('/').pop(),
                  url: doc.caminho_arquivo,
                } : undefined
                
                // Habilitação Jurídica (Nível II)
                const contratoSocial = docs.find((d: any) => d.tipo === 'CONTRATO_SOCIAL')
                const docRepresentante = docs.find((d: any) => d.tipo === 'DOCUMENTO_IDENTIDADE_REPRESENTANTE')
                const procuracao = docs.find((d: any) => d.tipo === 'PROCURACAO')
                const docProcurador = docs.find((d: any) => d.tipo === 'DOCUMENTO_IDENTIDADE_PROCURADOR')
                
                if (contratoSocial || docRepresentante || procuracao || docProcurador) {
                  setHabilitacao(prev => ({
                    ...prev,
                    contratoSocialInfo: criarArquivoInfo(contratoSocial),
                    documentoRepresentanteInfo: criarArquivoInfo(docRepresentante),
                    procuracaoArquivoInfo: criarArquivoInfo(procuracao),
                    documentoProcuradorInfo: criarArquivoInfo(docProcurador),
                  }))
                }
                
                // Fiscal Federal (Nível III)
                const receitaFederal = docs.find((d: any) => d.tipo === 'CND_RECEITA_FEDERAL_PGFN')
                const fgts = docs.find((d: any) => d.tipo === 'CRF_FGTS')
                const tst = docs.find((d: any) => d.tipo === 'CNDT_TST')
                
                if (receitaFederal || fgts || tst) {
                  setFiscalFederal(prev => ({
                    receitaFederal: {
                      ...prev.receitaFederal,
                      tipoComprovante: receitaFederal?.tipo_comprovante || prev.receitaFederal.tipoComprovante,
                      codigoControle: receitaFederal?.codigo_controle || prev.receitaFederal.codigoControle,
                      dataValidade: receitaFederal?.data_validade?.split('T')[0] || prev.receitaFederal.dataValidade,
                      arquivoInfo: criarArquivoInfo(receitaFederal),
                    },
                    fgts: {
                      ...prev.fgts,
                      tipoComprovante: fgts?.tipo_comprovante || prev.fgts.tipoComprovante,
                      codigoControle: fgts?.codigo_controle || prev.fgts.codigoControle,
                      dataValidade: fgts?.data_validade?.split('T')[0] || prev.fgts.dataValidade,
                      arquivoInfo: criarArquivoInfo(fgts),
                    },
                    tst: {
                      ...prev.tst,
                      tipoComprovante: tst?.tipo_comprovante || prev.tst.tipoComprovante,
                      codigoControle: tst?.codigo_controle || prev.tst.codigoControle,
                      dataValidade: tst?.data_validade?.split('T')[0] || prev.tst.dataValidade,
                      arquivoInfo: criarArquivoInfo(tst),
                    },
                  }))
                }
                
                // Fiscal Estadual (Nível IV)
                const certidaoEstadual = docs.find((d: any) => d.tipo === 'CND_ESTADUAL')
                const certidaoMunicipal = docs.find((d: any) => d.tipo === 'CND_MUNICIPAL')
                const inscricaoEstadualArq = docs.find((d: any) => d.tipo === 'INSCRICAO_ESTADUAL_ARQUIVO')
                const inscricaoMunicipalArq = docs.find((d: any) => d.tipo === 'INSCRICAO_MUNICIPAL_ARQUIVO')
                
                if (certidaoEstadual || certidaoMunicipal || inscricaoEstadualArq || inscricaoMunicipalArq) {
                  setFiscalEstadual(prev => ({
                    ...prev,
                    inscricaoEstadualArquivoInfo: criarArquivoInfo(inscricaoEstadualArq),
                    inscricaoMunicipalArquivoInfo: criarArquivoInfo(inscricaoMunicipalArq),
                    certidaoEstadual: {
                      ...prev.certidaoEstadual,
                      tipoComprovante: certidaoEstadual?.tipo_comprovante || prev.certidaoEstadual.tipoComprovante,
                      codigoControle: certidaoEstadual?.codigo_controle || prev.certidaoEstadual.codigoControle,
                      dataValidade: certidaoEstadual?.data_validade?.split('T')[0] || prev.certidaoEstadual.dataValidade,
                      arquivoInfo: criarArquivoInfo(certidaoEstadual),
                    },
                    certidaoMunicipal: {
                      ...prev.certidaoMunicipal,
                      tipoComprovante: certidaoMunicipal?.tipo_comprovante || prev.certidaoMunicipal.tipoComprovante,
                      codigoControle: certidaoMunicipal?.codigo_controle || prev.certidaoMunicipal.codigoControle,
                      dataValidade: certidaoMunicipal?.data_validade?.split('T')[0] || prev.certidaoMunicipal.dataValidade,
                      arquivoInfo: criarArquivoInfo(certidaoMunicipal),
                    },
                  }))
                }
                
                // Qualificação Técnica (Nível V) - Atestados
                const atestadosDocs = docs.filter((d: any) => d.tipo === 'ATESTADO_CAPACIDADE_TECNICA')
                if (atestadosDocs.length > 0) {
                  const atestadosCarregados = atestadosDocs.map((doc: any) => ({
                    id: doc.id,
                    emissor: doc.atestado_emissor || '',
                    data: doc.atestado_data?.split('T')[0] || '',
                    descricao: doc.atestado_descricao || '',
                    arquivoInfo: criarArquivoInfo(doc),
                  }))
                  setAtestados(atestadosCarregados)
                }
                
                // Qualificação Econômica (Nível VI) - Balanços
                const balancosDocs = docs.filter((d: any) => d.tipo === 'BALANCO_PATRIMONIAL')
                if (balancosDocs.length > 0) {
                  const balancosCarregados = balancosDocs.map((doc: any) => ({
                    id: doc.id,
                    ano: doc.balanco_demonstracao_contabil || '',
                    tipo: doc.balanco_tipo || 'ANUAL',
                    demonstracaoContabil: doc.balanco_demonstracao_contabil || '',
                    exercicioFinanceiro: doc.balanco_exercicio || '',
                    validade: doc.data_validade?.split('T')[0] || '',
                    arquivoInfo: criarArquivoInfo(doc),
                  }))
                  setBalancos(balancosCarregados)
                }
              }
              
              // Marca abas como completas baseado nos documentos reais
              const docs = fornecedorDb.documentos || []
              
              // Verifica cada nível baseado nos documentos
              const temCnpjValido = fornecedorDb.cpf_cnpj && !fornecedorDb.cpf_cnpj.startsWith('TEMP_')
              const temContratoSocial = docs.some((d: any) => d.tipo === 'CONTRATO_SOCIAL' && d.caminho_arquivo)
              const temDocRepresentante = docs.some((d: any) => d.tipo === 'DOCUMENTO_IDENTIDADE_REPRESENTANTE' && d.caminho_arquivo)
              const temReceitaFederal = docs.some((d: any) => d.tipo === 'CND_RECEITA_FEDERAL_PGFN' && (d.codigo_controle || d.caminho_arquivo))
              const temFgts = docs.some((d: any) => d.tipo === 'CRF_FGTS' && (d.codigo_controle || d.caminho_arquivo))
              const temTst = docs.some((d: any) => d.tipo === 'CNDT_TST' && (d.codigo_controle || d.caminho_arquivo))
              const temCertidaoEstadual = docs.some((d: any) => d.tipo === 'CND_ESTADUAL' && (d.codigo_controle || d.caminho_arquivo))
              const temCertidaoMunicipal = docs.some((d: any) => d.tipo === 'CND_MUNICIPAL' && (d.codigo_controle || d.caminho_arquivo))
              const temAtestados = docs.some((d: any) => d.tipo === 'ATESTADO_CAPACIDADE_TECNICA' && (d.atestado_emissor || d.caminho_arquivo))
              const temBalancos = docs.some((d: any) => d.tipo === 'BALANCO_PATRIMONIAL' && (d.balanco_exercicio || d.caminho_arquivo))
              
              const novoStatus: Record<string, StatusAba> = {
                credenciamento: temCnpjValido ? 'completo' : 'pendente',
                habilitacao: (temContratoSocial && temDocRepresentante) ? 'completo' : 'pendente',
                'fiscal-federal': (temReceitaFederal || temFgts || temTst) ? 'completo' : 'pendente',
                'fiscal-estadual': (temCertidaoEstadual || temCertidaoMunicipal) ? 'completo' : 'pendente',
                tecnica: temAtestados ? 'completo' : 'pendente',
                economica: temBalancos ? 'completo' : 'pendente',
              }
              setStatusAbas(novoStatus)
              
              // Define a aba ativa baseada no progresso
              if (fornecedorDb.nivel_i_completo && !fornecedorDb.nivel_ii_completo) {
                setActiveTab('habilitacao')
              } else if (fornecedorDb.nivel_ii_completo && !fornecedorDb.nivel_iii_completo) {
                setActiveTab('fiscal-federal')
              } else if (fornecedorDb.nivel_iii_completo && !fornecedorDb.nivel_iv_completo) {
                setActiveTab('fiscal-estadual')
              } else if (fornecedorDb.nivel_iv_completo && !fornecedorDb.nivel_v_completo) {
                setActiveTab('tecnica')
              } else if (fornecedorDb.nivel_v_completo && !fornecedorDb.nivel_vi_completo) {
                setActiveTab('economica')
              } else if (fornecedorDb.nivel_i_completo) {
                setActiveTab('habilitacao')
              }
            }
          }
        }
      } catch (e) {
        console.error('Erro ao carregar dados do fornecedor:', e)
      }
    }
    
    carregarDados()
  }, [])
  
  // Estado de conclusão das abas
  const [statusAbas, setStatusAbas] = useState<Record<string, StatusAba>>({
    credenciamento: 'pendente',
    habilitacao: 'pendente',
    'fiscal-federal': 'pendente',
    'fiscal-estadual': 'pendente',
    tecnica: 'pendente',
    economica: 'pendente',
  })

  const marcarAbaStatus = (aba: string, status: StatusAba) => {
    setStatusAbas(prev => ({ ...prev, [aba]: status }))
  }

  // Estado do Credenciamento
  const [dadosCnpj, setDadosCnpj] = useState<DadosCnpj | null>(null)
  const [representante, setRepresentante] = useState<Representante>({
    nome: '', cpf: '', cargo: '', email: '', telefone: ''
  })
  const [usarProcurador, setUsarProcurador] = useState(false)
  const [procurador, setProcurador] = useState<Procurador>({
    nome: '', cpf: '', email: '', telefone: ''
  })
  
  // Habilitação Jurídica
  const [habilitacao, setHabilitacao] = useState<HabilitacaoJuridica>({
    cnpjRegular: true,
    contratoSocial: null,
    documentoRepresentante: null,
    procuracaoArquivo: null,
    documentoProcurador: null,
  })
  
  // Regularidade Fiscal Federal
  const [fiscalFederal, setFiscalFederal] = useState<FiscalFederal>({
    receitaFederal: { tipoComprovante: 'CERTIDAO', codigoControle: '', dataValidade: '' },
    fgts: { tipoComprovante: 'CERTIDAO', codigoControle: '', dataValidade: '' },
    tst: { tipoComprovante: 'CERTIDAO', codigoControle: '', dataValidade: '' },
  })
  
  // Regularidade Fiscal Estadual/Municipal
  const [fiscalEstadual, setFiscalEstadual] = useState<FiscalEstadual>({
    inscricaoEstadual: '',
    inscricaoEstadualArquivo: null,
    inscricaoMunicipal: '',
    inscricaoMunicipalArquivo: null,
    certidaoEstadual: { tipoComprovante: 'CERTIDAO', codigoControle: '', dataValidade: '' },
    certidaoMunicipal: { tipoComprovante: 'CERTIDAO', codigoControle: '', dataValidade: '' },
  })
  
  // Qualificação Técnica
  const [atestados, setAtestados] = useState<AtestadoTecnico[]>([])
  
  // Qualificação Econômico-Financeira
  const [balancos, setBalancos] = useState<BalancoPatrimonial[]>([])

  // Funções de validação
  const validarHabilitacao = (): boolean => {
    // Obrigatório: Contrato Social e Documento do Representante
    if (!habilitacao.contratoSocial || !habilitacao.documentoRepresentante) {
      return false
    }
    // Se usar procurador, precisa dos documentos
    if (usarProcurador && (!habilitacao.procuracaoArquivo || !habilitacao.documentoProcurador)) {
      return false
    }
    return true
  }

  const validarFiscalFederal = (): boolean => {
    // Pelo menos código de controle preenchido para cada certidão
    return !!(
      fiscalFederal.receitaFederal.codigoControle &&
      fiscalFederal.fgts.codigoControle &&
      fiscalFederal.tst.codigoControle
    )
  }

  const validarFiscalEstadual = (): boolean => {
    // Pelo menos inscrição estadual ou municipal preenchida
    return !!(fiscalEstadual.inscricaoEstadual || fiscalEstadual.inscricaoMunicipal)
  }

  const validarTecnica = (): boolean => {
    // Qualificação técnica é opcional, então sempre válida
    // Mas se tiver atestados, devem ter emissor preenchido
    if (atestados.length === 0) return true
    return atestados.every(a => a.emissor.trim() !== '')
  }

  const validarEconomica = (): boolean => {
    // Precisa de pelo menos um balanço com arquivo
    if (balancos.length === 0) return true // Opcional
    return balancos.every(b => b.arquivo !== null)
  }

  // Finalizar Credenciamento - Salva no banco de dados
  const handleCredenciamentoComplete = async () => {
    if (!dadosCnpj || !emailUsuario) {
      setError('Dados incompletos para salvar o credenciamento')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Salva no banco de dados
      const res = await fetch(`${API_URL}/api/fornecedores/completar-credenciamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailUsuario,
          dadosCnpj,
          representante_nome: representante.nome,
          representante_cpf: representante.cpf.replace(/\D/g, ''),
          representante_cargo: representante.cargo,
          representante_email: representante.email,
          representante_telefone: representante.telefone,
          inscricao_estadual: fiscalEstadual.inscricaoEstadual,
          inscricao_municipal: fiscalEstadual.inscricaoMunicipal,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Erro ao salvar credenciamento')
      }

      const fornecedorAtualizado = await res.json()

      // Salva o ID do fornecedor
      setFornecedorId(fornecedorAtualizado.id)

      // Atualiza localStorage com dados do banco
      const fornecedorStr = localStorage.getItem('fornecedor')
      if (fornecedorStr) {
        const fornecedorLocal = JSON.parse(fornecedorStr)
        fornecedorLocal.id = fornecedorAtualizado.id
        fornecedorLocal.razao_social = fornecedorAtualizado.razao_social
        fornecedorLocal.cpf_cnpj = fornecedorAtualizado.cpf_cnpj
        localStorage.setItem('fornecedor', JSON.stringify(fornecedorLocal))
      }

      // Atualiza estado local
      const novoStatus = { ...statusAbas, credenciamento: 'completo' as StatusAba }
      setStatusAbas(novoStatus)
      setHabilitacao(prev => ({
        ...prev,
        cnpjRegular: dadosCnpj?.situacao.nome === 'Ativa'
      }))
      setActiveTab('habilitacao')

    } catch (err: any) {
      setError(err.message || 'Erro ao salvar credenciamento')
    } finally {
      setLoading(false)
    }
  }

  // Helper para obter ID do fornecedor
  const obterFornecedorId = (): string | null => {
    if (fornecedorId) return fornecedorId
    const fornecedorStr = localStorage.getItem('fornecedor')
    if (fornecedorStr) {
      try {
        const fornecedorLocal = JSON.parse(fornecedorStr)
        return fornecedorLocal.id || null
      } catch {
        return null
      }
    }
    return null
  }

  // Salvar Habilitação Jurídica (Nível II)
  const salvarHabilitacaoJuridica = async () => {
    const id = obterFornecedorId()
    
    if (!id) {
      setError('Fornecedor não identificado. Complete o credenciamento primeiro.')
      return false
    }
    
    try {
      console.log('Salvando habilitação jurídica para fornecedor:', id)
      console.log('Dados:', {
        contratoSocial: habilitacao.contratoSocialInfo,
        documentoRepresentante: habilitacao.documentoRepresentanteInfo,
        procuracaoArquivo: habilitacao.procuracaoArquivoInfo,
        documentoProcurador: habilitacao.documentoProcuradorInfo,
      })
      
      const res = await fetch(`${API_URL}/api/fornecedores/${id}/habilitacao-juridica`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contratoSocial: habilitacao.contratoSocialInfo,
          documentoRepresentante: habilitacao.documentoRepresentanteInfo,
          procuracaoArquivo: habilitacao.procuracaoArquivoInfo,
          documentoProcurador: habilitacao.documentoProcuradorInfo,
        }),
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Erro ao salvar habilitação jurídica')
      }
      
      console.log('Habilitação jurídica salva com sucesso')
      return true
    } catch (err: any) {
      console.error('Erro ao salvar habilitação jurídica:', err)
      setError(err.message)
      return false
    }
  }

  // Salvar Fiscal Federal (Nível III)
  const salvarFiscalFederalDb = async () => {
    const id = obterFornecedorId()
    if (!id) {
      setError('Fornecedor não identificado. Complete o credenciamento primeiro.')
      return false
    }
    try {
      const res = await fetch(`${API_URL}/api/fornecedores/${id}/fiscal-federal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fiscalFederal),
      })
      if (!res.ok) throw new Error('Erro ao salvar regularidade fiscal federal')
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    }
  }

  // Salvar Fiscal Estadual (Nível IV)
  const salvarFiscalEstadualDb = async () => {
    const id = obterFornecedorId()
    if (!id) {
      setError('Fornecedor não identificado. Complete o credenciamento primeiro.')
      return false
    }
    try {
      const res = await fetch(`${API_URL}/api/fornecedores/${id}/fiscal-estadual`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inscricaoEstadual: fiscalEstadual.inscricaoEstadual,
          inscricaoMunicipal: fiscalEstadual.inscricaoMunicipal,
          inscricaoEstadualArquivoInfo: fiscalEstadual.inscricaoEstadualArquivoInfo,
          inscricaoMunicipalArquivoInfo: fiscalEstadual.inscricaoMunicipalArquivoInfo,
          certidaoEstadual: {
            ...fiscalEstadual.certidaoEstadual,
            arquivoInfo: fiscalEstadual.certidaoEstadual.arquivoInfo,
          },
          certidaoMunicipal: {
            ...fiscalEstadual.certidaoMunicipal,
            arquivoInfo: fiscalEstadual.certidaoMunicipal.arquivoInfo,
          },
        }),
      })
      if (!res.ok) throw new Error('Erro ao salvar regularidade fiscal estadual')
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    }
  }

  // Salvar Qualificação Técnica (Nível V)
  const salvarQualificacaoTecnicaDb = async () => {
    const id = obterFornecedorId()
    if (!id) {
      setError('Fornecedor não identificado. Complete o credenciamento primeiro.')
      return false
    }
    try {
      // Envia atestados com informações de arquivo
      const atestadosParaSalvar = atestados.map(a => ({
        emissor: a.emissor,
        data: a.data,
        descricao: a.descricao,
        arquivoInfo: a.arquivoInfo,
      }))
      const res = await fetch(`${API_URL}/api/fornecedores/${id}/qualificacao-tecnica`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atestados: atestadosParaSalvar }),
      })
      if (!res.ok) throw new Error('Erro ao salvar qualificação técnica')
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    }
  }

  // Salvar Qualificação Econômica (Nível VI)
  const salvarQualificacaoEconomicaDb = async () => {
    const id = obterFornecedorId()
    if (!id) {
      setError('Fornecedor não identificado. Complete o credenciamento primeiro.')
      return false
    }
    try {
      const balancosParaSalvar = balancos.map(b => ({
        ano: b.ano,
        tipo: b.tipo,
        exercicioFinanceiro: b.exercicioFinanceiro,
        demonstracaoContabil: b.demonstracaoContabil,
        arquivoInfo: b.arquivoInfo,
      }))
      const res = await fetch(`${API_URL}/api/fornecedores/${id}/qualificacao-economica`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balancos: balancosParaSalvar }),
      })
      if (!res.ok) throw new Error('Erro ao salvar qualificação econômica')
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    }
  }

  // Salvar Cadastro Final
  const salvarCadastro = async () => {
    setLoading(true)
    setError(null)

    try {
      // Salva a última aba
      await salvarQualificacaoEconomicaDb()
      
      alert('Cadastro realizado com sucesso!')
      router.push('/fornecedor')
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar cadastro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastro de Fornecedor</h1>
          <p className="text-muted-foreground">
            Sistema de Cadastramento Unificado de Fornecedores
          </p>
        </div>
        {statusAbas.credenciamento === 'completo' && (
          <Button onClick={salvarCadastro} disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" />Salvar Cadastro</>
            )}
          </Button>
        )}
      </div>

      {/* Erro */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Indicador de Níveis */}
      <div className="grid grid-cols-6 gap-2">
        {NIVEIS_SICAF.map((nivel) => {
          const Icon = ICONS[nivel.id]
          const isActive = activeTab === nivel.id
          const status = statusAbas[nivel.id]
          const isDisabled = nivel.id !== 'credenciamento' && statusAbas.credenciamento !== 'completo'
          
          return (
            <button
              key={nivel.id}
              onClick={() => !isDisabled && setActiveTab(nivel.id)}
              disabled={isDisabled}
              className={`p-3 rounded-lg border text-center transition-all ${
                isActive 
                  ? 'border-blue-500 bg-blue-50' 
                  : status === 'completo'
                    ? 'border-green-300 bg-green-50'
                    : status === 'incompleto'
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Icon className={`h-5 w-5 mx-auto mb-1 ${
                isActive ? 'text-blue-600' 
                : status === 'completo' ? 'text-green-600' 
                : status === 'incompleto' ? 'text-orange-600'
                : 'text-gray-400'
              }`} />
              <p className={`text-xs font-medium ${
                isActive ? 'text-blue-600' 
                : status === 'completo' ? 'text-green-600'
                : status === 'incompleto' ? 'text-orange-600'
                : 'text-gray-600'
              }`}>
                {nivel.label}
              </p>
              {nivel.obrigatorio && status === 'pendente' && (
                <span className="text-[10px] text-red-500">Obrigatório</span>
              )}
              {status === 'completo' && (
                <CheckCircle className="h-3 w-3 text-green-500 mx-auto mt-1" />
              )}
              {status === 'incompleto' && (
                <XCircle className="h-3 w-3 text-orange-500 mx-auto mt-1" />
              )}
            </button>
          )
        })}
      </div>

      {/* Conteúdo das Abas */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NivelSicaf)}>
        <TabsContent value="credenciamento">
          <CredenciamentoTab
            dadosCnpj={dadosCnpj}
            setDadosCnpj={setDadosCnpj}
            representante={representante}
            setRepresentante={setRepresentante}
            usarProcurador={usarProcurador}
            setUsarProcurador={setUsarProcurador}
            procurador={procurador}
            setProcurador={setProcurador}
            onComplete={handleCredenciamentoComplete}
            setError={setError}
            emailUsuario={emailUsuario}
          />
        </TabsContent>

        <TabsContent value="habilitacao">
          <HabilitacaoJuridicaTab
            habilitacao={habilitacao}
            setHabilitacao={setHabilitacao}
            usarProcurador={usarProcurador}
            onBack={() => setActiveTab('credenciamento')}
            onNext={async () => {
              const valido = validarHabilitacao()
              const novoStatus = { ...statusAbas, habilitacao: valido ? 'completo' as StatusAba : 'incompleto' as StatusAba }
              setStatusAbas(novoStatus)
              // Salva no banco
              await salvarHabilitacaoJuridica()
              setActiveTab('fiscal-federal')
            }}
          />
        </TabsContent>

        <TabsContent value="fiscal-federal">
          <FiscalFederalTab
            fiscalFederal={fiscalFederal}
            setFiscalFederal={setFiscalFederal}
            onBack={() => setActiveTab('habilitacao')}
            onNext={async () => {
              const valido = validarFiscalFederal()
              const novoStatus = { ...statusAbas, 'fiscal-federal': valido ? 'completo' as StatusAba : 'incompleto' as StatusAba }
              setStatusAbas(novoStatus)
              // Salva no banco
              await salvarFiscalFederalDb()
              setActiveTab('fiscal-estadual')
            }}
          />
        </TabsContent>

        <TabsContent value="fiscal-estadual">
          <FiscalEstadualTab
            fiscalEstadual={fiscalEstadual}
            setFiscalEstadual={setFiscalEstadual}
            onBack={() => setActiveTab('fiscal-federal')}
            onNext={async () => {
              const valido = validarFiscalEstadual()
              const novoStatus = { ...statusAbas, 'fiscal-estadual': valido ? 'completo' as StatusAba : 'incompleto' as StatusAba }
              setStatusAbas(novoStatus)
              // Salva no banco
              await salvarFiscalEstadualDb()
              setActiveTab('tecnica')
            }}
          />
        </TabsContent>

        <TabsContent value="tecnica">
          <QualificacaoTecnicaTab
            atestados={atestados}
            setAtestados={setAtestados}
            onBack={() => setActiveTab('fiscal-estadual')}
            onNext={async () => {
              const valido = validarTecnica()
              const novoStatus = { ...statusAbas, tecnica: valido ? 'completo' as StatusAba : 'incompleto' as StatusAba }
              setStatusAbas(novoStatus)
              // Salva no banco
              await salvarQualificacaoTecnicaDb()
              setActiveTab('economica')
            }}
          />
        </TabsContent>

        <TabsContent value="economica">
          <QualificacaoEconomicaTab
            balancos={balancos}
            setBalancos={setBalancos}
            onBack={() => setActiveTab('tecnica')}
            onNext={async () => {
              const valido = validarEconomica()
              const novoStatus = { ...statusAbas, economica: valido ? 'completo' as StatusAba : 'incompleto' as StatusAba }
              setStatusAbas(novoStatus)
              // Salva no banco e finaliza
              await salvarCadastro()
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
