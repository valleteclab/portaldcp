import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ItemContratoService } from './item-contrato.service';
import { UnidadeMedidaContrato } from './entities/item-contrato.entity';
import { TipoPessoa } from '../fornecedores/entities/enums';

interface ItemCSV {
  numero_item: number;
  descricao: string;
  marca: string;
  unidade_medida: string;
  quantidade_contratada: number;
  valor_unitario: number;
  valor_total: number;
}

interface DadosContrato {
  numero_contrato: string;
  ano: number;
  licitacao_numero?: string;
  fornecedor_cnpj: string;
  fornecedor_razao_social: string;
  objeto?: string;
  valor_inicial: number;
  data_assinatura?: Date;
  data_vigencia_inicio?: Date;
  data_vigencia_fim?: Date;
}

export interface ResultadoImportacao {
  sucesso: boolean;
  mensagem: string;
  contrato_id?: string;
  estatisticas: {
    total_itens: number;
    itens_importados: number;
    itens_com_erro: number;
    erros: Array<{ linha: number; campo: string; mensagem: string; valor?: string }>;
  };
}

@Injectable()
export class MigracaoContratosService {
  private readonly logger = new Logger(MigracaoContratosService.name);

  constructor(
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepository: Repository<ItemContrato>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepository: Repository<Fornecedor>,
    private readonly itemContratoService: ItemContratoService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Importa contrato e itens a partir de CSV
   * 
   * Formato CSV esperado:
   * Ítem,Descrição,Marca,Und,Preço R$,Qtdade,Valor Inicial R$,Saída,Saída R$,Qtdade Atual,Valor R$
   */
  async importarContratoCSV(
    filePath: string,
    dadosContrato: DadosContrato,
    orgaoId: string,
  ): Promise<ResultadoImportacao> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const estatisticas = {
      total_itens: 0,
      itens_importados: 0,
      itens_com_erro: 0,
      erros: [] as Array<{ linha: number; campo: string; mensagem: string; valor?: string }>,
    };

    try {
      // Ler arquivo CSV com encoding correto
      const buffer = fs.readFileSync(filePath);
      const conteudo = iconv.decode(buffer, 'utf8');
      const linhas = conteudo.split('\n').map(l => l.trim()).filter(l => l);

      if (linhas.length < 2) {
        throw new BadRequestException('Arquivo CSV deve ter pelo menos cabeçalho e uma linha de dados');
      }

      this.logger.log(`Iniciando importação de ${linhas.length - 1} itens do arquivo ${filePath}`);

      // Parse do cabeçalho
      const cabecalho = linhas[0].split(',').map(c => c.trim());
      const indiceDescricao = cabecalho.findIndex(c => c.toLowerCase().includes('descri'));
      const indiceMarca = cabecalho.findIndex(c => c.toLowerCase().includes('marca'));
      const indiceUnd = cabecalho.findIndex(c => c.toLowerCase().includes('und'));
      const indicePreco = cabecalho.findIndex(c => c.toLowerCase().includes('preço') || c.toLowerCase().includes('preco'));
      const indiceQtdade = cabecalho.findIndex(c => c.toLowerCase().includes('qtdade') || c.toLowerCase().includes('quantidade'));
      const indiceValorInicial = cabecalho.findIndex(c => c.toLowerCase().includes('valor inicial'));

      if (indiceDescricao === -1 || indicePreco === -1 || indiceQtdade === -1 || indiceValorInicial === -1) {
        throw new BadRequestException('CSV deve conter colunas: Descrição, Preço R$, Qtdade, Valor Inicial R$');
      }

      // Buscar ou criar fornecedor
      const fornecedor = await this.buscarOuCriarFornecedor(
        dadosContrato.fornecedor_cnpj,
        dadosContrato.fornecedor_razao_social,
      );

      // Criar contrato
      const contrato = await queryRunner.manager.save(Contrato, {
        numero_contrato: dadosContrato.numero_contrato,
        ano: dadosContrato.ano,
        sequencial: parseInt(dadosContrato.numero_contrato.split('/')[0]) || 1,
        orgao_id: orgaoId,
        fornecedor_id: fornecedor.id,
        fornecedor_cnpj: fornecedor.cpf_cnpj,
        fornecedor_razao_social: fornecedor.razao_social,
        objeto: dadosContrato.objeto || 'Contrato importado via migração',
        valor_inicial: dadosContrato.valor_inicial,
        valor_global: dadosContrato.valor_inicial,
        data_assinatura: dadosContrato.data_assinatura || new Date(),
        data_vigencia_inicio: dadosContrato.data_vigencia_inicio || new Date(),
        data_vigencia_fim: dadosContrato.data_vigencia_fim || new Date(),
        status: 'VIGENTE' as any,
        tipo: 'CONTRATO' as any,
        categoria: 'COMPRAS' as any,
      });

      this.logger.log(`Contrato ${contrato.numero_contrato} criado com ID: ${contrato.id}`);

      // Processar itens
      const itens: ItemCSV[] = [];
      estatisticas.total_itens = linhas.length - 1;

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!linha.trim()) continue;

        try {
          // Parse da linha (considerando vírgulas dentro de aspas)
          const campos = this.parseCSVLine(linha);

          const descricao = campos[indiceDescricao]?.trim();
          const marca = campos[indiceMarca]?.trim() || '';
          const unidade = campos[indiceUnd]?.trim() || 'UNIDADE';
          const precoStr = campos[indicePreco]?.trim().replace(/[^\d,.-]/g, '').replace(',', '.');
          const qtdadeStr = campos[indiceQtdade]?.trim().replace(/[^\d,.-]/g, '').replace(',', '.');
          const valorInicialStr = campos[indiceValorInicial]?.trim().replace(/[^\d,.-]/g, '').replace(',', '.');

          // Validações
          if (!descricao) {
            estatisticas.itens_com_erro++;
            estatisticas.erros.push({
              linha: i + 1,
              campo: 'Descrição',
              mensagem: 'Descrição é obrigatória',
            });
            continue;
          }

          const preco = parseFloat(precoStr);
          const qtdade = parseFloat(qtdadeStr);
          const valorInicial = parseFloat(valorInicialStr);

          if (isNaN(preco) || preco <= 0) {
            estatisticas.itens_com_erro++;
            estatisticas.erros.push({
              linha: i + 1,
              campo: 'Preço R$',
              mensagem: 'Preço inválido',
              valor: precoStr,
            });
            continue;
          }

          if (isNaN(qtdade) || qtdade <= 0) {
            estatisticas.itens_com_erro++;
            estatisticas.erros.push({
              linha: i + 1,
              campo: 'Qtdade',
              mensagem: 'Quantidade inválida',
              valor: qtdadeStr,
            });
            continue;
          }

          // Normalizar unidade de medida
          const unidadeNormalizada = this.normalizarUnidadeMedida(unidade);

          itens.push({
            numero_item: i, // Usa número da linha como número do item
            descricao: descricao.substring(0, 500), // Limita tamanho
            marca: marca.substring(0, 100),
            unidade_medida: unidadeNormalizada,
            quantidade_contratada: qtdade,
            valor_unitario: preco,
            valor_total: valorInicial || preco * qtdade, // Usa valor do CSV ou calcula
          });
        } catch (error) {
          estatisticas.itens_com_erro++;
          estatisticas.erros.push({
            linha: i + 1,
            campo: 'Geral',
            mensagem: `Erro ao processar linha: ${error.message}`,
          });
        }
      }

      // Criar itens em lote
      if (itens.length > 0) {
        const itensParaCriar = itens.map(item => {
          const valorTotal = item.valor_total || item.valor_unitario * item.quantidade_contratada;
          return {
            contrato_id: contrato.id,
            numero_item: item.numero_item,
            descricao: item.descricao,
            unidade_medida: item.unidade_medida as UnidadeMedidaContrato,
            quantidade_contratada: item.quantidade_contratada,
            valor_unitario: item.valor_unitario,
            valor_total: valorTotal,
            saldo_disponivel: item.quantidade_contratada, // Saldo inicial = quantidade contratada
            quantidade_empenhada: 0,
            quantidade_entregue: 0,
            observacoes: item.marca ? `Marca: ${item.marca}` : null,
          };
        });

        const itensEntities = itensParaCriar.map(item => {
          const entity = this.itemContratoRepository.create({
            ...item,
            observacoes: item.observacoes || undefined,
          });
          return entity;
        });
        await queryRunner.manager.save(ItemContrato, itensEntities);
        estatisticas.itens_importados = itensParaCriar.length;

        this.logger.log(`${itensParaCriar.length} itens importados para o contrato ${contrato.numero_contrato}`);
      }

      await queryRunner.commitTransaction();

      return {
        sucesso: true,
        mensagem: `Contrato ${contrato.numero_contrato} importado com sucesso`,
        contrato_id: contrato.id,
        estatisticas,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao importar contrato: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Parse de linha CSV considerando vírgulas dentro de aspas
   */
  private parseCSVLine(linha: string): string[] {
    const campos: string[] = [];
    let campoAtual = '';
    let dentroAspas = false;

    for (let i = 0; i < linha.length; i++) {
      const char = linha[i];
      const proxChar = linha[i + 1];

      if (char === '"') {
        dentroAspas = !dentroAspas;
      } else if (char === ',' && !dentroAspas) {
        campos.push(campoAtual.trim());
        campoAtual = '';
      } else {
        campoAtual += char;
      }
    }

    // Adiciona último campo
    campos.push(campoAtual.trim());

    return campos;
  }

  /**
   * Normaliza unidade de medida para o enum
   */
  private normalizarUnidadeMedida(und: string): string {
    const undUpper = und.toUpperCase().trim();

    const mapeamento: Record<string, string> = {
      'UNIDADE': 'UNIDADE',
      'UN': 'UNIDADE',
      'UNID': 'UNIDADE',
      'UNIDA': 'UNIDADE',
      'UNIDA DE': 'UNIDADE', // Erro comum no CSV
      'CAIXA': 'CAIXA',
      'CX': 'CAIXA',
      'PACOTE': 'PACOTE',
      'PC': 'PACOTE',
      'METRO': 'METRO',
      'M': 'METRO',
      'METRO QUADRADO': 'METRO_QUADRADO',
      'M²': 'METRO_QUADRADO',
      'METRO CUBICO': 'METRO_CUBICO',
      'M³': 'METRO_CUBICO',
      'LITRO': 'LITRO',
      'L': 'LITRO',
      'QUILOGRAMA': 'QUILOGRAMA',
      'KG': 'QUILOGRAMA',
      'TONELADA': 'TONELADA',
      'T': 'TONELADA',
      'HORA': 'HORA',
      'H': 'HORA',
      'DIARIA': 'DIARIA',
      'DIA': 'DIARIA',
      'MES': 'MES',
      'ANO': 'ANO',
      'SERVICO': 'SERVICO',
      'GLOBAL': 'GLOBAL',
    };

    return mapeamento[undUpper] || 'UNIDADE';
  }

  /**
   * Busca fornecedor pelo CNPJ ou cria um novo
   */
  private async buscarOuCriarFornecedor(cnpj: string, razaoSocial: string): Promise<Fornecedor> {
    // Limpar CNPJ (remover formatação)
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    let fornecedor = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: cnpjLimpo },
    });

    if (!fornecedor) {
      this.logger.log(`Fornecedor não encontrado, criando novo: ${razaoSocial} (${cnpjLimpo})`);
      
      fornecedor = await this.fornecedorRepository.save({
        cpf_cnpj: cnpjLimpo,
        razao_social: razaoSocial,
        tipo_pessoa: TipoPessoa.JURIDICA,
        status_cadastro: 'APROVADO' as any, // Aprovar automaticamente para migração
      });
    }

    return fornecedor;
  }
}
