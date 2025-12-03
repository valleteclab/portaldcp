import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from './entities/orgao.entity';
import { UnidadeOrgao } from './entities/unidade-orgao.entity';
import { SolicitacaoAcesso } from './entities/solicitacao-acesso.entity';
import { OrgaosService } from './orgaos.service';
import { OrgaosController } from './orgaos.controller';
import { SolicitacoesService } from './solicitacoes.service';
import { SolicitacoesController } from './solicitacoes.controller';
import { UnidadesService } from './unidades.service';
import { UnidadesController } from './unidades.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Orgao, UnidadeOrgao, SolicitacaoAcesso])],
  controllers: [OrgaosController, SolicitacoesController, UnidadesController],
  providers: [OrgaosService, SolicitacoesService, UnidadesService],
  exports: [OrgaosService, SolicitacoesService, UnidadesService, TypeOrmModule],
})
export class OrgaosModule {}
