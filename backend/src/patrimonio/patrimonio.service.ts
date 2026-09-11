import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Not } from 'typeorm';
import * as XLSX from 'xlsx';
import { Setor } from '../orgaos/entities/setor.entity';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { CategoriaBem } from './entities/categoria-bem.entity';
import { ManutencaoBem } from './entities/manutencao-bem.entity';
import { LocacaoBem } from './entities/locacao-bem.entity';
import { ServidorBem } from './entities/servidor-bem.entity';
import { ComodatoBem } from './entities/comodato-bem.entity';
import { HistoricoBem } from './entities/historico-bem.entity';
import { StatusBem, StatusManutencao, TipoBem, EstadoConservacao } from './entities/enums';
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
    @InjectRepository(Setor)
    private readonly setorRepository: Repository<Setor>,
  ) {}

  // ─── BENS ────────────────────────────────────────────

  async listarBens(
    orgaoId: string,
    filtros?: {
      tipo?: TipoBem;
      status?: StatusBem;
      categoria_id?: string;
      setor_id?: string;
      busca?: string;
    },
  ) {
    const qb = this.bemRepository
      .createQueryBuilder('bem')
      .leftJoinAndSelect('bem.categoria', 'categoria')
      .leftJoinAndSelect('bem.setor', 'setor')
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
    if (filtros?.setor_id) {
      qb.andWhere('bem.setor_id = :setorId', { setorId: filtros.setor_id });
    }
    if (filtros?.busca) {
      qb.andWhere(
        '(bem.descricao ILIKE :busca OR bem.plaqueta ILIKE :busca OR bem.epc ILIKE :busca OR bem.numero_serie ILIKE :busca)',
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
        'setor',
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

  /**
   * Próximo número de plaqueta do órgão: maior plaqueta numérica + 1,
   * com 6 dígitos (000001, 000002…). Plaquetas antigas com letras não
   * entram na conta, então uma numeração legada convive com a nova.
   */
  async proximaPlaqueta(orgaoId: string): Promise<string> {
    const row = await this.bemRepository
      .createQueryBuilder('bem')
      .select("MAX(CAST(bem.plaqueta AS bigint))", 'maior')
      .where('bem.orgao_id = :orgaoId', { orgaoId })
      .andWhere("bem.plaqueta ~ '^[0-9]{1,12}$'")
      .getRawOne<{ maior: string | null }>();
    const proximo = Number(row?.maior || 0) + 1;
    return String(proximo).padStart(6, '0');
  }

  /** Plaqueta e EPC são únicos por órgão (409 quando repetir). */
  private async garantirCodigosUnicos(
    orgaoId: string,
    plaqueta?: string | null,
    epc?: string | null,
    ignorarBemId?: string,
  ) {
    const filtroId = ignorarBemId ? { id: Not(ignorarBemId) } : {};
    if (plaqueta) {
      const existe = await this.bemRepository.findOne({
        where: { orgao_id: orgaoId, plaqueta, ...filtroId },
        select: ['id', 'descricao'],
      });
      if (existe) {
        throw new ConflictException(
          `A plaqueta ${plaqueta} já está em uso: "${existe.descricao}"`,
        );
      }
    }
    if (epc) {
      const existe = await this.bemRepository.findOne({
        where: { orgao_id: orgaoId, epc, ...filtroId },
        select: ['id', 'descricao'],
      });
      if (existe) {
        throw new ConflictException(
          `O código RFID ${epc} já está vinculado a "${existe.descricao}"`,
        );
      }
    }
  }

  private normalizarCodigos<T extends { plaqueta?: string | null; epc?: string | null }>(dto: T): T {
    const out: any = { ...dto };
    if (typeof out.plaqueta === 'string') out.plaqueta = out.plaqueta.trim() || null;
    if (typeof out.epc === 'string') out.epc = out.epc.trim().toUpperCase() || null;
    return out;
  }

  async criarBem(orgaoId: string, dto: CriarBemDto, usuarioNome: string) {
    const dados = this.normalizarCodigos(dto);
    if (!dados.plaqueta) dados.plaqueta = await this.proximaPlaqueta(orgaoId);
    await this.garantirCodigosUnicos(orgaoId, dados.plaqueta, dados.epc);
    if (dados.setor_id) await this.validarSetor(orgaoId, dados.setor_id);

    const bem = this.bemRepository.create({
      ...(dados as any),
      orgao_id: orgaoId,
    }) as unknown as BemPatrimonial;
    const salvo = await this.bemRepository.save(bem);

    await this.registrarHistorico(
      salvo.id,
      orgaoId,
      'CRIADO',
      `Bem "${salvo.descricao}" cadastrado (plaqueta ${salvo.plaqueta})`,
      usuarioNome,
    );

    return this.obterBem(orgaoId, salvo.id);
  }

  private async validarSetor(orgaoId: string, setorId: string) {
    const setor = await this.setorRepository.findOne({ where: { id: setorId, orgao_id: orgaoId } });
    if (!setor) throw new BadRequestException('Setor não pertence a este órgão');
    return setor;
  }

  async atualizarBem(
    orgaoId: string,
    bemId: string,
    dto: AtualizarBemDto,
    usuarioNome: string,
  ) {
    const bem = await this.obterBem(orgaoId, bemId);
    const dados = this.normalizarCodigos(dto);
    if (dados.plaqueta === null) delete (dados as any).plaqueta; // nunca apaga a plaqueta
    await this.garantirCodigosUnicos(
      orgaoId,
      dados.plaqueta !== undefined ? dados.plaqueta : undefined,
      dados.epc !== undefined ? dados.epc : undefined,
      bemId,
    );
    if (dados.setor_id) await this.validarSetor(orgaoId, dados.setor_id);
    Object.assign(bem, dados);
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

  async salvarFoto(orgaoId: string, bemId: string, fotoUrl: string, usuarioNome: string) {
    const bem = await this.obterBem(orgaoId, bemId);
    bem.foto_url = fotoUrl;
    await this.bemRepository.save(bem);
    await this.registrarHistorico(bemId, orgaoId, 'FOTO', 'Foto do bem atualizada', usuarioNome);
    return { foto_url: fotoUrl };
  }

  /**
   * Carga inicial por planilha (xlsx/csv). Colunas reconhecidas pelo cabeçalho
   * (sem acento, sem maiúscula): plaqueta, descricao, categoria, setor, tipo,
   * estado, responsavel, cargo, marca, modelo, serie, valor, data_aquisicao,
   * nota_fiscal, fornecedor, epc, observacoes. Só "descricao" é obrigatória;
   * plaqueta vazia recebe o próximo número; plaqueta já existente ATUALIZA o bem.
   */
  async importarPlanilha(orgaoId: string, arquivo: Buffer, usuarioNome: string) {
    const wb = XLSX.read(arquivo, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException('Planilha vazia');
    const linhas: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!linhas.length) throw new BadRequestException('Nenhuma linha encontrada na planilha');

    const norm = (s: string) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    const ALIAS: Record<string, string> = {
      plaqueta: 'plaqueta', n_plaqueta: 'plaqueta', numero: 'plaqueta', tombo: 'plaqueta', patrimonio: 'plaqueta', n_patrimonio: 'plaqueta',
      descricao: 'descricao', bem: 'descricao', item: 'descricao',
      categoria: 'categoria', setor: 'setor', departamento: 'setor', localizacao: 'setor', local: 'setor',
      tipo: 'tipo', estado: 'estado', estado_de_conservacao: 'estado', conservacao: 'estado',
      responsavel: 'responsavel', cargo: 'cargo', marca: 'marca', modelo: 'modelo',
      serie: 'serie', numero_de_serie: 'serie', n_serie: 'serie', numero_serie: 'serie',
      valor: 'valor', valor_de_aquisicao: 'valor', valor_aquisicao: 'valor',
      data_aquisicao: 'data_aquisicao', data_de_aquisicao: 'data_aquisicao', aquisicao: 'data_aquisicao', data: 'data_aquisicao',
      nota_fiscal: 'nota_fiscal', nf: 'nota_fiscal', n_nf: 'nota_fiscal', fornecedor: 'fornecedor',
      epc: 'epc', rfid: 'epc', observacoes: 'observacoes', observacao: 'observacoes', obs: 'observacoes',
    };
    const mapear = (linha: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(linha)) {
        const chave = ALIAS[norm(k)];
        if (chave) out[chave] = v;
      }
      return out;
    };

    const [categorias, setores] = await Promise.all([
      this.listarCategorias(orgaoId),
      this.setorRepository.find({ where: { orgao_id: orgaoId } }),
    ]);
    const catPorNome = new Map(categorias.map((c) => [norm(c.nome), c]));
    const setorPorChave = new Map<string, Setor>();
    for (const s of setores) {
      setorPorChave.set(norm(s.nome), s);
      if (s.codigo) setorPorChave.set(norm(s.codigo), s);
    }

    const parseValor = (v: any): number | null => {
      if (v === '' || v == null) return null;
      if (typeof v === 'number') return v;
      const n = parseFloat(String(v).replace(/[R$\s.]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const parseData = (v: any): string | null => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim();
      const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) return `${br[3]}-${br[2]}-${br[1]}`;
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      return null;
    };
    const parseEstado = (v: any): EstadoConservacao | undefined => {
      const s = norm(v);
      if (!s) return undefined;
      if (s.startsWith('bom') || s === 'otimo' || s === 'novo') return EstadoConservacao.BOM;
      if (s.startsWith('reg')) return EstadoConservacao.REGULAR;
      if (s.startsWith('ruim') || s.startsWith('mau') || s.startsWith('pessimo')) return EstadoConservacao.RUIM;
      if (s.startsWith('inserv')) return EstadoConservacao.INSERVIVEL;
      return undefined;
    };
    const parseTipo = (v: any): TipoBem => {
      const s = norm(v);
      if (s.includes('loc')) return TipoBem.BEM_LOCADO;
      if (s.includes('comod')) return TipoBem.BEM_COMODATO;
      if (s.includes('servidor') || s.includes('particular')) return TipoBem.BEM_SERVIDOR;
      return TipoBem.BEM_PROPRIO;
    };

    const resultado = { total: linhas.length, criados: 0, atualizados: 0, erros: [] as { linha: number; erro: string }[] };
    for (let i = 0; i < linhas.length; i++) {
      const l = mapear(linhas[i]);
      const numeroLinha = i + 2; // cabeçalho é a linha 1
      try {
        const descricao = String(l.descricao || '').trim();
        if (!descricao) {
          if (Object.values(l).every((v) => String(v ?? '').trim() === '')) continue; // linha em branco
          throw new Error('descrição vazia');
        }
        let categoriaId: string | undefined;
        const nomeCat = String(l.categoria || '').trim();
        if (nomeCat) {
          let cat = catPorNome.get(norm(nomeCat));
          if (!cat) {
            cat = await this.criarCategoria(orgaoId, { nome: nomeCat });
            catPorNome.set(norm(nomeCat), cat);
          }
          categoriaId = cat.id;
        }
        const nomeSetor = String(l.setor || '').trim();
        const setor = nomeSetor ? setorPorChave.get(norm(nomeSetor)) : undefined;

        const dados: any = {
          descricao,
          categoria_id: categoriaId,
          tipo: parseTipo(l.tipo),
          estado_conservacao: parseEstado(l.estado),
          setor_id: setor?.id,
          localizacao_nome: !setor && nomeSetor ? nomeSetor : undefined,
          responsavel_nome: String(l.responsavel || '').trim() || undefined,
          responsavel_cargo: String(l.cargo || '').trim() || undefined,
          marca: String(l.marca || '').trim() || undefined,
          modelo: String(l.modelo || '').trim() || undefined,
          numero_serie: String(l.serie || '').trim() || undefined,
          valor_aquisicao: parseValor(l.valor) ?? undefined,
          data_aquisicao: parseData(l.data_aquisicao) ?? undefined,
          nota_fiscal_numero: String(l.nota_fiscal || '').trim() || undefined,
          fornecedor_nome: String(l.fornecedor || '').trim() || undefined,
          epc: String(l.epc || '').trim() || undefined,
          observacoes: String(l.observacoes || '').trim() || undefined,
        };
        for (const k of Object.keys(dados)) if (dados[k] === undefined) delete dados[k];

        const plaqueta = String(l.plaqueta ?? '').trim();
        const existente = plaqueta
          ? await this.bemRepository.findOne({ where: { orgao_id: orgaoId, plaqueta } })
          : null;
        if (existente) {
          await this.atualizarBem(orgaoId, existente.id, dados, usuarioNome);
          resultado.atualizados++;
        } else {
          await this.criarBem(orgaoId, { ...dados, plaqueta: plaqueta || undefined }, usuarioNome);
          resultado.criados++;
        }
      } catch (err: any) {
        resultado.erros.push({ linha: numeroLinha, erro: err?.message || String(err) });
      }
    }
    return resultado;
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
