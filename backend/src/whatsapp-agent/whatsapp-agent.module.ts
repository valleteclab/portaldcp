import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappAgentSession } from './entities/whatsapp-agent-session.entity';
import { WhatsappAgentController } from './whatsapp-agent.controller';
import { WhatsappAgentService } from './whatsapp-agent.service';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { IaModule } from '../ia/ia.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { Orgao } from '../orgaos/entities/orgao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappAgentSession, Orgao]),
    FornecedoresModule,
    IaModule,
    SystemConfigModule,
  ],
  controllers: [WhatsappAgentController],
  providers: [WhatsappAgentService],
  exports: [WhatsappAgentService],
})
export class WhatsappAgentModule {}
