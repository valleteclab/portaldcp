import { DataSource } from 'typeorm';
import { ClasseCatalogo, UnidadeMedida } from './entities/catalogo.entity';

// Classes principais do Compras.gov.br
const CLASSES_MATERIAIS = [
  { codigo: '100', nome: 'MATERIAIS DE CONSUMO' },
  { codigo: '300', nome: 'AUTOPEÇAS' },
  { codigo: '400', nome: 'MEDICAMENTOS E MATERIAIS HOSPITALARES' },
  { codigo: '600', nome: 'MATERIAL DE EXPEDIENTE' },
  { codigo: '800', nome: 'SERVIÇOS DE TERCEIROS' },
  { codigo: '2000', nome: 'IMOBILIZADO' },
  { codigo: '2015', nome: 'MATERIAL GRÁFICO' },
  { codigo: '2032', nome: 'GÊNEROS DE ALIMENTAÇÃO' },
  { codigo: '2036', nome: 'OUTROS' },
  { codigo: '2050', nome: 'MATERIAL DE COPA E COZINHA' },
  { codigo: '2054', nome: 'OUTROS ITENS DE ALMOXARIFADO' },
  { codigo: '8', nome: 'EQUIPAMENTOS DE INFORMÁTICA' },
  { codigo: '20', nome: 'MATERIAL ELÉTRICO E ELETRÔNICO' },
  { codigo: '24', nome: 'MATERIAL PARA SINALIZAÇÃO VISUAL' },
  { codigo: '9999', nome: 'ITENS DIVERSOS' },
];

const CLASSES_SERVICOS = [
  { codigo: '166', nome: 'SERVIÇOS DE MANUTENÇÃO E INSTALAÇÃO DE EQUIPAMENTOS DE TIC' },
  { codigo: '800', nome: 'SERVIÇOS DE TERCEIROS' },
  { codigo: '831', nome: 'SERVIÇOS DE CONSULTORIA E DE GERÊNCIA/GESTÃO' },
  { codigo: '859', nome: 'OUTROS SERVIÇOS DE SUPORTE' },
  { codigo: '01', nome: 'ASSESSORIA E CONSULTORIA TÉCNICA' },
  { codigo: '05', nome: 'SERVIÇOS TÉCNICOS PROFISSIONAIS' },
  { codigo: '11', nome: 'LOCAÇÃO DE SOFTWARES' },
  { codigo: '14', nome: 'LOCAÇÃO DE BENS MÓVEIS' },
  { codigo: '17', nome: 'MANUTENÇÃO E CONSERVAÇÃO DE MÁQUINAS E EQUIPAMENTOS' },
  { codigo: '43', nome: 'SERVIÇOS DE ENERGIA ELÉTRICA' },
  { codigo: '44', nome: 'SERVIÇOS DE ÁGUA E ESGOTO' },
  { codigo: '47', nome: 'SERVIÇOS DE COMUNICAÇÃO EM GERAL' },
  { codigo: '81', nome: 'SERVIÇOS BANCÁRIOS' },
  { codigo: '83', nome: 'SERVIÇOS DE CÓPIAS E REPRODUÇÃO DE DOCUMENTOS' },
  { codigo: '99', nome: 'OUTROS SERVIÇOS DE TERCEIROS' },
];

const UNIDADES_MEDIDA = [
  { sigla: 'UN', nome: 'Unidade' },
  { sigla: 'PCT', nome: 'Pacote' },
  { sigla: 'CX', nome: 'Caixa' },
  { sigla: 'M', nome: 'Metro' },
  { sigla: 'M2', nome: 'Metro Quadrado' },
  { sigla: 'M3', nome: 'Metro Cúbico' },
  { sigla: 'KG', nome: 'Quilograma' },
  { sigla: 'G', nome: 'Grama' },
  { sigla: 'L', nome: 'Litro' },
  { sigla: 'ML', nome: 'Mililitro' },
  { sigla: 'HR', nome: 'Hora' },
  { sigla: 'DIA', nome: 'Diária' },
  { sigla: 'MES', nome: 'Mensal' },
  { sigla: 'ANO', nome: 'Anual' },
  { sigla: 'RESMA', nome: 'Resma' },
  { sigla: 'ROLO', nome: 'Rolo' },
  { sigla: 'FD', nome: 'Fardo' },
  { sigla: 'PAR', nome: 'Par' },
  { sigla: 'JG', nome: 'Jogo' },
  { sigla: 'KIT', nome: 'Kit' },
  { sigla: 'GL', nome: 'Galão' },
  { sigla: 'SC', nome: 'Saco' },
  { sigla: 'TB', nome: 'Tubo' },
  { sigla: 'FR', nome: 'Frasco' },
  { sigla: 'BL', nome: 'Bloco' },
  { sigla: 'FL', nome: 'Folha' },
  { sigla: 'VB', nome: 'Verba' },
  { sigla: 'SV', nome: 'Serviço' },
];

export async function seedCatalogo(dataSource: DataSource): Promise<void> {
  const classeRepo = dataSource.getRepository(ClasseCatalogo);
  const unidadeRepo = dataSource.getRepository(UnidadeMedida);

  console.log('Iniciando seed do catálogo...');

  // Seed Classes de Materiais
  for (const classe of CLASSES_MATERIAIS) {
    const existente = await classeRepo.findOne({ where: { codigo: classe.codigo } });
    if (!existente) {
      await classeRepo.save({
        codigo: classe.codigo,
        nome: classe.nome,
        tipo: 'MATERIAL',
        origem: 'COMPRASGOV',
      });
      console.log(`Classe criada: ${classe.codigo} - ${classe.nome}`);
    }
  }

  // Seed Classes de Serviços
  for (const classe of CLASSES_SERVICOS) {
    const existente = await classeRepo.findOne({ where: { codigo: classe.codigo } });
    if (!existente) {
      await classeRepo.save({
        codigo: classe.codigo,
        nome: classe.nome,
        tipo: 'SERVICO',
        origem: 'COMPRASGOV',
      });
      console.log(`Classe criada: ${classe.codigo} - ${classe.nome}`);
    }
  }

  // Seed Unidades de Medida
  for (const unidade of UNIDADES_MEDIDA) {
    const existente = await unidadeRepo.findOne({ where: { sigla: unidade.sigla } });
    if (!existente) {
      await unidadeRepo.save({
        sigla: unidade.sigla,
        nome: unidade.nome,
      });
      console.log(`Unidade criada: ${unidade.sigla} - ${unidade.nome}`);
    }
  }

  console.log('Seed do catálogo concluído!');
}
