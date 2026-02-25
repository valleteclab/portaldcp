import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { API_URL, authFetch, getAuthToken } from '@/lib/api';

export type ModuloSistema = 
  | 'LICITACOES'
  | 'CONTRATOS'
  | 'ATAS'
  | 'PCA'
  | 'DEMANDAS'
  | 'FORNECEDORES'
  | 'PNCP'
  | 'USUARIOS'
  | 'DISPUTA'
  | 'CREDENCIAMENTO'
  | 'ALMOXARIFADO'
  | 'PORTAL_ASSINATURAS'
  | 'ORDENS_SERVICO'
  | 'IA_CONTRATOS'
  | 'WHATSAPP_CHAT';

// Constantes para uso como valores (não apenas tipos)
export const ModuloSistema = {
  LICITACOES: 'LICITACOES' as ModuloSistema,
  CONTRATOS: 'CONTRATOS' as ModuloSistema,
  ATAS: 'ATAS' as ModuloSistema,
  PCA: 'PCA' as ModuloSistema,
  DEMANDAS: 'DEMANDAS' as ModuloSistema,
  FORNECEDORES: 'FORNECEDORES' as ModuloSistema,
  PNCP: 'PNCP' as ModuloSistema,
  USUARIOS: 'USUARIOS' as ModuloSistema,
  DISPUTA: 'DISPUTA' as ModuloSistema,
  CREDENCIAMENTO: 'CREDENCIAMENTO' as ModuloSistema,
  ALMOXARIFADO: 'ALMOXARIFADO' as ModuloSistema,
  PORTAL_ASSINATURAS: 'PORTAL_ASSINATURAS' as ModuloSistema,
  ORDENS_SERVICO: 'ORDENS_SERVICO' as ModuloSistema,
  IA_CONTRATOS: 'IA_CONTRATOS' as ModuloSistema,
  WHATSAPP_CHAT: 'WHATSAPP_CHAT' as ModuloSistema,
} as const;

export const MODULOS_INFO: Record<ModuloSistema, { nome: string; descricao: string }> = {
  LICITACOES: { nome: 'Licitações', descricao: 'Gestão de Licitações' },
  CONTRATOS: { nome: 'Contratos', descricao: 'Gestão de Contratos' },
  ATAS: { nome: 'Atas', descricao: 'Gestão de Atas de Registro de Preços' },
  PCA: { nome: 'PCA', descricao: 'Plano de Contratações Anual' },
  DEMANDAS: { nome: 'Demandas', descricao: 'Gestão de Demandas' },
  FORNECEDORES: { nome: 'Fornecedores', descricao: 'Cadastro de Fornecedores' },
  PNCP: { nome: 'PNCP', descricao: 'Integração PNCP' },
  USUARIOS: { nome: 'Usuários', descricao: 'Gestão de Usuários' },
  DISPUTA: { nome: 'Disputa', descricao: 'Sala de Disputa' },
  CREDENCIAMENTO: { nome: 'Credenciamento', descricao: 'Credenciamento' },
  ALMOXARIFADO: { nome: 'Almoxarifado', descricao: 'Almoxarifado e Ordens de Fornecimento' },
  PORTAL_ASSINATURAS: { nome: 'Portal de Assinaturas', descricao: 'Portal de Assinaturas Eletrônicas' },
  ORDENS_SERVICO: { nome: 'Ordens de Serviço', descricao: 'Gestão de Ordens de Serviço' },
  IA_CONTRATOS: { nome: 'IA — Importar Contratos', descricao: 'Importação de contratos via IA (PDF/imagem)' },
  WHATSAPP_CHAT: { nome: 'WhatsApp Chat', descricao: 'Chat direto com contatos via WhatsApp' },
};

export function useModulosOrgao() {
  const [modulos, setModulos] = useState<ModuloSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const carregarModulosDaAPI = useCallback(async () => {
    // Verifica se estamos na área de admin (não precisa de módulos)
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      console.log('[useModulosOrgao] Área admin, ignorando módulos');
      setModulos([]);
      setLoading(false);
      return;
    }

    // Verifica se estamos na área de fornecedor (fornecedor não usa módulos de órgão)
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/fornecedor')) {
      console.log('[useModulosOrgao] Área fornecedor, ignorando módulos de órgão');
      setModulos([]);
      setLoading(false);
      return;
    }

    // Verifica se há token específico de órgão (orgao_token)
    // access_token pode ser de fornecedor, então precisamos verificar o orgao_token
    const orgaoToken = typeof window !== 'undefined' ? localStorage.getItem('orgao_token') : null;
    console.log('[useModulosOrgao] Token de órgão disponível:', !!orgaoToken);
    
    if (!orgaoToken) {
      // Se não há token de órgão, não busca módulos
      console.log('[useModulosOrgao] Sem token de órgão, retornando vazio');
      setModulos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // SEMPRE busca módulos atualizados do backend (fonte da verdade)
      console.log('[useModulosOrgao] Buscando módulos de:', `${API_URL}/api/orgaos/me`);
      const response = await authFetch(`${API_URL}/api/orgaos/me`);
      
      console.log('[useModulosOrgao] Response status:', response.status);
      
      if (response.ok) {
        const orgao = await response.json();
        console.log('[useModulosOrgao] Resposta completa do backend:', orgao);
        
        // Módulos vêm do banco de dados, sempre atualizados
        const modulosAtivos = orgao.modulos_ativos || orgao.modulos_habilitados || [];
        
        // Debug: log dos módulos recebidos
        console.log('[useModulosOrgao] Módulos extraídos:', modulosAtivos);
        
        setModulos(modulosAtivos);
      } else {
        // Se não autenticado ou erro, não mostra módulos
        const errorText = await response.text().catch(() => 'Erro desconhecido');
        console.error('[useModulosOrgao] Erro na resposta:', response.status, response.statusText, errorText);
        setModulos([]);
      }
    } catch (error) {
      console.error('[useModulosOrgao] Erro ao buscar módulos da API:', error);
      // Em caso de erro, não assume módulos (segurança)
      setModulos([]);
    } finally {
      setLoading(false);
    }
  }, []); // useCallback sem dependências para função estável

  useEffect(() => {
    // Carrega módulos da API sempre que a página mudar (fonte da verdade)
    // Isso garante que módulos atualizados pelo admin sejam refletidos
    carregarModulosDaAPI();

    // Escuta evento customizado para atualização (quando admin atualiza módulos na mesma sessão)
    const handleModulosAtualizados = () => {
      carregarModulosDaAPI();
    };

    window.addEventListener('modulosAtualizados', handleModulosAtualizados);

    return () => {
      window.removeEventListener('modulosAtualizados', handleModulosAtualizados);
    };
  }, [pathname, carregarModulosDaAPI]); // Recarrega a cada navegação

  const temAcesso = (modulo: ModuloSistema): boolean => {
    return modulos.includes(modulo);
  };

  const getModulosAtivos = () => {
    return modulos.map(m => ({
      codigo: m,
      ...MODULOS_INFO[m]
    }));
  };

  return {
    modulos,
    loading,
    temAcesso,
    getModulosAtivos,
  };
}

