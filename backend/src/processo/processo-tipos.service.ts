import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoProcesso, TipoProcessoRegistro } from './entities/processo.entity';
import { definicaoContratacao } from './tipos/tipo-contratacao';
import { DefinicaoTipoProcesso, ORDEM_TIPOS, RequisitoDoTipo, definicaoAvulso, esqueletosFuturos } from './tipos/tipo-processo';

/**
 * REGISTRO DOS TIPOS DE PROCESSO: o "como" (código) + o "quais/rótulo/ativo"
 * (dados, `tipos_processo`). A semente do boot nunca sobrescreve o que o
 * admin da plataforma editou (só insere o que falta).
 *
 * O ModeloFluxoService (requisitos legais da CONTRATACAO) vive no
 * FaseInternaModule, que importa este módulo: para não fechar ciclo, ele é
 * resolvido pelo ModuleRef só quando os requisitos são pedidos.
 */
@Injectable()
export class ProcessoTiposService {
  private readonly definicoes: Map<TipoProcesso, DefinicaoTipoProcesso>;

  constructor(
    @InjectRepository(TipoProcessoRegistro) private readonly repo: Repository<TipoProcessoRegistro>,
    private readonly moduleRef: ModuleRef,
  ) {
    const lista: DefinicaoTipoProcesso[] = [definicaoContratacao({ requisitos: () => this.requisitosDaContratacao() }), definicaoAvulso(), ...esqueletosFuturos()];
    this.definicoes = new Map(lista.map((d) => [d.tipo, d]));
  }

  definicao(tipo: TipoProcesso): DefinicaoTipoProcesso | null {
    return this.definicoes.get(tipo) ?? null;
  }

  /** Tipos que podem ser abertos por `POST /processos` (sem objeto de conteúdo). */
  tiposComAberturaDireta(): TipoProcesso[] {
    return [...this.definicoes.values()].filter((d) => d.abertura_direta && d.implementado).map((d) => d.tipo);
  }

  /** Semente idempotente do registro em dados; devolve quantos foram inseridos. */
  async semear(): Promise<number> {
    let inseridos = 0;
    for (const [i, tipo] of ORDEM_TIPOS.entries()) {
      const d = this.definicoes.get(tipo);
      if (!d) continue;
      const r = await this.repo.query(
        `INSERT INTO tipos_processo (codigo, rotulo, descricao, referencia_tipo, implementado, abertura_direta, ativo, ordem)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7) ON CONFLICT (codigo) DO NOTHING`,
        [d.tipo, d.rotulo, d.descricao, d.referencia_tipo, d.implementado, d.abertura_direta, i],
      );
      inseridos += Number(Array.isArray(r) ? r[1] ?? 0 : 0);
    }
    return inseridos;
  }

  /** Tela/API: registro em dados + o que o código sabe de cada tipo. */
  async listar(): Promise<any[]> {
    const linhas = await this.repo.find({ order: { ordem: 'ASC' } });
    return linhas.map((l) => {
      const d = this.definicoes.get(l.codigo);
      return {
        codigo: l.codigo,
        rotulo: l.rotulo,
        descricao: l.descricao,
        referencia_tipo: l.referencia_tipo,
        implementado: l.implementado,
        abertura_direta: l.abertura_direta,
        ativo: l.ativo,
        ordem: l.ordem,
        tem_fluxo: d?.tem_fluxo ?? true,
        documentos: d?.catalogoDocumentos() ?? [],
        campos_condicao: d?.camposCondicao() ?? [],
      };
    });
  }

  private async requisitosDaContratacao(): Promise<RequisitoDoTipo[]> {
    // Import tardio: evita ciclo de módulos (FaseInternaModule → ProcessoModule)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ModeloFluxoService } = require('../fase-interna/fluxo/modelo-fluxo.service');
    const svc = this.moduleRef.get(ModeloFluxoService, { strict: false });
    if (!svc) return [];
    const lista: any[] = await svc.requisitos();
    return lista.map((r) => ({ codigo: r.codigo, tipo: r.tipo, etapa: r.etapa, outra_etapa: r.outra_etapa ?? null, fundamento: r.fundamento, mensagem: r.mensagem, ativo: r.ativo }));
  }
}
