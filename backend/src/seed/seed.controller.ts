import { Controller, Post, Get } from '@nestjs/common';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('usuarios')
  async seedUsuarios() {
    return this.seedService.seedUsuariosTeste();
  }

  @Get('status')
  async status() {
    return this.seedService.getStatus();
  }
}
