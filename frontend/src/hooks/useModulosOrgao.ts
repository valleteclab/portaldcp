import { useState, useEffect } from 'react';

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

  useEffect(() => {
    const orgaoStr = localStorage.getItem('orgao');
    if (orgaoStr) {
      try {
        const orgao = JSON.parse(orgaoStr);
        setModulos(orgao.modulos_ativos || Object.keys(MODULOS_INFO) as ModuloSistema[]);
      } catch (e) {
        console.error('Erro ao parsear orgao:', e);
        setModulos(Object.keys(MODULOS_INFO) as ModuloSistema[]);
      }
    } else {
      setModulos(Object.keys(MODULOS_INFO) as ModuloSistema[]);
    }
    setLoading(false);
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

