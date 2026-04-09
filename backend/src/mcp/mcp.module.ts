import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpController } from './mcp.controller';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { AnexoMedicao } from '../contratos/entities/anexo-medicao.entity';
import { AssinaturaDigital } from '../assinaturas/entities/assinatura-digital.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ContratosModule } from '../contratos/contratos.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
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
  ],
  controllers: [McpController],
})
export class McpModule {}
