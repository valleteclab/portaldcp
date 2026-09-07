import { Controller, Get, Post, Delete, Param, Body, Req, ForbiddenException, ParseUUIDPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { OrgaoApiKeyService } from './orgao-api-key.service';

/**
 * Gestão das chaves de integração do órgão (MCP somente leitura).
 * Rotas autenticadas com o JWT do órgão/usuário do órgão (guard global).
 */
@Controller('orgaos/:orgaoId/mcp-keys')
export class McpKeysController {
  constructor(
    private readonly chaves: OrgaoApiKeyService,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  private exigirOrgao(user: JwtPayload, orgaoId: string) {
    const doToken = user.type === UserType.ORGAO ? user.sub : (user.orgaoId || (user as any).orgao_id);
    if (!doToken || doToken !== orgaoId) throw new ForbiddenException('Sem acesso a este órgão');
  }

  @Get()
  async listar(@Param('orgaoId', ParseUUIDPipe) orgaoId: string, @Req() req: { user: JwtPayload }) {
    this.exigirOrgao(req.user, orgaoId);
    return this.chaves.listar(orgaoId);
  }

  @Post()
  async gerar(
    @Param('orgaoId', ParseUUIDPipe) orgaoId: string,
    @Body() body: { nome?: string },
    @Req() req: { user: JwtPayload },
  ) {
    this.exigirOrgao(req.user, orgaoId);
    let criadoPor: string | null = null;
    if (req.user.type === UserType.USUARIO) {
      const u = await this.usuarioRepo.findOne({ where: { id: req.user.sub }, select: ['id', 'nome', 'email'] });
      criadoPor = u?.nome || u?.email || null;
    } else if (req.user.type === UserType.ORGAO) {
      criadoPor = 'Conta do órgão';
    }
    return this.chaves.gerar(orgaoId, body?.nome || '', criadoPor);
  }

  @Delete(':id')
  async revogar(
    @Param('orgaoId', ParseUUIDPipe) orgaoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
  ) {
    this.exigirOrgao(req.user, orgaoId);
    return this.chaves.revogar(id, orgaoId);
  }
}
