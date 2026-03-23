import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { CategoriaBem } from './entities/categoria-bem.entity';
import { ManutencaoBem } from './entities/manutencao-bem.entity';
import { LocacaoBem } from './entities/locacao-bem.entity';
import { ServidorBem } from './entities/servidor-bem.entity';
import { ComodatoBem } from './entities/comodato-bem.entity';
import { HistoricoBem } from './entities/historico-bem.entity';
import { StatusBem, StatusManutencao, TipoBem } from './entities/enums';
import { CriarBemDto } from './dto/criar-bem.dto';
import { AtualizarBemDto } from './dto/atualizar-bem.dto';
import { CriarManutencaoDto } from './dto/criar-manutencao.dto';
import { AtualizarManutencaoDto } from './dto/atualizar-manutencao.dto';
import { CriarLocacaoDto } from './dto/criar-locacao.dto';
import { CriarServidorBemDto } from './dto/criar-servidor-bem.dto';
import { CriarComodatoDto } from './dto/criar-comodato.dto';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';

@Injectable()
export class PatrimonioService {
  constructor(
    @InjectRepository(BemPatrimonial)
    private readonly bemRepository: Repository<BemPatrimonial>,
    @InjectRepository(CategoriaBem)
    private readonly categoriaRepository: Repository<CategoriaBem>,
    @InjectRepository(ManutencaoBem)
    private readonly manutencaoRepository: Repository<ManutencaoBem>,
    @InjectRepository(LocacaoBem)
    private readonly locacaoRepository: Repository<LocacaoBem>,
    @InjectRepository(ServidorBem)
    private readonly servidorRepository: Repository<ServidorBem>,
    @InjectRepository(ComodatoBem)
    private readonly comodatoRepository: Repository<ComodatoBem>,
    @InjectRepository(HistoricoBem)
    private readonly historicoRepository: Repository<HistoricoBem>,
  ) {}

  // ─── BENS ────────────────────────────────────────────

  async listarBens(
    orgaoId: string,
    filtros?: {
      tipo?: TipoBem;
      status?: StatusBem;
      categoria_id?: string;
      busca?: string;
    },
  ) {
    const qb = this.bemRepository
      .createQueryBuilder('bem')
      .leftJoinAndSelect('bem.categoria', 'categoria')
      .where('bem.orgao_id = :orgaoId', { orgaoId });

    if (filtros?.tipo) {
      qb.andWhere('bem.tipo = :tipo', { tipo: filtros.tipo });
    }
    if (filtros?.status) {
      qb.andWhere('bem.status = :status', { status: filtros.status });
    }
    if (filtros?.categoria_id) {
      qb.andWhere('bem.categoria_id = :categoriaId', {
        categoriaId: filtros.categoria_id,
      });
    }
    if (filtros?.busca) {
      qb.andWhere(
        '(bem.descricao ILIKE :busca OR bem.plaqueta ILIKE :busca)',
        { busca: `%${filtros.busca}%` },
      );
    }

    qb.orderBy('bem.created_at', 'DESC');
    return qb.getMany();
  }

  async obterBem(orgaoId: string, bemId: string) {
    const bem = await this.bemRepository.findOne({
      where: { id: bemId, orgao_id: orgaoId },
      relations: [
        'categoria',
        'manutencoes',
        'locacoes',
        'servidores',
        'comodatos',
        'historicos',
      ],
    });
    if (!bem) throw new NotFoundException('Bem não encontrado');
    return bem;
  }

  async criarBem(orgaoId: string, dto: CriarBemDto, usuarioNome: string) {
    const bem = this.bemRepository.create({
      ...dto,
      orgao_id: orgaoId,
    });
    const salvo = await this.bemRepository.save(bem);

    await this.registrarHistorico(
      salvo.id,
      orgaoId,
      'CRIADO',
      `Bem "${salvo.descricao}" cadastrado`,
      usuarioNome,
    );

    return salvo;
  }

  async atualizarBem(
    orgaoId: string,
    bemId: string,
    dto: AtualizarBemDto,
    usuarioNome: string,
  ) {
    const bem = await this.obterBem(orgaoId, bemId);
    Object.assign(bem, dto);
    const salvo = await this.bemRepository.save(bem);

    await this.registrarHistorico(
      bemId,
      orgaoId,
      'EDITADO',
      `Bem "${salvo.descricao}" atualizado`,
      usuarioNome,
    );

    return salvo;
  }

  async excluirBem(orgaoId: string, bemId: string, usuarioNome: string) {
    const bem = await this.obterBem(orgaoId, bemId);
    await this.registrarHistorico(
      bemId,
      orgaoId,
      'EXCLUIDO',
      `Bem "${bem.descricao}" excluído`,
      usuarioNome,
    );
    await this.bemRepository.remove(bem);
    return { message: 'Bem excluído com sucesso' };
  }

  // ─── CATEGORIAS ──────────────────────────────────────

  async listarCategorias(orgaoId: string) {
    return this.categoriaRepository.find({
      where: [
        { sistema: true, ativo: true },
        { orgao_id: orgaoId, ativo: true },
      ],
      order: { sistema: 'DESC', nome: 'ASC' },
    });
  }

  async criarCategoria(orgaoId: string, dto: CriarCategoriaDto) {
    const categoria = this.categoriaRepository.create({
      ...dto,
      orgao_id: orgaoId,
      sistema: false,
    });
    return this.categoriaRepository.save(categoria);
  }

  async atualizarCategoria(
    orgaoId: string,
    categoriaId: string,
    dto: CriarCategoriaDto,
  ) {
    const categoria = await this.categoriaRepository.findOne({
      where: { id: categoriaId, orgao_id: orgaoId, sistema: false },
    });
    if (!categoria)
      throw new NotFoundException(
        'Categoria não encontrada ou é do sistema',
      );
    categoria.nome = dto.nome;
    return this.categoriaRepository.save(categoria);
  }

  async desativarCategoria(orgaoId: string, categoriaId: string) {
    const categoria = await this.categoriaRepository.findOne({
      where: { id: categoriaId, orgao_id: orgaoId, sistema: false },
    });
    if (!categoria)
      throw new NotFoundException(
        'Categoria não encontrada ou é do sistema',
      );
    categoria.ativo = false;
    return this.categoriaRepository.save(categoria);
  }

  // ─── MANUTENÇÕES ─────────────────────────────────────

  async listarManutencoes(
    orgaoId: string,
    filtros?: { status?: StatusManutencao },
  ) {
    const where: any = { orgao_id: orgaoId };
    if (filtros?.status) where.status = filtros.status;

    return this.manutencaoRepository.find({
      where,
      relations: ['bem', 'bem.categoria'],
      order: { created_at: 'DESC' },
    });
  }

  async criarManutencao(
    orgaoId: string,
    bemId: string,
    dto: CriarManutencaoDto,
    usuarioNome: string,
  ) {
    const bem = await this.obterBem(orgaoId, bemId);

    const manutencao = this.manutencaoRepository.create({
      ...dto,
      bem_id: bemId,
      orgao_id: orgaoId,
      registrado_por: usuarioNome,
    });
    const salva = await this.manutencaoRepository.save(manutencao);

    // Atualiza status do bem
    bem.status = StatusBem.EM_MANUTENCAO;
    await this.bemRepository.save(bem);

    await this.registrarHistorico(
      bemId,
      orgaoId,
      'ENVIADO_MANUTENCAO',
      `Enviado para manutenção: ${dto.motivo}`,
      usuarioNome,
    );

    return salva;
  }

  async atualizarManutencao(
    orgaoId: string,
    manutId: string,
    dto: AtualizarManutencaoDto,
    usuarioNome: string,
  ) {
    const manutencao = await this.manutencaoRepository.findOne({
      where: { id: manutId, orgao_id: orgaoId },
      relations: ['bem'],
    });
    if (!manutencao)
      throw new NotFoundException('Manutenção não encontrada');

    Object.assign(manutencao, dto);
    const salva = await this.manutencaoRepository.save(manutencao);

    // Se concluída, atualiza status do bem
    if (dto.status === StatusManutencao.CONCLUIDO) {
      manutencao.bem.status = StatusBem.ATIVO;
      await this.bemRepository.save(manutencao.bem);

      await this.registrarHistorico(
        manutencao.bem_id,
        orgaoId,
        'RETORNADO_MANUTENCAO',
        'Manutenção concluída, bem retornado ao ativo',
        usuarioNome,
      );
    }

    return salva;
  }

  async obterManutencao(orgaoId: string, manutId: string) {
    const manutencao = await this.manutencaoRepository.findOne({
      where: { id: manutId, orgao_id: orgaoId },
      relations: ['bem', 'bem.categoria'],
    });
    if (!manutencao)
      throw new NotFoundException('Manutenção não encontrada');
    return manutencao;
  }

  // ─── LOCAÇÕES ────────────────────────────────────────

  async listarLocacoes(orgaoId: string) {
    return this.locacaoRepository.find({
      where: { orgao_id: orgaoId },
      relations: ['bem', 'bem.categoria'],
      order: { created_at: 'DESC' },
    });
  }

  async criarLocacao(
    orgaoId: string,
    bemId: string,
    dto: CriarLocacaoDto,
    usuarioNome: string,
  ) {
    await this.obterBem(orgaoId, bemId);

    const locacao = this.locacaoRepository.create({
      ...dto,
      bem_id: bemId,
      orgao_id: orgaoId,
    });
    const salva = await this.locacaoRepository.save(locacao);

    await this.registrarHistorico(
      bemId,
      orgaoId,
      'LOCACAO_VINCULADA',
      `Locação vinculada: ${dto.locador}`,
      usuarioNome,
    );

    return salva;
  }

  async atualizarLocacao(
    orgaoId: string,
    locId: string,
    dto: Partial<CriarLocacaoDto>,
  ) {
    const locacao = await this.locacaoRepository.findOne({
      where: { id: locId, orgao_id: orgaoId },
    });
    if (!locacao) throw new NotFoundException('Locação não encontrada');
    Object.assign(locacao, dto);
    return this.locacaoRepository.save(locacao);
  }

  // ─── SERVIDORES ──────────────────────────────────────

  async listarServidores(orgaoId: string) {
    return this.servidorRepository.find({
      where: { orgao_id: orgaoId },
      relations: ['bem', 'bem.categoria'],
      order: { created_at: 'DESC' },
    });
  }

  async criarServidorBem(
    orgaoId: string,
    bemId: string,
    dto: CriarServidorBemDto,
    usuarioNome: string,
  ) {
    await this.obterBem(orgaoId, bemId);

    const servidor = this.servidorRepository.create({
      ...dto,
      bem_id: bemId,
      orgao_id: orgaoId,
    });
    const salvo = await this.servidorRepository.save(servidor);

    await this.registrarHistorico(
      bemId,
      orgaoId,
      'SERVIDOR_VINCULADO',
      `Vinculado ao servidor: ${dto.proprietario_nome}`,
      usuarioNome,
    );

    return salvo;
  }

  async atualizarServidorBem(
    orgaoId: string,
    servId: string,
    dto: Partial<CriarServidorBemDto>,
  ) {
    const servidor = await this.servidorRepository.findOne({
      where: { id: servId, orgao_id: orgaoId },
    });
    if (!servidor)
      throw new NotFoundException('Registro de servidor não encontrado');
    Object.assign(servidor, dto);
    return this.servidorRepository.save(servidor);
  }

  // ─── COMODATOS ───────────────────────────────────────

  async listarComodatos(orgaoId: string) {
    return this.comodatoRepository.find({
      where: { orgao_id: orgaoId },
      relations: ['bem', 'bem.categoria'],
      order: { created_at: 'DESC' },
    });
  }

  async criarComodato(
    orgaoId: string,
    bemId: string,
    dto: CriarComodatoDto,
    usuarioNome: string,
  ) {
    await this.obterBem(orgaoId, bemId);

    const comodato = this.comodatoRepository.create({
      ...dto,
      bem_id: bemId,
      orgao_id: orgaoId,
    });
    const salvo = await this.comodatoRepository.save(comodato);

    await this.registrarHistorico(
      bemId,
      orgaoId,
      'COMODATO_VINCULADO',
      `Comodato vinculado: ${dto.comodante}`,
      usuarioNome,
    );

    return salvo;
  }

  async atualizarComodato(
    orgaoId: string,
    comodId: string,
    dto: Partial<CriarComodatoDto>,
  ) {
    const comodato = await this.comodatoRepository.findOne({
      where: { id: comodId, orgao_id: orgaoId },
    });
    if (!comodato) throw new NotFoundException('Comodato não encontrado');
    Object.assign(comodato, dto);
    return this.comodatoRepository.save(comodato);
  }

  // ─── HISTÓRICO ───────────────────────────────────────

  private async registrarHistorico(
    bemId: string,
    orgaoId: string,
    acao: string,
    descricao: string,
    usuarioNome: string,
  ) {
    const historico = this.historicoRepository.create({
      bem_id: bemId,
      orgao_id: orgaoId,
      acao,
      descricao,
      usuario_nome: usuarioNome,
    });
    return this.historicoRepository.save(historico);
  }
}
