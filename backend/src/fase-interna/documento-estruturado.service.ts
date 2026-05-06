import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DocumentoFaseInterna,
  TipoDocumentoFaseInterna,
  StatusDocumento,
} from './entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from './entities/log-fase-interna.entity';
import { AuditLogService, ContextoUsuario } from './audit-log.service';
import { validarEtp } from './types/etp-dados.type';
import { validarTr } from './types/tr-dados.type';
import {
  validarPesquisaPrecos,
  calcularEstatisticasItem,
  PesquisaPrecosDados,
  ItemPesquisaPrecos,
} from './types/pesquisa-precos.type';
import {
  validarMatrizRiscos,
  gerarEstatisticas,
  calcularGrauRisco,
  MatrizRiscosDados,
  RiscoIdentificado,
} from './types/matriz-riscos.type';

/**
 * Servico responsavel pelo gerenciamento dos dados estruturados (jsonb)
 * dos documentos da Fase Interna (ETP, TR, Pesquisa de Precos, Matriz de Riscos, etc.)
 *
 * Responsabilidades:
 *  - Validar dados conforme o tipo do documento
 *  - Persistir os dados no campo dados_estruturados
 *  - Recalcular estatisticas (PP / MR)
 *  - Submeter para aprovacao apenas quando os dados estiverem validos
 *  - Registrar todas as acoes no audit log
 */
@Injectable()
export class DocumentoEstruturadoService {
  constructor(
    @InjectRepository(DocumentoFaseInterna)
    private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly auditLog: AuditLogService,
  ) {}

  // ========================================
  // CONSULTA AUXILIAR
  // ========================================

  async validarPorDocumentoId(
    documentoId: string,
    dados: any,
  ): Promise<{ valido: boolean; erros: string[] }> {
    const documento = await this.docRepo.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }
    return this.validarDados(documento.tipo, dados);
  }

  // ========================================
  // VALIDACAO POR TIPO
  // ========================================

  validarDados(
    tipo: TipoDocumentoFaseInterna,
    dados: any,
  ): { valido: boolean; erros: string[] } {
    if (!dados || typeof dados !== 'object') {
      return { valido: false, erros: ['Dados estruturados ausentes ou invalidos'] };
    }

    const erros: string[] = [];

    switch (tipo) {
      case TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR: {
        erros.push(...validarEtp(dados));
        break;
      }
      case TipoDocumentoFaseInterna.TERMO_REFERENCIA: {
        erros.push(...validarTr(dados));
        break;
      }
      case TipoDocumentoFaseInterna.PESQUISA_PRECOS: {
        erros.push(...validarPesquisaPrecos(dados));
        const itens: ItemPesquisaPrecos[] = (dados as PesquisaPrecosDados).itens || [];
        itens.forEach((item, idx) => {
          try {
            calcularEstatisticasItem(item);
          } catch (e: any) {
            erros.push(`Item ${idx + 1}: erro ao calcular estatisticas (${e?.message || 'erro desconhecido'})`);
          }
        });
        break;
      }
      case TipoDocumentoFaseInterna.ANALISE_RISCOS: {
        erros.push(...validarMatrizRiscos(dados));
        const riscos: RiscoIdentificado[] = (dados as MatrizRiscosDados).riscos || [];
        riscos.forEach((risco, idx) => {
          try {
            calcularGrauRisco(risco.probabilidade, risco.impacto);
          } catch (e: any) {
            erros.push(`Risco ${idx + 1}: erro ao calcular grau (${e?.message || 'erro desconhecido'})`);
          }
        });
        try {
          gerarEstatisticas(dados as MatrizRiscosDados);
        } catch (e: any) {
          erros.push(`Erro ao gerar estatisticas da matriz: ${e?.message || 'erro desconhecido'}`);
        }
        break;
      }
      default:
        // Tipos sem validacao estruturada especifica
        return { valido: true, erros: [] };
    }

    return { valido: erros.length === 0, erros };
  }

  // ========================================
  // SALVAMENTO DE DADOS ESTRUTURADOS
  // ========================================

  async salvarDadosEstruturados(
    documentoId: string,
    dados: any,
    contexto?: ContextoUsuario,
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.docRepo.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    const validacao = this.validarDados(documento.tipo, dados);
    if (!validacao.valido) {
      throw new BadRequestException({
        message: 'Dados estruturados invalidos',
        erros: validacao.erros,
      });
    }

    // Aplica calculos derivados (estatisticas) quando aplicavel
    const dadosFinais = this.aplicarCalculosDerivados(documento.tipo, dados);

    const dadosAntes = documento.dados_estruturados;
    documento.dados_estruturados = dadosFinais;

    let salvo: DocumentoFaseInterna;
    try {
      salvo = await this.docRepo.save(documento);
    } catch (e: any) {
      throw new BadRequestException(
        `Erro ao salvar dados estruturados: ${e?.message || 'erro desconhecido'}`,
      );
    }

    try {
      const diff = this.auditLog.diff(dadosAntes, dadosFinais);
      await this.auditLog.log({
        licitacao_id: salvo.licitacao_id,
        documento_id: salvo.id,
        acao: AcaoLogFaseInterna.DOCUMENTO_EDITADO,
        descricao: `Dados estruturados atualizados (${salvo.tipo})`,
        dados_antes: diff.antes,
        dados_depois: diff.depois,
        contexto,
      });
    } catch {
      // Falha de auditoria nao deve impedir a operacao principal
    }

    return salvo;
  }

  // ========================================
  // SUBMISSAO PARA APROVACAO
  // ========================================

  async submeterParaAprovacao(
    documentoId: string,
    contexto?: ContextoUsuario,
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.docRepo.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    if (documento.status !== StatusDocumento.EM_ELABORACAO) {
      throw new BadRequestException(
        'Documento nao esta em elaboracao e nao pode ser submetido',
      );
    }

    const validacao = this.validarDados(documento.tipo, documento.dados_estruturados);
    if (!validacao.valido) {
      throw new BadRequestException({
        message: 'Documento nao pode ser submetido: existem dados invalidos',
        erros: validacao.erros,
      });
    }

    const statusAntes = documento.status;
    documento.status = StatusDocumento.AGUARDANDO_APROVACAO;

    let salvo: DocumentoFaseInterna;
    try {
      salvo = await this.docRepo.save(documento);
    } catch (e: any) {
      throw new BadRequestException(
        `Erro ao submeter documento: ${e?.message || 'erro desconhecido'}`,
      );
    }

    try {
      await this.auditLog.log({
        licitacao_id: salvo.licitacao_id,
        documento_id: salvo.id,
        acao: AcaoLogFaseInterna.DOCUMENTO_SUBMETIDO,
        descricao: `Documento submetido para aprovacao (${salvo.tipo})`,
        dados_antes: { status: statusAntes },
        dados_depois: { status: salvo.status },
        contexto,
      });
    } catch {
      // ignora falha de auditoria
    }

    return salvo;
  }

  // ========================================
  // RECALCULO DE ESTATISTICAS
  // ========================================

  async recalcularEstatisticas(documentoId: string): Promise<DocumentoFaseInterna> {
    const documento = await this.docRepo.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    if (!documento.dados_estruturados) {
      throw new BadRequestException(
        'Documento nao possui dados estruturados para recalcular',
      );
    }

    const dadosFinais = this.aplicarCalculosDerivados(
      documento.tipo,
      documento.dados_estruturados,
    );

    documento.dados_estruturados = dadosFinais;

    try {
      return await this.docRepo.save(documento);
    } catch (e: any) {
      throw new BadRequestException(
        `Erro ao recalcular estatisticas: ${e?.message || 'erro desconhecido'}`,
      );
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Aplica calculos derivados (estatisticas) conforme o tipo do documento.
   * Para PP: recalcula estatisticas de cada item.
   * Para MR: recalcula grau/nivel de cada risco e estatisticas globais.
   */
  private aplicarCalculosDerivados(tipo: TipoDocumentoFaseInterna, dados: any): any {
    if (!dados || typeof dados !== 'object') return dados;

    if (tipo === TipoDocumentoFaseInterna.PESQUISA_PRECOS) {
      const pp = { ...(dados as PesquisaPrecosDados) };
      if (Array.isArray(pp.itens)) {
        pp.itens = pp.itens.map((item) => calcularEstatisticasItem(item));
      }
      return pp;
    }

    if (tipo === TipoDocumentoFaseInterna.ANALISE_RISCOS) {
      const mr = { ...(dados as MatrizRiscosDados) };
      if (Array.isArray(mr.riscos)) {
        mr.riscos = mr.riscos.map((risco) => {
          const calc = calcularGrauRisco(risco.probabilidade, risco.impacto);
          return { ...risco, grau: calc.grau, nivel: calc.nivel } as RiscoIdentificado;
        });
      }
      return gerarEstatisticas(mr);
    }

    return dados;
  }
}
