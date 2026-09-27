import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import type { Ator } from '../../auth/acesso/ator';
import { ROTULO_PAPEL } from './codigos';
import {
  PessoaDoOrgao,
  PlanejamentoFluxo,
  RegraPessoa,
  aplicarEdicaoPlanejamento,
  normalizarPlanejamento,
  pessoaAtende,
  planejamentoSemente,
  rotuloRegra,
  validarPlanejamento,
} from './planejamento-fluxo';

type Autor = { id: string | null; nome: string | null };

/** Destinatário de aviso (sino, e-mail e WhatsApp). */
export interface DestinatarioAviso {
  id: string;
  email?: string;
  telefone?: string;
}

/**
 * PLANEJAMENTO NO MODELO DE FLUXO (antes do processo): quem aprova a demanda,
 * quem monta o DFD consolidado (unidade de planejamento) e a 2ª aprovação do
 * DFD. Dados em `planejamento_fluxo_orgao` (padrão do sistema semeado no boot
 * e na primeira leitura; o órgão ganha a própria linha ao salvar).
 */
@Injectable()
export class PlanejamentoFluxoService {
  private semente: Promise<void> | null = null;
  private readonly cache = new Map<string, { p: PlanejamentoFluxo; ate: number }>();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  garantirSemente(): Promise<void> {
    if (!this.semente) {
      this.semente = (async () => {
        const [linha] = await this.ds.query(`SELECT 1 FROM planejamento_fluxo_orgao WHERE orgao_id IS NULL LIMIT 1`);
        if (linha) return;
        const s = planejamentoSemente();
        await this.ds.query(
          `INSERT INTO planejamento_fluxo_orgao (orgao_id, versao, aprovador_demanda, responsavel_dfd, aprovacao_dfd, atualizado_por_nome)
           SELECT NULL, 1, $1::jsonb, $2::jsonb, $3::jsonb, 'Sistema (semente)'
            WHERE NOT EXISTS (SELECT 1 FROM planejamento_fluxo_orgao WHERE orgao_id IS NULL)`,
          [JSON.stringify(s.aprovador_demanda), JSON.stringify(s.responsavel_dfd), JSON.stringify(s.aprovacao_dfd)],
        );
      })().catch((e) => {
        this.semente = null;
        throw e;
      });
    }
    return this.semente;
  }

  private async linha(orgaoId: string | null): Promise<any | null> {
    await this.garantirSemente();
    const [l] = orgaoId
      ? await this.ds.query(`SELECT * FROM planejamento_fluxo_orgao WHERE orgao_id::text = $1`, [orgaoId])
      : await this.ds.query(`SELECT * FROM planejamento_fluxo_orgao WHERE orgao_id IS NULL ORDER BY created_at LIMIT 1`);
    return l ?? null;
  }

  /** O planejamento VIGENTE do órgão: o próprio, senão o do sistema (cache curto, limpo ao gravar). */
  async vigente(orgaoId: string | null): Promise<PlanejamentoFluxo> {
    const chave = orgaoId ?? 'sistema';
    const c = this.cache.get(chave);
    if (c && c.ate > Date.now()) return c.p;
    const l = (orgaoId ? await this.linha(orgaoId) : null) ?? (await this.linha(null));
    const p = l ? normalizarPlanejamento(l) : planejamentoSemente();
    this.cache.set(chave, { p, ate: Date.now() + 3000 });
    return p;
  }

  private async opcoesDoOrgao(orgaoId: string | null) {
    if (!orgaoId) return { setores: [] as Array<{ id: string; nome: string }>, usuarios: [] as Array<{ id: string; nome: string; ativo: boolean }> };
    const setores = await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 ORDER BY nome`, [orgaoId]);
    const usuarios = await this.ds.query(`SELECT id::text AS id, nome, ativo FROM usuarios WHERE orgao_id::text = $1 ORDER BY nome`, [orgaoId]);
    return { setores, usuarios: usuarios.map((u: any) => ({ id: u.id, nome: u.nome, ativo: u.ativo !== false })) };
  }

  /** Tela de Configurações › Fluxo (seção "Demandas e DFD"). */
  async tela(orgaoId: string | null) {
    const p = await this.vigente(orgaoId);
    const op = await this.opcoesDoOrgao(orgaoId);
    const nomes = (r: RegraPessoa) => ({
      setor: r.tipo === 'SETOR' ? op.setores.find((s: any) => s.id === r.valor)?.nome ?? null : null,
      usuario: r.tipo === 'USUARIO' ? op.usuarios.find((u: any) => u.id === r.valor)?.nome ?? null : null,
    });
    return {
      sistema: !orgaoId,
      proprio: !!p.orgao_id,
      planejamento: p,
      rotulos: {
        aprovador_demanda: rotuloRegra(p.aprovador_demanda, 'APROVAR', nomes(p.aprovador_demanda)),
        responsavel_dfd: rotuloRegra(p.responsavel_dfd, 'MONTAR', nomes(p.responsavel_dfd)),
        aprovador_dfd: rotuloRegra(p.aprovacao_dfd.aprovador, 'APROVAR', nomes(p.aprovacao_dfd.aprovador)),
      },
      erros: validarPlanejamento(p, { setores: orgaoId ? op.setores.map((s: any) => s.id) : undefined, usuarios: orgaoId ? op.usuarios : undefined }),
      papeis: Object.entries(ROTULO_PAPEL).map(([codigo, rotulo]) => ({ codigo, rotulo })),
      setores: op.setores,
      usuarios: op.usuarios.filter((u: any) => u.ativo !== false).map((u: any) => ({ id: u.id, nome: u.nome })),
    };
  }

  /** Grava (o do órgão; `orgaoId` null = o do sistema — só o admin da plataforma). Inválido → 400. */
  async salvar(orgaoId: string | null, corpo: any, autor: Autor) {
    const atual = await this.vigente(orgaoId);
    const { planejamento, erros } = aplicarEdicaoPlanejamento(atual, corpo);
    const op = await this.opcoesDoOrgao(orgaoId);
    erros.push(...validarPlanejamento(planejamento, { setores: orgaoId ? op.setores.map((s: any) => s.id) : undefined, usuarios: orgaoId ? op.usuarios : undefined }));
    if (erros.length) throw new BadRequestException({ message: `Não foi salvo: ${erros.map((e) => e.mensagem).join(' ')}`, erros });
    this.cache.clear();
    const valores = [JSON.stringify(planejamento.aprovador_demanda), JSON.stringify(planejamento.responsavel_dfd), JSON.stringify(planejamento.aprovacao_dfd), autor.nome ?? null];
    const propria = orgaoId ? await this.linha(orgaoId) : await this.linha(null);
    if (propria) {
      await this.ds.query(
        `UPDATE planejamento_fluxo_orgao SET aprovador_demanda = $2::jsonb, responsavel_dfd = $3::jsonb, aprovacao_dfd = $4::jsonb,
                atualizado_por_nome = $5, versao = versao + 1, updated_at = now() WHERE id::text = $1`,
        [propria.id, ...valores],
      );
    } else {
      await this.ds.query(
        `INSERT INTO planejamento_fluxo_orgao (orgao_id, versao, aprovador_demanda, responsavel_dfd, aprovacao_dfd, atualizado_por_nome)
         VALUES ($1, 1, $2::jsonb, $3::jsonb, $4::jsonb, $5) ON CONFLICT DO NOTHING`,
        [orgaoId, ...valores],
      );
    }
    this.cache.clear();
    return this.tela(orgaoId);
  }

  /** "Restaurar o padrão": o órgão volta a usar o planejamento do sistema. */
  async restaurar(orgaoId: string) {
    this.cache.clear();
    await this.ds.query(`DELETE FROM planejamento_fluxo_orgao WHERE orgao_id::text = $1`, [orgaoId]);
    return this.tela(orgaoId);
  }

  // ==========================================================================
  // QUEM PODE (sempre do token + banco)
  // ==========================================================================

  /** Pessoa do órgão (login do órgão / admin da plataforma = tudo; usuário: papéis, setor e flags do banco). */
  async pessoa(ator: Ator | null | undefined, orgaoId: string): Promise<PessoaDoOrgao | null> {
    if (!ator) return null;
    if (ator.admin || (ator.tipo === 'ORGAO' && ator.orgaoId === orgaoId)) {
      return { orgao: true, admin_orgao: true, usuario_id: null, papeis: [], setor_id: null, pode_aprovar_demandas: true };
    }
    if (ator.tipo !== 'USUARIO' || !ator.usuarioId || ator.orgaoId !== orgaoId || !ehUuid(ator.usuarioId)) return null;
    const [u] = await this.ds.query(
      `SELECT role::text AS role, papeis_fase_interna AS papeis, setor_id::text AS setor_id, pode_aprovar_demandas
         FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
      [ator.usuarioId, orgaoId],
    );
    if (!u) return null;
    return {
      orgao: false,
      admin_orgao: u.role === 'ADMIN',
      usuario_id: ator.usuarioId,
      papeis: Array.isArray(u.papeis) ? u.papeis : [],
      setor_id: u.setor_id ?? null,
      pode_aprovar_demandas: !!u.pode_aprovar_demandas,
    };
  }

  async podeAprovarDemanda(ator: Ator | null | undefined, orgaoId: string): Promise<boolean> {
    const p = await this.pessoa(ator, orgaoId);
    return !!p && pessoaAtende((await this.vigente(orgaoId)).aprovador_demanda, p, 'APROVAR');
  }

  /** Unidade de planejamento: monta o DFD consolidado e abre o processo (também a partir de uma demanda). */
  async podeMontarDfd(ator: Ator | null | undefined, orgaoId: string): Promise<boolean> {
    const p = await this.pessoa(ator, orgaoId);
    return !!p && pessoaAtende((await this.vigente(orgaoId)).responsavel_dfd, p, 'MONTAR');
  }

  async podeAprovarDfd(ator: Ator | null | undefined, orgaoId: string): Promise<boolean> {
    const p = await this.pessoa(ator, orgaoId);
    return !!p && pessoaAtende((await this.vigente(orgaoId)).aprovacao_dfd.aprovador, p, 'APROVAR');
  }

  /**
   * Usuários ativos do órgão que atendem a regra (avisos por sino, e-mail e
   * WhatsApp). MONTAR inclui os administradores do órgão. Vazio → o chamador
   * avisa o login do órgão.
   */
  async destinatarios(orgaoId: string, r: RegraPessoa, uso: 'APROVAR' | 'MONTAR'): Promise<DestinatarioAviso[]> {
    const cond: string[] = [];
    const params: unknown[] = [orgaoId];
    if (r.tipo === 'PAPEL' && r.valor) {
      params.push(r.valor);
      cond.push(`COALESCE(papeis_fase_interna, '[]'::jsonb) ? $${params.length}::text`);
    } else if (r.tipo === 'SETOR' && r.valor) {
      params.push(r.valor);
      cond.push(`setor_id::text = $${params.length}`);
    } else if (r.tipo === 'USUARIO' && r.valor) {
      params.push(r.valor);
      cond.push(`id::text = $${params.length}`);
    } else if (uso === 'APROVAR') {
      cond.push(`pode_aprovar_demandas = true`);
    }
    if (uso === 'MONTAR') cond.push(`role::text = 'ADMIN'`);
    if (!cond.length) return [];
    const linhas = await this.ds.query(
      `SELECT id::text AS id, email, telefone FROM usuarios WHERE orgao_id::text = $1 AND ativo = true AND (${cond.join(' OR ')}) ORDER BY nome LIMIT 30`,
      params,
    );
    return linhas.map((u: any) => ({ id: u.id, email: u.email || undefined, telefone: u.telefone || undefined }));
  }
}
