import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CidadeDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  state?: string;
}

class EnderecoDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ValidateNested()
  @Type(() => CidadeDto)
  city: CidadeDto;
}

class TomadorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  federalTaxNumber: string;

  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => EnderecoDto)
  address: EnderecoDto;
}

class TotalDto {
  @IsNumber()
  @IsPositive()
  invoiceAmount: number;

  @IsNumber()
  @Min(0)
  issRate: number;

  @IsNumber()
  @Min(0)
  issAmount: number;

  @IsBoolean()
  issWithheld: boolean;
}

export class CreateNfseSpedyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  integrationId: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  referenceCode?: string;

  @IsIn(['development', 'production'])
  ambiente: 'development' | 'production';

  @IsString()
  @IsNotEmpty()
  federalServiceCode: string;

  @IsString()
  @IsNotEmpty()
  cityServiceCode: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @ValidateNested()
  @Type(() => TotalDto)
  total: TotalDto;

  @ValidateNested()
  @Type(() => TomadorDto)
  receiver: TomadorDto;
}
