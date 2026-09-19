import axios from 'axios';
import { FatorTransparenciaService } from './fator-transparencia.service';

jest.mock('axios');

describe('Consulta contábil obrigatoriamente completa', () => {
  const params = {
    nContrato: '1/2026',
    ano: 2026,
    cpfcnpj: '12345',
    exigirConsultaCompleta: true,
  };
  const service = new FatorTransparenciaService({
    getValue: async () => '1',
  } as any);
  afterEach(() => jest.resetAllMocks());

  it('falha explicitamente quando a integração não está configurada', async () => {
    const semConfiguracao = new FatorTransparenciaService({
      getValue: async () => null,
    } as any);
    await expect(semConfiguracao.buscarEmpenhos(params)).rejects.toThrow(
      'não configurada',
    );
  });
  it('não confunde erro de rede com ausência de pagamentos', async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error('timeout'));
    await expect(service.buscarEmpenhos(params)).rejects.toThrow(
      'indisponível',
    );
  });
  it('não aceita HTML de erro ou login como uma consulta vazia', async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValue({ data: '<html>Serviço indisponível</html>' });
    await expect(service.buscarEmpenhos(params)).rejects.toThrow(
      'indisponível',
    );
  });
  it('aceita a tabela de despesas vazia como consulta sem registros', async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValue({ data: "<table id='grid'><tbody></tbody></table>" });
    await expect(service.buscarEmpenhos(params)).resolves.toEqual([]);
  });
  it('rejeita mudança de formato quando há documentos não interpretados', async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValue({
        data: "<table id='grid'><tr><td>dialog_1</td></tr></table>",
      });
    await expect(service.buscarEmpenhos(params)).rejects.toThrow(
      'indisponível',
    );
  });
});
