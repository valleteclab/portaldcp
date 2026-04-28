import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ExtController } from './ext.controller';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { AnexoMedicao } from '../contratos/entities/anexo-medicao.entity';
import { AssinaturaDigital } from '../assinaturas/entities/assinatura-digital.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ContratosModule } from '../contratos/contratos.module';
import { UploadModule } from '../upload/upload.module';
import { AlmoxarifadoModule } from '../almoxarifado/almoxarifado.module';
import { FornecedorApiService } from './fornecedor-api.service';

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    TypeOrmModule.forFeature([
      Contrato,
      Medicao,
      ItemCronograma,
      EtapaCronograma,
      AnexoMedicao,
      AssinaturaDigital,
      Fornecedor,
    ]),
    ContratosModule,
    UploadModule,
    AlmoxarifadoModule,
  ],
  controllers: [ExtController],
  providers: [FornecedorApiService],
  exports: [FornecedorApiService],
})
export class ExtModule {}
