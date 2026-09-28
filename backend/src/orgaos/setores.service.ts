import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setor } from './entities/setor.entity';
import { Orgao } from './entities/orgao.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
import { CreateSetorDto } from './dto/create-setor.dto';
import { UpdateSetorDto } from './dto/update-setor.dto';
import { erroDoSuperior } from './hierarquia-setores';

@Injectable()
export class SetoresService {
  constructor(
    @InjectRepository(Setor)
    private readonly setorRepository: Repository<Setor>,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
  ) {}

  async findByOrgao(orgaoId: string): Promise<Setor[]> {
    return this.setorRepository.find({
      where: { orgao_id: orgaoId },
      order: { codigo: 'ASC' },
    });
  }

  async findById(id: string): Promise<Setor> {
    const setor = await this.setorRepository.findOne({ where: { id } });
    if (!setor) {
      throw new HttpException('Setor não encontrado', HttpStatus.NOT_FOUND);
    }
    return setor;
  }

  async create(orgaoId: string, dto: CreateSetorDto): Promise<Setor> {
    const orgao = await this.orgaoRepository.findOne({ where: { id: orgaoId } });
    if (!orgao) {
      throw new HttpException('Órgão não encontrado', HttpStatus.NOT_FOUND);
    }

    let codigo = (dto.codigo || '').trim();
    if (!codigo) {
      const setores = await this.setorRepository.find({ where: { orgao_id: orgaoId } });
      const maxNum = setores.reduce((max, s) => {
        const m = s.codigo.match(/^SET-(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
      codigo = `SET-${String(maxNum + 1).padStart(3, '0')}`;
    }

    const existente = await this.setorRepository.findOne({
      where: { orgao_id: orgaoId, codigo },
    });
    if (existente) {
      throw new HttpException('Já existe um setor com este código', HttpStatus.CONFLICT);
    }

    const chefe = await this.chefeValido(orgaoId, dto.chefe_usuario_id);
    const superior = await this.superiorValido(orgaoId, null, dto.setor_superior_id);
    const setor = this.setorRepository.create({
      orgao_id: orgaoId,
      codigo,
      nome: dto.nome,
      chefe_usuario_id: chefe,
      setor_superior_id: superior,
      eh_unidade_superior: dto.eh_unidade_superior === true,
    });
    return this.setorRepository.save(setor);
  }

  async update(orgaoId: string, id: string, dto: UpdateSetorDto): Promise<Setor> {
    const setor = await this.findById(id);
    if (setor.orgao_id !== orgaoId) {
      throw new HttpException('Setor não pertence a este órgão', HttpStatus.FORBIDDEN);
    }

    if (dto.codigo !== undefined) {
      const existente = await this.setorRepository.findOne({
        where: { orgao_id: orgaoId, codigo: dto.codigo },
      });
      if (existente && existente.id !== id) {
        throw new HttpException('Já existe um setor com este código', HttpStatus.CONFLICT);
      }
    }

    if (dto.chefe_usuario_id !== undefined) {
      dto = { ...dto, chefe_usuario_id: await this.chefeValido(orgaoId, dto.chefe_usuario_id) };
    }
    if (dto.setor_superior_id !== undefined) {
      dto = { ...dto, setor_superior_id: await this.superiorValido(orgaoId, id, dto.setor_superior_id) };
    }
    Object.assign(setor, dto);
    return this.setorRepository.save(setor);
  }

  /** Chefe do setor: usuário ATIVO do mesmo órgão (vazio/null → sem chefe). */
  private async chefeValido(orgaoId: string, chefeId: string | null | undefined): Promise<string | null> {
    if (!chefeId) return null;
    const [u] = await this.setorRepository.manager.query(
      `SELECT id::text AS id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
      [chefeId, orgaoId],
    );
    if (!u) throw new HttpException('Chefe do setor deve ser um usuário ativo deste órgão', HttpStatus.BAD_REQUEST);
    return u.id;
  }

  /**
   * Setor superior: do MESMO órgão, não ele mesmo e sem ciclo (o superior não
   * pode estar abaixo do setor). Vazio/null → topo da árvore.
   */
  private async superiorValido(orgaoId: string, setorId: string | null, superiorId: string | null | undefined): Promise<string | null> {
    if (!superiorId) return null;
    const setores = await this.setorRepository.find({ where: { orgao_id: orgaoId }, select: ['id', 'setor_superior_id'] });
    const erro = erroDoSuperior(setores, setorId, superiorId);
    if (erro) throw new HttpException(erro, HttpStatus.BAD_REQUEST);
    return superiorId;
  }

  async delete(orgaoId: string, id: string): Promise<void> {
    const setor = await this.findById(id);
    if (setor.orgao_id !== orgaoId) {
      throw new HttpException('Setor não pertence a este órgão', HttpStatus.FORBIDDEN);
    }

    // Hierarquia: nenhum setor fica apontando para um superior apagado
    const abaixo = await this.setorRepository.count({ where: { orgao_id: orgaoId, setor_superior_id: id } });
    if (abaixo > 0) {
      throw new HttpException(
        `Não é possível excluir: ${abaixo} setor(es) estão abaixo deste. Troque o setor superior deles antes.`,
        HttpStatus.CONFLICT,
      );
    }

    // Verificar se o setor está em uso em requisições (setor_solicitante ou codigo_setor)
    const emUso = await this.requisicaoRepository
      .createQueryBuilder('r')
      .where('r.orgao_id = :orgaoId', { orgaoId })
      .andWhere(
        '(r.setor_solicitante = :nome OR r.codigo_setor = :codigo)',
        { nome: setor.nome, codigo: setor.codigo },
      )
      .getCount();

    if (emUso > 0) {
      throw new HttpException(
        `Não é possível excluir. Este setor está vinculado a ${emUso} requisição(ões) ou ordem(ns) de serviço.`,
        HttpStatus.CONFLICT,
      );
    }

    await this.setorRepository.remove(setor);
  }
}
