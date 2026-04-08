import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { CreateNfseSpedyDto } from './dto/create-nfse-spedy.dto';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

@Injectable()
export class NfseSpedyService {
  private readonly logger = new Logger(NfseSpedyService.name);
  private readonly baseUrl = process.env.SPEDY_API_URL || 'https://api.spedy.com.br';

  constructor(
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
  ) {}

  private getClient(apiKey?: string): AxiosInstance {
    const key = apiKey || process.env.SPEDY_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException('Chave Spedy não configurada. Configure SPEDY_API_KEY ou vincule a empresa no cadastro do fornecedor.');
    }
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
      },
    });
  }

  private mapTaxRegime(fornecedor: Fornecedor): string {
    if (fornecedor.optante_mei) return 'simplesNacionalMEI';
    if (fornecedor.optante_simples) return 'simplesNacional';
    return 'regimeNormal';
  }

  async emitirNfse(fornecedorId: string, dto: CreateNfseSpedyDto) {
    const fornecedor = await this.fornecedorRepo.findOne({ where: { id: fornecedorId } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');

    const client = this.getClient(fornecedor.spedy_api_key);

    const payload: Record<string, any> = {
      integrationId: dto.integrationId,
      environmentType: dto.ambiente,
      federalServiceCode: dto.federalServiceCode,
      cityServiceCode: dto.cityServiceCode,
      description: dto.description,
      total: dto.total,
      receiver: {
        name: dto.receiver.name,
        federalTaxNumber: dto.receiver.federalTaxNumber,
        email: dto.receiver.email,
        ...(dto.receiver.phone ? { phoneNumber: dto.receiver.phone } : {}),
        address: {
          street: dto.receiver.address.street,
          ...(dto.receiver.address.number ? { number: dto.receiver.address.number } : {}),
          ...(dto.receiver.address.complement ? { additionalInformation: dto.receiver.address.complement } : {}),
          ...(dto.receiver.address.district ? { district: dto.receiver.address.district } : {}),
          postalCode: dto.receiver.address.postalCode,
          ...(dto.receiver.address.country ? { country: dto.receiver.address.country } : {}),
          city: dto.receiver.address.city,
        },
      },
    };

    if (dto.referenceCode) payload.referenceCode = dto.referenceCode;
    if (dto.nbsCode) payload.nbsCode = dto.nbsCode;
    if (dto.nationalTaxationCode) payload.nationalTaxationCode = dto.nationalTaxationCode;
    if (dto.rps) payload.rps = dto.rps;
    payload.taxationType = dto.taxationType ?? 'taxationInMunicipality';
    payload.sendEmailToCustomer = dto.sendEmailToCustomer ?? false;
    if (dto.effectiveDate) payload.effectiveDate = dto.effectiveDate;

    try {
      const response = await client.post('/v1/service-invoices', payload);
      this.logger.log(`NFS-e emitida — fornecedor=${fornecedorId} cnpj=${fornecedor.cpf_cnpj} integrationId=${dto.integrationId} id=${response.data?.id}`);
      return {
        provider: 'SPEDY',
        fornecedorId,
        cnpj: fornecedor.cpf_cnpj,
        integrationId: dto.integrationId,
        referenceCode: dto.referenceCode ?? null,
        status: response.data?.status ?? 'enqueued',
        providerResponse: response.data,
      };
    } catch (error: any) {
      const detail = error?.response?.data;
      const message = detail?.message || error?.message || 'Erro ao emitir NFS-e via Spedy';
      this.logger.error(`Falha na emissão NFS-e Spedy [${dto.integrationId}]: ${message}`, detail);
      throw new BadRequestException(message);
    }
  }

  async consultarStatus(id: string) {
    const client = this.getClient();
    try {
      const response = await client.get(`/v1/service-invoices/${id}`);
      return {
        provider: 'SPEDY',
        id,
        status: response.data?.status,
        providerResponse: response.data,
      };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Erro ao consultar status da NFS-e';
      this.logger.error(`Falha ao consultar NFS-e Spedy [${id}]: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async vincularEmpresaSpedy(fornecedorId: string, spedyCompanyId: string, spedyApiKey: string) {
    const fornecedor = await this.fornecedorRepo.findOne({ where: { id: fornecedorId } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');

    fornecedor.spedy_company_id = spedyCompanyId;
    fornecedor.spedy_api_key = spedyApiKey;
    await this.fornecedorRepo.save(fornecedor);

    return { ok: true, fornecedorId, spedyCompanyId };
  }

  async verificarCidade(ibgeCode: string) {
    const client = this.getClient();
    try {
      const response = await client.get(`/v1/service-invoices/cities?code=${ibgeCode}&pageSize=1`);
      return response.data?.items?.[0] ?? null;
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Erro ao consultar município';
      this.logger.warn(`Falha ao consultar cidade Spedy [${ibgeCode}]: ${message}`);
      return null;
    }
  }

  async dadosFornecedorParaSpedy(fornecedorId: string) {
    const f = await this.fornecedorRepo.findOne({ where: { id: fornecedorId } });
    if (!f) throw new NotFoundException('Fornecedor não encontrado');

    return {
      spedyVinculado: !!f.spedy_api_key,
      spedyCompanyId: f.spedy_company_id ?? null,
      taxRegime: this.mapTaxRegime(f),
      cnpj: f.cpf_cnpj,
      razaoSocial: f.razao_social,
      nomeFantasia: f.nome_fantasia,
      email: f.email,
      cidade: f.cidade,
      uf: f.uf,
      cep: f.cep,
    };
  }
}
