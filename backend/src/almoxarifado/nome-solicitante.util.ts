import { EntityManager } from 'typeorm';
import { Usuario } from '../usuarios/entities/usuario.entity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nome de quem fez a requisição, para os PDFs (OS e OF).
 *
 * O token de login não traz o nome, então as requisições foram gravadas com o
 * e-mail no lugar dele ("gilberto.ferreira@…"). Quando o gravado está vazio ou
 * é um e-mail, vale o nome do cadastro do usuário; sem cadastro, o gravado.
 */
export async function nomeDoSolicitante(
  manager: EntityManager,
  requisicao:
    | { usuario_solicitante_id?: string | null; usuario_solicitante_nome?: string | null }
    | null
    | undefined,
): Promise<string | null> {
  if (!requisicao) return null;
  const gravado = (requisicao.usuario_solicitante_nome || '').trim();
  const id = requisicao.usuario_solicitante_id;
  if (id && UUID.test(id) && (!gravado || gravado.includes('@'))) {
    try {
      const usuario = await manager
        .getRepository(Usuario)
        .findOne({ where: { id }, select: ['id', 'nome'] });
      const nome = usuario?.nome?.trim();
      if (nome) return nome;
    } catch {
      // Sem o cadastro, fica o que foi gravado — o PDF não pode deixar de sair
    }
  }
  return gravado || null;
}
