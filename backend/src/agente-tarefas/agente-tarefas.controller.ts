import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgenteTarefasService, ChatResult } from './agente-tarefas.service';
import { ChatMensagemDto } from './dto/chat-message.dto';
import { JwtPayload } from '../auth/auth.service';

@ApiTags('Assistente IA - Tarefas')
@Controller('agente-tarefas')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgenteTarefasController {
  private readonly logger = new Logger(AgenteTarefasController.name);

  constructor(private readonly agenteTarefasService: AgenteTarefasService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Conversar com o Assistente IA',
    description:
      'Envia uma mensagem ao assistente que pode executar ações no sistema conforme as permissões do usuário logado.',
  })
  async chat(
    @Req() req: { user: JwtPayload },
    @Body(ValidationPipe) body: ChatMensagemDto,
  ): Promise<ChatResult> {
    this.logger.log(`Chat request de usuário: ${req.user.sub}`);
    return this.agenteTarefasService.processarMensagem(
      req.user,
      body.mensagem,
      body.historico || [],
    );
  }
}
