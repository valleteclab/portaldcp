import { useState, useEffect } from 'react';
import { API_URL, authFetch } from '@/lib/api';

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
  | 'CREDENCIAMENTO';

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
};

export function useModulosOrgao() {
  const [modulos, setModulos] = useState<ModuloSistema[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarModulosDaAPI = async () => {
    try {
      // SEMPRE busca módulos atualizados do backend (fonte da verdade)
      const response = await authFetch(`${API_URL}/api/orgaos/me`);
      
      if (response.ok) {
        const orgao = await response.json();
        // Módulos vêm do banco de dados, sempre atualizados
        const modulosAtivos = orgao.modulos_ativos || orgao.modulos_habilitados || [];
        setModulos(modulosAtivos);
      } else {
        // Se não autenticado ou erro, não mostra módulos
        setModulos([]);
      }
    } catch (error) {
      console.error('Erro ao buscar módulos da API:', error);
      // Em caso de erro, não assume módulos (segurança)
      setModulos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carrega módulos da API (fonte da verdade)
    carregarModulosDaAPI();

    // Escuta evento customizado para atualização (quando admin atualiza módulos)
    const handleModulosAtualizados = () => {
      carregarModulosDaAPI();
    };

    window.addEventListener('modulosAtualizados', handleModulosAtualizados);

    return () => {
      window.removeEventListener('modulosAtualizados', handleModulosAtualizados);
    };
  }, []);

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

