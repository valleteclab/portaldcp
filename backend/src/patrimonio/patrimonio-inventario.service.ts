import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
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
import { agruparPorResponsavel, chaveTelefone, mensagemConvite } from './inventario-responsavel.util';
import { FotoBem, OrigemFotoBem } from './entities/foto-bem.entity';
import { ehTagDeTerceiro, plaquetaDeEpcAscii } from './codigo-tag.util';
import { gerarTermoConferenciaPdf } from './termo-conferencia-pdf';
import { codigoVerificacao, montarTermoSetor, periodoConferencia } from './termo-conferencia.util';
import { gerarRelatorioFinalPdf } from './relatorio-final-pdf';
import { montarRelatorioFinal, SetorNoRelatorio } from './relatorio-final.util';
import { brasaoParaPdf } from './brasao-pdf.util';
import {
  exigeConfirmacaoPresenca,
  leituraContaNoRelatorio,
  localizadoEmOutroSetor,
  mensagemPendencias,
  pendentesDeConfirmacao,
} from './confirmacao-presenca.util';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL || 'https://portaldcp.com.br').replace(/\/$/, '');
}

/** Um bem deste setor visto em outra sala da mesma campanha. */
interface AvistamentoEmOutraSala {
  setor_nome: string;
  /** Já respondido "está aqui" no fechamento daquela sala. */
  confirmado: boolean;
  lido_em: Date;
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
    @InjectRepository(FotoBem) private readonly fotoRepo: Repository<FotoBem>,
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

  /**
   * Bens deste setor que apareceram — e foram CONFIRMADOS — em outra sala da
   * mesma campanha. Sem isso o setor de origem cobraria como não localizado um
   * bem que foi achado, só que em outro lugar: dois relatórios se contradizendo.
   *
   * Devolve bem_id -> nome da sala onde ele foi confirmado.
   */
  private async localizadosEmOutraSala(invSetor: InventarioSetor): Promise<Map<string, AvistamentoEmOutraSala>> {
    const mapa = new Map<string, AvistamentoEmOutraSala>();
    if (!invSetor.setor_id) return mapa;
    const leituras = await this.leituraRepo
      .createQueryBuilder('l')
      .innerJoin('l.inventario_setor', 's')
      .addSelect('s.setor_nome', 's_setor_nome')
      .where('l.inventario_id = :inv', { inv: invSetor.inventario_id })
      .andWhere('l.inventario_setor_id <> :setor', { setor: invSetor.id })
      .andWhere('l.situacao = :sit', { sit: SituacaoLeitura.OUTRO_SETOR })
      .andWhere('l.presenca_confirmada IS DISTINCT FROM false')
      .andWhere('l.bem_id IS NOT NULL')
      .orderBy('l.created_at', 'DESC')
      .getRawAndEntities();
    leituras.entities.forEach((l, i) => {
      if (!l.bem_id || mapa.has(l.bem_id)) return;
      mapa.set(l.bem_id, {
        setor_nome: leituras.raw[i]?.s_setor_nome || 'outra sala',
        confirmado: l.presenca_confirmada === true,
        lido_em: l.created_at,
      });
    });
    return mapa;
  }

  private async resumoDoSetor(invSetor: InventarioSetor) {
    const [bens, leituras, emOutraSala] = await Promise.all([
      this.bensDoSetor(invSetor),
      this.leituraRepo.find({ where: { inventario_setor_id: invSetor.id } }),
      this.localizadosEmOutraSala(invSetor),
    ]);
    const lidos = new Set(leituras.filter((l) => l.bem_id && l.situacao === SituacaoLeitura.ENCONTRADO).map((l) => l.bem_id));
    const confirmadoFora = (b: BemPatrimonial) => emOutraSala.get(b.id)?.confirmado === true;
    const achado = (b: BemPatrimonial) => lidos.has(b.id) || confirmadoFora(b);
    // Leitura que o conferente negou ("não está nesta sala") é ruído de antena:
    // não pode entrar na contagem de divergências nem ir para a comissão como
    // transferência a fazer. Fica gravada, só para auditoria.
    const valem = leituras.filter((l) => leituraContaNoRelatorio(l));
    const cont = (sit: SituacaoLeitura) => valem.filter((l) => l.situacao === sit).length;
    return {
      ...invSetor,
      link: `${appUrl()}/inventario/${invSetor.token_acesso}`,
      resumo: {
        total: bens.length,
        encontrados: bens.filter((b) => lidos.has(b.id)).length,
        /** Achados, porém em outra sala: pedem transferência, não busca. */
        em_outra_sala: bens.filter((b) => !lidos.has(b.id) && confirmadoFora(b)).length,
        nao_localizados: bens.filter((b) => !achado(b)).length,
        outro_setor: cont(SituacaoLeitura.OUTRO_SETOR),
        desconhecidos: cont(SituacaoLeitura.DESCONHECIDO),
        sem_plaqueta: cont(SituacaoLeitura.SEM_PLAQUETA),
        baixados_presentes: cont(SituacaoLeitura.BAIXADO_PRESENTE),
        /** Leituras negadas pelo conferente (vieram de outra sala). */
        descartadas: leituras.length - valem.length,
        leituras: valem.length,
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

  /**
   * Manda o link de conferência por WhatsApp para o responsável do setor.
   * Se a mesma pessoa (mesmo WhatsApp) responde por outros setores ainda
   * abertos, vai UMA mensagem listando todos: o link abre este setor e o app
   * troca para os demais.
   */
  async enviarLink(orgaoId: string, inventarioId: string, setorId: string) {
    const inv = await this.carregar(orgaoId, inventarioId);
    const s = inv.setores.find((x) => x.id === setorId);
    if (!s) throw new NotFoundException('Setor da campanha não encontrado');
    const link = `${appUrl()}/inventario/${s.token_acesso}`;
    if (!s.responsavel_telefone) {
      return { enviado: false, link, setores: 0, motivo: 'Setor sem telefone do responsável' };
    }
    const chave = chaveTelefone(s.responsavel_telefone);
    const { grupos } = agruparPorResponsavel(inv.setores);
    const doResponsavel = grupos.find((g) => chaveTelefone(g.telefone) === chave)?.setores || [s];
    const setores = doResponsavel.some((x) => x.id === s.id) ? doResponsavel : [s, ...doResponsavel];
    const enviado = await this.enviarConvite(orgaoId, inv, s, setores);
    return { enviado, link, setores: setores.length };
  }

  /**
   * Envia os links de todos os setores ainda abertos, uma mensagem por
   * responsável (agrupado pelo WhatsApp).
   */
  async enviarLinks(orgaoId: string, inventarioId: string) {
    const inv = await this.carregar(orgaoId, inventarioId);
    if (inv.status === StatusInventario.FECHADO) throw new BadRequestException('Campanha já fechada');
    const { grupos, semTelefone } = agruparPorResponsavel(inv.setores);
    const falhas: string[] = [];
    let pessoas = 0;
    let setoresAvisados = 0;
    for (const g of grupos) {
      const ok = await this.enviarConvite(orgaoId, inv, g.setores[0], g.setores);
      if (ok) {
        pessoas++;
        setoresAvisados += g.setores.length;
      } else {
        falhas.push(g.nome || g.telefone);
      }
    }
    return {
      pessoas,
      setores: setoresAvisados,
      falhas,
      sem_telefone: semTelefone.map((x) => x.setor_nome),
    };
  }

  private async enviarConvite(orgaoId: string, inv: Inventario, principal: InventarioSetor, setores: InventarioSetor[]) {
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'nome', 'nome_fantasia'] });
    const telefone = principal.responsavel_telefone as string;
    const mensagem = mensagemConvite({
      ano: inv.ano,
      orgaoNome: orgao?.nome_fantasia || orgao?.nome || 'Portal DCP',
      responsavelNome: principal.responsavel_nome || setores.find((x) => x.responsavel_nome)?.responsavel_nome || null,
      setores: setores.map((x) => x.setor_nome),
      link: `${appUrl()}/inventario/${principal.token_acesso}`,
    });
    let enviado = false;
    try {
      enviado = await this.whatsapp.enviar(orgaoId, { to: telefone, mensagem });
      if (!enviado) enviado = await this.whatsapp.enviarSistema(telefone, mensagem);
    } catch (err: any) {
      this.logger.warn(`WhatsApp do inventário não enviado (${principal.setor_nome}): ${err?.message}`);
    }
    if (enviado) {
      const agora = new Date();
      for (const x of setores) x.link_enviado_em = agora;
      await this.invSetorRepo.save(setores);
    }
    return enviado;
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
        setor_id: s.setor_id,
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

  /**
   * Setores da mesma campanha com o mesmo WhatsApp do responsável (inclui o
   * atual). Quem tem o link de um deles é a mesma pessoa, então pode trocar.
   */
  private async setoresDoMesmoResponsavel(s: InventarioSetor) {
    const chave = chaveTelefone(s.responsavel_telefone);
    if (!chave) return [];
    const irmaos = await this.invSetorRepo.find({ where: { inventario_id: s.inventario_id } });
    const meus = irmaos
      .filter((x) => chaveTelefone(x.responsavel_telefone) === chave)
      .sort((a, b) => a.setor_nome.localeCompare(b.setor_nome, 'pt-BR'));
    if (meus.length < 2) return [];
    return meus.map((x) => ({ token: x.token_acesso, nome: x.setor_nome, status: x.status, atual: x.id === s.id }));
  }

  /** Tela do setor: bens a conferir e o que já foi lido. */
  async obterPorToken(token: string) {
    const s = await this.setorPorToken(token);
    const [bens, leituras, orgao, categorias, emOutraSala] = await Promise.all([
      this.bensDoSetor(s),
      this.leituraRepo.find({ where: { inventario_setor_id: s.id }, relations: ['bem', 'bem.categoria'], order: { created_at: 'DESC' } }),
      this.orgaoRepo.findOne({ where: { id: s.orgao_id }, select: ['id', 'nome', 'nome_fantasia', 'logo_url'] }),
      this.patrimonioService.listarCategorias(s.orgao_id),
      this.localizadosEmOutraSala(s),
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
    const setoresDoResponsavel = await this.setoresDoMesmoResponsavel(s);
    return {
      orgao: { nome: orgao?.nome_fantasia || orgao?.nome || '', logo_url: orgao?.logo_url || null },
      setores_do_responsavel: setoresDoResponsavel,
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
        /**
         * Visto em outra sala desta campanha. Confirmado, sai dos pendentes.
         * Ainda sem resposta, continua sendo cobrado aqui — mas vira aviso,
         * para a equipe não varrer a sala atrás de um bem que outra equipe
         * acabou de ler (duas equipes conferindo no mesmo dia é o normal).
         */
        localizado_em_outra_sala:
          !porBem.has(b.id) && emOutraSala.get(b.id)?.confirmado ? emOutraSala.get(b.id)!.setor_nome : null,
        avistado_em_outra_sala:
          !porBem.has(b.id) && emOutraSala.get(b.id)
            ? {
                setor_nome: emOutraSala.get(b.id)!.setor_nome,
                confirmado: emOutraSala.get(b.id)!.confirmado,
                lido_em: emOutraSala.get(b.id)!.lido_em,
              }
            : null,
      })),
      leituras: leituras.map((l) => ({
        id: l.id,
        situacao: l.situacao,
        origem: l.origem,
        codigo_lido: l.codigo_lido,
        setor_cadastro_nome: l.setor_cadastro_nome,
        estado_conservacao: l.estado_conservacao,
        observacao: l.observacao,
        foto_url: l.foto_url,
        created_at: l.created_at,
        presenca_confirmada: l.presenca_confirmada ?? null,
        presenca_confirmada_por: l.presenca_confirmada_por,
        exige_confirmacao: exigeConfirmacaoPresenca(l.situacao),
        bem: l.bem ? bem(l.bem) : null,
      })),
    };
  }

  /**
   * Foto tirada na conferência (celular): grava o arquivo em
   * uploads/patrimonio/<orgaoId>/leitura-<leituraId>-<timestamp>.<ext>, liga à
   * leitura e, se a leitura tem bem, entra na galeria do bem (origem INVENTARIO).
   */
  async salvarFotoLeitura(
    token: string,
    leituraId: string,
    arquivo: { buffer: Buffer; mimetype: string; originalname?: string; size: number } | undefined,
    input: { lido_por?: string; legenda?: string },
  ) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Nenhuma imagem enviada');
    if (arquivo.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('Imagem acima de 10 MB');
    const EXT_POR_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const ext = EXT_POR_MIME[arquivo.mimetype];
    if (!ext) throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP');
    if (!/^[0-9a-f-]{36}$/i.test(leituraId || '')) throw new NotFoundException('Leitura não encontrada');
    const leitura = await this.leituraRepo.findOne({ where: { id: leituraId, inventario_setor_id: s.id } });
    if (!leitura) throw new NotFoundException('Leitura não encontrada neste setor');

    const orgaoDir = String(s.orgao_id).replace(/[^a-zA-Z0-9-]/g, '');
    const dir = join(UPLOAD_DIR, 'patrimonio', orgaoDir);
    mkdirSync(dir, { recursive: true });
    const nome = `leitura-${leitura.id.replace(/[^a-zA-Z0-9-]/g, '')}-${Date.now()}${ext}`;
    writeFileSync(join(dir, nome), arquivo.buffer);
    const url = `/api/uploads/patrimonio/${orgaoDir}/${nome}`;

    leitura.foto_url = url;
    if (input.lido_por && !leitura.lido_por) leitura.lido_por = input.lido_por.slice(0, 120);
    await this.leituraRepo.save(leitura);

    if (leitura.bem_id) {
      await this.patrimonioService.adicionarFoto(s.orgao_id, leitura.bem_id, {
        url,
        origem: OrigemFotoBem.INVENTARIO,
        inventario_leitura_id: leitura.id,
        legenda: input.legenda?.trim() || `Conferência do inventário ${s.inventario.ano} (${s.setor_nome})`,
        tirada_por: input.lido_por?.trim() || s.responsavel_nome || 'Conferência de inventário',
      });
    }
    return { foto_url: url };
  }

  /**
   * Interpreta o que veio da câmera/leitor/teclado e acha o bem:
   * URL do QR (/p/<uuid>), plaqueta (com ou sem zeros), EPC do chip RFID
   * (igual ao gravado no bem, ou EPC em hex que codifica o número da plaqueta
   * em ASCII/decimal, como o fornecedor grava nas etiquetas pré-codificadas).
   */
  async resolverCodigo(orgaoId: string, codigoBruto: string): Promise<{ bem: BemPatrimonial | null; codigo: string }> {
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
    const porNumero = (num: string) => {
      if (!/^\d{1,12}$/.test(num) || Number(num) === 0) return Promise.resolve(null);
      return this.bemRepo
        .createQueryBuilder('bem')
        .leftJoinAndSelect('bem.setor', 'setor')
        .leftJoinAndSelect('bem.categoria', 'categoria')
        .where('bem.orgao_id = :orgaoId', { orgaoId })
        .andWhere("bem.plaqueta ~ '^[0-9]+$' AND CAST(bem.plaqueta AS bigint) = :num", { num: Number(num) })
        .getOne();
    };
    // 3) plaqueta digitada sem zeros à esquerda (ou EPC gravado só com dígitos)
    if (!bem && /^\d+$/.test(limpo)) bem = await porNumero(limpo.replace(/^0+/, '') || '0');
    // 4) EPC em hex (leitor RFID): o fornecedor grava o número da plaqueta em ASCII
    //    (ex.: "CMLEM000482" → 434D4C454D303030343832) — decodifica e tenta o número.
    //    A validação do texto fica em plaquetaDeEpcAscii: sem ela, qualquer EPC
    //    binário de terceiro pescava um dígito e casava com um bem ao acaso.
    if (!bem) {
      const numero = plaquetaDeEpcAscii(limpo);
      if (numero) bem = await porNumero(numero);
    }
    return { bem, codigo };
  }

  async registrarLeitura(token: string, input: LeituraInput) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const r = await this.processarLeitura(s, input);
    // Tag de terceiro não abre a conferência: o setor só entra em andamento
    // quando alguém leu algo de verdade.
    if (!(r as any).ignorada) await this.marcarEmAndamento(s);
    return r;
  }

  /**
   * Varredura de sala: várias tags de uma vez (leitor RFID). Cada código passa
   * pela mesma classificação da leitura unitária; a resposta traz o resultado
   * de cada um, para o app montar a lista ao vivo sem uma chamada por tag.
   */
  async registrarLeiturasLote(token: string, input: { codigos: string[]; origem?: OrigemLeitura; lido_por?: string }) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const codigos = Array.from(new Set((input.codigos || []).map((c) => String(c || '').trim()).filter(Boolean))).slice(0, 500);
    if (!codigos.length) throw new BadRequestException('Nenhum código informado');
    const resultados: any[] = [];
    for (const codigo of codigos) {
      try {
        const r = await this.processarLeitura(s, { codigo, origem: input.origem || OrigemLeitura.RFID, lido_por: input.lido_por });
        resultados.push({ codigo, ...r });
      } catch (err: any) {
        resultados.push({ codigo, erro: err?.message || 'Falha ao registrar' });
      }
    }
    const ignoradas = resultados.filter((r) => r.ignorada).length;
    if (ignoradas < resultados.length) await this.marcarEmAndamento(s);
    const cont = (sit: SituacaoLeitura) => resultados.filter((r) => r.situacao === sit).length;
    return {
      total: resultados.length,
      novas: resultados.filter((r) => r.situacao && !r.repetida).length,
      repetidas: resultados.filter((r) => r.repetida).length,
      encontrados: cont(SituacaoLeitura.ENCONTRADO),
      outro_setor: cont(SituacaoLeitura.OUTRO_SETOR),
      desconhecidos: cont(SituacaoLeitura.DESCONHECIDO),
      baixados_presentes: cont(SituacaoLeitura.BAIXADO_PRESENTE),
      /** Tags que não são do órgão (etiqueta de roupa, embalagem): descartadas. */
      ignoradas,
      resultados,
    };
  }

  private async marcarEmAndamento(s: InventarioSetor) {
    if (s.status === StatusInventarioSetor.PENDENTE) {
      s.status = StatusInventarioSetor.EM_ANDAMENTO;
      s.iniciado_em = new Date();
      await this.invSetorRepo.save(s);
    }
  }

  /** Classifica e grava uma leitura no setor já carregado (sem tocar no status do setor). */
  private async processarLeitura(s: InventarioSetor, input: LeituraInput) {
    const { bem, codigo } = await this.resolverCodigo(s.orgao_id, input.codigo);
    // Tag que não é do órgão e não casou com nada (etiqueta de roupa, embalagem):
    // descarta sem gravar. Registrar viraria uma linha DESCONHECIDO no relatório
    // da sala para cada peça de roupa que passasse perto da antena.
    if (ehTagDeTerceiro(codigo, !!bem)) {
      return { ignorada: true, repetida: false, situacao: null, leitura: null, bem: null };
    }
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
    // Bem de outro setor (ou baixado) volta a pendente de resposta a cada
    // leitura: a pergunta só faz sentido no fechamento, com tudo já lido.
    if (exigeConfirmacaoPresenca(situacao)) {
      leitura.presenca_confirmada = null;
      leitura.presenca_confirmada_por = null;
      leitura.presenca_confirmada_em = null;
    } else if (leitura.presenca_confirmada !== null) {
      // Deixou de ser caso de confirmação (o bem mudou de setor no cadastro).
      leitura.presenca_confirmada = null;
      leitura.presenca_confirmada_por = null;
      leitura.presenca_confirmada_em = null;
    }
    leitura.setor_cadastro_nome = bem ? bem.setor?.nome || bem.localizacao_nome || null : null;
    if (estado) leitura.estado_conservacao = estado;
    if (input.observacao !== undefined) leitura.observacao = input.observacao?.trim() || null;
    if (input.lido_por) leitura.lido_por = input.lido_por.slice(0, 120);
    await this.leituraRepo.save(leitura);

    if (bem) {
      // Bem de outro setor só é dado como conferido depois que alguém confirmar
      // que ele estava mesmo na sala. Sem isso, uma leitura pela parede marcava
      // como conferido um bem que ninguém viu.
      if (!exigeConfirmacaoPresenca(situacao)) bem.ultima_conferencia_em = new Date();
      if (estado) bem.estado_conservacao = estado;
      await this.bemRepo.save(bem);
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
            estado_conservacao: bem.estado_conservacao,
          }
        : null,
    };
  }

  private async leituraDoToken(token: string, leituraId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(leituraId || '')) throw new NotFoundException('Leitura não encontrada');
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const leitura = await this.leituraRepo.findOne({ where: { id: leituraId, inventario_setor_id: s.id } });
    if (!leitura) throw new NotFoundException('Leitura não encontrada neste setor');
    return { s, leitura };
  }

  /**
   * Ajuste de uma leitura já registrada (estado de conservação e observação),
   * confirmado no cartão do app. Não relê o código nem muda a situação.
   */
  async atualizarLeitura(token: string, leituraId: string, input: { estado_conservacao?: string | null; observacao?: string | null }) {
    const { leitura } = await this.leituraDoToken(token, leituraId);
    if (input.estado_conservacao !== undefined) {
      const estado = input.estado_conservacao as EstadoConservacao | null;
      if (estado !== null && !Object.values(EstadoConservacao).includes(estado)) {
        throw new BadRequestException('Estado de conservação inválido');
      }
      leitura.estado_conservacao = estado;
      if (estado && leitura.bem_id) await this.bemRepo.update({ id: leitura.bem_id }, { estado_conservacao: estado });
    }
    if (input.observacao !== undefined) leitura.observacao = input.observacao?.trim() || null;
    await this.leituraRepo.save(leitura);
    return { id: leitura.id, estado_conservacao: leitura.estado_conservacao, observacao: leitura.observacao };
  }

  /** Leitura feita por engano (plaqueta digitada errada, toque errado): remove. */
  async desfazerLeitura(token: string, leituraId: string) {
    const { leitura } = await this.leituraDoToken(token, leituraId);
    await this.leituraRepo.remove(leitura);
    return { ok: true };
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

  /**
   * Resposta do conferente, no fechamento: cada bem de outro setor (ou baixado)
   * lido aqui estava mesmo na sala, ou foi o leitor pegando através da parede?
   *
   * "Está aqui" vira achado confirmado e marca o bem como conferido.
   * "Não está" descarta a leitura das contas — a linha fica para auditoria, com
   * quem respondeu e quando, mas o bem segue pendente no setor dele.
   */
  async confirmarPresencas(
    token: string,
    input: { confirmacoes: Array<{ leitura_id: string; confirmada: boolean }>; por?: string },
  ) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const lista = Array.isArray(input?.confirmacoes) ? input.confirmacoes : [];
    if (!lista.length) throw new BadRequestException('Nenhuma confirmação informada');
    const por = String(input.por || '').trim().slice(0, 120) || null;
    const agora = new Date();
    let confirmadas = 0;
    let descartadas = 0;
    for (const item of lista) {
      const leitura = await this.leituraRepo.findOne({
        where: { id: String(item?.leitura_id || ''), inventario_setor_id: s.id },
        relations: ['bem'],
      });
      if (!leitura || !exigeConfirmacaoPresenca(leitura.situacao)) continue;
      leitura.presenca_confirmada = !!item.confirmada;
      leitura.presenca_confirmada_por = por;
      leitura.presenca_confirmada_em = agora;
      await this.leituraRepo.save(leitura);
      if (item.confirmada) {
        confirmadas++;
        // Agora sim o bem foi visto por alguém nesta sala.
        if (leitura.bem_id) await this.bemRepo.update({ id: leitura.bem_id }, { ultima_conferencia_em: agora });
      } else {
        descartadas++;
      }
    }
    const pendentes = pendentesDeConfirmacao(
      await this.leituraRepo.find({ where: { inventario_setor_id: s.id } }),
    );
    return { confirmadas, descartadas, pendentes: pendentes.length };
  }

  /**
   * Recomeçar a conferência da sala: apaga tudo que foi lido e volta ao zero.
   *
   * Por que existe: o "Desfazer" só aparece no cartão da leitura recém-feita, e
   * na varredura de sala — justamente onde se lê muito e rápido — não há cartão
   * nenhum. Quem varria a sala errada ficava sem saída e dependia do suporte
   * mexer no banco. Agora resolve sozinho, em campo.
   *
   * Fica o registro de quem recomeçou e quantas leituras foram apagadas, nas
   * observações do setor, para a comissão enxergar.
   */
  async recomecarSetor(token: string, input: { nome: string; motivo?: string }) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const nome = String(input?.nome || '').trim();
    if (nome.length < 3) throw new BadRequestException('Informe o nome de quem está recomeçando a conferência');
    const apagadas = await this.leituraRepo.count({ where: { inventario_setor_id: s.id } });
    if (!apagadas) throw new BadRequestException('Esta sala ainda não tem nenhuma leitura para apagar');
    await this.leituraRepo.delete({ inventario_setor_id: s.id });

    const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
    const motivo = String(input?.motivo || '').trim();
    const registro =
      `[${quando}] Conferência recomeçada por ${nome}: ${apagadas} leitura(s) apagada(s).` +
      (motivo ? ` Motivo: ${motivo}` : '');
    s.observacoes = s.observacoes ? `${s.observacoes}
${registro}` : registro;
    s.status = StatusInventarioSetor.PENDENTE;
    s.iniciado_em = null;
    await this.invSetorRepo.save(s);
    this.logger.log(`Inventário: setor ${s.setor_nome} recomeçado por ${nome} (${apagadas} leituras apagadas)`);
    return { ok: true, apagadas };
  }

  async fecharSetor(token: string, input: { nome: string; observacoes?: string }) {
    const s = await this.setorPorToken(token);
    this.exigirAberto(s);
    const nome = String(input.nome || '').trim();
    if (nome.length < 3) throw new BadRequestException('Informe o nome de quem está finalizando a conferência');
    // Trava: sem responder, a sala fecharia com bens que ninguém sabe se estavam lá.
    const leituras = await this.leituraRepo.find({ where: { inventario_setor_id: s.id }, relations: ['bem'] });
    const pendentes = pendentesDeConfirmacao(leituras);
    if (pendentes.length) {
      throw new BadRequestException(
        mensagemPendencias(
          pendentes.map((l) => ({ plaqueta: l.bem?.plaqueta, descricao: l.bem?.descricao, codigo_lido: l.codigo_lido })),
        ),
      );
    }
    s.status = StatusInventarioSetor.FECHADO;
    s.fechado_em = new Date();
    s.fechado_por = nome;
    if (input.observacoes !== undefined) s.observacoes = input.observacoes?.trim() || null;
    await this.invSetorRepo.save(s);
    return { ok: true, fechado_em: s.fechado_em, fechado_por: s.fechado_por };
  }

  /** Dados da comissão exigidos pelo relatório final. */
  async atualizarComissao(
    orgaoId: string,
    inventarioId: string,
    dados: {
      portaria?: string | null;
      processo?: string | null;
      comissao?: string | null;
      membros?: Array<{ nome: string; cargo?: string | null; papel?: string | null }> | null;
      autoridade_nome?: string | null;
      autoridade_cargo?: string | null;
    },
  ) {
    const inv = await this.carregar(orgaoId, inventarioId);
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() || null : v === null ? null : undefined);
    const campos: any = {
      portaria: texto(dados?.portaria),
      processo: texto(dados?.processo),
      comissao: texto(dados?.comissao),
      autoridade_nome: texto(dados?.autoridade_nome),
      autoridade_cargo: texto(dados?.autoridade_cargo),
    };
    if (dados?.membros !== undefined) {
      campos.membros = Array.isArray(dados.membros)
        ? dados.membros
            .map((m) => ({
              nome: String(m?.nome || '').trim(),
              cargo: String(m?.cargo || '').trim() || null,
              papel: String(m?.papel || '').trim().toUpperCase() === 'PRESIDENTE' ? 'PRESIDENTE' : 'MEMBRO',
            }))
            .filter((m) => m.nome)
            .slice(0, 12)
        : null;
    }
    for (const k of Object.keys(campos)) if (campos[k] === undefined) delete campos[k];
    await this.invRepo.update({ id: inv.id }, campos);
    return this.obter(orgaoId, inventarioId);
  }

  /**
   * RELATÓRIO FINAL DA COMISSÃO: consolida os termos de todos os setores.
   *
   * Monta cada setor com a MESMA função do termo e só então soma. Assim o
   * relatório da comissão não tem como contradizer o termo que o servidor
   * assinou — seria a pior divergência possível num documento de prestação
   * de contas.
   *
   * Sai mesmo com setor em aberto: a comissão precisa acompanhar o andamento.
   * O que não pode é sair sem dizer isso, e por isso o PDF traz a ressalva.
   */
  async gerarRelatorioFinal(orgaoId: string, inventarioId: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
    const inv = await this.carregar(orgaoId, inventarioId);
    const orgao = await this.orgaoRepo.findOne({
      where: { id: orgaoId },
      select: ['id', 'nome', 'nome_fantasia', 'cidade', 'uf', 'logo_url'],
    });

    const setores: SetorNoRelatorio[] = [];
    let inicio: Date | null = null;
    let fim: Date | null = null;
    for (const s of inv.setores) {
      const [bens, leituras, emOutraSala] = await Promise.all([
        this.bensDoSetor(s),
        this.leituraRepo.find({ where: { inventario_setor_id: s.id }, relations: ['bem'] }),
        this.localizadosEmOutraSala(s),
      ]);
      const confirmadosFora = new Map<string, string>();
      emOutraSala.forEach((v, k) => {
        if (v.confirmado) confirmadosFora.set(k, v.setor_nome);
      });
      setores.push({
        nome: s.setor_nome,
        responsavel: s.responsavel_nome,
        fechado: s.status === StatusInventarioSetor.FECHADO,
        fechado_por: s.fechado_por,
        dados: montarTermoSetor({ bens: bens as any, leituras: leituras as any, localizadosEmOutraSala: confirmadosFora }),
      });
      if (s.iniciado_em && (!inicio || s.iniciado_em < inicio)) inicio = s.iniciado_em;
      if (s.fechado_em && (!fim || s.fechado_em > fim)) fim = s.fechado_em;
    }

    const agora = new Date();
    const buffer = gerarRelatorioFinalPdf(
      {
        orgao_nome: orgao?.nome_fantasia || orgao?.nome || '',
        brasao: brasaoParaPdf(orgao?.logo_url),
        inventario_nome: inv.nome,
        inventario_ano: inv.ano,
        portaria: inv.portaria,
        processo: inv.processo,
        comissao_texto: inv.comissao,
        membros: inv.membros,
        autoridade_nome: inv.autoridade_nome,
        autoridade_cargo: inv.autoridade_cargo,
        periodo: periodoConferencia(inicio, fim || agora),
        cidade_uf: [(orgao as any)?.cidade, (orgao as any)?.uf].filter(Boolean).join('/') || '',
        data_extenso: agora.toLocaleDateString('pt-BR', {
          timeZone: 'America/Bahia',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
      },
      montarRelatorioFinal(setores),
    );
    return { buffer, nomeArquivo: `relatorio_inventario_${inv.ano}.pdf` };
  }

  /**
   * TERMO DE CONFERÊNCIA do setor: o documento que o responsável assina e leva.
   *
   * Só depois de fechado — o termo atesta conferência concluída, e antes disso
   * os números ainda mudam. Os quadros saem da mesma regra da tela: leitura
   * negada pelo conferente não entra, e bem achado por outra sala não é falta.
   */
  async gerarTermoSetor(token: string): Promise<{ buffer: Buffer; nomeArquivo: string; setor: InventarioSetor }> {
    const s = await this.setorPorToken(token);
    if (s.status !== StatusInventarioSetor.FECHADO) {
      throw new BadRequestException(
        'O termo é emitido depois de finalizar a conferência do setor.',
      );
    }
    const [bens, leituras, orgao, emOutraSala] = await Promise.all([
      this.bensDoSetor(s),
      this.leituraRepo.find({ where: { inventario_setor_id: s.id }, relations: ['bem'] }),
      this.orgaoRepo.findOne({ where: { id: s.orgao_id }, select: ['id', 'nome', 'nome_fantasia', 'cnpj', 'logo_url'] }),
      this.localizadosEmOutraSala(s),
    ]);
    const confirmadosFora = new Map<string, string>();
    emOutraSala.forEach((v, k) => {
      if (v.confirmado) confirmadosFora.set(k, v.setor_nome);
    });

    const dados = montarTermoSetor({
      bens: bens as any,
      leituras: leituras as any,
      localizadosEmOutraSala: confirmadosFora,
    });

    const buffer = gerarTermoConferenciaPdf(
      {
        orgao_nome: orgao?.nome_fantasia || orgao?.nome || '',
        orgao_cnpj: (orgao as any)?.cnpj || null,
        brasao: brasaoParaPdf(orgao?.logo_url),
        comissao: s.inventario?.comissao || null,
        inventario_nome: s.inventario?.nome || 'Inventário de Bens Móveis',
        inventario_ano: s.inventario?.ano || new Date().getFullYear(),
        setor_nome: s.setor_nome,
        responsavel_nome: s.responsavel_nome,
        periodo: periodoConferencia(s.iniciado_em, s.fechado_em),
        emitido_em: new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' }),
        fechado_por: s.fechado_por,
        codigo_verificacao: codigoVerificacao(s.id),
      },
      dados,
    );
    const nomeArquivo = `termo_${s.setor_nome.normalize('NFD').replace(/[^\w]/g, '_')}_${s.inventario?.ano || ''}.pdf`;
    return { buffer, nomeArquivo, setor: s };
  }

  /**
   * Manda o termo por WhatsApp para o número que o conferente digitar — o
   * responsável do setor, o presidente da comissão, quem for. Em campo o
   * celular é o único canal: ninguém vai ao computador imprimir.
   */
  async enviarTermoWhatsApp(token: string, input: { telefone: string; nome?: string }) {
    const telefone = String(input?.telefone || '').replace(/\D/g, '');
    if (telefone.length < 10) {
      throw new BadRequestException('Informe o WhatsApp com DDD de quem vai receber o termo');
    }
    const { buffer, nomeArquivo, setor } = await this.gerarTermoSetor(token);
    const configurado = await this.whatsapp.isConfigurado(setor.orgao_id);
    if (!configurado) {
      throw new BadRequestException('O WhatsApp deste órgão não está configurado. Baixe o PDF e envie manualmente.');
    }
    const legenda =
      `Termo de Conferência — ${setor.setor_nome}
` +
      `${setor.inventario?.nome || 'Inventário'} ${setor.inventario?.ano || ''}

` +
      `Conferência finalizada por ${setor.fechado_por || setor.responsavel_nome || '—'}.`;
    const enviado = await this.whatsapp.enviarDocumento(setor.orgao_id, {
      to: telefone,
      documentoBase64: buffer.toString('base64'),
      nomeArquivo,
      legenda,
      extensao: 'pdf',
      mimeType: 'application/pdf',
    });
    if (!enviado) throw new BadRequestException('Não foi possível enviar pelo WhatsApp. Baixe o PDF e envie manualmente.');
    this.logger.log(`Termo do setor ${setor.setor_nome} enviado por WhatsApp para ${telefone}`);
    return { ok: true, telefone, nome_arquivo: nomeArquivo };
  }

  /** Página pública do QR (quem lê a plaqueta com a câmera do celular). */
  async bemPublico(bemId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(bemId)) throw new NotFoundException('Bem não encontrado');
    const bem = await this.bemRepo.findOne({ where: { id: bemId }, relations: ['categoria', 'setor', 'orgao'] });
    if (!bem) throw new NotFoundException('Bem não encontrado');
    const fotos = await this.fotoRepo.find({ where: { bem_id: bem.id }, order: { created_at: 'DESC' } });
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
      fotos: fotos.map((f) => ({ url: f.url, origem: f.origem, legenda: f.legenda, created_at: f.created_at })),
      ultima_conferencia_em: bem.ultima_conferencia_em,
      orgao: { nome: bem.orgao?.nome_fantasia || bem.orgao?.nome || '', logo_url: bem.orgao?.logo_url || null },
      conferencia,
    };
  }
}
