import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from './entities/orgao.entity';
import { Setor } from './entities/setor.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
import { UnidadeOrgao } from './entities/unidade-orgao.entity';
import { SolicitacaoAcesso } from './entities/solicitacao-acesso.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { OrgaosService } from './orgaos.service';
import { OrgaosController } from './orgaos.controller';
import { SolicitacoesService } from './solicitacoes.service';
import { SolicitacoesController } from './solicitacoes.controller';
import { UnidadesService } from './unidades.service';
import { UnidadesController } from './unidades.controller';
import { SetoresService } from './setores.service';
import { SetoresController } from './setores.controller';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { ImapModule } from '../imap/imap.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Orgao, Setor, UnidadeOrgao, SolicitacaoAcesso, Usuario, Requisicao]),
    AuthModule,
    EmailModule,
    ImapModule,
    WhatsAppModule,
    UploadModule,
  ],
  controllers: [OrgaosController, SolicitacoesController, UnidadesController, SetoresController],
  providers: [OrgaosService, SolicitacoesService, UnidadesService, SetoresService],
  exports: [OrgaosService, SolicitacoesService, UnidadesService, SetoresService, TypeOrmModule],
})
export class OrgaosModule {}
