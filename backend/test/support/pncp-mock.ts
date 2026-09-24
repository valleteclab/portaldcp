/**
 * Mock HTTP do PNCP + bloqueio de rede externa (nock).
 *
 * - Toda requisição para os hosts do PNCP (o fictício pncp.e2e.invalid usado
 *   em PNCP_API_URL, e também pncp.gov.br / treina.pncp.gov.br, que aparecem
 *   fixos em alguns serviços) é CAPTURADA e respondida pelo mock.
 * - Qualquer outra saída para fora de 127.0.0.1/localhost é RECUSADA pelo nock
 *   e registrada em `pncpMock.bloqueadas` (e-mail, WhatsApp, IA, Receita...).
 *
 * Instalado automaticamente pelo setup-after-env.ts; os testes só importam o
 * singleton `pncpMock`:
 *
 *   import { pncpMock } from './support';
 *   pncpMock.limpar();
 *   ... ação que publica no PNCP ...
 *   const envios = pncpMock.filtrar('POST', /\/compras$/);
 *   expect(envios[0].corpo).toMatchObject({ modalidadeId: 6 });
 */
import nock from 'nock';

export interface RequisicaoCapturada {
  metodo: string;
  host: string;
  caminho: string;
  headers: Record<string, string | string[] | undefined>;
  /** Corpo já convertido de JSON quando possível; string caso contrário (multipart etc.). */
  corpo: any;
  em: Date;
}

export interface RespostaMock {
  status: number;
  corpo?: any;
  headers?: Record<string, string>;
}

type Responder = (req: RequisicaoCapturada) => RespostaMock;

interface RegraResposta {
  metodo?: string;
  caminho: RegExp | string;
  responder: Responder;
  vezes?: number;
}

export const HOSTS_PNCP = [
  'http://pncp.e2e.invalid',
  'https://pncp.gov.br',
  'https://treina.pncp.gov.br',
];

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function casa(caminho: RegExp | string, alvo: string): boolean {
  return typeof caminho === 'string' ? alvo.includes(caminho) : caminho.test(alvo);
}

/** Respostas padrão — suficientes para o PncpService seguir o fluxo feliz. */
function respostaPadrao(req: RequisicaoCapturada): RespostaMock {
  const caminho = req.caminho.split('?')[0];

  if (req.metodo === 'POST' && /\/usuarios\/login$/.test(caminho)) {
    return {
      status: 200,
      corpo: { token: 'token-pncp-e2e' },
      headers: { authorization: 'Bearer token-pncp-e2e' },
    };
  }

  // POST /orgaos/{cnpj}/compras → PNCP devolve Location com ano/sequencial
  const compra = caminho.match(/\/orgaos\/(\d+)\/compras$/);
  if (req.metodo === 'POST' && compra) {
    const ano = new Date().getFullYear();
    const seq = pncpMock.proximoSequencial();
    return {
      status: 201,
      corpo: {
        numeroControlePNCP: `${compra[1]}-1-${String(seq).padStart(6, '0')}/${ano}`,
        ano,
        sequencial: seq,
      },
      headers: { location: `${caminho}/${ano}/${seq}` },
    };
  }

  if (req.metodo === 'GET') return { status: 200, corpo: req.caminho.includes('/consulta/') ? { data: [] } : {} };
  if (req.metodo === 'POST') return { status: 201, corpo: {} };
  return { status: 200, corpo: {} };
}

class PncpMock {
  /** Requisições que chegaram aos hosts do PNCP, em ordem. */
  readonly requisicoes: RequisicaoCapturada[] = [];
  /** Tentativas de sair para a internet fora do PNCP (recusadas). */
  readonly bloqueadas: Array<{ host: string; caminho: string; metodo: string; em: Date }> = [];

  private regras: RegraResposta[] = [];
  private sequencial = 0;
  private instalado = false;

  proximoSequencial(): number {
    this.sequencial += 1;
    return this.sequencial;
  }

  /** Liga o nock: intercepta PNCP e recusa o resto da rede externa. */
  instalar(): void {
    if (this.instalado) return;
    if (!nock.isActive()) nock.activate();

    nock.disableNetConnect();
    // App (supertest / socket.io) e Postgres descartável são locais
    nock.enableNetConnect((host) => /^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/.test(host));

    const self = this;
    for (const host of HOSTS_PNCP) {
      const escopo = nock(host).persist();
      for (const metodo of METODOS) {
        escopo.intercept(() => true, metodo).reply(function (uri, corpo) {
          return self.registrar(host, metodo, uri, this.req.headers as any, corpo);
        });
      }
    }

    nock.emitter.on('no match', (req: any) => {
      const host = req?.hostname || req?.host || req?.options?.hostname || '';
      if (/^(127\.0\.0\.1|localhost|::1)$/.test(String(host).replace(/:\d+$/, ''))) return;
      this.bloqueadas.push({
        host: String(host),
        caminho: String(req?.path || req?.options?.path || ''),
        metodo: String(req?.method || req?.options?.method || ''),
        em: new Date(),
      });
    });

    this.instalado = true;
  }

  desinstalar(): void {
    nock.cleanAll();
    nock.enableNetConnect();
    nock.emitter.removeAllListeners('no match');
    this.instalado = false;
  }

  private registrar(
    host: string,
    metodo: string,
    uri: string,
    headers: Record<string, any>,
    corpoBruto: any,
  ): [number, any, Record<string, string>] {
    let corpo = corpoBruto;
    if (typeof corpo === 'string') {
      try {
        corpo = JSON.parse(corpo);
      } catch {
        // multipart / texto — mantém string
      }
    }
    const req: RequisicaoCapturada = {
      metodo,
      host,
      caminho: uri,
      headers: { ...headers },
      corpo,
      em: new Date(),
    };
    this.requisicoes.push(req);

    const idx = this.regras.findIndex(
      (r) => (!r.metodo || r.metodo === metodo) && casa(r.caminho, uri),
    );
    let resposta: RespostaMock;
    if (idx >= 0) {
      const regra = this.regras[idx];
      resposta = regra.responder(req);
      if (regra.vezes !== undefined) {
        regra.vezes -= 1;
        if (regra.vezes <= 0) this.regras.splice(idx, 1);
      }
    } else {
      resposta = respostaPadrao(req);
    }
    return [resposta.status, resposta.corpo ?? {}, resposta.headers ?? {}];
  }

  /**
   * Sobrescreve a resposta para um método/caminho. A regra mais antiga que
   * casar vence. `vezes` limita quantas requisições ela atende.
   */
  responder(
    metodo: string | undefined,
    caminho: RegExp | string,
    resposta: RespostaMock | Responder,
    vezes?: number,
  ): void {
    this.regras.push({
      metodo: metodo?.toUpperCase(),
      caminho,
      responder: typeof resposta === 'function' ? resposta : () => resposta,
      vezes,
    });
  }

  /** Requisições capturadas filtradas (ignora o login por padrão). */
  filtrar(metodo?: string, caminho?: RegExp | string, incluirLogin = false): RequisicaoCapturada[] {
    return this.requisicoes.filter(
      (r) =>
        (incluirLogin || !/\/usuarios\/login$/.test(r.caminho)) &&
        (!metodo || r.metodo === metodo.toUpperCase()) &&
        (!caminho || casa(caminho, r.caminho)),
    );
  }

  /** Zera capturas, bloqueios e regras (mantém os interceptadores). */
  limpar(): void {
    this.requisicoes.length = 0;
    this.bloqueadas.length = 0;
    this.regras = [];
  }
}

export const pncpMock = new PncpMock();
