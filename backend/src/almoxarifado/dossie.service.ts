import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { join } from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver');
import { Writable } from 'stream';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Recebimento, StatusRecebimento } from './entities/recebimento.entity';
import { DossieOrdem } from './entities/dossie-ordem.entity';
import { DossieAnexo } from './entities/dossie-anexo.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { NotaFiscalFornecedor } from './entities/nota-fiscal-fornecedor.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';

@Injectable()
export class DossieService {
  private readonly logger = new Logger(DossieService.name);

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(Recebimento)
    private readonly recebimentoRepository: Repository<Recebimento>,
    @InjectRepository(DossieOrdem)
    private readonly dossieRepository: Repository<DossieOrdem>,
    @InjectRepository(DossieAnexo)
    private readonly anexoRepository: Repository<DossieAnexo>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(NotaFiscalFornecedor)
    private readonly nfRepository: Repository<NotaFiscalFornecedor>,
    private readonly notificacoesService: NotificacoesService,
  ) {}

  /**
   * Lista ordens com recebimento ACEITO/ACEITO_PARCIAL para o fiscal.
   * Se o usuário é fiscal de algum contrato: mostra apenas ordens desses contratos.
   * Caso contrário (ex: admin, usuário sem contratos como fiscal): mostra todas as ordens do órgão.
   */
  async listarDossiesFiscal(orgaoId: string, fiscalId: string): Promise<any[]> {
    const contratosComoFiscal = await this.contratoRepository.find({
      where: { orgao_id: orgaoId, fiscal_id: fiscalId },
      select: ['id'],
    });
    const contratoIds = contratosComoFiscal.map((c) => c.id);

    const whereOrdens: { orgao_id: string; contrato_id?: any } = { orgao_id: orgaoId };
    if (contratoIds.length > 0) {
      whereOrdens.contrato_id = In(contratoIds);
    }

    const ordens = await this.ordemRepository.find({
      where: whereOrdens,
      relations: ['contrato', 'contrato.fornecedor', 'fornecedor'],
      order: { data_emissao: 'DESC' },
    });

    const resultado: any[] = [];
    for (const ordem of ordens) {
      const recebimentos = await this.recebimentoRepository.find({
        where: {
          ordem_fornecimento_id: ordem.id,
          status: In([StatusRecebimento.ACEITO, StatusRecebimento.ACEITO_PARCIAL]),
        },
        select: ['id', 'numero', 'comprovacao_aceite_path', 'comprovacao_aceite_codigo_validacao', 'status'],
      });
      if (recebimentos.length === 0) continue;

      const dossie = await this.dossieRepository.findOne({
        where: { ordem_fornecimento_id: ordem.id },
        relations: ['anexos'],
      });

      const temOfPdf = ordem.caminho_pdf && fs.existsSync(ordem.caminho_pdf);
      const nfs = await this.nfRepository.find({
        where: { ordem_fornecimento_id: ordem.id },
        select: ['id', 'numero', 'caminho_xml', 'caminho_pdf'],
      });
      const temNf = nfs.some((nf) => nf.caminho_xml || nf.caminho_pdf);
      const temComprovacao = recebimentos.some((r) => r.comprovacao_aceite_path && fs.existsSync(r.comprovacao_aceite_path));

      resultado.push({
        ordem_id: ordem.id,
        ordem_numero: ordem.numero,
        contrato_numero: ordem.contrato?.numero_contrato,
        fornecedor: ordem.fornecedor?.razao_social || ordem.contrato?.fornecedor?.razao_social,
        data_emissao: ordem.data_emissao,
        valor_total: ordem.valor_total,
        tem_of_pdf: !!temOfPdf,
        tem_nf: !!temNf,
        tem_comprovacao: !!temComprovacao,
        recebimentos: recebimentos.map((r) => ({
          id: r.id,
          numero: r.numero,
          tem_comprovacao: !!(r.comprovacao_aceite_path && fs.existsSync(r.comprovacao_aceite_path)),
        })),
        anexos_count: dossie?.anexos?.length ?? 0,
        entregue_financeiro_em: dossie?.entregue_financeiro_em,
      });
    }
    return resultado;
  }

  /**
   * Garante que existe DossieOrdem para a ordem e retorna
   */
  private async getOuCriarDossie(ordemId: string): Promise<DossieOrdem> {
    let dossie = await this.dossieRepository.findOne({
      where: { ordem_fornecimento_id: ordemId },
      relations: ['contrato'],
    });
    if (dossie) return dossie;

    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId },
      relations: ['contrato'],
    });
    if (!ordem || !ordem.contrato_id) throw new NotFoundException('Ordem não encontrada');

    dossie = this.dossieRepository.create({
      ordem_fornecimento_id: ordemId,
      contrato_id: ordem.contrato_id,
      fiscal_id: ordem.contrato?.fiscal_id || null,
    });
    return this.dossieRepository.save(dossie);
  }

  /**
   * Upload de anexo para o dossiê da ordem
   */
  async uploadAnexo(
    ordemId: string,
    file: Express.Multer.File,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<DossieAnexo> {
    const dossie = await this.getOuCriarDossie(ordemId);

    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const dossieDir = join(uploadDir, 'dossie_anexos');
    if (!fs.existsSync(dossieDir)) fs.mkdirSync(dossieDir, { recursive: true });

    const ext = file.originalname.split('.').pop() || 'bin';
    const filename = `dossie_${dossie.id}_${Date.now()}.${ext}`;
    const filepath = join(dossieDir, filename);
    if (file.path && fs.existsSync(file.path)) {
      fs.renameSync(file.path, filepath);
    } else if ((file as any).buffer) {
      fs.writeFileSync(filepath, (file as any).buffer);
    } else {
      throw new BadRequestException('Arquivo inválido');
    }

    const anexo = this.anexoRepository.create({
      dossie_ordem_id: dossie.id,
      nome_arquivo: file.originalname,
      caminho: filepath,
      tipo_mime: file.mimetype || 'application/octet-stream',
      usuario_upload_id: usuarioId,
      usuario_upload_nome: usuarioNome,
    });
    return this.anexoRepository.save(anexo);
  }

  /**
   * Gera ZIP com OF + NF + Comprovação + anexos
   */
  async gerarZip(ordemId: string): Promise<Buffer> {
    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId },
      relations: ['contrato', 'fornecedor'],
    });
    if (!ordem) throw new NotFoundException('Ordem não encontrada');

    const recebimentos = await this.recebimentoRepository.find({
      where: {
        ordem_fornecimento_id: ordemId,
        status: In([StatusRecebimento.ACEITO, StatusRecebimento.ACEITO_PARCIAL]),
      },
    });
    const dossie = await this.dossieRepository.findOne({
      where: { ordem_fornecimento_id: ordemId },
      relations: ['anexos'],
    });
    const nfs = await this.nfRepository.find({ where: { ordem_fornecimento_id: ordemId } });

    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk: Buffer, _enc, cb) {
          chunks.push(chunk);
          cb();
        },
      });
      writable.on('finish', () => resolve(Buffer.concat(chunks)));
      archive.pipe(writable);
      archive.on('error', reject);

      const safeNum = ordem.numero.replace(/\//g, '_');

      if (ordem.caminho_pdf && fs.existsSync(ordem.caminho_pdf)) {
        archive.file(ordem.caminho_pdf, { name: `01_OF_${safeNum}.pdf` });
      }

      let nfIdx = 0;
      for (const nf of nfs) {
        if (nf.caminho_pdf && fs.existsSync(nf.caminho_pdf)) {
          archive.file(nf.caminho_pdf, { name: `02_NF_${nf.numero || nfIdx + 1}.pdf` });
        } else if (nf.caminho_xml && fs.existsSync(nf.caminho_xml)) {
          archive.file(nf.caminho_xml, { name: `02_NF_${nf.numero || nfIdx + 1}.xml` });
        }
        nfIdx++;
      }

      for (const rec of recebimentos) {
        if (rec.comprovacao_aceite_path && fs.existsSync(rec.comprovacao_aceite_path)) {
          archive.file(rec.comprovacao_aceite_path, { name: `03_ComprovacaoAceite_${rec.numero.replace(/\//g, '_')}.pdf` });
        }
      }

      if (dossie?.anexos?.length) {
        let axIdx = 0;
        for (const ax of dossie.anexos) {
          if (fs.existsSync(ax.caminho)) {
            archive.file(ax.caminho, { name: `04_Anexo_${String(axIdx + 1).padStart(2, '0')}_${ax.nome_arquivo}` });
            axIdx++;
          }
        }
      }

      archive.finalize();
    });
  }

  /**
   * Marca dossiê como entregue ao financeiro
   */
  async marcarEntregueFinanceiro(
    ordemId: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<DossieOrdem> {
    const dossie = await this.getOuCriarDossie(ordemId);
    dossie.entregue_financeiro_em = new Date();
    dossie.entregue_financeiro_por = usuarioNome;
    return this.dossieRepository.save(dossie);
  }

  /**
   * Notifica o fiscal quando dossiê fica disponível
   */
  async notificarFiscalDossieDisponivel(
    orgaoId: string,
    ordemId: string,
    ordemNumero: string,
    fiscalId: string | null,
  ): Promise<void> {
    if (!fiscalId) return;
    try {
      await this.notificacoesService.criar({
        orgao_id: orgaoId,
        usuario_id: fiscalId,
        tipo: TipoNotificacao.DOSSIE_FISCAL_DISPONIVEL,
        titulo: `Dossiê disponível: Ordem ${ordemNumero}`,
        mensagem: `O dossiê da ordem ${ordemNumero} está disponível. Acesse a página Dossiê do Fiscal para baixar os documentos.`,
        link: `/orgao/fiscal/dossie`,
        metadata: { ordem_id: ordemId },
      });
      this.logger.log(`Notificação DOSSIE_FISCAL_DISPONIVEL enviada ao fiscal ${fiscalId}`);
    } catch (e) {
      this.logger.warn(`Erro ao notificar fiscal: ${(e as Error).message}`);
    }
  }

  /**
   * Garante que o dossiê existe e notifica o fiscal quando recebimento é aceito.
   * Chamado ao finalizar recebimento (ACEITO) para garantir que o fiscal receba a documentação.
   */
  async garantirDossieENotificarFiscal(ordemId: string): Promise<void> {
    try {
      const ordem = await this.ordemRepository.findOne({
        where: { id: ordemId },
        relations: ['contrato'],
      });
      if (!ordem) return;
      const dossie = await this.getOuCriarDossie(ordemId);
      this.logger.log(`Dossiê garantido para ordem ${ordem.numero} (id: ${dossie.id})`);
      if (ordem.contrato?.fiscal_id) {
        await this.notificarFiscalDossieDisponivel(
          ordem.orgao_id,
          ordemId,
          ordem.numero,
          ordem.contrato.fiscal_id,
        );
      }
    } catch (e) {
      this.logger.warn(`Erro ao garantir dossiê/notificar fiscal (ordem ${ordemId}): ${(e as Error).message}`);
    }
  }
}
