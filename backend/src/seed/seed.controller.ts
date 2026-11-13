import { Controller, Post, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { SeedService } from './seed.service';

/** Contas de teste com senha fixa: só o admin da plataforma, e nunca em produção. */
@Controller('seed')
@UseGuards(AdminGuard)
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('usuarios')
  async seedUsuarios() {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.seedService.seedUsuariosTeste();
  }

  @Get('status')
  async status() {
    return this.seedService.getStatus();
  }
}
