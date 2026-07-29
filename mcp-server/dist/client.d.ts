export declare function listContracts(): Promise<any[]>;
export declare function getContract(contractId: string): Promise<any>;
export declare function createMeasurement(contractId: string, dados: {
    periodo_inicio: string;
    periodo_fim: string;
    nota_fiscal_numero?: string;
    nota_fiscal_valor?: number;
    nota_fiscal_data?: string;
    observacoes?: string;
    valor_medido?: number;
    itens?: Array<{
        item_cronograma_id: string;
        quantidade_medida: number;
    }>;
    equipe?: MeasurementTeamInput;
    enviar_imediatamente?: boolean;
}): Promise<any>;
export interface MeasurementEmployeeInput {
    item_cronograma_id: string;
    nome: string;
    posto_numero?: number;
    inicio_prestacao_servicos?: string;
    lotacao?: string;
    situacao?: string;
    carga_horaria_semanal?: number;
    dias_trabalhados: number;
}
export interface MeasurementTeamInput {
    fechamento_fatura?: string;
    responsavel_legal?: string;
    data_emissao?: string;
    percentual_iss?: number;
    percentual_ir?: number;
    retencao_inss?: number;
    funcionarios: MeasurementEmployeeInput[];
}
export declare function getPreviousTeam(contractId: string): Promise<any>;
export declare function saveMeasurementTeam(measurementId: string, equipe: MeasurementTeamInput): Promise<any>;
export declare function submitMeasurement(measurementId: string): Promise<any>;
export declare function uploadDocument(measurementId: string, filePath: string, tipo: string, descricao?: string): Promise<any>;
export declare function getMeasurementStatus(measurementId: string): Promise<any>;
//# sourceMappingURL=client.d.ts.map