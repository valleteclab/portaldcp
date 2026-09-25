import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DocumentosService } from './documentos.service';

/**
 * O caminho do arquivo vem do cliente no "vincular" e fica gravado no banco;
 * download (inclusive o público) e exclusão usam esse caminho. Nada fora das
 * pastas de upload pode ser lido, vinculado ou apagado.
 */
describe('DocumentosService — caminhos de arquivo', () => {
  const cwdOriginal = process.cwd();
  let raiz: string;
  let service: DocumentosService;
  const docRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn(async (d) => ({ id: 'novo', ...d })),
    remove: jest.fn(),
    delete: jest.fn(),
  };
  const licRepo = { findOne: jest.fn(async () => ({ id: 'lic' })) };

  beforeAll(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-'));
    fs.mkdirSync(path.join(raiz, 'uploads', 'documentos'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'uploads', 'documentos', 'edital.pdf'), '%PDF-1.4');
    fs.writeFileSync(path.join(raiz, 'segredo.env'), 'JWT_SECRET=nao-pode-sair');
    process.chdir(raiz);
    delete process.env.UPLOAD_DIR;
    delete process.env.UPLOAD_PATH;
    service = new DocumentosService(docRepo as any, licRepo as any);
  });

  afterAll(() => {
    process.chdir(cwdOriginal);
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  beforeEach(() => jest.clearAllMocks());

  const vincular = (caminho: string) =>
    service.vincularDocumentoExistente('lic', { tipo: 'EDITAL' as any, titulo: 't', nome_original: 'n.pdf', caminho });

  it('vincula arquivo enviado pelo upload do sistema', async () => {
    const doc = await vincular('/uploads/documentos/edital.pdf');
    expect(doc.caminho_arquivo).toBe(path.join(raiz, 'uploads', 'documentos', 'edital.pdf'));
  });

  it.each([
    '/../segredo.env',
    '/uploads/../segredo.env',
    '/api/uploads/../segredo.env',
    '../segredo.env',
    '<absoluto>',
  ])('recusa vincular caminho fora das pastas de upload: %s', async (caminho) => {
    await expect(vincular(caminho === '<absoluto>' ? path.join(raiz, 'segredo.env') : caminho)).rejects.toBeInstanceOf(BadRequestException);
    expect(docRepo.save).not.toHaveBeenCalled();
  });

  it('não entrega arquivo fora das pastas de upload mesmo que o caminho já esteja gravado no banco', async () => {
    docRepo.findOne.mockResolvedValueOnce({
      id: 'antigo',
      caminho_arquivo: path.join(raiz, 'segredo.env'),
      nome_arquivo: 'segredo.env',
    });
    await expect(service.getArquivo('antigo')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('entrega arquivo legítimo gravado com caminho relativo antigo', async () => {
    docRepo.findOne.mockResolvedValueOnce({
      id: 'ok',
      caminho_arquivo: '/uploads/documentos/edital.pdf',
      nome_arquivo: 'edital.pdf',
    });
    const { buffer } = await service.getArquivo('ok');
    expect(buffer.toString()).toBe('%PDF-1.4');
  });
});
