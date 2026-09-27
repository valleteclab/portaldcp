'use client'

/**
 * Diálogo "Nova demanda" (lista de demandas). Estado próprio — digitar aqui não
 * redesenha a lista inteira (era o que deixava o modal lento). Já abre com o
 * setor e o responsável de quem está logado (editáveis). O trimestre dos itens
 * sai do "Para quando" (ver `trimestreDaData`).
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { API_URL, authFetch } from '@/lib/api'
import { carregarEscopoDemandas, trimestreDaData, type EscopoDemandas, type SetorOrgao } from './tipos'

interface FormNovaDemanda {
  unidade_requisitante: string
  setor_id: string | null
  responsavel_nome: string
  responsavel_email: string
  responsavel_telefone: string
  data_desejada_contratacao: string
  renovacao_contrato: boolean
  descricao_sucinta_objeto: string
  observacoes: string
}

const VAZIO: FormNovaDemanda = {
  unidade_requisitante: '',
  setor_id: null,
  responsavel_nome: '',
  responsavel_email: '',
  responsavel_telefone: '',
  data_desejada_contratacao: '',
  renovacao_contrato: false,
  descricao_sucinta_objeto: '',
  observacoes: '',
}

/** Formulário inicial: setor e responsável de quem está logado. */
function inicialDoUsuario(escopo: EscopoDemandas | null): FormNovaDemanda {
  const u = escopo?.usuario
  if (!u) return { ...VAZIO }
  return {
    ...VAZIO,
    unidade_requisitante: u.setor_nome || '',
    setor_id: u.setor_id || null,
    responsavel_nome: u.nome || '',
    responsavel_email: u.email || '',
    responsavel_telefone: u.telefone || '',
  }
}

const TRIMESTRE_TEXTO: Record<number, string> = { 1: '1º trimestre', 2: '2º trimestre', 3: '3º trimestre', 4: '4º trimestre' }

export function NovaDemandaDialog({
  open,
  onOpenChange,
  ano,
  orgaoId,
  onCriada,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ano: number
  orgaoId: string
  onCriada: (id: string) => void
}) {
  const [form, setForm] = useState<FormNovaDemanda>(VAZIO)
  const [setores, setSetores] = useState<SetorOrgao[]>([])
  const [setorLivre, setSetorLivre] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [melhorandoDescricao, setMelhorandoDescricao] = useState(false)
  const [melhorandoJustificativa, setMelhorandoJustificativa] = useState(false)
  const carregado = useRef(false)

  // Setores e usuário logado: 1 vez (em paralelo), só quando o diálogo abre
  useEffect(() => {
    if (!open || !orgaoId) return
    if (carregado.current) return
    carregado.current = true
    Promise.all([
      authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`).then(async (r) => (r.ok ? r.json() : [])).catch(() => []),
      carregarEscopoDemandas(orgaoId),
    ]).then(([lista, escopo]) => {
      const s: SetorOrgao[] = Array.isArray(lista) ? lista : []
      setSetores(s)
      const ini = inicialDoUsuario(escopo)
      // setor do usuário fora da lista (ou sem setores cadastrados) → texto livre
      if (ini.unidade_requisitante && !s.some(x => x.nome === ini.unidade_requisitante)) setSetorLivre(s.length > 0)
      setForm(f => (f.descricao_sucinta_objeto || f.unidade_requisitante ? f : ini))
    })
  }, [open, orgaoId])

  const set = <K extends keyof FormNovaDemanda>(k: K, v: FormNovaDemanda[K]) => setForm(f => ({ ...f, [k]: v }))

  const pedirIa = async (conteudo: string): Promise<string> => {
    const res = await authFetch(`${API_URL}/api/ia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagens: [{ role: 'user', content: conteudo }], tipoDocumento: 'DFD' }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return String(data.resposta || '').trim()
  }

  const melhorarDescricao = async () => {
    const texto = form.descricao_sucinta_objeto.trim()
    if (!texto || melhorandoDescricao) return
    setMelhorandoDescricao(true)
    try {
      const novo = await pedirIa(
        `Você redige descrições sucintas de objeto para demandas de contratação pública (Lei 14.133/2021). ` +
        `Reescreva o texto abaixo como uma descrição sucinta formal, clara e específica (1 a 3 frases), ` +
        `preservando a intenção. Responda APENAS com o texto final, sem aspas nem comentários.\n\n` +
        `Setor requisitante: ${form.unidade_requisitante || 'não informado'}\n` +
        `Texto do usuário: ${texto}`,
      )
      if (novo) set('descricao_sucinta_objeto', novo)
    } catch {
      toast.error('Não foi possível melhorar o texto agora — você pode continuar com o seu.')
    } finally {
      setMelhorandoDescricao(false)
    }
  }

  const melhorarJustificativa = async () => {
    if (melhorandoJustificativa) return
    setMelhorandoJustificativa(true)
    try {
      const atual = form.observacoes.trim()
      const novo = await pedirIa(
        `Você redige justificativas de necessidade para demandas de contratação pública (Art. 18, I, Lei 14.133/2021). ` +
        (atual ? `Melhore e desenvolva o texto do usuário, preservando os fatos. ` : `Redija a justificativa a partir do objeto informado. `) +
        `Texto formal e objetivo, 1 a 2 parágrafos. Responda APENAS com o texto final.\n\n` +
        `Objeto: ${form.descricao_sucinta_objeto || 'não informado'}\n` +
        `Setor: ${form.unidade_requisitante || 'não informado'}\n` +
        (atual ? `\nTexto do usuário:\n${atual}` : ''),
      )
      if (novo) set('observacoes', novo)
    } catch {
      toast.error('Não foi possível gerar agora — você pode preencher depois, na seção 2 da demanda.')
    } finally {
      setMelhorandoJustificativa(false)
    }
  }

  const criar = async () => {
    if (!form.unidade_requisitante.trim()) { toast.warning('Informe a unidade requisitante'); return }
    if (!form.descricao_sucinta_objeto.trim()) { toast.warning('Informe a descrição do pedido'); return }
    setSalvando(true)
    try {
      // Data vazia NÃO vai como '' (o banco recusaria) — omite
      const payload: Record<string, unknown> = { orgaoId, ano_referencia: ano, ...form }
      if (!form.data_desejada_contratacao) delete payload.data_desejada_contratacao
      if (!form.setor_id) delete payload.setor_id
      const res = await authFetch(`${API_URL}/api/demandas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = Array.isArray(err.message) ? err.message.join('\n') : err.message
        toast.error(msg || 'Erro ao criar demanda — verifique os campos obrigatórios (*)')
        return
      }
      const criada = await res.json()
      setForm(f => ({ ...inicialDoUsuario(null), unidade_requisitante: f.unidade_requisitante, setor_id: f.setor_id, responsavel_nome: f.responsavel_nome, responsavel_email: f.responsavel_email, responsavel_telefone: f.responsavel_telefone }))
      onOpenChange(false)
      onCriada(criada.id)
    } catch {
      toast.error('Erro ao criar demanda')
    } finally {
      setSalvando(false)
    }
  }

  const trimestre = trimestreDaData(form.data_desejada_contratacao)
  const iaCls = 'shrink-0 h-7 text-xs gap-1.5 text-[#1351b4] border-[#c5d4eb] bg-[#f6f9fd] hover:bg-[#ecf3fc]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova demanda</DialogTitle>
          <DialogDescription>
            O pedido do seu setor para o PCA {ano}: o que precisa, por quê e para quando.
            Depois de criar, você adiciona os itens e envia para aprovação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label htmlFor="nd-unidade" className="block text-sm font-medium mb-1">Unidade requisitante *</label>
            {setores.length > 0 && !setorLivre ? (
              <Select
                value={form.setor_id ?? ''}
                onValueChange={(value) => {
                  if (value === '__outro__') {
                    setSetorLivre(true)
                    setForm(f => ({ ...f, unidade_requisitante: '', setor_id: null }))
                    return
                  }
                  const setor = setores.find(s => s.id === value)
                  setForm(f => ({
                    ...f,
                    setor_id: setor?.id ?? null,
                    unidade_requisitante: setor?.nome ?? '',
                    // responsável do setor só preenche o que estiver vazio (o do usuário logado continua)
                    responsavel_nome: f.responsavel_nome || setor?.responsavel_nome || '',
                    responsavel_email: f.responsavel_email || setor?.responsavel_email || '',
                    responsavel_telefone: f.responsavel_telefone || setor?.responsavel_telefone || '',
                  }))
                }}
              >
                <SelectTrigger id="nd-unidade"><SelectValue placeholder="Selecione o setor requisitante" /></SelectTrigger>
                <SelectContent>
                  {setores.map(setor => (
                    <SelectItem key={setor.id} value={setor.id}>{setor.codigo ? `${setor.codigo} - ` : ''}{setor.nome}</SelectItem>
                  ))}
                  <SelectItem value="__outro__">Outro setor (digitar o nome)</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="nd-unidade"
                  value={form.unidade_requisitante}
                  onChange={(e) => setForm(f => ({ ...f, unidade_requisitante: e.target.value, setor_id: null }))}
                  placeholder="Ex: Departamento de TI, Setor de Compras..."
                  autoFocus={setorLivre}
                />
                {setores.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0 h-10"
                    onClick={() => { setSetorLivre(false); setForm(f => ({ ...f, unidade_requisitante: '', setor_id: null })) }}>
                    Voltar à lista
                  </Button>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="nd-descricao" className="block text-sm font-medium mb-1">Descrição do pedido *</label>
            <Textarea
              id="nd-descricao"
              value={form.descricao_sucinta_objeto}
              onChange={(e) => set('descricao_sucinta_objeto', e.target.value)}
              placeholder="Escreva do seu jeito (ex: 'preciso de 20 cadeiras pro administrativo') — a IA formaliza para você."
              rows={3}
            />
            <div className="flex items-start sm:items-center justify-between gap-2 mt-1 flex-wrap sm:flex-nowrap">
              <p className="text-xs text-gray-600">
                Este resumo identifica o seu pedido — a unidade de planejamento usa para juntar pedidos parecidos no DFD.
              </p>
              <Button type="button" variant="outline" size="sm" className={iaCls} onClick={melhorarDescricao}
                disabled={melhorandoDescricao || !form.descricao_sucinta_objeto.trim()}
                title="A IA reescreve o seu texto como uma descrição formal de contratação (você pode editar depois)">
                {melhorandoDescricao ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {melhorandoDescricao ? 'Melhorando…' : 'Melhorar com IA'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nd-tipo" className="block text-sm font-medium mb-1">Tipo da demanda</label>
              <Select value={form.renovacao_contrato ? 'RENOVACAO' : 'NOVA'} onValueChange={(v) => set('renovacao_contrato', v === 'RENOVACAO')}>
                <SelectTrigger id="nd-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOVA">Nova demanda</SelectItem>
                  <SelectItem value="RENOVACAO">Renovação contratual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="nd-data" className="block text-sm font-medium mb-1">Para quando (data desejada) <span className="text-gray-500 font-normal">(opcional)</span></label>
              <Input id="nd-data" type="date" value={form.data_desejada_contratacao} onChange={(e) => set('data_desejada_contratacao', e.target.value)} />
              <p className="text-xs text-gray-600 mt-1">
                {trimestre ? `Os itens entram no ${TRIMESTRE_TEXTO[trimestre]} do PCA.` : 'Sem data, você escolhe o trimestre de cada item.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nd-resp" className="block text-sm font-medium mb-1">Nome do responsável</label>
              <Input id="nd-resp" value={form.responsavel_nome} onChange={(e) => set('responsavel_nome', e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label htmlFor="nd-tel" className="block text-sm font-medium mb-1">Telefone</label>
              <Input id="nd-tel" value={form.responsavel_telefone} onChange={(e) => set('responsavel_telefone', e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>

          <div>
            <label htmlFor="nd-email" className="block text-sm font-medium mb-1">E-mail do responsável</label>
            <Input id="nd-email" type="email" value={form.responsavel_email} onChange={(e) => set('responsavel_email', e.target.value)} placeholder="email@orgao.gov.br" />
          </div>

          <div>
            <label htmlFor="nd-just" className="block text-sm font-medium mb-1">
              Justificativa da necessidade <span className="text-gray-500 font-normal">(opcional aqui, editável depois)</span>
            </label>
            <Textarea id="nd-just" value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)}
              placeholder="Por que essa contratação é necessária? Escreva do seu jeito — a IA formaliza." rows={3} />
            <div className="flex justify-end mt-1">
              <Button type="button" variant="outline" size="sm" className={iaCls} onClick={melhorarJustificativa}
                disabled={melhorandoJustificativa || (!form.observacoes.trim() && !form.descricao_sucinta_objeto.trim())}
                title="A IA redige/melhora a justificativa usando o objeto informado acima">
                {melhorandoJustificativa ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {melhorandoJustificativa ? 'Gerando…' : form.observacoes.trim() ? 'Melhorar com IA' : 'Redigir com IA'}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Criar demanda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
