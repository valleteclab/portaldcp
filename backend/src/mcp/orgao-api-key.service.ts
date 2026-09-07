import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { OrgaoApiKey } from './entities/orgao-api-key.entity';

const PREFIXO = 'dcp_org_';

@Injectable()
export class OrgaoApiKeyService {
  constructor(
    @InjectRepository(OrgaoApiKey)
    private readonly repo: Repository<OrgaoApiKey>,
  ) {}

  private hash(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }

  /** Lista as chaves do órgão (sem o hash). */
  async listar(orgaoId: string) {
    const chaves = await this.repo.find({
      where: { orgao_id: orgaoId },
      order: { created_at: 'DESC' },
      select: ['id', 'nome', 'prefixo', 'criado_por', 'ultimo_uso', 'revogada_em', 'created_at'],
    });
    return chaves;
  }

  /** Gera uma chave nova. O valor em claro é devolvido UMA vez. */
  async gerar(orgaoId: string, nome: string, criadoPor: string | null) {
    const rotulo = String(nome || '').trim();
    if (rotulo.length < 3) throw new BadRequestException('Dê um nome à chave (ex.: "Copilot da Secretaria")');
    const plaintext = PREFIXO + randomBytes(32).toString('hex');
    const chave = this.repo.create({
      orgao_id: orgaoId,
      nome: rotulo.slice(0, 120),
      key_hash: this.hash(plaintext),
      prefixo: plaintext.slice(0, 12),
      criado_por: criadoPor,
    });
    const salva = await this.repo.save(chave);
    return { id: salva.id, nome: salva.nome, prefixo: salva.prefixo, api_key: plaintext };
  }

  async revogar(id: string, orgaoId: string) {
    const chave = await this.repo.findOne({ where: { id, orgao_id: orgaoId } });
    if (!chave) throw new NotFoundException('Chave não encontrada');
    if (!chave.revogada_em) {
      chave.revogada_em = new Date();
      await this.repo.save(chave);
    }
    return { ok: true };
  }

  /** Resolve a chave em claro → registro ativo (e marca o uso). null = inválida/revogada. */
  async autenticar(plaintext: string | undefined | null): Promise<OrgaoApiKey | null> {
    const valor = String(plaintext || '').trim();
    if (!valor) return null;
    const chave = await this.repo.findOne({
      where: { key_hash: this.hash(valor), revogada_em: IsNull() },
      relations: ['orgao'],
    });
    if (!chave) return null;
    this.repo.update(chave.id, { ultimo_uso: new Date() }).catch(() => { /* só estatística */ });
    return chave;
  }
}
