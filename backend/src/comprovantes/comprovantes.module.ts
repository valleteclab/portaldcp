import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComprovanteFornecedor } from './comprovante.entity';
import { ComprovantesController } from './comprovantes.controller';
import { ComprovantesService } from './comprovantes.service';

/** Global: propostas e habilitação emitem comprovantes sem importar o módulo. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ComprovanteFornecedor])],
  controllers: [ComprovantesController],
  providers: [ComprovantesService],
  exports: [ComprovantesService],
})
export class ComprovantesModule {}
