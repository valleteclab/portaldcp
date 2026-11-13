import { randomInt } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapeamentoAnonimo } from '../sessao/entities/mapeamento-anonimo.entity';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';

/**
 * Serviço de Anonimização de Fornecedores
 * 
 * Responsável por:
 * - Gerar códigos anônimos para fornecedores (Fornecedor A, B, C...)
 * - Manter consistência do mapeamento durante toda a sessão
 * - Aplicar anonimização nos dados antes de enviar ao frontend
 * 
 * IMPORTANTE: Os dados reais NUNCA saem do backend quando anonimização está ativa
 */
@Injectable()
export class AnonimizacaoService {
  private readonly logger = new Logger(AnonimizacaoService.name);

  // Letras para códigos anônimos
  private readonly LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  constructor(
    @InjectRepository(MapeamentoAnonimo)
    private readonly mapeamentoRepo: Repository<MapeamentoAnonimo>,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
  ) {}

  /**
   * Gera código anônimo baseado no índice
   * 1 = "Fornecedor A", 26 = "Fornecedor Z", 27 = "Fornecedor AA"
   */
  private gerarCodigoAnonimo(indice: number): string {
    let codigo = '';
    let num = indice;
    
    while (num > 0) {
      num--;
      codigo = this.LETRAS[num % 26] + codigo;
      num = Math.floor(num / 26);
    }
    
    return `Fornecedor ${codigo}`;
  }

  /**
   * Obtém ou cria o código anônimo do fornecedor na sessão — ATÔMICO (E2).
   *
   * Antes: "busca → max(indice)+1 → insere" sem trava; chamadas concorrentes
   * (Promise.all no broadcast) davam o MESMO código a vários fornecedores ou
   * estouravam a unicidade (sessao, fornecedor) — o lance era gravado e o
   * fornecedor recebia "erro" (simulador 5c/7b). Agora: transação curta com
   * `pg_advisory_xact_lock` por sessão (serializa só a atribuição de códigos
   * da MESMA sessão), releitura e inserção com `ON CONFLICT DO NOTHING`; o
   * índice único (sessao_id, indice) garante no banco.
   */
  async obterCodigoAnonimo(sessaoId: string, fornecedorId: string): Promise<string> {
    const existente = await this.mapeamentoRepo.findOne({
      where: { sessao_id: sessaoId, fornecedor_id: fornecedorId },
    });
    if (existente) return existente.codigo_anonimo;
    const mapa = await this.atribuirCodigos(sessaoId, [fornecedorId]);
    return mapa.get(fornecedorId)!;
  }

  /**
   * Atribui (se ainda não houver) códigos aos fornecedores, na ordem dada, numa
   * só transação travada por sessão. Devolve o código de cada um.
   */
  async atribuirCodigos(sessaoId: string, fornecedorIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(fornecedorIds.filter(Boolean))];
    return this.mapeamentoRepo.manager.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mapeamento_anonimo:${sessaoId}`]);
      const atuais: Array<{ fornecedor_id: string; codigo_anonimo: string; indice: number }> = await m.query(
        `SELECT fornecedor_id, codigo_anonimo, indice FROM mapeamento_anonimo WHERE sessao_id = $1`,
        [sessaoId],
      );
      const mapa = new Map(atuais.map((a) => [String(a.fornecedor_id), a.codigo_anonimo]));
      let proximo = atuais.reduce((mx, a) => Math.max(mx, Number(a.indice) || 0), 0) + 1;
      // Ordem SORTEADA: se seguisse a ordem dos ids, quem conhece os
      // participantes reconstruiria o mapa código → empresa.
      const novos = ids.filter((id) => !mapa.has(id));
      for (let i = novos.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [novos[i], novos[j]] = [novos[j], novos[i]];
      }
      for (const id of novos) {
        const codigo = this.gerarCodigoAnonimo(proximo);
        await m.query(
          `INSERT INTO mapeamento_anonimo (sessao_id, fornecedor_id, codigo_anonimo, indice)
           VALUES ($1, $2, $3, $4) ON CONFLICT (sessao_id, fornecedor_id) DO NOTHING`,
          [sessaoId, id, codigo, proximo],
        );
        mapa.set(id, codigo);
        proximo++;
      }
      return mapa;
    });
  }

  // ==========================================================================
  // CÓDIGO POR UNIDADE (item ou lote) — julgamento item a item
  // ==========================================================================
  //
  // O julgamento de um item pode começar assim que ELE encerra, com outros
  // ainda em disputa (decisão do dono, 13/11/2026). Julgar identifica o
  // licitante naquele item; se o código fosse o mesmo na sessão toda, o órgão
  // passaria a saber quem é o "Fornecedor B" que ainda dá lance nos demais.
  // Por isso cada unidade tem o seu sorteio: a empresa X é "Fornecedor B" no
  // item 1 e, por exemplo, "Fornecedor D" no item 2. O código da SESSÃO segue
  // existindo para o que não tem unidade (chat) e para a dispensa.

  private tabelaDaUnidadePronta: Promise<void> | null = null;

  /** Tabela criada sob demanda (uma vez por processo): não depende de migração nem do synchronize. */
  private garantirTabelaDaUnidade(): Promise<void> {
    if (!this.tabelaDaUnidadePronta) {
      this.tabelaDaUnidadePronta = this.mapeamentoRepo.manager
        .query(
          `CREATE TABLE IF NOT EXISTS mapeamento_anonimo_unidade (
             sessao_id uuid NOT NULL,
             unidade_id uuid NOT NULL,
             fornecedor_id uuid NOT NULL,
             codigo_anonimo varchar(50) NOT NULL,
             indice int NOT NULL,
             created_at timestamptz NOT NULL DEFAULT now(),
             PRIMARY KEY (sessao_id, unidade_id, fornecedor_id),
             UNIQUE (sessao_id, unidade_id, indice)
           )`,
        )
        .then(() => undefined)
        .catch((e) => {
          this.tabelaDaUnidadePronta = null;
          throw e;
        });
    }
    return this.tabelaDaUnidadePronta;
  }

  /** Atribui (em ordem SORTEADA) o código da unidade a quem ainda não tem; devolve o mapa completo da unidade. */
  async atribuirCodigosDaUnidade(sessaoId: string, unidadeId: string, fornecedorIds: string[]): Promise<Map<string, string>> {
    await this.garantirTabelaDaUnidade();
    const ids = [...new Set(fornecedorIds.filter(Boolean).map(String))];
    return this.mapeamentoRepo.manager.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mapeamento_anonimo_unidade:${sessaoId}:${unidadeId}`]);
      const atuais: Array<{ fornecedor_id: string; codigo_anonimo: string; indice: number }> = await m.query(
        `SELECT fornecedor_id::text AS fornecedor_id, codigo_anonimo, indice FROM mapeamento_anonimo_unidade WHERE sessao_id = $1 AND unidade_id = $2`,
        [sessaoId, unidadeId],
      );
      const mapa = new Map(atuais.map((a) => [String(a.fornecedor_id), a.codigo_anonimo]));
      let proximo = atuais.reduce((mx, a) => Math.max(mx, Number(a.indice) || 0), 0) + 1;
      const novos = ids.filter((id) => !mapa.has(id));
      for (let i = novos.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [novos[i], novos[j]] = [novos[j], novos[i]];
      }
      for (const id of novos) {
        const codigo = this.gerarCodigoAnonimo(proximo);
        await m.query(
          `INSERT INTO mapeamento_anonimo_unidade (sessao_id, unidade_id, fornecedor_id, codigo_anonimo, indice)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sessao_id, unidade_id, fornecedor_id) DO NOTHING`,
          [sessaoId, unidadeId, id, codigo, proximo],
        );
        mapa.set(id, codigo);
        proximo++;
      }
      return mapa;
    });
  }

  /** Código do fornecedor NAQUELA unidade (atribui se ainda não tem). */
  async obterCodigoNaUnidade(sessaoId: string, unidadeId: string, fornecedorId: string): Promise<string> {
    await this.garantirTabelaDaUnidade();
    const [r] = await this.mapeamentoRepo.manager.query(
      `SELECT codigo_anonimo FROM mapeamento_anonimo_unidade WHERE sessao_id = $1 AND unidade_id = $2 AND fornecedor_id = $3`,
      [sessaoId, unidadeId, fornecedorId],
    );
    if (r) return r.codigo_anonimo;
    return (await this.atribuirCodigosDaUnidade(sessaoId, unidadeId, [fornecedorId])).get(String(fornecedorId))!;
  }

  /** Todos os códigos por unidade da sessão: Map<unidadeId, Map<fornecedorId, código>>. */
  async obterMapeamentoPorUnidade(sessaoId: string): Promise<Map<string, Map<string, string>>> {
    await this.garantirTabelaDaUnidade();
    const rows: Array<{ u: string; f: string; c: string }> = await this.mapeamentoRepo.manager.query(
      `SELECT unidade_id::text AS u, fornecedor_id::text AS f, codigo_anonimo AS c FROM mapeamento_anonimo_unidade WHERE sessao_id = $1`,
      [sessaoId],
    );
    const saida = new Map<string, Map<string, string>>();
    for (const r of rows) {
      if (!saida.has(r.u)) saida.set(r.u, new Map());
      saida.get(r.u)!.set(r.f, r.c);
    }
    return saida;
  }

  /**
   * Obtém mapeamento completo de uma sessão
   * Retorna Map<fornecedorId, codigoAnonimo>
   */
  async obterMapeamentoSessao(sessaoId: string): Promise<Map<string, string>> {
    const mapeamentos = await this.mapeamentoRepo.find({
      where: { sessao_id: sessaoId },
    });

    const map = new Map<string, string>();
    for (const m of mapeamentos) {
      map.set(m.fornecedor_id, m.codigo_anonimo);
    }

    return map;
  }

  /**
   * Verifica se anonimização está ativa para uma sessão
   */
  async isAnonimizacaoAtiva(sessaoId: string): Promise<boolean> {
    const sessao = await this.sessaoRepo.findOne({
      where: { id: sessaoId },
    });

    return sessao?.anonimizacao_ativa ?? true; // Default: ativo
  }

  /**
   * Anonimiza nome do fornecedor se anonimização estiver ativa
   */
  async anonimizarNome(
    sessaoId: string,
    fornecedorId: string,
    nomeReal: string,
    forcarAnonimizacao?: boolean,
  ): Promise<string> {
    // Se forçar anonimização ou se estiver ativa na sessão
    const ativa = forcarAnonimizacao ?? await this.isAnonimizacaoAtiva(sessaoId);
    
    if (!ativa) {
      return nomeReal;
    }

    return this.obterCodigoAnonimo(sessaoId, fornecedorId);
  }

  /**
   * Anonimiza um array de lances
   */
  async anonimizarLances(
    sessaoId: string,
    lances: Array<{ fornecedorId: string; fornecedorNome: string; [key: string]: any }>,
  ): Promise<Array<{ fornecedorId: string; fornecedorNome: string; [key: string]: any }>> {
    const ativa = await this.isAnonimizacaoAtiva(sessaoId);
    
    if (!ativa) {
      return lances;
    }

    // Pré-carregar mapeamento para evitar múltiplas queries
    const mapeamento = await this.obterMapeamentoSessao(sessaoId);

    return Promise.all(lances.map(async (lance) => {
      let codigoAnonimo = mapeamento.get(lance.fornecedorId);
      
      if (!codigoAnonimo) {
        codigoAnonimo = await this.obterCodigoAnonimo(sessaoId, lance.fornecedorId);
      }

      return {
        ...lance,
        fornecedorId: `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`,
        fornecedorNome: codigoAnonimo,
      };
    }));
  }

  /**
   * Anonimiza dados de um item (melhorLance, etc)
   */
  async anonimizarItem(
    sessaoId: string,
    item: {
      melhorLance?: { fornecedorId: string; fornecedorNome: string; valor: number };
      [key: string]: any;
    },
  ): Promise<typeof item> {
    const ativa = await this.isAnonimizacaoAtiva(sessaoId);
    
    if (!ativa || !item.melhorLance) {
      return item;
    }

    const codigoAnonimo = await this.obterCodigoAnonimo(
      sessaoId,
      item.melhorLance.fornecedorId,
    );

    return {
      ...item,
      melhorLance: {
        ...item.melhorLance,
        fornecedorId: `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`,
        fornecedorNome: codigoAnonimo,
      },
    };
  }

  /**
   * Ativa/desativa anonimização de uma sessão
   * Registra log de auditoria
   */
  async toggleAnonimizacao(
    sessaoId: string,
    ativa: boolean,
    usuarioId: string,
    justificativa?: string,
  ): Promise<void> {
    await this.sessaoRepo.update(sessaoId, {
      anonimizacao_ativa: ativa,
    });

    this.logger.log(`Sessão ${sessaoId} - Anonimização ${ativa ? 'ATIVADA' : 'DESATIVADA'} por ${usuarioId}. Justificativa: ${justificativa || 'N/A'}`);
  }
}
