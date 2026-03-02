import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus, Req, Res, Query, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, UserType } from './auth.service';
import type { JwtPayload } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Public()
  @Post('login/admin')
  @HttpCode(HttpStatus.OK)
  async loginAdmin(@Body() body: { email: string; senha: string }) {
    return this.authService.loginAdmin(body.email, body.senha);
  }

  @Public()
  @Post('login/orgao')
  @HttpCode(HttpStatus.OK)
  async loginOrgao(@Body() body: { email: string; senha: string }) {
    return this.authService.loginOrgao(body.email, body.senha);
  }

  @Public()
  @Post('login/fornecedor')
  @HttpCode(HttpStatus.OK)
  async loginFornecedor(@Body() body: { cpf_cnpj: string; senha: string }) {
    return this.authService.loginFornecedor(body.cpf_cnpj, body.senha);
  }

  @Public()
  @Post('login/fornecedor/email')
  @HttpCode(HttpStatus.OK)
  async loginFornecedorPorEmail(@Body() body: { email: string; senha: string }) {
    return this.authService.loginFornecedorPorEmail(body.email, body.senha);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const googleUser = req.user as any;
    
    try {
      const result = await this.authService.processarGoogleLogin(googleUser);
      
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
      
      if (result.status === 'PENDENTE') {
        // Usuário novo - redireciona para seleção de órgão
        return res.redirect(`${frontendUrl}/auth/google/selecionar-orgao?token=${result.tempToken}`);
      } else if (result.status === 'ATIVO') {
        // Usuário existente - redireciona com JWT
        return res.redirect(`${frontendUrl}/auth/callback?token=${result.token}`);
      } else if (result.status === 'BLOQUEADO') {
        return res.redirect(`${frontendUrl}/auth/erro?motivo=bloqueado`);
      } else if (result.status === 'AGUARDANDO_APROVACAO') {
        return res.redirect(`${frontendUrl}/auth/google/aguardando?email=${encodeURIComponent(result.email)}`);
      }
    } catch (error: any) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/auth/erro?motivo=${encodeURIComponent(error.message)}`);
    }
  }

  @Public()
  @Post('google/completar-cadastro')
  @HttpCode(HttpStatus.OK)
  async completarCadastroGoogle(
    @Body() body: { tempToken: string; orgaoId: string; role?: string }
  ) {
    const { tempToken, orgaoId, role } = body;
    
    if (!tempToken || !orgaoId) {
      throw new BadRequestException('Token temporário e órgão são obrigatórios');
    }
    
    return this.authService.completarCadastroGoogle(tempToken, orgaoId, role);
  }

  @Public()
  @Post('google/verificar-status')
  @HttpCode(HttpStatus.OK)
  async verificarStatusUsuario(
    @Body() body: { email: string }
  ) {
    return this.authService.verificarStatusUsuario(body.email);
  }
}
