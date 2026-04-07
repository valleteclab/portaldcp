import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NfseSpedyController } from './nfse-spedy.controller';
import { NfseSpedyService } from './nfse-spedy.service';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Fornecedor])],
  controllers: [NfseSpedyController],
  providers: [NfseSpedyService],
  exports: [NfseSpedyService],
})
export class NfseSpedyModule {}
