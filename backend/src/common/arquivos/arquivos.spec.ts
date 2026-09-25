import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  assinarCaminho,
  assinarReferencia,
  caminhoContido,
  caminhoLogico,
  caminhoLogicoDeUrl,
  classificarTipo,
  diretorioDeGravacao,
  diretorioPrivado,
  expiracaoPadrao,
  limparReferencia,
  removerAssinatura,
  resolverArquivo,
  sanitizarTipo,
  transformarStrings,
  verificarAssinatura,
} from './arquivos';

describe('arquivos — classificação, caminho e URL assinada', () => {
  const envOriginal = { ...process.env };
  let raiz: string;
  let publico: string;
  let privado: string;

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'arquivos-spec-'));
    publico = join(raiz, 'uploads');
    privado = join(raiz, 'privado');
    mkdirSync(publico, { recursive: true });
    mkdirSync(privado, { recursive: true });
    process.env.UPLOAD_DIR = publico;
    process.env.UPLOAD_PRIVATE_DIR = privado;
    process.env.JWT_SECRET = 'segredo-de-teste';
    delete process.env.ARQUIVOS_URL_SECRET;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    rmSync(raiz, { recursive: true, force: true });
  });

  const gravar = (base: string, rel: string, conteudo = 'x') => {
    const p = join(base, rel);
    mkdirSync(resolve(p, '..'), { recursive: true });
    writeFileSync(p, conteudo);
    return p;
  };

  describe('classificação por pasta', () => {
    it.each(['logos', 'patrimonio', 'licitacao'])('%s é pública', (t) => expect(classificarTipo(t)).toBe('PUBLICO'));
    it.each([
      'documentos',
      'fiscal-estadual',
      'geral',
      'notas-fiscais',
      'medicoes',
      'boletins',
      'contratos',
      'documentos_assinados',
      'documentos_assinatura_avulsos',
      'fase-interna',
      'impugnacoes',
      'pasta-que-ninguem-conhece',
    ])('%s é sensível (negar por padrão)', (t) => expect(classificarTipo(t)).toBe('SENSIVEL'));

    it('sanitiza o tipo do upload genérico', () => {
      expect(sanitizarTipo('../../etc')).toBe('geral'); // '______etc' começa com _ → inválido
      expect(sanitizarTipo('')).toBe('geral');
      expect(sanitizarTipo(undefined)).toBe('geral');
      expect(sanitizarTipo('.privado')).toBe('geral');
      expect(sanitizarTipo('a/b')).toBe('a_b');
      expect(sanitizarTipo('fiscal-estadual')).toBe('fiscal-estadual');
    });

    it('arquivo novo sensível vai para o privado; público para a pasta pública', () => {
      expect(diretorioDeGravacao('documentos')).toBe(resolve(privado, 'documentos'));
      expect(diretorioDeGravacao('logos')).toBe(resolve(publico, 'logos'));
    });

    it('sem UPLOAD_PRIVATE_DIR, o privado fica DENTRO do volume de UPLOAD_DIR (.privado)', () => {
      delete process.env.UPLOAD_PRIVATE_DIR;
      expect(diretorioPrivado()).toBe(resolve(publico, '.privado'));
    });
  });

  describe('caminho lógico e proteção contra path traversal', () => {
    it('aceita caminhos válidos', () => {
      expect(caminhoLogico(['documentos', '1700-1.pdf'])?.rel).toBe('documentos/1700-1.pdf');
      expect(caminhoLogico('medicoes/abc/foto 1.jpg')?.subpastas).toEqual(['abc']);
    });

    it.each([
      [['..', 'etc', 'passwd']],
      [['documentos', '..', 'x.pdf']],
      [['documentos', '.']],
      [['.privado', 'documentos', 'x.pdf']],
      [['documentos', '.env']],
      [['documentos', 'a\\..\\b.pdf']],
      [['documentos', 'a\u0000.pdf']],
      [['documentos', '']],
      [['documentos']],
      [['a', 'b', 'c', 'd', 'e.pdf']],
      [['_tmp', 'x.pdf']],
    ])('recusa %j', (segs) => expect(caminhoLogico(segs as string[])).toBeNull());

    it('extrai o lógico das URLs gravadas no banco (e ignora a assinatura)', () => {
      expect(caminhoLogicoDeUrl('/api/uploads/documentos/1-2.pdf')?.rel).toBe('documentos/1-2.pdf');
      expect(caminhoLogicoDeUrl('/uploads/contratos/abc/termo.pdf')?.rel).toBe('contratos/abc/termo.pdf');
      expect(caminhoLogicoDeUrl('https://api.x.gov.br/api/uploads/boletins/b.pdf?expira=1&assinatura=z')?.rel).toBe('boletins/b.pdf');
      expect(caminhoLogicoDeUrl('documentos_assinatura_avulsos/d.pdf')?.rel).toBe('documentos_assinatura_avulsos/d.pdf');
      expect(caminhoLogicoDeUrl(join(publico, 'notas-fiscais', 'nf-1.pdf'))?.rel).toBe('notas-fiscais/nf-1.pdf');
    });

    it('URL com traversal codificado é recusada', () => {
      expect(caminhoLogicoDeUrl('/api/uploads/documentos/..%2F..%2Fetc%2Fpasswd')).toBeNull();
      expect(caminhoLogicoDeUrl('/uploads/../../etc/passwd')).toBeNull();
      expect(caminhoLogicoDeUrl('/etc/passwd')).toBeNull();
    });

    it('caminhoContido nunca sai da base', () => {
      expect(caminhoContido(publico, 'documentos/x.pdf')).toBe(resolve(publico, 'documentos/x.pdf'));
      expect(caminhoContido(publico, '../fora.pdf')).toBeNull();
      expect(caminhoContido(publico, '/etc/passwd')).toBeNull();
      expect(caminhoContido(publico, '')).toBeNull();
    });
  });

  describe('resolvedor (privado primeiro, legado como transição)', () => {
    it('lê do privado quando existe', () => {
      gravar(publico, 'documentos/a.pdf', 'legado');
      const p = gravar(privado, 'documentos/a.pdf', 'novo');
      expect(resolverArquivo(caminhoLogico('documentos/a.pdf'))).toBe(p);
    });

    it('cai para a pasta antiga (arquivo ainda não migrado)', () => {
      const p = gravar(publico, 'documentos/b.pdf');
      expect(resolverArquivo(caminhoLogico('documentos/b.pdf'))).toBe(p);
    });

    it('legado do upload genérico em geral/ é achado pela URL do tipo sensível', () => {
      const p = gravar(publico, 'geral/c.pdf');
      expect(resolverArquivo(caminhoLogico('documentos/c.pdf'))).toBe(p);
    });

    it('pasta PÚBLICA nunca lê do privado nem de geral/', () => {
      gravar(privado, 'licitacao/d.pdf');
      gravar(publico, 'geral/d.pdf');
      expect(resolverArquivo(caminhoLogico('licitacao/d.pdf'))).toBeNull();
    });

    it('inexistente → null', () => expect(resolverArquivo(caminhoLogico('documentos/nada.pdf'))).toBeNull());
  });

  describe('URL assinada', () => {
    const agora = Date.UTC(2026, 8, 25, 12, 0, 0);

    it('assina e verifica o mesmo caminho', () => {
      const a = assinarCaminho('documentos/x.pdf', agora)!;
      expect(verificarAssinatura('documentos/x.pdf', a.expira, a.assinatura, agora)).toBe(true);
    });

    it('assinatura de um arquivo não vale para outro', () => {
      const a = assinarCaminho('documentos/x.pdf', agora)!;
      expect(verificarAssinatura('documentos/y.pdf', a.expira, a.assinatura, agora)).toBe(false);
    });

    it('expirada, adulterada ou com prazo além do emitido é recusada', () => {
      const a = assinarCaminho('documentos/x.pdf', agora)!;
      expect(verificarAssinatura('documentos/x.pdf', a.expira, a.assinatura, a.expira * 1000 + 1)).toBe(false);
      const adulterada = a.assinatura.slice(0, -1) + (a.assinatura.endsWith('A') ? 'B' : 'A');
      expect(verificarAssinatura('documentos/x.pdf', a.expira, adulterada, agora)).toBe(false);
      expect(verificarAssinatura('documentos/x.pdf', a.expira + 86400 * 30, a.assinatura, agora)).toBe(false);
      expect(verificarAssinatura('documentos/x.pdf', undefined, a.assinatura, agora)).toBe(false);
    });

    it('validade de 4h a 8h, estável dentro da janela', () => {
      const e1 = expiracaoPadrao(agora);
      expect(e1 * 1000 - agora).toBeGreaterThanOrEqual(4 * 3600 * 1000);
      expect(e1 * 1000 - agora).toBeLessThanOrEqual(8 * 3600 * 1000);
      expect(expiracaoPadrao(agora + 60_000)).toBe(e1);
    });

    it('assina só referências SENSÍVEIS (prefixadas ou relativas conhecidas)', () => {
      expect(assinarReferencia('/api/uploads/documentos/x.pdf', agora)).toMatch(/^\/api\/uploads\/documentos\/x\.pdf\?expira=\d+&assinatura=[\w-]+$/);
      expect(assinarReferencia('/uploads/contratos/c/termo.pdf', agora)).toContain('?expira=');
      expect(assinarReferencia('contratos/c/termo.pdf', agora)).toContain('?expira=');
      expect(assinarReferencia('/api/uploads/logos/l.png', agora)).toBe('/api/uploads/logos/l.png');
      expect(assinarReferencia('Contrato 01/2026', agora)).toBe('Contrato 01/2026');
      expect(assinarReferencia('/app/uploads/notas-fiscais/nf.pdf', agora)).toBe('/app/uploads/notas-fiscais/nf.pdf');
    });

    it('re-assinar substitui a assinatura antiga; a entrada da API sai limpa', () => {
      const uma = assinarReferencia('/api/uploads/documentos/x.pdf', agora);
      const duas = assinarReferencia(uma, agora + 5 * 3600 * 1000);
      expect(duas.match(/assinatura=/g)).toHaveLength(1);
      expect(limparReferencia(duas)).toBe('/api/uploads/documentos/x.pdf');
      expect(removerAssinatura('/api/uploads/a/b.pdf?v=2&expira=1&assinatura=z')).toBe('/api/uploads/a/b.pdf?v=2');
    });

    it('transforma a resposta sem mutar o original', () => {
      const original = { a: { url: '/api/uploads/medicoes/m/f.jpg' }, b: [1, 'x'], d: new Date(0) };
      const saida: any = transformarStrings(original, (s) => assinarReferencia(s, agora));
      expect(original.a.url).toBe('/api/uploads/medicoes/m/f.jpg');
      expect(saida.a.url).toContain('assinatura=');
      expect(saida.b).toBe(original.b);
      expect(saida.d).toBe(original.d);
    });

    it('sem segredo configurado não assina (o arquivo continua exigindo login)', () => {
      delete process.env.JWT_SECRET;
      expect(assinarCaminho('documentos/x.pdf', agora)).toBeNull();
      expect(assinarReferencia('/api/uploads/documentos/x.pdf', agora)).toBe('/api/uploads/documentos/x.pdf');
    });
  });
});
