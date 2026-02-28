import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

export interface NfeHeader {
  numero: string;
  serie: string;
  chaveAcesso: string;
  dataEmissao: string;
  valorTotal: number;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
}

export interface NfeProduto {
  nItem: number;
  cProd: string;
  xProd: string;
  qCom: number;
  uCom: string;
  vUnCom: number;
  vProd: number;
  NCM: string;
}

export interface NfeParseResult {
  header: NfeHeader;
  produtos: NfeProduto[];
}

@Injectable()
export class XmlNfeParserService {
  private readonly logger = new Logger(XmlNfeParserService.name);

  parse(xmlContent: string): NfeParseResult {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      trimValues: true,
    });

    const parsed = parser.parse(xmlContent);

    const nfeProc = parsed.nfeProc || parsed;
    const nfe = nfeProc.NFe || nfeProc;
    const infNFe = nfe.infNFe || nfe;

    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const total = infNFe.total || {};
    const icmsTot = total.ICMSTot || {};

    let chaveAcesso = '';
    if (nfeProc.protNFe?.infProt?.chNFe) {
      chaveAcesso = String(nfeProc.protNFe.infProt.chNFe);
    } else if (infNFe['@_Id']) {
      chaveAcesso = String(infNFe['@_Id']).replace(/^NFe/, '');
    }

    const header: NfeHeader = {
      numero: String(ide.nNF || ''),
      serie: String(ide.serie || ''),
      chaveAcesso,
      dataEmissao: String(ide.dhEmi || ide.dEmi || ''),
      valorTotal: this.toNumber(icmsTot.vNF),
      cnpjEmitente: String(emit.CNPJ || ''),
      razaoSocialEmitente: String(emit.xNome || ''),
    };

    const dets = infNFe.det;
    const detArray = Array.isArray(dets) ? dets : dets ? [dets] : [];

    const produtos: NfeProduto[] = detArray.map((det: any) => {
      const prod = det.prod || {};
      return {
        nItem: Number(det['@_nItem'] || 0),
        cProd: String(prod.cProd || ''),
        xProd: String(prod.xProd || ''),
        qCom: this.toNumber(prod.qCom),
        uCom: String(prod.uCom || ''),
        vUnCom: this.toNumber(prod.vUnCom),
        vProd: this.toNumber(prod.vProd),
        NCM: String(prod.NCM || ''),
      };
    });

    this.logger.log(`XML parseado: NF ${header.numero}/${header.serie}, ${produtos.length} itens`);

    return { header, produtos };
  }

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    const num = Number(String(value).replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }
}
