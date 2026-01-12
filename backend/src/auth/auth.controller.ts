import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { CurrentUserData } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login/usuario')
  @HttpCode(HttpStatus.OK)
  async loginUsuario(@Body() body: { email: string; senha: string }) {
    return this.authService.loginUsuario(body.email, body.senha);
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@CurrentUser() user: CurrentUserData) {
    return this.authService.refreshToken(user.id, user.tipo);
  }

  @Public()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateToken(@Body() body: { token: string }) {
    return this.authService.validateToken(body.token);
  }
}
