import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappAgentSession } from './entities/whatsapp-agent-session.entity';
import { WhatsappAgentController } from './whatsapp-agent.controller';
import { WhatsappAgentService } from './whatsapp-agent.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { IaModule } from '../ia/ia.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappAgentSession]),
    forwardRef(() => WhatsAppModule),
    FornecedoresModule,
    IaModule,
    SystemConfigModule,
  ],
  controllers: [WhatsappAgentController],
  providers: [WhatsappAgentService],
})
export class WhatsappAgentModule {}
