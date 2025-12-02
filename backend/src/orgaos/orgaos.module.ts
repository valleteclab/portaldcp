import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from './entities/orgao.entity';
import { SolicitacaoAcesso } from './entities/solicitacao-acesso.entity';
import { OrgaosService } from './orgaos.service';
import { OrgaosController } from './orgaos.controller';
import { SolicitacoesService } from './solicitacoes.service';
import { SolicitacoesController } from './solicitacoes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Orgao, SolicitacaoAcesso])],
  controllers: [OrgaosController, SolicitacoesController],
  providers: [OrgaosService, SolicitacoesService],
  exports: [OrgaosService, SolicitacoesService, TypeOrmModule],
})
export class OrgaosModule {}
