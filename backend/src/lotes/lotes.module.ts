/**
 * ============================================================================
 * MÓDULO: LOTES DE LICITAÇÃO
 * ============================================================================
 * 
 * Módulo responsável pelo gerenciamento de lotes em licitações.
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * 
 * Art. 40, §3º - "O parcelamento será adotado quando técnica e economicamente 
 * viável, e deverá ser justificado quando não for adotado."
 * 
 * Art. 12, VII - Vinculação obrigatória ao PCA ou justificativa
 * 
 * ============================================================================
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotesController } from './lotes.controller';
import { LotesService } from './lotes.service';
import { LoteLicitacao } from './entities/lote-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { ItemPCA } from '../pca/entities/pca.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoteLicitacao,
      Licitacao,
      ItemLicitacao,
      ItemPCA,
    ]),
  ],
  controllers: [LotesController],
  providers: [LotesService],
  exports: [LotesService],
})
export class LotesModule {}
