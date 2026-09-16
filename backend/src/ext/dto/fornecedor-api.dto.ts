import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 'periodo_inicio e periodo_fim sao obrigatorios' })
  message: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 400 })
  statusCode: number;
}

export class FornecedorMeResponseDto {
  @ApiProperty({ example: '44f0c194-5233-4b44-aa63-a091a057fb9b' })
  id: string;

  @ApiProperty({ example: 'EFFECT PRODUTORA LTDA' })
  razao_social: string;

  @ApiProperty({ example: '10723280000110' })
  cpf_cnpj: string;

  @ApiPropertyOptional({ example: 'financeiro@fornecedor.com.br' })
  email?: string;

  @ApiPropertyOptional({ example: '77999999999' })
  telefone?: string;
}

export class ContratoResumoResponseDto {
  @ApiProperty({ example: 'a662ca03-1476-4abf-9939-cbcad6298927' })
  id: string;

  @ApiProperty({ example: '049/2023 2 AD' })
  numero_contrato: string;

  @ApiProperty({ example: 'Prestacao de servicos especializados' })
  objeto: string;

  @ApiPropertyOptional({ example: 'CONTINUADO' })
  tipo?: string;

  @ApiPropertyOptional({ example: 'MEDICAO' })
  modalidade_execucao?: string;

  @ApiProperty({ example: 36789.73 })
  valor_global: number;

  @ApiPropertyOptional({ example: '2026-01-01' })
  data_vigencia_inicio?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  data_vigencia_fim?: string;

  @ApiProperty({ example: 'VIGENTE' })
  status: string;

  @ApiPropertyOptional({ example: '001/2026' })
  numero_processo?: string;
}

export class ItemCronogramaResponseDto {
  @ApiProperty({ example: '742b9fb0-4372-4740-8d53-1fc05e3e61bd' })
  id: string;

  @ApiProperty({ example: 1 })
  numero_item: number;

  @ApiProperty({ example: 'Servico mensal' })
  descricao: string;

  @ApiProperty({ example: 'MES' })
  unidade_medida: string;

  @ApiProperty({ example: 12 })
  quantidade: number;

  @ApiProperty({ example: 4 })
  quantidade_medida: number;

  @ApiProperty({ example: 8 })
  saldo_quantidade: number;

  @ApiProperty({ example: 1000 })
  valor_unitario: number;

  @ApiProperty({ example: 12000 })
  valor_total: number;

  @ApiPropertyOptional({ example: 1 })
  lote_numero?: number;

  @ApiPropertyOptional({ example: 'Serviços com dedicação de mão de obra' })
  lote_descricao?: string;
}

export class ContratoDetalheResponseDto extends ContratoResumoResponseDto {
  @ApiProperty({ example: 0 })
  valor_executado_anterior: number;

  @ApiProperty({ example: 15000 })
  saldo_disponivel: number;

  @ApiProperty({ type: [ItemCronogramaResponseDto] })
  itens_cronograma: ItemCronogramaResponseDto[];

  @ApiProperty({
    description:
      'Regras que o agente deve aplicar ao montar a medição, incluindo separação por lote e exigência de funcionários.',
  })
  regras_medicao: Record<string, any>;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  etapas: any[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  ultimas_medicoes: any[];
}

export class ItemMedicaoRequestDto {
  @ApiProperty({ example: '742b9fb0-4372-4740-8d53-1fc05e3e61bd' })
  item_cronograma_id: string;

  @ApiProperty({ example: 1 })
  quantidade_medida: number;
}

export class DiscriminacaoRequestDto {
  @ApiProperty({ example: 'ISS' })
  descricao: string;

  @ApiPropertyOptional({ example: 2 })
  percentual?: number;

  @ApiPropertyOptional({ example: 735.79 })
  valor?: number;
}

export class FuncionarioEquipeRequestDto {
  @ApiProperty({ description: 'UUID do item/cargo sujeito à relação' })
  item_cronograma_id: string;

  @ApiProperty({ example: 'AGNALDO PEREIRA DOS SANTOS' })
  nome: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Número da vaga. Se omitido, o Portal DCP distribui automaticamente.',
  })
  posto_numero?: number;

  @ApiPropertyOptional({ example: '2025-09-20' })
  inicio_prestacao_servicos?: string;

  @ApiPropertyOptional({ example: 'RÁDIO E TV CÂMARA' })
  lotacao?: string;

  @ApiPropertyOptional({ example: 'ATIVO' })
  situacao?: string;

  @ApiPropertyOptional({ example: 30 })
  carga_horaria_semanal?: number;

  @ApiProperty({ example: 30, description: 'De 0,01 a 30 dias' })
  dias_trabalhados: number;
}

export class EquipeMedicaoRequestDto {
  @ApiPropertyOptional({
    example: 'CÂMARA MUNICIPAL DE LUÍS EDUARDO MAGALHÃES-BA',
  })
  fechamento_fatura?: string;

  @ApiPropertyOptional({ example: 'AUGUSTO LOPES DA ROCHA ISENSEE' })
  responsavel_legal?: string;

  @ApiPropertyOptional({ example: '2026-07-29' })
  data_emissao?: string;

  @ApiPropertyOptional({ example: 2.5 })
  percentual_iss?: number;

  @ApiPropertyOptional({ example: 4.8 })
  percentual_ir?: number;

  @ApiPropertyOptional({ example: 1430.19 })
  retencao_inss?: number;

  @ApiProperty({ type: [FuncionarioEquipeRequestDto] })
  funcionarios: FuncionarioEquipeRequestDto[];
}

export class CriarMedicaoRequestDto {
  @ApiProperty({ example: '2026-04-01', description: 'Formato YYYY-MM-DD' })
  periodo_inicio: string;

  @ApiProperty({ example: '2026-04-30', description: 'Formato YYYY-MM-DD' })
  periodo_fim: string;

  @ApiPropertyOptional({ example: '12345' })
  nota_fiscal_numero?: string;

  @ApiPropertyOptional({ example: 36789.73 })
  nota_fiscal_valor?: number;

  @ApiPropertyOptional({ example: '2026-04-28', description: 'Formato YYYY-MM-DD' })
  nota_fiscal_data?: string;

  @ApiPropertyOptional({ example: 'Servico executado conforme contrato.' })
  observacoes?: string;

  @ApiPropertyOptional({ example: 36789.73 })
  valor_medido?: number;

  @ApiPropertyOptional({ type: [ItemMedicaoRequestDto] })
  itens?: ItemMedicaoRequestDto[];

  @ApiPropertyOptional({
    type: [DiscriminacaoRequestDto],
    description: 'Composicao financeira da despesa (ISS, despesas operacionais, servicos, etc.). Se percentuais forem informados, os valores sao calculados automaticamente a partir do valor_medido ou nota_fiscal_valor.',
  })
  discriminacoes?: DiscriminacaoRequestDto[];

  @ApiPropertyOptional({
    type: EquipeMedicaoRequestDto,
    description:
      'Relação mensal de funcionários. Obrigatória somente quando o contrato estiver configurado para esse controle e houver execução no lote indicado.',
  })
  equipe?: EquipeMedicaoRequestDto;

  @ApiPropertyOptional({ example: false })
  enviar_imediatamente?: boolean;
}

export class MedicaoResponseDto {
  @ApiProperty({ example: '974135df-7f40-4c9b-8926-07a546c26c12' })
  id: string;

  @ApiProperty({ example: 4 })
  numero_medicao: number;

  @ApiProperty({ example: 'RASCUNHO' })
  status: string;

  @ApiProperty({ example: 36789.73 })
  valor_medido: number;

  @ApiPropertyOptional({ example: '2026-04-01' })
  periodo_inicio?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  periodo_fim?: string;
}

export class UploadMedicaoDocumentoDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;

  @ApiProperty({ enum: ['NOTA_FISCAL', 'DOCUMENTO', 'FOTO'], example: 'NOTA_FISCAL' })
  tipo: 'NOTA_FISCAL' | 'DOCUMENTO' | 'FOTO';

  @ApiPropertyOptional({ example: 'Nota fiscal de abril' })
  descricao?: string;
}

export class CienciaRecebimentoRequestDto {
  @ApiPropertyOptional({ example: 'Ordem recebida pelo fornecedor.' })
  observacao?: string;
}

export class CienciaEntregaRequestDto {
  @ApiProperty({ example: '2026-04-28' })
  data_entrega: string;

  @ApiPropertyOptional({ example: 'Entrega realizada no almoxarifado central.' })
  observacao?: string;
}

export class OrdemResponseDto {
  @ApiProperty({ example: '9b42a246-22b4-4c1d-9cfd-7f1462ed778e' })
  id: string;

  @ApiProperty({ example: 'OF-0001/2026' })
  numero: string;

  @ApiProperty({ example: 'ENVIADA' })
  status: string;

  @ApiProperty({ example: 'FORNECIMENTO' })
  tipo: string;

  @ApiProperty({ example: 1500 })
  valor_total: number;
}

export class UploadNotaFiscalOrdemDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Envie ao menos um XML e um PDF no campo arquivos.',
  })
  arquivos: any[];
}
