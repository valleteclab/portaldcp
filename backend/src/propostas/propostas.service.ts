import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proposta, StatusProposta } from './entities/proposta.entity';
import { PropostaItem } from './entities/proposta-item.entity';
import { CreatePropostaDto, DesclassificarPropostaDto } from './dto/create-proposta.dto';
import { ItensService } from '../itens/itens.service';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

function formatarDataLocal(date: Date | null | undefined): string | null {
  if (!date) return null;
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  const hora = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const seg = String(date.getSeconds()).padStart(2, '0');
  return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
}

@Injectable()
export class PropostasService {
  constructor(
    @InjectRepository(Proposta)
    private readonly propostaRepository: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private readonly propostaItemRepository: Repository<PropostaItem>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    private readonly itensService: ItensService,
  ) {}

  private async validarAntesAberturaSessao(licitacaoId: string): Promise<void> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
    });

    const abertura = licitacao?.data_abertura_sessao;
    if (abertura instanceof Date && !isNaN(abertura.getTime())) {
      const agora = new Date();
      if (agora >= abertura) {
        throw new BadRequestException('Não é possível enviar/alterar proposta após a abertura da sessão');
      }
    }
  }

  async create(createDto: CreatePropostaDto): Promise<Proposta> {
    await this.validarAntesAberturaSessao(createDto.licitacao_id);

    // Verifica se já existe proposta deste fornecedor para esta licitação
    const existing = await this.propostaRepository.findOne({
      where: {
        licitacao_id: createDto.licitacao_id,
        fornecedor_id: createDto.fornecedor_id,
      }
    });

    if (existing) {
      throw new ConflictException({
        message: 'Fornecedor já possui proposta para esta licitação',
        propostaId: existing.id,
      });
    }

    // Valida declarações obrigatórias
    if (!createDto.declaracao_termos) {
      throw new BadRequestException('É obrigatório aceitar os termos do edital');
    }
    if (!createDto.declaracao_inexistencia_fatos) {
      throw new BadRequestException('Declaração de inexistência de fatos impeditivos é obrigatória');
    }
    if (!createDto.declaracao_menor) {
      throw new BadRequestException('Declaração sobre trabalho de menor é obrigatória');
    }

    // Cria a proposta
    const proposta = this.propostaRepository.create({
      licitacao_id: createDto.licitacao_id,
      fornecedor_id: createDto.fornecedor_id,
      declaracao_termos: createDto.declaracao_termos,
      declaracao_mpe: createDto.declaracao_mpe || false,
      declaracao_integridade: createDto.declaracao_integridade,
      declaracao_inexistencia_fatos: createDto.declaracao_inexistencia_fatos,
      declaracao_menor: createDto.declaracao_menor,
      declaracao_reserva_cargos: createDto.declaracao_reserva_cargos || false,
      endereco_entrega: createDto.endereco_entrega,
      cidade_entrega: createDto.cidade_entrega,
      uf_entrega: createDto.uf_entrega,
      cep_entrega: createDto.cep_entrega,
      prazo_validade_dias: createDto.prazo_validade_dias || 60,
      prazo_entrega_dias: createDto.prazo_entrega_dias,
      observacoes: createDto.observacoes,
      status: StatusProposta.RASCUNHO,
    });

    const propostaSalva = await this.propostaRepository.save(proposta);

    // Adiciona os itens
    let valorTotal = 0;
    for (const itemDto of createDto.itens) {
      const itemLicitacao = await this.itensService.findOne(itemDto.item_licitacao_id);
      const valorTotalItem = Number(itemLicitacao.quantidade) * itemDto.valor_unitario;

      const propostaItem = this.propostaItemRepository.create({
        proposta_id: propostaSalva.id,
        item_licitacao_id: itemDto.item_licitacao_id,
        valor_unitario: itemDto.valor_unitario,
        valor_total: valorTotalItem,
        marca: itemDto.marca,
        modelo: itemDto.modelo,
        fabricante: itemDto.fabricante,
        descricao_complementar: itemDto.descricao_complementar,
        prazo_entrega_dias: itemDto.prazo_entrega_dias,
        garantia_meses: itemDto.garantia_meses,
      });

      await this.propostaItemRepository.save(propostaItem);
      valorTotal += valorTotalItem;
    }

    // Atualiza valor total da proposta
    propostaSalva.valor_total_proposta = valorTotal;
    return await this.propostaRepository.save(propostaSalva);
  }

  async findByLicitacao(licitacaoId: string): Promise<Proposta[]> {
    const propostas = await this.propostaRepository.find({
      where: { licitacao_id: licitacaoId },
      relations: ['fornecedor', 'itens', 'itens.item_licitacao'],
      order: { valor_total_proposta: 'ASC' }
    });

    return propostas.map((proposta) => {
      const itens_proposta = (proposta.itens || []).map((pi) => {
        const item = pi.item_licitacao;
        return {
          id: pi.id,
          item_licitacao_id: pi.item_licitacao_id,
          numero_item: item?.numero_item,
          descricao: item?.descricao_detalhada || item?.descricao_resumida,
          quantidade: item?.quantidade,
          unidade: item?.unidade_medida,
          valor_unitario: pi.valor_unitario,
          valor_total: pi.valor_total,
          marca: pi.marca,
          modelo: pi.modelo,
          fabricante: pi.fabricante,
          descricao_complementar: pi.descricao_complementar,
          prazo_entrega_dias: pi.prazo_entrega_dias,
          garantia_meses: pi.garantia_meses,
        };
      });

      return {
        ...proposta,
        itens_proposta,
      } as any;
    });
  }

  async findByFornecedor(fornecedorId: string): Promise<Proposta[]> {
    const propostas = await this.propostaRepository.find({
      where: { fornecedor_id: fornecedorId },
      relations: ['licitacao'],
      order: { created_at: 'DESC' }
    });

    return propostas.map((p) => {
      const lic = (p as any).licitacao;
      if (!lic) return p;
      return {
        ...p,
        licitacao: {
          ...lic,
          data_publicacao_edital: formatarDataLocal(lic.data_publicacao_edital),
          data_limite_impugnacao: formatarDataLocal(lic.data_limite_impugnacao),
          data_inicio_acolhimento: formatarDataLocal(lic.data_inicio_acolhimento),
          data_fim_acolhimento: formatarDataLocal(lic.data_fim_acolhimento),
          data_abertura_sessao: formatarDataLocal(lic.data_abertura_sessao),
        }
      } as any;
    });
  }

  async findOne(id: string): Promise<Proposta> {
    const proposta = await this.propostaRepository.findOne({
      where: { id },
      relations: ['licitacao', 'fornecedor']
    });
    if (!proposta) {
      throw new NotFoundException(`Proposta com ID ${id} não encontrada`);
    }

    const lic = (proposta as any).licitacao;
    if (!lic) return proposta;

    return {
      ...proposta,
      licitacao: {
        ...lic,
        data_publicacao_edital: formatarDataLocal(lic.data_publicacao_edital),
        data_limite_impugnacao: formatarDataLocal(lic.data_limite_impugnacao),
        data_inicio_acolhimento: formatarDataLocal(lic.data_inicio_acolhimento),
        data_fim_acolhimento: formatarDataLocal(lic.data_fim_acolhimento),
        data_abertura_sessao: formatarDataLocal(lic.data_abertura_sessao),
      }
    } as any;
  }

  async getItens(propostaId: string): Promise<PropostaItem[]> {
    return await this.propostaItemRepository.find({
      where: { proposta_id: propostaId },
      relations: ['item_licitacao'],
      order: { created_at: 'ASC' }
    });
  }

  async enviar(id: string): Promise<Proposta> {
    const proposta = await this.findOne(id);

    await this.validarAntesAberturaSessao(proposta.licitacao_id);

    if (proposta.status !== StatusProposta.RASCUNHO) {
      throw new BadRequestException('Proposta já foi enviada');
    }

    // Verifica se tem pelo menos um item
    const itens = await this.getItens(id);
    if (itens.length === 0) {
      throw new BadRequestException('Proposta precisa ter pelo menos um item');
    }

    proposta.status = StatusProposta.ENVIADA;
    proposta.data_envio = new Date();

    return await this.propostaRepository.save(proposta);
  }

  async classificar(id: string): Promise<Proposta> {
    const proposta = await this.findOne(id);
    proposta.status = StatusProposta.CLASSIFICADA;
    proposta.data_analise = new Date();
    return await this.propostaRepository.save(proposta);
  }

  async desclassificar(id: string, dados: DesclassificarPropostaDto): Promise<Proposta> {
    const proposta = await this.findOne(id);
    proposta.status = StatusProposta.DESCLASSIFICADA;
    proposta.motivo_desclassificacao = dados.motivo;
    proposta.data_analise = new Date();
    return await this.propostaRepository.save(proposta);
  }

  async marcarVencedora(id: string): Promise<Proposta> {
    const proposta = await this.findOne(id);
    proposta.status = StatusProposta.VENCEDORA;
    return await this.propostaRepository.save(proposta);
  }

  async cancelar(id: string): Promise<Proposta> {
    const proposta = await this.findOne(id);

    if (proposta.status !== StatusProposta.RASCUNHO) {
      throw new BadRequestException('Apenas propostas em rascunho podem ser canceladas');
    }

    proposta.status = StatusProposta.CANCELADA;
    return await this.propostaRepository.save(proposta);
  }

  async remove(id: string, fornecedorId: string): Promise<void> {
    if (!fornecedorId) {
      throw new BadRequestException('fornecedorId é obrigatório');
    }

    const proposta = await this.propostaRepository.findOne({
      where: { id },
    });
    if (!proposta) {
      throw new NotFoundException(`Proposta com ID ${id} não encontrada`);
    }

    if (proposta.fornecedor_id !== fornecedorId) {
      throw new BadRequestException('Apenas o fornecedor da proposta pode excluí-la');
    }

    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: proposta.licitacao_id },
    });

    const abertura = licitacao?.data_abertura_sessao;
    if (abertura instanceof Date && !isNaN(abertura.getTime())) {
      const agora = new Date();
      if (agora >= abertura) {
        throw new BadRequestException('Não é possível excluir a proposta após a abertura da sessão');
      }
    }

    await this.propostaRepository.remove(proposta);
  }

  // Ranking de propostas por item
  async getRankingPorItem(itemLicitacaoId: string) {
    const propostaItens = await this.propostaItemRepository.find({
      where: { item_licitacao_id: itemLicitacaoId },
      relations: ['proposta', 'proposta.fornecedor'],
      order: { valor_unitario: 'ASC' }
    });

    return propostaItens
      .filter(pi => pi.proposta.status !== StatusProposta.DESCLASSIFICADA && 
                    pi.proposta.status !== StatusProposta.CANCELADA)
      .map((pi, index) => ({
        posicao: index + 1,
        fornecedor_id: pi.proposta.fornecedor_id,
        fornecedor_nome: pi.proposta.fornecedor?.razao_social,
        valor_unitario: pi.valor_unitario,
        valor_total: pi.valor_total,
        marca: pi.marca,
        modelo: pi.modelo,
      }));
  }

  // Atualizar proposta
  async update(id: string, dados: { valor_total_proposta?: number }): Promise<Proposta> {
    const proposta = await this.findOne(id);

    await this.validarAntesAberturaSessao(proposta.licitacao_id);
    
    // Só permite editar se não estiver desclassificada ou cancelada
    if (proposta.status === StatusProposta.DESCLASSIFICADA || proposta.status === StatusProposta.CANCELADA) {
      throw new BadRequestException('Esta proposta não pode ser editada');
    }

    if (dados.valor_total_proposta !== undefined) {
      proposta.valor_total_proposta = dados.valor_total_proposta;
    }

    return await this.propostaRepository.save(proposta);
  }

  // Atualizar item da proposta
  async updateItem(itemId: string, dados: { valor_unitario?: number; marca?: string; modelo?: string }): Promise<PropostaItem> {
    const item = await this.propostaItemRepository.findOne({
      where: { id: itemId },
      relations: ['proposta', 'item_licitacao']
    });

    if (!item) {
      throw new NotFoundException('Item da proposta não encontrado');
    }

    // Verifica se a proposta pode ser editada
    if (item.proposta.status === StatusProposta.DESCLASSIFICADA || item.proposta.status === StatusProposta.CANCELADA) {
      throw new BadRequestException('Esta proposta não pode ser editada');
    }

    await this.validarAntesAberturaSessao(item.proposta.licitacao_id);

    if (dados.valor_unitario !== undefined) {
      item.valor_unitario = dados.valor_unitario;
      // Recalcula valor total do item
      const quantidade = item.item_licitacao?.quantidade || 0;
      item.valor_total = dados.valor_unitario * quantidade;
    }
    if (dados.marca !== undefined) {
      item.marca = dados.marca;
    }
    if (dados.modelo !== undefined) {
      item.modelo = dados.modelo;
    }

    return await this.propostaItemRepository.save(item);
  }
}
