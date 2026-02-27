import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common/pipes';
import { SetoresService } from './setores.service';
import { CreateSetorDto } from './dto/create-setor.dto';
import { UpdateSetorDto } from './dto/update-setor.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('orgaos/:orgaoId/setores')
@UseGuards(JwtAuthGuard)
export class SetoresController {
  constructor(private readonly setoresService: SetoresService) {}

  private podeAcessarOrgao(user: JwtPayload, orgaoId: string): boolean {
    if (user.type === UserType.ADMIN) return true;
    const userOrgaoId = user.orgaoId || (user as any).orgao_id || (user.type === UserType.ORGAO ? user.sub : null);
    return userOrgaoId === orgaoId;
  }

  @Get()
  async listar(@Param('orgaoId') orgaoId: string, @Req() req: any) {
    const user = req.user as JwtPayload;
    if (!this.podeAcessarOrgao(user, orgaoId)) {
      throw new ForbiddenException('Sem permissão para acessar este órgão');
    }
    return this.setoresService.findByOrgao(orgaoId);
  }

  @Get(':id')
  async buscar(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @Req() req: any) {
    const user = req.user as JwtPayload;
    if (!this.podeAcessarOrgao(user, orgaoId)) {
      throw new ForbiddenException('Sem permissão para acessar este órgão');
    }
    const setor = await this.setoresService.findById(id);
    if (setor.orgao_id !== orgaoId) {
      throw new ForbiddenException('Setor não pertence a este órgão');
    }
    return setor;
  }

  @Post()
  async criar(
    @Param('orgaoId') orgaoId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateSetorDto,
    @Req() req: any,
  ) {
    const user = req.user as JwtPayload;
    if (!this.podeAcessarOrgao(user, orgaoId)) {
      throw new ForbiddenException('Sem permissão para acessar este órgão');
    }
    return this.setoresService.create(orgaoId, { ...dto, orgao_id: orgaoId });
  }

  @Put(':id')
  async atualizar(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: UpdateSetorDto,
    @Req() req: any,
  ) {
    const user = req.user as JwtPayload;
    if (!this.podeAcessarOrgao(user, orgaoId)) {
      throw new ForbiddenException('Sem permissão para acessar este órgão');
    }
    return this.setoresService.update(orgaoId, id, dto);
  }

  @Delete(':id')
  async excluir(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @Req() req: any) {
    const user = req.user as JwtPayload;
    if (!this.podeAcessarOrgao(user, orgaoId)) {
      throw new ForbiddenException('Sem permissão para acessar este órgão');
    }
    await this.setoresService.delete(orgaoId, id);
    return { message: 'Setor excluído com sucesso' };
  }
}
