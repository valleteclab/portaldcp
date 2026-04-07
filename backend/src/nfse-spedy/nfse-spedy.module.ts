import { Module } from '@nestjs/common';
import { NfseSpedyController } from './nfse-spedy.controller';
import { NfseSpedyService } from './nfse-spedy.service';

@Module({
  controllers: [NfseSpedyController],
  providers: [NfseSpedyService],
  exports: [NfseSpedyService],
})
export class NfseSpedyModule {}
