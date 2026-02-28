import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadNotaFiscalDto {
  @IsUUID()
  @IsOptional()
  ordem_fornecimento_id?: string;
}

export class ConfirmarMapeamentoDto {
  @IsUUID()
  nota_fiscal_fornecedor_id: string;

  mapeamento: {
    produto_nf_index: number;
    xProd_nf: string;
    item_contrato_id: string;
    descricao_of: string;
  }[];
}
