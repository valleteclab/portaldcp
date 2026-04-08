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
  complement?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsOptional()
  country?: string;

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

  @IsString()
  @IsOptional()
  phone?: string;

  @ValidateNested()
  @Type(() => EnderecoDto)
  address: EnderecoDto;
}

class RpsDto {
  @IsString()
  @IsOptional()
  series?: string;

  @IsNumber()
  @IsOptional()
  number?: number;
}

class TotalDto {
  @IsNumber()
  @IsPositive()
  invoiceAmount: number;

  // ISS
  @IsNumber()
  @Min(0)
  issRate: number;

  @IsNumber()
  @Min(0)
  issAmount: number;

  @IsBoolean()
  issWithheld: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  issBaseTax?: number;

  // Descontos / deduções
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountUnconditionedAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountConditionedAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deductionsAmount?: number;

  // IR
  @IsNumber()
  @Min(0)
  @IsOptional()
  irRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  irAmount?: number;

  @IsBoolean()
  @IsOptional()
  irWithheld?: boolean;

  // CSLL
  @IsNumber()
  @Min(0)
  @IsOptional()
  csllRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  csllAmount?: number;

  @IsBoolean()
  @IsOptional()
  csllWithheld?: boolean;

  // PIS
  @IsNumber()
  @Min(0)
  @IsOptional()
  pisRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  pisAmount?: number;

  @IsBoolean()
  @IsOptional()
  pisWithheld?: boolean;

  // COFINS
  @IsNumber()
  @Min(0)
  @IsOptional()
  cofinsRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cofinsAmount?: number;

  @IsBoolean()
  @IsOptional()
  cofinsWithheld?: boolean;

  // INSS
  @IsNumber()
  @Min(0)
  @IsOptional()
  inssRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  inssAmount?: number;

  @IsBoolean()
  @IsOptional()
  inssWithheld?: boolean;
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
  @IsOptional()
  nbsCode?: string;

  @IsString()
  @IsOptional()
  nationalTaxationCode?: string;

  @ValidateNested()
  @IsOptional()
  @Type(() => RpsDto)
  rps?: RpsDto;

  @IsIn([
    'taxationInMunicipality', 'taxationOutsideMunicipality', 'exemption', 'immune',
    'suspendedByCourt', 'suspendedByAdministrativeProcedure', 'exportation', 'nonIncidence',
  ])
  @IsOptional()
  taxationType?: string;

  @IsString()
  @IsOptional()
  effectiveDate?: string;

  @IsBoolean()
  @IsOptional()
  sendEmailToCustomer?: boolean;

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
