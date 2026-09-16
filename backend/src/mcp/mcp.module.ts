import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpController } from './mcp.controller';
import { McpOrgaoController } from './mcp-orgao.controller';
import { McpKeysController } from './mcp-keys.controller';
import { OrgaoApiKeyService } from './orgao-api-key.service';
import { OrgaoApiKey } from './entities/orgao-api-key.entity';
import { TermoAditivo } from '../contratos/entities/termo-aditivo.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { AnexoMedicao } from '../contratos/entities/anexo-medicao.entity';
import { AssinaturaDigital } from '../assinaturas/entities/assinatura-digital.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ContratosModule } from '../contratos/contratos.module';
import { UploadModule } from '../upload/upload.module';
import { ExtModule } from '../ext/ext.module';

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
      OrgaoApiKey,
      TermoAditivo,
      Usuario,
    ]),
    ContratosModule,
    UploadModule,
    ExtModule,
  ],
  controllers: [McpController, McpOrgaoController, McpKeysController],
  providers: [OrgaoApiKeyService],
})
export class McpModule {}
