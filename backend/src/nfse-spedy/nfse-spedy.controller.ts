import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { CreateNfseSpedyDto } from './dto/create-nfse-spedy.dto';
import { NfseSpedyService } from './nfse-spedy.service';

@Controller('nfse/spedy')
export class NfseSpedyController {
  constructor(private readonly nfseSpedyService: NfseSpedyService) {}

  private getFornecedorId(user: JwtPayload): string {
    if (user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem emitir NFS-e');
    }

    return user.sub;
  }

  @Post('emitir')
  async emitir(
    @Req() request: { user: JwtPayload },
    @Body() dto: CreateNfseSpedyDto,
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.nfseSpedyService.emitirNfse(fornecedorId, dto);
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
