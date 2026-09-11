import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Setor } from '../orgaos/entities/setor.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { Inventario, InventarioSetor, InventarioLeitura } from './entities/inventario.entity';
import {
  StatusInventario,
  StatusInventarioSetor,
  OrigemLeitura,
  SituacaoLeitura,
  StatusBem,
  EstadoConservacao,
  TipoBem,
} from './entities/enums';
import { CriarInventarioDto, AtualizarSetorInventarioDto } from './dto/criar-inventario.dto';
import { PatrimonioService } from './patrimonio.service';

function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL || 'https://portaldcp.com.br').replace(/\/$/, '');
}

export interface LeituraInput {
  codigo: string;
  origem?: OrigemLeitura;
  estado_conservacao?: EstadoConservacao;
  observacao?: string;
  lido_por?: string;
}

/**
 * Campanha de inventário: a comissão abre, cada setor recebe um link com
 * token e confere pelo celular (QR pela câmera, leitor RFID em modo teclado
 * ou plaqueta digitada). O sistema classifica cada leitura na hora.
 */
@Injectable()
export class PatrimonioInventarioService {
  private readonly logger = new Logger(PatrimonioInventarioService.name);

  constructor(
    @InjectRepository(Inventario) private readonly invRepo: Repository<Inventario>,
    @InjectRepository(InventarioSetor) private readonly invSetorRepo: Repository<InventarioSetor>,
    @InjectRepository(InventarioLeitura) private readonly leituraRepo: Repository<InventarioLeitura>,
    @InjectRepository(BemPatrimonial) private readonly bemRepo: Repository<BemPatrimonial>,
    @InjectRepository(Setor) private readonly setorRepo: Repository<Setor>,
    @InjectRepository(Orgao) private readonly orgaoRepo: Repository<Orgao>,
    private readonly patrimonioService: PatrimonioService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ─── ÓRGÃO ─────────────────────────────────────────────────────────

  async criar(orgaoId: string, dto: CriarInventarioDto, usuarioNome: string) {
    if (!dto.setores?.length) throw new BadRequestException('Informe ao menos um setor para a campanha');
    const setoresCadastro = await this.setorRepo.find({ where: { orgao_id: orgaoId } });
    const porId = new Map(setoresCadastro.map((s) => [s.id, s]));

    const inventario = await this.invRepo.save(
      this.invRepo.create({
        orgao_id: orgaoId,
        nome: dto.nome.trim(),
        ano: dto.ano,
        comissao: dto.comissao?.trim() || null,
        observacoes: dto.observacoes?.trim() || null,
        aberto_por: usuarioNome,
        status: StatusInventario.ABERTO,
      }),
    );

    const vistos = new Set<string>();
    const setores: InventarioSetor[] = [];
    for (const s of dto.setores) {
      const cadastro = s.setor_id ? porId.get(s.setor_id) : undefined;
      if (s.setor_id && !cadastro) throw new BadRequestException('Setor não pertence a este órgão');
      const nome = (cadastro?.nome || s.setor_nome || '').trim();
      if (!nome) throw new BadRequestException('Setor sem nome');
      const chave = cadastro?.id || nome.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      setores.push(
        this.invSetorRepo.create({
          inventario_id: inventario.id,
          orgao_id: orgaoId,
          setor_id: cadastro?.id || null,
          setor_nome: nome,
          responsavel_nome: s.responsavel_nome?.trim() || null,
          responsavel_telefone: s.responsavel_telefone?.replace(/\D/g, '') || null,
          token_acesso: randomBytes(32).toString('hex'),
          status: StatusInventarioSetor.PENDENTE,
        }),
      );
    }
    await this.invSetorRepo.save(setores);
    return this.obter(orgaoId, inventario.id);
  }

  async listar(orgaoId: string) {
    const lista = await this.invRepo.find({
      where: { orgao_id: orgaoId },
      relations: ['setores'],
      order: { ano: 'DESC', created_at: 'DESC' },
    });
    return lista.map((inv) => ({
      id: inv.id,
      nome: inv.nome,
      ano: inv.ano,
      status: inv.status,
      aberto_por: inv.aberto_por,
      fechado_em: inv.fechado_em,
      created_at: inv.created_at,
      setores_total: inv.setores.length,
      setores_fechados: inv.setores.filter((s) => s.status === StatusInventarioSetor.FECHADO).length,
    }));
  }

  private async carregar(orgaoId: string, inventarioId: string) {
    const inv = await this.invRepo.findOne({
      where: { id: inventarioId, orgao_id: orgaoId },
      relations: ['setores'],
    });
    if (!inv) throw new NotFoundException('Campanha de inventário não encontrada');
    inv.setores.sort((a, b) => a.setor_nome.localeCompare(b.setor_nome));
    return inv;
  }

  /** Campanha com o andamento de cada setor. */
  async obter(orgaoId: string, inventarioId: string) {
    const inv = await this.carregar(orgaoId, inventarioId);
    const setores = await Promise.all(inv.setores.map((s) => this.resumoDoSetor(s)));
    return {
      ...inv,
      setores,
      totais: setores.reduce(
        (acc, s) => ({
          bens: acc.bens + s.resumo.total,
          encontrados: acc.encontrados + s.resumo.encontrados,
          nao_localizados: acc.nao_localizados + s.resumo.nao_localizados,
          divergencias: acc.divergencias + s.resumo.outro_setor + s.resumo.desconhecidos + s.resumo.sem_plaqueta + s.resumo.baixados_presentes,
        }),
        { bens: 0, encontrados: 0, nao_localizados: 0, divergencias: 0 },
      ),
    };
  }

  private async bensDoSetor(invSetor: InventarioSetor) {
    if (!invSetor.setor_id) return [] as BemPatrimonial[];
    return this.bemRepo.find({
      where: { orgao_id: invSetor.orgao_id, setor_id: invSetor.setor_id, status: In([StatusBem.ATIVO, StatusBem.EM_MANUTENCAO]) },
      relations: ['categoria'],
      order: { plaqueta: 'ASC' },
    });
  }

  private async resumoDoSetor(invSetor: InventarioSetor) {
    const [bens, leituras] = await Promise.all([
      this.bensDoSetor(invSetor),
      this.leituraRepo.find({ where: { inventario_setor_id: invSetor.id } }),
    ]);
    const lidos = new Set(leituras.filter((l) => l.bem_id && l.situacao === SituacaoLeitura.ENCONTRADO).map((l) => l.bem_id));
    const cont = (sit: SituacaoLeitura) => leituras.filter((l) => l.situacao === sit).length;
    return {
      ...invSetor,
      link: `${appUrl()}/inventario/${invSetor.token_acesso}`,
      resumo: {
        total: bens.length,
        encontrados: bens.filter((b) => lidos.has(b.id)).length,
        nao_localizados: bens.filter((b) => !lidos.has(b.id)).length,
        outro_setor: cont(SituacaoLeitura.OUTRO_SETOR),
        desconhecidos: cont(SituacaoLeitura.DESCONHECIDO),
        sem_plaqueta: cont(SituacaoLeitura.SEM_PLAQUETA),
        baixados_presentes: cont(SituacaoLeitura.BAIXADO_PRESENTE),
        leituras: leituras.length,
      },
    };
  }

  async atualizarSetor(orgaoId: string, inventarioId: string, setorId: string, dto: AtualizarSetorInventarioDto) {
    const s = await this.invSetorRepo.findOne({ where: { id: setorId, inventario_id: inventarioId, orgao_id: orgaoId } });
    if (!s) throw new NotFoundException('Setor da campanha não encontrado');
    if (dto.responsavel_nome !== undefined) s.responsavel_nome = dto.responsavel_nome?.trim() || null;
    if (dto.responsavel_telefone !== undefined) s.responsavel_telefone = dto.responsavel_telefone?.replace(/\D/g, '') || null;
    if (dto.observacoes !== undefined) s.observacoes = dto.observacoes?.trim() || null;
    await this.invSetorRepo.save(s);
    return this.resumoDoSetor(s);
  }

  /** Manda o link de conferência por WhatsApp para o responsável do setor. */
  async enviarLink(orgaoId: string, inventarioId: string, setorId: string) {
    const inv = await this.carregar(orgaoId, inventarioId);
    const s = inv.setores.find((x) => x.id === setorId);
    if (!s) throw new NotFoundException('Setor da campanha não encontrado');
    const link = `${appUrl()}/inventario/${s.token_acesso}`;
    if (!s.responsavel_telefone) {
      return { enviado: false, link, motivo: 'Setor sem telefone do responsável' };
    }
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'nome', 'nome_fantasia'] });
    const mensagem =
      `📋 *Inventário ${inv.ano} — ${orgao?.nome_fantasia || orgao?.nome || 'Portal DCP'}*\n\n` +
      `Olá${s.responsavel_nome ? `, ${s.responsavel_nome}` : ''}! Você é responsável pela conferência do setor *${s.setor_nome}*.\n\n` +
      `Abra o link no celular, aponte a câmera para o QR de cada plaqueta e finalize quando terminar:\n${link}\n\n` +
      `_Se preferir, instale como aplicativo pelo aviso que aparece na tela._`;
    let enviado = false;
    try {
      enviado = await this.whatsapp.enviar(orgaoId, { to: s.responsavel_telefone, mensagem });
      if (!enviado) enviado = await this.whatsapp.enviarSistema(s.responsavel_telefone, mensagem);
    } catch (err: any) {
      this.logger.warn(`WhatsApp do inventário não enviado (${s.setor_nome}): ${err?.message}`);
    }
    if (enviado) {
      s.link_enviado_em = new Date();
      await this.invSetorRepo.save(s);
    }
    return { enviado, link };
  }

  async reabrirSetor(orgaoId: string, inventarioId: string, setorId: string) {
    const inv = await this.carregar(orgaoId, inventarioId);
    if (inv.status === StatusInventario.FECHADO) throw new BadRequestException('Campanha já fechada');
    const s = inv.setores.find((x) => x.id === setorId);
    if (!s) throw new NotFoundException('Setor da campanha não encontrado');
    s.status = StatusInventarioSetor.EM_ANDAMENTO;
    s.fechado_em = null;
    s.fechado_por = null;
    await this.invSetorRepo.save(s);
    return this.resumoDoSetor(s);
  }

  async fechar(orgaoId: string, inventarioId: string, usuarioNome: string, forcar = false) {
    const inv = await this.carregar(orgaoId, inventarioId);
    if (inv.status === StatusInventario.FECHADO) return inv;
    const abertos = inv.setores.filter((s) => s.status !== StatusInventarioSetor.FECHADO);
    if (abertos.length && !forcar) {
      throw new BadRequestException(
        `Ainda há ${abertos.length} setor(es) sem fechamento: ${abertos.map((s) => s.setor_nome).join(', ')}`,
      );
    }
    inv.status = StatusInventario.FECHADO;
    inv.fechado_por = usuarioNome;
    inv.fechado_em = new Date();
    await this.invRepo.save(inv);
    return this.obter(orgaoId, inventarioId);
  }

  /** Relatório de divergências da campanha, por setor. */
  async divergencias(orgaoId: string, inventarioId: string) {
    const inv = await this.carregar(orgaoId, inventarioId);
    const setores = [] as any[];
    for (const s of inv.setores) {
      const [bens, leituras] = await Promise.all([
        this.bensDoSetor(s),
        this.leituraRepo.find({ where: { inventario_setor_id: s.id }, relations: ['bem', 'bem.setor'], order: { created_at: 'ASC' } }),
      ]);
      const encontrados = new Set(leituras.filter((l) => l.situacao === SituacaoLeitura.ENCONTRADO && l.bem_id).map((l) => l.bem_id));
      const mapaBem = (b: BemPatrimonial | null | undefined) =>
        b ? { id: b.id, plaqueta: b.plaqueta, descricao: b.descricao, setor_nome: b.setor?.nome || b.localizacao_nome || null } : null;
      setores.push({
        id: s.id,
        setor_nome: s.setor_nome,
        status: s.status,
        responsavel_nome: s.responsavel_nome,
        fechado_por: s.fechado_por,
        fechado_em: s.fechado_em,
        nao_localizados: bens.filter((b) => !encontrados.has(b.id)).map((b) => ({ id: b.id, plaqueta: b.plaqueta, descricao: b.descricao })),
        outro_setor: leituras.filter((l) => l.situacao === SituacaoLeitura.OUTRO_SETOR).map((l) => ({ ...mapaBem(l.bem), setor_cadastro_nome: l.setor_cadastro_nome, observacao: l.observacao })),
        desconhecidos: leituras.filter((l) => l.situacao === SituacaoLeitura.DESCONHECIDO).map((l) => ({ codigo_lido: l.codigo_lido, observacao: l.observacao, created_at: l.created_at })),
        sem_plaqueta: leituras.filter((l) => l.situacao === SituacaoLeitura.SEM_PLAQUETA).map((l) => ({ ...mapaBem(l.bem), observacao: l.observacao })),
        baixados_presentes: leituras.filter((l) => l.situacao === SituacaoLeitura.BAIXADO_PRESENTE).map((l) => mapaBem(l.bem)),
        estado_ruim: leituras
          .filter((l) => l.estado_conservacao === EstadoConservacao.RUIM || l.estado_conservacao === EstadoConservacao.INSERVIVEL)
          .map((l) => ({ ...mapaBem(l.bem), estado_conservacao: l.estado_conservacao, observacao: l.observacao })),
      });
    }
    return { inventario: { id: inv.id, nome: inv.nome, ano: inv.ano, status: inv.status, comissao: inv.comissao }, setores };
  }

  // ─── PÚBLICO (token do setor) ──────────────────────────────────────

  private async setorPorToken(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token || '')) throw new NotFoundException('Link inválido');
    const s = await this.invSetorRepo.findOne({ where: { token_acesso: token.toLowerCase() }, relations: ['inventario', 'setor'] });
    if (!s) throw new NotFoundException('Link de conferência não encontrado');
    return s;
  }

  private exigirAberto(s: InventarioSetor) {
    if (s.inventario.status === StatusInventario.FECHADO) throw new BadRequestException('Esta campanha de inventário já foi fechada');
    if (s.status === StatusInventarioSetor.FECHADO) throw new BadRequestException('A conferência deste setor já foi finalizada');
  }

  /** Tela do setor: bens a conferir e o que já foi lido. */
  async obterPorToken(token: string) {
    const s = await this.setorPorToken(token);
    const [bens, leituras, orgao, categorias] = await Promise.all([
      this.bensDoSetor(s),
      this.leituraRepo.find({ where: { inventario_setor_id: s.id }, relations: ['bem', 'bem.categoria'], order: { created_at: 'DESC' } }),
      this.orgaoRepo.findOne({ where: { id: s.orgao_id }, select: ['id', 'nome', 'nome_fantasia', 'logo_url'] }),
      this.patrimonioService.listarCategorias(s.orgao_id),
    ]);
    const porBem = new Map(leituras.filter((l) => l.bem_id).map((l) => [l.bem_id as string, l]));
    const bem = (b: BemPatrimonial) => ({
      id: b.id,
      plaqueta: b.plaqueta,
      descricao: b.descricao,
      categoria: b.categoria?.nome || null,
      estado_conservacao: b.estado_conservacao,
      foto_url: b.foto_url,
      marca: b.marca,
      modelo: b.modelo,
    });
    return {
      orgao: { nome: orgao?.nome_fantasia || orgao?.nome || '', logo_url: orgao?.logo_url || null },
      inventario: { id: s.inventario.id, nome: s.inventario.nome, ano: s.inventario.ano, status: s.inventario.status },
      setor: {
        id: s.id,
        nome: s.setor_nome,
        responsavel_nome: s.responsavel_nome,
        status: s.status,
        fechado_em: s.fechado_em,
        fechado_por: s.fechado_por,
        tem_cadastro: !!s.setor_id,
      },
      categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
      bens: bens.map((b) => ({
        ...bem(b),
        situacao: porBem.get(b.id)?.situacao || null,
        lido_em: porBem.get(b.id)?.created_at || null,
      })),
      leituras: leituras.map((l) => ({
        id: l.id,
        situacao: l.situacao,
        origem: l.origem,
        codigo_lido: l.codigo_lido,
        setor_cadastro_nome: l.setor_cadastro_nome,
        estado_conservacao: l.estado_conservacao,
        observacao: l.observacao,
        created_at: l.created_at,
        bem: l.bem ? bem(l.bem) : null,
      })),
    };
  }

  /** Interpreta o que veio da câmera/leitor/teclado e acha o bem. */
  private async resolverCodigo(orgaoId: string, codigoBruto: string): Promise<{ bem: BemPatrimonial | null; codigo: string }> {
    const codigo = String(codigoBruto || '').trim();
    if (!codigo) throw new BadRequestException('Código vazio');
    // 1) URL do QR da plaqueta: .../p/<uuid>
    const m = codigo.match(/\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const uuidSolto = codigo.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const id = m?.[1] || uuidSolto?.[0];
    if (id) {
      const bem = await this.bemRepo.findOne({ where: { id: id.toLowerCase(), orgao_id: orgaoId }, relations: ['setor', 'categoria'] });
      return { bem, codigo };
    }
    // 2) plaqueta (com ou sem zeros à esquerda) ou EPC do chip RFID
    const limpo = codigo.replace(/\s+/g, '').toUpperCase();
    const qb = this.bemRepo
      .createQueryBuilder('bem')
      .leftJoinAndSelect('bem.setor', 'setor')
      .leftJoinAndSelect('bem.categoria', 'categoria')
      .where('bem.orgao_id = :orgaoId', { orgaoId })
      .andWhere('(UPPER(bem.plaqueta) = :limpo OR UPPER(bem.epc) = :limpo)', { limpo });
    let bem = await qb.getOne();
    if (!bem && /^\d+$/.test(limpo)) {
      bem = await this.bemRepo
        .createQueryBuilder('bem')
        .leftJoinAndSelect('bem.setor', 'setor')
        .leftJoinAndSelect('bem.categoria', 'categoria')
        .where('bem.orgao_id = :orgaoId', { orgaoId })
        .andWhere("bem.plaqueta ~ '^[0-9]+$' AND CAST(bem.plaqueta AS bigint) = :num", { num: Number(limpo) })
        .getOne();
    }
    return { bem, codigo };
  }

  async registrarLeitura(token: string, input: LeituraInput) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const { bem, codigo } = await this.resolverCodigo(s.orgao_id, input.codigo);
    const origem = input.origem && Object.values(OrigemLeitura).includes(input.origem) ? input.origem : OrigemLeitura.QR;
    const estado = input.estado_conservacao && Object.values(EstadoConservacao).includes(input.estado_conservacao) ? input.estado_conservacao : null;

    let situacao: SituacaoLeitura;
    if (!bem) situacao = SituacaoLeitura.DESCONHECIDO;
    else if (bem.status === StatusBem.BAIXADO) situacao = SituacaoLeitura.BAIXADO_PRESENTE;
    else if (s.setor_id && bem.setor_id === s.setor_id) situacao = SituacaoLeitura.ENCONTRADO;
    else if (!s.setor_id) situacao = SituacaoLeitura.ENCONTRADO; // setor livre: registra presença
    else situacao = SituacaoLeitura.OUTRO_SETOR;

    // Mesmo bem lido duas vezes no mesmo setor: atualiza, não duplica.
    let leitura = bem
      ? await this.leituraRepo.findOne({ where: { inventario_setor_id: s.id, bem_id: bem.id } })
      : await this.leituraRepo.findOne({ where: { inventario_setor_id: s.id, codigo_lido: codigo, situacao: SituacaoLeitura.DESCONHECIDO } });
    const repetida = !!leitura;
    if (!leitura) {
      leitura = this.leituraRepo.create({
        inventario_id: s.inventario_id,
        inventario_setor_id: s.id,
        orgao_id: s.orgao_id,
        bem_id: bem?.id || null,
        codigo_lido: codigo.slice(0, 250),
        origem,
        situacao,
      });
    }
    leitura.situacao = situacao;
    leitura.setor_cadastro_nome = bem ? bem.setor?.nome || bem.localizacao_nome || null : null;
    if (estado) leitura.estado_conservacao = estado;
    if (input.observacao !== undefined) leitura.observacao = input.observacao?.trim() || null;
    if (input.lido_por) leitura.lido_por = input.lido_por.slice(0, 120);
    await this.leituraRepo.save(leitura);

    if (bem) {
      bem.ultima_conferencia_em = new Date();
      if (estado) bem.estado_conservacao = estado;
      await this.bemRepo.save(bem);
    }
    if (s.status === StatusInventarioSetor.PENDENTE) {
      s.status = StatusInventarioSetor.EM_ANDAMENTO;
      s.iniciado_em = new Date();
      await this.invSetorRepo.save(s);
    }
    return {
      repetida,
      situacao,
      leitura: { id: leitura.id, created_at: leitura.created_at, estado_conservacao: leitura.estado_conservacao, observacao: leitura.observacao },
      bem: bem
        ? {
            id: bem.id,
            plaqueta: bem.plaqueta,
            descricao: bem.descricao,
            categoria: bem.categoria?.nome || null,
            setor_nome: bem.setor?.nome || bem.localizacao_nome || null,
            status: bem.status,
            foto_url: bem.foto_url,
          }
        : null,
    };
  }

  /** Bem físico sem plaqueta: cadastra na hora, já no setor, e registra a leitura. */
  async cadastrarSemPlaqueta(
    token: string,
    input: { descricao: string; categoria_id?: string; estado_conservacao?: EstadoConservacao; observacao?: string; lido_por?: string; marca?: string; modelo?: string; numero_serie?: string },
  ) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const descricao = String(input.descricao || '').trim();
    if (descricao.length < 3) throw new BadRequestException('Descreva o bem (mínimo 3 letras)');
    const bem = await this.patrimonioService.criarBem(
      s.orgao_id,
      {
        descricao,
        tipo: TipoBem.BEM_PROPRIO,
        categoria_id: input.categoria_id || undefined,
        estado_conservacao: input.estado_conservacao || undefined,
        setor_id: s.setor_id || undefined,
        localizacao_nome: s.setor_id ? undefined : s.setor_nome,
        marca: input.marca?.trim() || undefined,
        modelo: input.modelo?.trim() || undefined,
        numero_serie: input.numero_serie?.trim() || undefined,
        observacoes: `Cadastrado na conferência do inventário ${s.inventario.ano} (${s.setor_nome})${input.observacao ? `: ${input.observacao.trim()}` : ''}`,
      },
      input.lido_por ? `${input.lido_por} (inventário)` : 'Conferência de inventário',
    );
    const leitura = await this.leituraRepo.save(
      this.leituraRepo.create({
        inventario_id: s.inventario_id,
        inventario_setor_id: s.id,
        orgao_id: s.orgao_id,
        bem_id: bem.id,
        codigo_lido: `SEM-PLAQUETA:${bem.plaqueta}`,
        origem: OrigemLeitura.MANUAL,
        situacao: SituacaoLeitura.SEM_PLAQUETA,
        estado_conservacao: input.estado_conservacao || null,
        observacao: input.observacao?.trim() || null,
        lido_por: input.lido_por?.slice(0, 120) || null,
      }),
    );
    if (s.status === StatusInventarioSetor.PENDENTE) {
      s.status = StatusInventarioSetor.EM_ANDAMENTO;
      s.iniciado_em = new Date();
      await this.invSetorRepo.save(s);
    }
    return {
      situacao: SituacaoLeitura.SEM_PLAQUETA,
      leitura: { id: leitura.id, created_at: leitura.created_at },
      bem: { id: bem.id, plaqueta: bem.plaqueta, descricao: bem.descricao, categoria: bem.categoria?.nome || null, setor_nome: s.setor_nome, status: bem.status, foto_url: null },
    };
  }

  async fecharSetor(token: string, input: { nome: string; observacoes?: string }) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const nome = String(input.nome || '').trim();
    if (nome.length < 3) throw new BadRequestException('Informe o nome de quem está finalizando a conferência');
    s.status = StatusInventarioSetor.FECHADO;
    s.fechado_em = new Date();
    s.fechado_por = nome;
    if (input.observacoes !== undefined) s.observacoes = input.observacoes?.trim() || null;
    await this.invSetorRepo.save(s);
    return { ok: true, fechado_em: s.fechado_em, fechado_por: s.fechado_por };
  }

  /** Página pública do QR (quem lê a plaqueta com a câmera do celular). */
  async bemPublico(bemId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(bemId)) throw new NotFoundException('Bem não encontrado');
    const bem = await this.bemRepo.findOne({ where: { id: bemId }, relations: ['categoria', 'setor', 'orgao'] });
    if (!bem) throw new NotFoundException('Bem não encontrado');
    // Campanha aberta no setor do bem? Então a página pode abrir a conferência.
    let conferencia: { link: string; setor_nome: string; ano: number } | null = null;
    if (bem.setor_id) {
      const aberto = await this.invSetorRepo
        .createQueryBuilder('s')
        .innerJoin('s.inventario', 'i')
        .where('s.setor_id = :setorId', { setorId: bem.setor_id })
        .andWhere("i.status = 'ABERTO'")
        .andWhere("s.status <> 'FECHADO'")
        .orderBy('i.created_at', 'DESC')
        .getOne();
      if (aberto) {
        const inv = await this.invRepo.findOne({ where: { id: aberto.inventario_id }, select: ['id', 'ano'] });
        conferencia = { link: `${appUrl()}/inventario/${aberto.token_acesso}`, setor_nome: aberto.setor_nome, ano: inv?.ano || 0 };
      }
    }
    return {
      id: bem.id,
      plaqueta: bem.plaqueta,
      descricao: bem.descricao,
      categoria: bem.categoria?.nome || null,
      setor_nome: bem.setor?.nome || bem.localizacao_nome || null,
      responsavel_nome: bem.responsavel_nome || null,
      estado_conservacao: bem.estado_conservacao,
      status: bem.status,
      marca: bem.marca,
      modelo: bem.modelo,
      foto_url: bem.foto_url,
      ultima_conferencia_em: bem.ultima_conferencia_em,
      orgao: { nome: bem.orgao?.nome_fantasia || bem.orgao?.nome || '', logo_url: bem.orgao?.logo_url || null },
      conferencia,
    };
  }
}
