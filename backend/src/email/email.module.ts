import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { EmailService } from './email.service';

@Module({
  imports: [TypeOrmModule.forFeature([Orgao])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
