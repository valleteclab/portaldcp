import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
