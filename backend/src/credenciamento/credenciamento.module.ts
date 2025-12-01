import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CredenciamentoController } from './credenciamento.controller';
import { CredenciamentoService } from './credenciamento.service';
import { Credenciamento, Credenciado } from './entities/credenciamento.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Credenciamento, Credenciado])
  ],
  controllers: [CredenciamentoController],
  providers: [CredenciamentoService],
  exports: [CredenciamentoService]
})
export class CredenciamentoModule {}
