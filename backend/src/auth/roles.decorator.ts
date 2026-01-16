import { SetMetadata } from '@nestjs/common';

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN', // Acesso total ao sistema (área /admin)
  ADMIN = 'ADMIN',
  PREGOEIRO = 'PREGOEIRO',
  EQUIPE_APOIO = 'EQUIPE_APOIO',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

