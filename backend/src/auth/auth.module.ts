import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { OrgaoGuard } from './orgao.guard';
import { OwnershipGuard } from './ownership.guard';

@Module({
  controllers: [AuthController],
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET não configurado. Defina a variável de ambiente JWT_SECRET.');
        }
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '7d';
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
          },
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Orgao, Fornecedor]),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    OrgaoGuard,
    OwnershipGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    OrgaoGuard,
    OwnershipGuard,
    JwtModule,
  ],
})
export class AuthModule {}
