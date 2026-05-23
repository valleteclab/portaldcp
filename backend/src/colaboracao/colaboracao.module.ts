import { Module } from '@nestjs/common';
import { ColaboracaoGateway } from './colaboracao.gateway';

@Module({
  providers: [ColaboracaoGateway],
  exports: [ColaboracaoGateway],
})
export class ColaboracaoModule {}
