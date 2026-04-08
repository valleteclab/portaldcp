import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { CreateNfseSpedyDto } from './dto/create-nfse-spedy.dto';
import { NfseSpedyService } from './nfse-spedy.service';
import { IsString } from 'class-validator';

class VincularSpedyDto {
  @IsString()
  spedyCompanyId: string;

  @IsString()
  spedyApiKey: string;
}

@Controller('nfse/spedy')
export class NfseSpedyController {
  constructor(private readonly nfseSpedyService: NfseSpedyService) {}

  private getFornecedorId(user: JwtPayload): string {
    if (user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem usar este recurso');
    }
    return user.sub;
  }

  @Get('meus-dados')
  async meusDados(@Req() request: { user: JwtPayload }) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.nfseSpedyService.dadosFornecedorParaSpedy(fornecedorId);
  }

  @Post('vincular')
  async vincular(
    @Req() request: { user: JwtPayload },
    @Body() body: VincularSpedyDto,
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.nfseSpedyService.vincularEmpresaSpedy(fornecedorId, body.spedyCompanyId, body.spedyApiKey);
  }

  @Post('emitir')
  async emitir(
    @Req() request: { user: JwtPayload },
    @Body() dto: CreateNfseSpedyDto,
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.nfseSpedyService.emitirNfse(fornecedorId, dto);
  }

  @Get('cidade/:ibge')
  async cidade(
    @Req() request: { user: JwtPayload },
    @Param('ibge') ibge: string,
  ) {
    this.getFornecedorId(request.user);
    return this.nfseSpedyService.verificarCidade(ibge);
  }

  @Get(':id/status')
  async status(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
  ) {
    this.getFornecedorId(request.user);
    return this.nfseSpedyService.consultarStatus(id);
  }

  @Public()
  @Post('webhook')
  async webhook(@Body() body: any) {
    return {
      ok: true,
      provider: 'SPEDY',
      receivedAt: new Date().toISOString(),
      event: body?.event || null,
      data: body?.data || body || null,
    };
  }
}
