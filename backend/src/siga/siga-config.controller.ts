import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';

export interface ConfigSiga {
  codigo_unidade: string | null;
  codigo_orgao: string | null;
  codigo_unidade_orcamentaria: string | null;
  data_inicio: string | null;
  nome_unidade: string;
}

/** O que falta na configuração para gerar arquivos do SIGA (vazio = pronto). */
export function pendenciasConfigSiga(c: ConfigSiga): string[] {
  const faltas: string[] = [];
  if (!c.codigo_unidade) faltas.push('Código da unidade gestora no SIGA');
  if (!c.codigo_orgao) faltas.push('Código do órgão (orçamento)');
  if (!c.codigo_unidade_orcamentaria) faltas.push('Código da unidade orçamentária');
  return faltas;
}

export function configSigaDoOrgao(o: Orgao): ConfigSiga {
  return {
    codigo_unidade: o.siga_codigo_unidade ?? null,
    codigo_orgao: o.siga_codigo_orgao ?? null,
    codigo_unidade_orcamentaria: o.siga_codigo_unidade_orcamentaria ?? null,
    data_inicio: o.siga_data_inicio ? String(o.siga_data_inicio).slice(0, 10) : null,
    nome_unidade: o.nome,
  };
}

const CODIGO = /^\d{1,4}$/;

/** Configuração do SIGA (TCM-BA) compartilhada por Patrimônio e Frota. */
@Controller('orgaos/:orgaoId/siga/config')
@RequireModule(ModuloSistema.PATRIMONIO, ModuloSistema.FROTA)
export class SigaConfigController {
  constructor(@InjectRepository(Orgao) private readonly orgaos: Repository<Orgao>) {}

  @Get()
  async obter(@Param('orgaoId') orgaoId: string) {
    const orgao = await this.orgaos.findOne({ where: { id: orgaoId } });
    if (!orgao) throw new NotFoundException('Órgão não encontrado');
    const config = configSigaDoOrgao(orgao);
    return { ...config, pendencias: pendenciasConfigSiga(config) };
  }

  @Patch()
  async salvar(
    @Param('orgaoId') orgaoId: string,
    @Body()
    body: {
      codigo_unidade?: string | null;
      codigo_orgao?: string | null;
      codigo_unidade_orcamentaria?: string | null;
      data_inicio?: string | null;
    },
  ) {
    const orgao = await this.orgaos.findOne({ where: { id: orgaoId } });
    if (!orgao) throw new NotFoundException('Órgão não encontrado');
    const codigo = (valor: string | null | undefined, rotulo: string) => {
      const v = String(valor ?? '').trim();
      if (!v) return null;
      if (!CODIGO.test(v)) throw new BadRequestException(`${rotulo}: informe até 4 dígitos, só números.`);
      return v;
    };
    if ('codigo_unidade' in body) orgao.siga_codigo_unidade = codigo(body.codigo_unidade, 'Código da unidade gestora');
    if ('codigo_orgao' in body) orgao.siga_codigo_orgao = codigo(body.codigo_orgao, 'Código do órgão');
    if ('codigo_unidade_orcamentaria' in body)
      orgao.siga_codigo_unidade_orcamentaria = codigo(body.codigo_unidade_orcamentaria, 'Código da unidade orçamentária');
    if ('data_inicio' in body) {
      const d = String(body.data_inicio ?? '').trim();
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Data de início inválida.');
      orgao.siga_data_inicio = d || null;
    }
    await this.orgaos.save(orgao);
    const config = configSigaDoOrgao(orgao);
    return { ...config, pendencias: pendenciasConfigSiga(config) };
  }
}
