import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Contrato } from './entities/contrato.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ConciliacaoPagamento } from './entities/conciliacao-pagamento.entity';
import { FatorTransparenciaService } from './fator-transparencia.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  centavos,
  chavePagamento,
  validarRateio,
} from './conciliacao-pagamento.util';

@Injectable()
export class ConciliacaoPagamentoService {
  constructor(
    private readonly db: DataSource,
    private readonly fator: FatorTransparenciaService,
  ) {}

  private async contrato(id: string, user: JwtPayload) {
    if (![UserType.ADMIN, UserType.ORGAO, UserType.USUARIO].includes(user.type))
      throw new ForbiddenException();
    const contrato = await this.db.getRepository(Contrato).findOneBy({ id });
    if (!contrato) throw new NotFoundException('Contrato não encontrado.');
    const orgao =
      user.type === UserType.ORGAO
        ? user.sub
        : user.orgaoId || (user as JwtPayload & { orgao_id?: string }).orgao_id;
    if (user.type !== UserType.ADMIN && contrato.orgao_id !== orgao)
      throw new ForbiddenException('Contrato de outro órgão.');
    return contrato;
  }

  private async consultar(contrato: Contrato) {
    if (!contrato.fornecedor_cnpj || !contrato.numero_contrato)
      throw new BadRequestException(
        'Informe fornecedor e número do contrato antes de conciliar.',
      );
    const registros = await this.fator.buscarEmpenhos({
      nContrato: contrato.numero_contrato,
      cpfcnpj: contrato.fornecedor_cnpj,
      ano: contrato.ano,
      processoLicitatorioPortal:
        contrato.processo_licitatorio_portal ?? undefined,
      exigirConsultaCompleta: true,
    });
    const pagamentos = registros.filter((p) => p.fase_tipo === 'PAGAMENTO');
    const cnpjContrato = contrato.fornecedor_cnpj.replace(/\D/g, '');
    const contagem = new Map<string, number>();
    pagamentos.forEach((p) =>
      contagem.set(
        chavePagamento(p),
        (contagem.get(chavePagamento(p)) || 0) + 1,
      ),
    );
    return pagamentos.map((p) => ({
      ...p,
      chave: chavePagamento(p),
      elegivel:
        p.confirmacao !== 'NAO_CONFIRMADO' &&
        // O portal omite o documento de pessoa física; a consulta já vem
        // filtrada pelo CPF/CNPJ do contrato, então vazio não é outro credor.
        (!p.cnpj || p.cnpj.replace(/\D/g, '') === cnpjContrato) &&
        !!p.numero_empenho &&
        // Nº de liquidação não é exigido: atas e o formato antigo do portal não
        // o trazem. A chave usa empenho + data + valor; se dois pagamentos
        // coincidirem nisso, a contagem os marca como ambíguos.
        contagem.get(chavePagamento(p)) === 1,
    }));
  }

  async listar(id: string, user: JwtPayload) {
    const contrato = await this.contrato(id, user);
    const pagamentos = await this.consultar(contrato);
    const [medicoes, vinculos] = await Promise.all([
      this.db
        .getRepository(Medicao)
        .find({ where: { contrato_id: id }, order: { numero_medicao: 'ASC' } }),
      this.db
        .getRepository(ConciliacaoPagamento)
        .find({ where: { contrato_id: id }, order: { criado_em: 'DESC' } }),
    ]);
    const ativos = vinculos.filter((v) => !v.cancelado_em);
    const somar = (lista: ConciliacaoPagamento[]) =>
      lista.reduce((s, v) => s + centavos(v.valor), 0) / 100;
    const pagamentosPorChave = new Map(pagamentos.map((p) => [p.chave, p]));
    const estornosPendentes = pagamentos.filter(
      (p) =>
        p.elegivel &&
        p.valor < 0 &&
        centavos(p.valor) !==
          centavos(somar(ativos.filter((v) => v.pagamento_chave === p.chave))),
    );
    const revisao = (v: ConciliacaoPagamento) =>
      !pagamentosPorChave.get(v.pagamento_chave)?.elegivel ||
      estornosPendentes.some(
        (p) => p.numero_empenho === v.pagamento.numero_empenho,
      ) ||
      medicoes.find((m) => m.id === v.medicao_id)?.status !==
        StatusMedicao.APROVADA;
    return {
      consultado_em: new Date().toISOString(),
      pagamentos: pagamentos.map((p) => {
        const total = somar(
          ativos.filter((v) => v.pagamento_chave === p.chave),
        );
        return {
          ...p,
          conciliado: total,
          disponivel: (centavos(p.valor) - centavos(total)) / 100,
          sugestoes:
            p.elegivel && p.valor > 0
              ? medicoes
                  .filter(
                    (m) =>
                      m.status === StatusMedicao.APROVADA &&
                      centavos(m.valor_medido) === centavos(p.valor),
                  )
                  .map((m) => m.id)
              : [],
        };
      }),
      medicoes: medicoes
        .filter(
          (m) =>
            m.status === StatusMedicao.APROVADA ||
            ativos.some((v) => v.medicao_id === m.id),
        )
        .map((m) => {
          const lista = ativos.filter((v) => v.medicao_id === m.id);
          const pago = somar(lista);
          const pendente = (centavos(m.valor_medido) - centavos(pago)) / 100;
          return {
            id: m.id,
            numero: m.numero_medicao,
            nota_fiscal: m.nota_fiscal_numero,
            periodo_inicio: m.periodo_inicio,
            valor: Number(m.valor_medido),
            conciliado: pago,
            pendente,
            aprovada: m.status === StatusMedicao.APROVADA,
            situacao:
              lista.some(revisao) || pendente < 0 || pago < 0
                ? 'REVISAR'
                : pago === 0
                  ? 'SEM_PAGAMENTO'
                  : pendente === 0
                    ? 'INTEGRAL'
                    : 'PARCIAL',
          };
        }),
      vinculos: vinculos.map((v) => ({
        ...v,
        revisar: !v.cancelado_em && revisao(v),
      })),
    };
  }

  async vincular(
    id: string,
    user: JwtPayload,
    dados: {
      pagamento_chave: string;
      medicao_id: string;
      valor: number;
      justificativa: string;
    },
  ) {
    const contrato = await this.contrato(id, user);
    const pagamentos = await this.consultar(contrato);
    const pagamento = pagamentos.find((p) => p.chave === dados.pagamento_chave);
    if (!pagamento?.elegivel)
      throw new BadRequestException(
        'Pagamento não confirmado, ambíguo ou não localizado na consulta atual.',
      );
    const justificativa = this.justificativa(dados.justificativa);
    return this.db.transaction(async (manager) => {
      // Serializa rateios do contrato: duas confirmações não podem usar o mesmo saldo.
      await manager.findOneOrFail(Contrato, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      // A mesma despesa pode aparecer em consultas de contratos distintos.
      // Serializa também pela identidade contábil dentro do órgão.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${contrato.orgao_id}:${pagamento.chave}`,
      ]);
      const outrosVinculos = await manager.find(ConciliacaoPagamento, {
        where: { orgao_id: contrato.orgao_id, pagamento_chave: pagamento.chave },
      });
      if (outrosVinculos.some(v => !v.cancelado_em && v.contrato_id !== id)) {
        throw new BadRequestException('Este pagamento já possui vínculo em outro contrato. Revise o vínculo de origem antes de continuar.');
      }
      const medicao = await manager.findOne(Medicao, {
        where: { id: dados.medicao_id, contrato_id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!medicao || medicao.status !== StatusMedicao.APROVADA)
        throw new BadRequestException(
          'Selecione uma medição aprovada deste contrato.',
        );
      const vinculos = (
        await manager.find(ConciliacaoPagamento, { where: { contrato_id: id } })
      ).filter((v) => !v.cancelado_em);
      const daMedicao = vinculos.filter((v) => v.medicao_id === medicao.id);
      if (
        daMedicao.some(
          (v) =>
            !pagamentos.some(
              (p) => p.chave === v.pagamento_chave && p.elegivel,
            ),
        )
      )
        throw new BadRequestException(
          'Revise os vínculos não localizados na contabilidade antes de continuar.',
        );
      const soma = (lista: ConciliacaoPagamento[]) =>
        lista.reduce((s, v) => s + centavos(v.valor), 0) / 100;
      const erro = validarRateio(
        dados.valor,
        pagamento.valor,
        soma(vinculos.filter((v) => v.pagamento_chave === pagamento.chave)),
        Number(medicao.valor_medido),
        soma(daMedicao),
      );
      if (erro) throw new BadRequestException(erro);
      return manager.save(
        ConciliacaoPagamento,
        manager.create(ConciliacaoPagamento, {
          contrato_id: id,
          orgao_id: contrato.orgao_id,
          medicao_id: medicao.id,
          pagamento_chave: pagamento.chave,
          pagamento,
          valor: dados.valor,
          justificativa,
          usuario_id: user.sub,
          usuario_nome: await this.nomeUsuario(user),
        }),
      );
    });
  }

  async cancelar(
    id: string,
    vinculoId: string,
    user: JwtPayload,
    motivo: string,
  ) {
    await this.contrato(id, user);
    const justificativa = this.justificativa(motivo);
    return this.db.transaction(async (manager) => {
      await manager.findOneOrFail(Contrato, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const vinculo = await manager.findOneBy(ConciliacaoPagamento, {
        id: vinculoId,
        contrato_id: id,
      });
      if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
      if (vinculo.cancelado_em) return vinculo;
      vinculo.cancelado_em = new Date();
      vinculo.cancelado_por = user.sub;
      vinculo.motivo_cancelamento = justificativa;
      return manager.save(vinculo);
    });
  }

  private async nomeUsuario(user: JwtPayload) {
    const usuario = await this.db
      .getRepository(Usuario)
      .findOne({ where: { id: user.sub }, select: ['id', 'nome'] });
    return usuario?.nome || user.email || 'Usuário do órgão';
  }

  private justificativa(valor: string) {
    if (
      typeof valor !== 'string' ||
      valor.trim().length < 5 ||
      valor.length > 2000
    )
      throw new BadRequestException(
        'Informe uma justificativa entre 5 e 2000 caracteres.',
      );
    return valor.trim();
  }
}
