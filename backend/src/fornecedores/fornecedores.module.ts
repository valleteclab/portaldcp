import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Fornecedor } from './entities/fornecedor.entity';
import { FornecedorDocumento } from './entities/fornecedor-documento.entity';
import { FornecedorSocio } from './entities/fornecedor-socio.entity';
import { FornecedorAtividade } from './entities/fornecedor-atividade.entity';
import { FornecedoresService } from './fornecedores.service';
import { FornecedoresController } from './fornecedores.controller';
import { CnpjService } from './cnpj.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Fornecedor, 
      FornecedorDocumento,
      FornecedorSocio,
      FornecedorAtividade,
    ]),
    ConfigModule,
  ],
  controllers: [FornecedoresController],
  providers: [FornecedoresService, CnpjService],
  exports: [FornecedoresService, CnpjService, TypeOrmModule],
})
export class FornecedoresModule {}
