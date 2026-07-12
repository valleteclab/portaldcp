/**
 * ============================================================================
 * PRÉ-OS DE PUBLICIDADE — fluxo fornecedor → responsável → gestor
 * ============================================================================
 *
 * Fornecedor monta e envia; responsável do órgão confere/ajusta (devolve com
 * motivo ou aceita). O aceite gera os itens no contrato (gerarLinhasPublicidade)
 * e a Requisição/OS segue o fluxo normal de autorização do gestor.
 *
 * Notificações (padrão do sistema: sino + WhatsApp):
 * - ENVIADA   → usuários do órgão (sino) + WhatsApp do responsável de medições/OS
 * - DEVOLVIDA → fornecedor (sino do portal) + WhatsApp do representante
 * - ACEITA    → fornecedor (sino + WhatsApp) — é a aprovação prévia por escrito
 *
 * ============================================================================
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato } from './entities/contrato.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import {
  PreOsPublicidade,
  StatusPreOs,
  LinhaPreOs,
} from './entities/pre-os-publicidade.entity';
import {
  TipoNotificacao,
  PrioridadeNotificacao,
} from '../notificacoes/entities/notificacao.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { TabelaReferenciaService } from './tabela-referencia.service';

const r2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

@Injectable()
export class PreOsPublicidadeService {
  private readonly logger = new Logger(PreOsPublicidadeService.name);

  constructor(
    @InjectRepository(PreOsPublicidade)
    private readonly preOsRepo: Repository<PreOsPublicidade>,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Orgao)
    private readonly orgaoRepo: Repository<Orgao>,
    private readonly notificacoes: NotificacoesService,
    private readonly whatsapp: WhatsAppService,
    private readonly tabelaReferencia: TabelaReferenciaService,
  ) {}

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async contratoDoFornecedor(contratoId: string, fornecedorId: string): Promise<Contrato> {
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Contrato não pertence a este fornecedor');
    }
    if (!contrato.remuneracao_publicidade) {
      throw new BadRequestException('Este contrato não é de publicidade (sem remuneração configurada)');
    }
    return contrato;
  }

  private validarLinhas(linhas: LinhaPreOs[]): void {
    if (!Array.isArray(linhas) || linhas.length === 0) {
      throw new BadRequestException('A pré-OS precisa de ao menos uma linha.');
    }
    for (const l of linhas) {
      if (l.tipo === 'SINAPRO' && !l.item_tabela_id) {
        throw new BadRequestException('Linha SINAPRO sem item da tabela.');
      }
      if ((l.tipo === 'TERCEIROS' || l.tipo === 'MIDIA') && !l.descricao?.trim()) {
        throw new BadRequestException(`Linha ${l.tipo} sem descrição do serviço.`);
      }
    }
  }

  private totalEstimado(linhas: LinhaPreOs[]): number {
    return r2(
      linhas.reduce((s, l) => s + Number(l.preco_unit || 0) * (Number(l.quantidade) || 1), 0),
    );
  }

  // ==========================================================================
  // Fornecedor
  // ==========================================================================

  async listarDoFornecedor(contratoId: string, fornecedorId: string): Promise<PreOsPublicidade[]> {
    await this.contratoDoFornecedor(contratoId, fornecedorId);
    return this.preOsRepo.find({
      where: { contrato_id: contratoId, fornecedor_id: fornecedorId },
      order: { sequencial: 'DESC' },
    });
  }

  async criarRascunho(
    contratoId: string,
    fornecedorId: string,
    dados: { titulo: string; justificativa?: string; linhas: LinhaPreOs[] },
  ): Promise<PreOsPublicidade> {
    const contrato = await this.contratoDoFornecedor(contratoId, fornecedorId);
    if (!dados.titulo?.trim()) throw new BadRequestException('Informe o título/campanha da pré-OS.');
    this.validarLinhas(dados.linhas);
    const ultimo = await this.preOsRepo.findOne({
      where: { contrato_id: contratoId },
      order: { sequencial: 'DESC' },
    });
    const preOs = this.preOsRepo.create({
      contrato_id: contratoId,
      orgao_id: contrato.orgao_id,
      fornecedor_id: fornecedorId,
      sequencial: (ultimo?.sequencial || 0) + 1,
      titulo: dados.titulo.trim(),
      justificativa: dados.justificativa?.trim() || null,
      linhas: dados.linhas,
      valor_total_estimado: this.totalEstimado(dados.linhas),
      status: StatusPreOs.RASCUNHO,
    });
    return this.preOsRepo.save(preOs);
  }

  async atualizarRascunho(
    preOsId: string,
    fornecedorId: string,
    dados: { titulo?: string; justificativa?: string; linhas?: LinhaPreOs[] },
  ): Promise<PreOsPublicidade> {
    const preOs = await this.preOsRepo.findOne({ where: { id: preOsId } });
    if (!preOs) throw new NotFoundException('Pré-OS não encontrada');
    if (preOs.fornecedor_id !== fornecedorId) throw new ForbiddenException('Sem acesso a esta pré-OS');
    if (preOs.status !== StatusPreOs.RASCUNHO && preOs.status !== StatusPreOs.DEVOLVIDA) {
      throw new BadRequestException('Só é possível editar pré-OS em rascunho ou devolvida.');
    }
    if (dados.titulo !== undefined) preOs.titulo = dados.titulo.trim() || preOs.titulo;
    if (dados.justificativa !== undefined) preOs.justificativa = dados.justificativa?.trim() || null;
    if (dados.linhas !== undefined) {
      this.validarLinhas(dados.linhas);
      preOs.linhas = dados.linhas;
      preOs.valor_total_estimado = this.totalEstimado(dados.linhas);
    }
    return this.preOsRepo.save(preOs);
  }

  async enviar(preOsId: string, fornecedorId: string): Promise<PreOsPublicidade> {
    const preOs = await this.preOsRepo.findOne({ where: { id: preOsId } });
    if (!preOs) throw new NotFoundException('Pré-OS não encontrada');
    if (preOs.fornecedor_id !== fornecedorId) throw new ForbiddenException('Sem acesso a esta pré-OS');
    if (preOs.status !== StatusPreOs.RASCUNHO && preOs.status !== StatusPreOs.DEVOLVIDA) {
      throw new BadRequestException('Esta pré-OS já foi enviada.');
    }
    this.validarLinhas(preOs.linhas);
    preOs.status = StatusPreOs.ENVIADA;
    preOs.enviada_em = new Date();
    preOs.motivo_devolucao = null;
    const salvo = await this.preOsRepo.save(preOs);
    await this.notificarOrgaoEnvio(salvo);
    return salvo;
  }

  async excluirRascunho(preOsId: string, fornecedorId: string): Promise<void> {
    const preOs = await this.preOsRepo.findOne({ where: { id: preOsId } });
    if (!preOs) throw new NotFoundException('Pré-OS não encontrada');
    if (preOs.fornecedor_id !== fornecedorId) throw new ForbiddenException('Sem acesso a esta pré-OS');
    if (preOs.status !== StatusPreOs.RASCUNHO) {
      throw new BadRequestException('Só é possível excluir pré-OS em rascunho.');
    }
    await this.preOsRepo.delete(preOsId);
  }

  // ==========================================================================
  // Órgão (responsável)
  // ==========================================================================

  async listarDoContrato(contratoId: string, orgaoId: string): Promise<PreOsPublicidade[]> {
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.orgao_id !== orgaoId) throw new ForbiddenException('Sem acesso a este contrato');
    return this.preOsRepo.find({
      where: { contrato_id: contratoId },
      order: { sequencial: 'DESC' },
    });
  }

  async devolver(
    preOsId: string,
    orgaoId: string,
    motivo: string,
    respondidaPorNome?: string,
  ): Promise<PreOsPublicidade> {
    const preOs = await this.preOsRepo.findOne({ where: { id: preOsId } });
    if (!preOs) throw new NotFoundException('Pré-OS não encontrada');
    if (preOs.orgao_id !== orgaoId) throw new ForbiddenException('Sem acesso a esta pré-OS');
    if (preOs.status !== StatusPreOs.ENVIADA) {
      throw new BadRequestException('Só é possível devolver pré-OS enviada.');
    }
    if (!motivo?.trim()) throw new BadRequestException('Informe o motivo da devolução.');
    preOs.status = StatusPreOs.DEVOLVIDA;
    preOs.motivo_devolucao = motivo.trim();
    preOs.respondida_em = new Date();
    preOs.respondida_por_nome = respondidaPorNome || null;
    const salvo = await this.preOsRepo.save(preOs);
    await this.notificarFornecedor(salvo, 'DEVOLVIDA');
    return salvo;
  }

  /**
   * Aceita a pré-OS (aprovação prévia): gera os itens no contrato via
   * gerarLinhasPublicidade (linhas podem ter sido ajustadas pelo responsável).
   */
  async aceitar(
    preOsId: string,
    orgaoId: string,
    respondidaPorNome?: string,
    linhasAjustadas?: LinhaPreOs[],
  ): Promise<PreOsPublicidade> {
    const preOs = await this.preOsRepo.findOne({ where: { id: preOsId } });
    if (!preOs) throw new NotFoundException('Pré-OS não encontrada');
    if (preOs.orgao_id !== orgaoId) throw new ForbiddenException('Sem acesso a esta pré-OS');
    if (preOs.status !== StatusPreOs.ENVIADA) {
      throw new BadRequestException('Só é possível aceitar pré-OS enviada.');
    }
    const linhas = linhasAjustadas?.length ? linhasAjustadas : preOs.linhas;
    this.validarLinhas(linhas);

    const itens = await this.tabelaReferencia.gerarLinhasPublicidade(
      preOs.contrato_id,
      linhas as any[],
    );
    if (itens.length === 0) {
      throw new BadRequestException('Nenhum item pôde ser gerado a partir das linhas da pré-OS.');
    }

    preOs.status = StatusPreOs.ACEITA;
    preOs.linhas = linhas;
    preOs.valor_total_estimado = this.totalEstimado(linhas);
    preOs.respondida_em = new Date();
    preOs.respondida_por_nome = respondidaPorNome || null;
    preOs.itens_gerados_ids = itens.map((i) => i.id);
    const salvo = await this.preOsRepo.save(preOs);
    await this.notificarFornecedor(salvo, 'ACEITA');
    return salvo;
  }

  // ==========================================================================
  // Notificações (sino + WhatsApp — padrão do sistema)
  // ==========================================================================

  private async dadosContexto(preOs: PreOsPublicidade) {
    const contrato = await this.contratoRepo.findOne({ where: { id: preOs.contrato_id } });
    const fornecedor = await this.fornecedorRepo.findOne({
      where: { id: preOs.fornecedor_id },
      select: ['id', 'razao_social', 'email', 'telefone', 'representante_telefone'],
    });
    return { contrato, fornecedor };
  }

  private async notificarOrgaoEnvio(preOs: PreOsPublicidade): Promise<void> {
    try {
      const { contrato, fornecedor } = await this.dadosContexto(preOs);
      const titulo = `Pré-OS #${preOs.sequencial} recebida — ${contrato?.numero_contrato}`;
      const mensagem =
        `${fornecedor?.razao_social || 'O fornecedor'} enviou a pré-OS "${preOs.titulo}" ` +
        `(${brl(Number(preOs.valor_total_estimado))}) do contrato ${contrato?.numero_contrato}. ` +
        `Confira, ajuste se necessário e aceite para gerar a OS, ou devolva com motivo.`;

      // Sino: usuários ativos do órgão
      const usuarios = await this.usuarioRepo.find({
        where: { orgao_id: preOs.orgao_id, ativo: true },
        select: ['id', 'email', 'telefone'],
      });
      await this.notificacoes.criarParaMultiplos(usuarios, {
        orgao_id: preOs.orgao_id,
        tipo: TipoNotificacao.PRE_OS_ENVIADA,
        titulo,
        mensagem,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'pre_os',
        entidade_id: preOs.id,
        link: `/orgao/contratos/${preOs.contrato_id}?tab=detalhes`,
        metadata: { pre_os_sequencial: preOs.sequencial, contrato_numero: contrato?.numero_contrato },
      } as any);

      // WhatsApp do responsável (mesmo do fluxo de medições)
      const orgao = await this.orgaoRepo.findOne({
        where: { id: preOs.orgao_id },
        select: ['id', 'whatsapp_responsavel_medicoes'],
      });
      const zap = orgao?.whatsapp_responsavel_medicoes?.replace(/\D/g, '');
      if (zap) {
        await this.whatsapp
          .enviar(preOs.orgao_id, {
            to: zap,
            mensagem: `📋 *Portal DCP — Pré-OS recebida*\n\n${mensagem}`,
          })
          .catch((e) => this.logger.warn(`WhatsApp responsável não enviado: ${e.message}`));
      }
    } catch (e) {
      this.logger.error(`Erro ao notificar envio de pré-OS: ${(e as any).message}`);
    }
  }

  private async notificarFornecedor(preOs: PreOsPublicidade, evento: 'DEVOLVIDA' | 'ACEITA'): Promise<void> {
    try {
      const { contrato, fornecedor } = await this.dadosContexto(preOs);
      const aceita = evento === 'ACEITA';
      const titulo = aceita
        ? `Pré-OS #${preOs.sequencial} aprovada — ${contrato?.numero_contrato}`
        : `Pré-OS #${preOs.sequencial} devolvida — ${contrato?.numero_contrato}`;
      const mensagem = aceita
        ? `A pré-OS "${preOs.titulo}" (${brl(Number(preOs.valor_total_estimado))}) foi APROVADA pelo órgão ` +
          `(aprovação prévia — cláusula 3.6). A Ordem de Serviço será emitida na sequência.`
        : `A pré-OS "${preOs.titulo}" foi DEVOLVIDA pelo órgão. Motivo: ${preOs.motivo_devolucao}. ` +
          `Corrija no portal e reenvie.`;

      // Sino do portal do fornecedor
      if (fornecedor) {
        await this.notificacoes.criarParaMultiplos(
          [{ id: fornecedor.id, email: fornecedor.email, telefone: fornecedor.representante_telefone || fornecedor.telefone }],
          {
            orgao_id: preOs.orgao_id,
            tipo: aceita ? TipoNotificacao.PRE_OS_ACEITA : TipoNotificacao.PRE_OS_DEVOLVIDA,
            titulo,
            mensagem,
            prioridade: PrioridadeNotificacao.ALTA,
            entidade_tipo: 'pre_os',
            entidade_id: preOs.id,
            link: `/fornecedor/contratos/${preOs.contrato_id}`,
            metadata: { pre_os_sequencial: preOs.sequencial, contrato_numero: contrato?.numero_contrato },
          } as any,
        );
        // WhatsApp do representante do fornecedor
        const zap = (fornecedor.representante_telefone || fornecedor.telefone || '').replace(/\D/g, '');
        if (zap) {
          await this.whatsapp
            .enviar(preOs.orgao_id, {
              to: zap,
              mensagem: `${aceita ? '✅' : '↩️'} *Portal DCP — Pré-OS ${aceita ? 'aprovada' : 'devolvida'}*\n\n${mensagem}`,
            })
            .catch((e) => this.logger.warn(`WhatsApp fornecedor não enviado: ${e.message}`));
        }
      }
    } catch (e) {
      this.logger.error(`Erro ao notificar fornecedor da pré-OS: ${(e as any).message}`);
    }
  }
}
