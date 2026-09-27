import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { DespachoFaseInterna } from './entities/despacho-fase-interna.entity';
import { gerarPdfDespacho } from './despacho-tramitacao-pdf';
import { atribuirFolhasDespachoEtapa, contarPaginasPdf } from './folhas-autos';
import { dataHoraBrasilia } from './tramitacao-regras';

const PASTA = 'licitacoes';
export const urlDoDespachoDeEtapa = (id: string) => `/api/fase-interna/despachos/${id}/pdf`;

/**
 * DESPACHO DAS ETAPAS DE REGISTRO NOS AUTOS (F3): ao registrar a etapa que
 * conclui por despacho ("autorização de início", "indicação da modalidade"…),
 * o texto vira um PDF curto — órgão, processo, etapa, texto, data/hora de
 * Brasília, quem registrou e o cargo — que entra nos autos como FOLHA, na
 * mesma sequência das peças e dos despachos de tramitação, intercalado em
 * ordem cronológica na montagem dos autos.
 */
@Injectable()
export class DespachoEtapaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async registrar(
    licitacaoId: string,
    d: { etapa: string; titulo_etapa: string; texto: string; autor: { id: string | null; nome: string | null } },
  ): Promise<{ id: string; folha_inicial: number; folha_final: number; url: string }> {
    const [lic] = await this.ds.query(
      `SELECT l.id::text AS id, l.orgao_id::text AS orgao_id, l.numero_processo, l.objeto, o.nome AS orgao_nome, o.cidade, o.uf
         FROM licitacoes l JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Processo não encontrado');
    const [u] = d.autor.id && ehUuid(d.autor.id) ? await this.ds.query(`SELECT cargo FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`, [d.autor.id, lic.orgao_id]) : [];
    const agora = new Date();
    const autor = d.autor.nome || 'Usuário';
    // "Despacho de autorização do início" já é um despacho; as demais ganham o prefixo
    const titulo = /^despacho\b/i.test(d.titulo_etapa.trim()) ? d.titulo_etapa.trim() : `Despacho — ${d.titulo_etapa.trim()}`;
    const pdf = await gerarPdfDespacho({
      orgao_nome: lic.orgao_nome || 'Órgão',
      cidade: lic.cidade ?? null,
      uf: lic.uf ?? null,
      numero_processo: lic.numero_processo,
      objeto: lic.objeto,
      sequencia: 0,
      devolucao: false,
      de: '',
      para: '',
      titulo: titulo.toUpperCase(),
      campos: [['Etapa', d.titulo_etapa]],
      despacho: d.texto,
      ocorrido_em: agora,
      registrado_em: agora,
      enviado_por: autor,
      cargo: u?.cargo ?? null,
      rodape: [`Registrado eletronicamente em ${dataHoraBrasilia(agora)} (horário de Brasília) por ${autor}, ao concluir a etapa no fluxo do processo.`],
    });
    const nome = `despacho-etapa-${d.etapa.toLowerCase()}-${randomUUID()}.pdf`;
    const dir = path.join(diretorioDeGravacao(PASTA), lic.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), pdf);
    const rel = `${PASTA}/${lic.id}/${nome}`;
    const paginas = Math.max(1, await contarPaginasPdf(pdf));
    try {
      return await this.ds.transaction(async (m) => {
        const repo = m.getRepository(DespachoFaseInterna);
        const salvo = await repo.save(
          repo.create({
            licitacao_id: lic.id,
            orgao_id: lic.orgao_id,
            tipo: 'REGISTRO_ETAPA',
            etapa: d.etapa,
            titulo: titulo.slice(0, 250),
            texto: d.texto,
            autor_id: d.autor.id,
            autor_nome: d.autor.nome,
            autor_cargo: u?.cargo ?? null,
            registrado_em: agora,
            arquivo: rel,
            hash: createHash('sha256').update(pdf).digest('hex'),
            paginas,
          }),
        );
        const faixa = await atribuirFolhasDespachoEtapa(m, lic.id, salvo.id, paginas);
        return { id: salvo.id, ...faixa, url: urlDoDespachoDeEtapa(salvo.id) };
      });
    } catch (e) {
      fs.promises.unlink(path.join(dir, nome)).catch(() => undefined);
      throw e;
    }
  }

  /** PDF do despacho (folha dos autos). */
  async arquivo(id: string): Promise<{ caminho: string; nome: string }> {
    const [d] = ehUuid(id) ? await this.ds.query(`SELECT arquivo, etapa FROM despachos_fase_interna WHERE id::text = $1`, [id]) : [];
    const caminho = d?.arquivo ? resolverArquivoDeUrl(d.arquivo) : null;
    if (!caminho || !fs.existsSync(caminho)) throw new NotFoundException('Despacho não encontrado');
    return { caminho, nome: `despacho-${String(d.etapa).toLowerCase()}.pdf` };
  }
}
