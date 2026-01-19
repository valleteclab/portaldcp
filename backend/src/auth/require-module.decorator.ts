import { SetMetadata } from '@nestjs/common';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';

export const REQUIRED_MODULE_KEY = 'required_module';

export const RequireModule = (...modulos: ModuloSistema[]) =>
  SetMetadata(REQUIRED_MODULE_KEY, modulos);

