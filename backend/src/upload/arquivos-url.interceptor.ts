import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { assinarReferencia, limparReferencia, transformarStrings } from '../common/arquivos/arquivos';

/**
 * URL ASSINADA DE ARQUIVO SENSÍVEL (global, só HTTP).
 *
 *  - Saída: toda string da resposta que referencia um upload SENSÍVEL
 *    (`/api/uploads/...`, `/uploads/...` ou `contratos/x.pdf` relativo) ganha
 *    `?expira=…&assinatura=…` (HMAC, 4–8 h). Quem recebeu o registro pela API
 *    já passou pela autorização daquela rota — o link (inclusive <img src> e
 *    páginas por token, que não mandam Bearer) funciona por algumas horas.
 *  - Entrada: a mesma assinatura é removida das strings do corpo JSON, para que
 *    a URL assinada nunca seja gravada no banco.
 *
 * Não muta os objetos originais (cópia só do que muda).
 */
@Injectable()
export class ArquivosUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      req.body = transformarStrings(req.body, limparReferencia);
    }
    const agora = Date.now();
    return next.handle().pipe(map((dados) => transformarStrings(dados, (s) => assinarReferencia(s, agora))));
  }
}
