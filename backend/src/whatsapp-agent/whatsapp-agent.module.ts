import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappAgentSession } from './entities/whatsapp-agent-session.entity';
import { WhatsappAgentController } from './whatsapp-agent.controller';
import { WhatsappAgentService } from './whatsapp-agent.service';
import { WhatsappMedicaoBotService } from './whatsapp-medicao-bot.service';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { IaModule } from '../ia/ia.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappAgentSession,
      Orgao,
      Fornecedor,
      Contrato,
      Medicao,
    ]),
    FornecedoresModule,
    IaModule,
    SystemConfigModule,
  ],
  controllers: [WhatsappAgentController],
  providers: [WhatsappAgentService, WhatsappMedicaoBotService],
  exports: [WhatsappAgentService, WhatsappMedicaoBotService],
})
export class WhatsappAgentModule {}
