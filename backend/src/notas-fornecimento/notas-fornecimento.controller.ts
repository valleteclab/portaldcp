/**
 * Notas de fornecimento na tela das Medições (módulo Contratos). Só usuários
 * do órgão; cada rota confere o órgão dono da nota e o destino configurado.
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequireModule } from '../auth/require-module.decorator';
import { SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Ator, NotasFornecimentoService, SignatarioPedido } from './notas-fornecimento.service';

@Controller('notas-fornecimento')
@RequireModule(ModuloSistema.CONTRATOS)
@SomenteOrgao()
export class NotasFornecimentoController {
  constructor(
    private readonly service: NotasFornecimentoService,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  private orgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) return user.sub;
    const id = user.orgaoId || (user as any).orgao_id;
    if (id) return id;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  private async ator(user: JwtPayload): Promise<Ator> {
    if (user.type === UserType.USUARIO) {
      const u = await this.usuarioRepo.findOne({ where: { id: user.sub } });
      return { usuarioId: user.sub, nome: u?.nome || user.email || 'Usuário', contaPrincipal: false };
    }
    return { usuarioId: null, nome: user.email || 'Órgão', contaPrincipal: true };
  }

  @Get()
  listar(@Req() req: { user: JwtPayload }) {
    return this.service.listar(this.orgaoId(req.user));
  }

  @Get('usuarios')
  usuarios(@Req() req: { user: JwtPayload }) {
    return this.service.usuariosParaAssinar(this.orgaoId(req.user));
  }

  @Get(':id')
  detalhe(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.service.detalhe(id, this.orgaoId(req.user));
  }

  /** tipo: pdf | xml | termo | comprovante. `?baixar=1` força o download. */
  @Get(':id/arquivo/:tipo')
  async arquivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tipo') tipo: string,
    @Req() req: { user: JwtPayload; query: Record<string, string> },
    @Res() res: Response,
  ) {
    const a = await this.service.arquivo(id, this.orgaoId(req.user), tipo);
    res.set({
      'Content-Type': a.mime,
      'Content-Disposition': `${req.query?.baixar ? 'attachment' : 'inline'}; filename="${a.nome}"`,
      'Cache-Control': 'private, no-store',
    });
    createReadStream(a.caminho).pipe(res);
  }

  @Get(':id/pacote')
  async pacote(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }, @Res() res: Response) {
    const { buffer, nome } = await this.service.pacote(id, this.orgaoId(req.user));
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${nome}"`, 'Content-Length': String(buffer.length) });
    res.send(buffer);
  }

  @Post(':id/devolver')
  async devolver(@Param('id', ParseUUIDPipe) id: string, @Body() body: { motivo: string }, @Req() req: { user: JwtPayload }) {
    return this.service.devolver(id, this.orgaoId(req.user), body?.motivo, await this.ator(req.user));
  }

  @Post(':id/assinaturas')
  async colherAssinaturas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { signatarios: SignatarioPedido[] },
    @Req() req: { user: JwtPayload },
  ) {
    return this.service.colherAssinaturas(id, this.orgaoId(req.user), body?.signatarios, await this.ator(req.user));
  }

  @Delete(':id/assinaturas')
  async cancelarAssinaturas(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.service.cancelarAssinaturas(id, this.orgaoId(req.user), await this.ator(req.user));
  }

  @Patch(':id/enviado-contabilidade')
  async enviadoContabilidade(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.service.marcarEnviadoContabilidade(id, this.orgaoId(req.user), await this.ator(req.user));
  }
}
