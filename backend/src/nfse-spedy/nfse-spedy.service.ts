import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { CreateNfseSpedyDto } from './dto/create-nfse-spedy.dto';

@Injectable()
export class NfseSpedyService {
  private readonly logger = new Logger(NfseSpedyService.name);
  private readonly baseUrl = process.env.SPEDY_API_URL || 'https://api.spedy.com.br';

  private getClient(): AxiosInstance {
    const apiKey = process.env.SPEDY_API_KEY;

    if (!apiKey) {
      throw new ServiceUnavailableException('SPEDY_API_KEY não configurada');
    }

    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
    });
  }

  async emitirNfse(fornecedorId: string, dto: CreateNfseSpedyDto) {
    const client = this.getClient();

    try {
      const payload = {
        ...dto.payload,
        integrationId: dto.integrationId,
      };

      const response = await client.post('/v1/service-invoices', payload);

      return {
        provider: 'SPEDY',
        referenceCode: dto.referenceCode || null,
        fornecedorId,
        integrationId: dto.integrationId,
        status: response.data?.status || 'created',
        providerResponse: response.data,
      };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Erro ao emitir NFS-e via Spedy';
      this.logger.error(`Falha na emissão NFS-e Spedy: ${message}`);
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
        providerResponse: response.data,
      };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Erro ao consultar status da NFS-e';
      this.logger.error(`Falha ao consultar status NFS-e Spedy [${id}]: ${message}`);
      throw new BadRequestException(message);
    }
  }
}
