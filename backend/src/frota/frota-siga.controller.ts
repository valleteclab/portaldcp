import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe,
  Patch, Post, Query, Req, Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Repository } from 'typeorm';
import type { Response } from 'express';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { configSigaDoOrgao, ConfigSiga, pendenciasConfigSiga } from '../siga/siga-config.controller';
import { ErroCampoSiga, montarArquivosSiga } from '../siga/siga-arquivo.util';
import { Veiculo } from './entities/veiculo.entity';
import { Abastecimento } from './entities/abastecimento.entity';
import { FrotaRequisicao, StatusRequisicaoFrota } from './entities/frota-requisicao.entity';
import { intervaloDoMes } from './frota.utils';
import {
  agregarConsumoCombustivel, competenciaSiga, ConsumoFonte, dataBrasilia, hojeBrasiliaCompacto,
  linhaCombustivelSiga, linhaFrotaSiga, pendenciasVeiculoSiga, registroBemFrota, stAntigoVeiculo,
} from './siga-frota.util';

/**
 * Exportação da Frota para o SIGA (TCM-BA). O SIGA não tem API: geramos os
 * arquivos "Frota" (cadastro, uma vez por veículo) e "Combustivel" (mensal)
 * para o órgão importar no SIGA Captura.
 */
@Controller('frota/siga')
@RequireModule(ModuloSistema.FROTA)
export class FrotaSigaController {
  constructor(
    @InjectRepository(Veiculo) private readonly veiculos: Repository<Veiculo>,
    @InjectRepository(Abastecimento) private readonly abastecimentos: Repository<Abastecimento>,
    @InjectRepository(FrotaRequisicao) private readonly requisicoes: Repository<FrotaRequisicao>,
    @InjectRepository(Orgao) private readonly orgaos: Repository<Orgao>,
  ) {}

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) return user.sub;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new Error('Órgão não identificado');
  }

  private async config(orgaoId: string): Promise<ConfigSiga> {
    const orgao = await this.orgaos.findOne({ where: { id: orgaoId } });
    if (!orgao) throw new NotFoundException('Órgão não encontrado');
    return configSigaDoOrgao(orgao);
  }

  private async configPronta(orgaoId: string): Promise<ConfigSiga> {
    const config = await this.config(orgaoId);
    const faltas = pendenciasConfigSiga(config);
    if (faltas.length)
      throw new BadRequestException(`Configure o SIGA antes de gerar o arquivo. Falta: ${faltas.join(', ')}.`);
    return config;
  }

  /** Veículos considerados no SIGA: ativos, baixados ou já enviados. */
  private async veiculosDoOrgao(orgaoId: string): Promise<Veiculo[]> {
    const todos = await this.veiculos.find({ where: { orgao_id: orgaoId }, order: { placa: 'ASC' } });
    return todos.filter((v) => v.ativo || v.data_baixa || v.siga_enviado_em);
  }

  private async veiculosDoArquivo(orgaoId: string, somenteNaoEnviados: boolean) {
    const lista = await this.veiculosDoOrgao(orgaoId);
    return lista.filter((v) => !pendenciasVeiculoSiga(v).length && (!somenteNaoEnviados || !v.siga_enviado_em));
  }

  private situacao(v: Veiculo, config: ConfigSiga) {
    const pendencias = pendenciasVeiculoSiga(v);
    return {
      id: v.id,
      placa: v.placa,
      registro_bem: registroBemFrota(v.placa),
      modelo: v.modelo,
      marca: v.marca,
      ano: v.ano,
      tipo: v.tipo,
      tipo_combustivel: v.tipo_combustivel,
      chassi: v.chassi,
      renavam: v.renavam,
      ativo: v.ativo,
      siga_tipo_veiculo: v.siga_tipo_veiculo,
      siga_marca_veiculo: v.siga_marca_veiculo,
      alugado: !!v.alugado,
      nota_fiscal_ou_contrato: v.nota_fiscal_ou_contrato,
      valor_aquisicao: v.valor_aquisicao == null ? null : Number(v.valor_aquisicao),
      numero_empenho: v.numero_empenho,
      data_aquisicao: v.data_aquisicao ? String(v.data_aquisicao).slice(0, 10) : null,
      data_baixa: v.data_baixa ? String(v.data_baixa).slice(0, 10) : null,
      siga_enviado_em: v.siga_enviado_em,
      anterior_siga: stAntigoVeiculo(v.data_aquisicao, config.data_inicio) === '1',
      pendencias,
      situacao: pendencias.length ? 'PENDENTE' : v.siga_enviado_em ? 'ENVIADO' : 'PRONTO',
    };
  }

  // ========== RESUMO ==========

  @Get('resumo')
  async resumo(@Req() req: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(req.user);
    const config = await this.config(orgaoId);
    const lista = (await this.veiculosDoOrgao(orgaoId)).map((v) => this.situacao(v, config));
    return {
      config_pendencias: pendenciasConfigSiga(config),
      total: lista.length,
      prontos: lista.filter((v) => v.situacao === 'PRONTO').length,
      pendentes: lista.filter((v) => v.situacao === 'PENDENTE').length,
      enviados: lista.filter((v) => v.situacao === 'ENVIADO').length,
    };
  }

  // ========== VEÍCULOS (dados do SIGA) ==========

  @Get('veiculos')
  async listar(@Req() req: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(req.user);
    const config = await this.config(orgaoId);
    return (await this.veiculosDoOrgao(orgaoId)).map((v) => this.situacao(v, config));
  }

  @Patch('veiculos/:id')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: Record<string, unknown>,
  ) {
    const orgaoId = this.getOrgaoId(req.user);
    const v = await this.veiculos.findOne({ where: { id, orgao_id: orgaoId } });
    if (!v) throw new NotFoundException('Veículo não encontrado');

    const texto = (valor: unknown) => {
      const t = String(valor ?? '').trim();
      return t || null;
    };
    const inteiro = (valor: unknown, rotulo: string, max: number) => {
      const t = String(valor ?? '').trim();
      if (!t) return null;
      if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > max)
        throw new BadRequestException(`${rotulo}: informe um código numérico de até ${String(max).length} dígitos.`);
      return Number(t);
    };
    const data = (valor: unknown, rotulo: string) => {
      const t = String(valor ?? '').trim();
      if (!t) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new BadRequestException(`${rotulo} inválida.`);
      return t;
    };

    if ('siga_tipo_veiculo' in body) v.siga_tipo_veiculo = inteiro(body.siga_tipo_veiculo, 'Tipo de veículo (SIGA)', 99);
    if ('siga_marca_veiculo' in body) v.siga_marca_veiculo = inteiro(body.siga_marca_veiculo, 'Marca do veículo (SIGA)', 999);
    if ('alugado' in body) v.alugado = body.alugado === true || body.alugado === 'true';
    if ('nota_fiscal_ou_contrato' in body) v.nota_fiscal_ou_contrato = texto(body.nota_fiscal_ou_contrato);
    if ('valor_aquisicao' in body) {
      const t = String(body.valor_aquisicao ?? '').trim();
      if (!t) v.valor_aquisicao = null;
      else {
        const n = Number(t.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Valor de aquisição inválido.');
        v.valor_aquisicao = n;
      }
    }
    if ('numero_empenho' in body) v.numero_empenho = texto(body.numero_empenho);
    if ('data_aquisicao' in body) v.data_aquisicao = data(body.data_aquisicao, 'Data de aquisição');
    if ('data_baixa' in body) v.data_baixa = data(body.data_baixa, 'Data de baixa');
    // Dados do documento do veículo que o SIGA também exige.
    if ('renavam' in body) v.renavam = texto(body.renavam) as string;
    if ('chassi' in body) v.chassi = texto(body.chassi) as string;
    if ('ano' in body && String(body.ano ?? '').trim() !== '') {
      const ano = Number(body.ano);
      if (!Number.isInteger(ano) || ano < 1900 || ano > 9999) throw new BadRequestException('Ano de fabricação inválido.');
      v.ano = ano;
    }
    if ('siga_enviado' in body && body.siga_enviado === false) v.siga_enviado_em = null;

    const salvo = await this.veiculos.save(v);
    return this.situacao(salvo, await this.config(orgaoId));
  }

  // ========== ARQUIVO DE FROTA (cadastro) ==========

  @Get('arquivo-frota/ids')
  async idsArquivoFrota(@Req() req: { user: JwtPayload }, @Query('somente_nao_enviados') somente?: string) {
    const lista = await this.veiculosDoArquivo(this.getOrgaoId(req.user), somente !== 'false');
    return { veiculo_ids: lista.map((v) => v.id), total: lista.length };
  }

  @Get('arquivo-frota')
  async arquivoFrota(
    @Req() req: { user: JwtPayload },
    @Res() res: Response,
    @Query('somente_nao_enviados') somente?: string,
  ) {
    const orgaoId = this.getOrgaoId(req.user);
    const config = await this.configPronta(orgaoId);
    const lista = await this.veiculosDoArquivo(orgaoId, somente !== 'false');
    if (!lista.length)
      throw new BadRequestException(
        somente !== 'false'
          ? 'Nenhum veículo pronto e ainda não enviado ao SIGA.'
          : 'Nenhum veículo com os dados do SIGA completos.',
      );
    const codigo = config.codigo_unidade as string;
    const arquivo = this.montar(
      () =>
        montarArquivosSiga(
          { identificacao: 'Frota', codigoUnidade: codigo, nomeUnidade: config.nome_unidade },
          lista,
          (v, seq) => linhaFrotaSiga(v, { codigoUnidade: codigo, dataInicioSiga: config.data_inicio }, seq),
          `Frota_${codigo}_${hojeBrasiliaCompacto()}`,
        ),
    );
    this.enviar(res, arquivo.nome, arquivo.buffer);
  }

  @Post('marcar-enviados')
  async marcarEnviados(@Req() req: { user: JwtPayload }, @Body() body: { veiculo_ids?: string[] }) {
    const orgaoId = this.getOrgaoId(req.user);
    const ids = Array.isArray(body?.veiculo_ids) ? body.veiculo_ids.filter((i) => typeof i === 'string') : [];
    if (!ids.length) throw new BadRequestException('Informe os veículos enviados.');
    const result = await this.veiculos.update({ id: In(ids), orgao_id: orgaoId }, { siga_enviado_em: new Date() });
    return { marcados: result.affected ?? 0 };
  }

  // ========== ARQUIVO DE COMBUSTÍVEL (mensal) ==========

  private async consumo(orgaoId: string, competencia: string) {
    try {
      competenciaSiga(competencia);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { inicio, fim } = intervaloDoMes(competencia);
    const [veiculos, abastecimentos, requisicoes] = await Promise.all([
      this.veiculos.find({ where: { orgao_id: orgaoId } }),
      this.abastecimentos.find({ where: { orgao_id: orgaoId, data: Between(inicio, fim) } }),
      // Competência pela data do abastecimento em Brasília (00:00 BRT = 03:00 UTC).
      this.requisicoes.find({
        where: [
          {
            orgao_id: orgaoId,
            status: StatusRequisicaoFrota.ABASTECIDO,
            data_abastecimento: Between(
              new Date(`${inicio}T03:00:00.000Z`),
              new Date(new Date(`${fim}T03:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - 1),
            ),
          },
          { orgao_id: orgaoId, status: StatusRequisicaoFrota.ABASTECIDO, data_abastecimento: IsNull(), data_requisicao: Between(inicio, fim) },
        ],
      }),
    ]);
    const fontes: ConsumoFonte[] = [
      ...abastecimentos.map((a) => ({
        veiculo_id: a.veiculo_id,
        placa: veiculos.find((v) => v.id === a.veiculo_id)?.placa ?? null,
        data: String(a.data).slice(0, 10),
        litros: a.quantidade_litros,
        valor: a.valor_total,
        combustivel: a.tipo_combustivel,
      })),
      ...requisicoes.map((r) => ({
        veiculo_id: r.veiculo_id ?? null,
        placa: r.veiculo_placa,
        data: dataBrasilia(r.data_abastecimento) ?? String(r.data_requisicao ?? '').slice(0, 10),
        litros: r.quantidade_abastecida ?? 0,
        valor: r.valor_total ?? 0,
        combustivel: r.tipo_combustivel,
      })),
    ];
    return agregarConsumoCombustivel(competencia, fontes, veiculos);
  }

  @Get('combustivel/previa')
  async previaCombustivel(@Req() req: { user: JwtPayload }, @Query('competencia') competencia: string) {
    const orgaoId = this.getOrgaoId(req.user);
    const config = await this.config(orgaoId);
    const linhas = await this.consumo(orgaoId, competencia);
    const validas = linhas.filter((l) => !l.pendencias.length);
    const soma = (ls: typeof linhas, campo: 'litros' | 'custo', casas: number) =>
      Math.round(ls.reduce((s, l) => s + l[campo], 0) * 10 ** casas) / 10 ** casas;
    return {
      competencia,
      config_pendencias: pendenciasConfigSiga(config),
      linhas,
      totais: {
        linhas: linhas.length,
        linhas_no_arquivo: validas.length,
        linhas_com_pendencia: linhas.length - validas.length,
        litros: soma(linhas, 'litros', 3),
        custo: soma(linhas, 'custo', 2),
        litros_no_arquivo: soma(validas, 'litros', 3),
        custo_no_arquivo: soma(validas, 'custo', 2),
      },
    };
  }

  @Get('combustivel/arquivo')
  async arquivoCombustivel(
    @Req() req: { user: JwtPayload },
    @Res() res: Response,
    @Query('competencia') competencia: string,
  ) {
    const orgaoId = this.getOrgaoId(req.user);
    const config = await this.configPronta(orgaoId);
    const linhas = (await this.consumo(orgaoId, competencia)).filter((l) => !l.pendencias.length);
    if (!linhas.length) throw new BadRequestException('Nenhum consumo sem pendências nesta competência.');
    const codigo = config.codigo_unidade as string;
    const arquivo = this.montar(() =>
      montarArquivosSiga(
        { identificacao: 'Combustivel', codigoUnidade: codigo, nomeUnidade: config.nome_unidade },
        linhas,
        (l, seq) => linhaCombustivelSiga(l, codigo, competencia, seq),
        `Combustivel_${codigo}_${competenciaSiga(competencia)}`,
      ),
    );
    this.enviar(res, arquivo.nome, arquivo.buffer);
  }

  // ========== apoio ==========

  private montar(gerar: () => ReturnType<typeof montarArquivosSiga>) {
    let arquivos: ReturnType<typeof montarArquivosSiga>;
    try {
      arquivos = gerar();
    } catch (e) {
      if (e instanceof ErroCampoSiga) throw new BadRequestException(e.message);
      throw e;
    }
    if (arquivos.length > 1)
      throw new BadRequestException('O arquivo passaria de 5.000 linhas, limite do SIGA. Fale com o suporte para gerar em partes.');
    return arquivos[0];
  }

  private enviar(res: Response, nome: string, buffer: Buffer) {
    res.setHeader('Content-Type', 'text/plain; charset=ISO-8859-1');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  }
}
