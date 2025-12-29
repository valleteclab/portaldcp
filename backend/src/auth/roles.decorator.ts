import { SetMetadata } from '@nestjs/common';

export enum Role {
  ADMIN = 'ADMIN',
  PREGOEIRO = 'PREGOEIRO',
  EQUIPE_APOIO = 'EQUIPE_APOIO',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

