import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNfseSpedyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  integrationId: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  referenceCode?: string;

  /**
   * Payload exatamente no formato esperado pela Spedy para POST /v1/service-invoices.
   */
  @IsObject()
  payload: Record<string, any>;
}
