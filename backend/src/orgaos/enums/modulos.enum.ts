export enum ModuloSistema {
  LICITACOES = 'LICITACOES',
  CONTRATOS = 'CONTRATOS',
  ATAS = 'ATAS',
  PCA = 'PCA',
  DEMANDAS = 'DEMANDAS',
  FORNECEDORES = 'FORNECEDORES',
  PNCP = 'PNCP',
  USUARIOS = 'USUARIOS',
  DISPUTA = 'DISPUTA',
  CREDENCIAMENTO = 'CREDENCIAMENTO',
  ALMOXARIFADO = 'ALMOXARIFADO',
}

export const MODULOS_DESCRICAO: Record<ModuloSistema, string> = {
  [ModuloSistema.LICITACOES]: 'Gestão de Licitações',
  [ModuloSistema.CONTRATOS]: 'Gestão de Contratos',
  [ModuloSistema.ATAS]: 'Gestão de Atas de Registro de Preços',
  [ModuloSistema.PCA]: 'Plano de Contratações Anual',
  [ModuloSistema.DEMANDAS]: 'Gestão de Demandas',
  [ModuloSistema.FORNECEDORES]: 'Cadastro de Fornecedores',
  [ModuloSistema.PNCP]: 'Integração PNCP',
  [ModuloSistema.USUARIOS]: 'Gestão de Usuários',
  [ModuloSistema.DISPUTA]: 'Sala de Disputa',
  [ModuloSistema.CREDENCIAMENTO]: 'Credenciamento',
  [ModuloSistema.ALMOXARIFADO]: 'Almoxarifado e Ordens de Fornecimento',
};

