import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImapService } from './imap.service';
import { Orgao } from '../orgaos/entities/orgao.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Orgao])],
  providers: [ImapService],
  exports: [ImapService],
})
export class ImapModule {}
