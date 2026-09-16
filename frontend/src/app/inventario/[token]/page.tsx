'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Camera, Keyboard, Loader2, X, CheckCircle2, AlertTriangle, HelpCircle, PackagePlus,
  ClipboardCheck, RefreshCw, WifiOff, Search, ScanLine, Volume2, VolumeX,
} from 'lucide-react'
import { API_URL } from '@/lib/api'

const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((mod) => mod.Scanner),
  { ssr: false, loading: () => <div className="w-full h-full bg-black/60 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-amber-400" /></div> },
)

const PUB = `${API_URL}/api/patrimonio-pub`
const LS_NOME = 'inventario_nome_conferente'
const LS_MUDO = 'inventario_mudo'

type Som = 'ok' | 'outro' | 'erro'
const somDe = (situacao?: Situacao | null): Som =>
  situacao === 'ENCONTRADO' || situacao === 'SEM_PLAQUETA' ? 'ok' : situacao === 'OUTRO_SETOR' || situacao === 'BAIXADO_PRESENTE' ? 'outro' : 'erro'

type Situacao = 'ENCONTRADO' | 'OUTRO_SETOR' | 'DESCONHECIDO' | 'SEM_PLAQUETA' | 'BAIXADO_PRESENTE'
type Bem = { id: string; plaqueta: string | null; descricao: string; categoria: string | null; estado_conservacao: string | null; foto_url: string | null; marca?: string | null; modelo?: string | null; situacao?: Situacao | null; lido_em?: string | null }
type Leitura = { id: string; situacao: Situacao; origem: string; codigo_lido: string; setor_cadastro_nome: string | null; estado_conservacao: string | null; observacao: string | null; created_at: string; foto_url?: string | null; bem: Bem | null }
type Dados = {
  orgao: { nome: string; logo_url: string | null }
  inventario: { id: string; nome: string; ano: number; status: 'ABERTO' | 'FECHADO' }
  setor: { id: string; nome: string; responsavel_nome: string | null; status: 'PENDENTE' | 'EM_ANDAMENTO' | 'FECHADO'; fechado_em: string | null; fechado_por: string | null; tem_cadastro: boolean }
  categorias: { id: string; nome: string }[]
  /** Outros setores da mesma pessoa nesta campanha (vazio quando é só um). */
  setores_do_responsavel?: { token: string; nome: string; status: 'PENDENTE' | 'EM_ANDAMENTO' | 'FECHADO'; atual: boolean }[]
  bens: Bem[]
  leituras: Leitura[]
}
type Resultado = { situacao: Situacao; repetida?: boolean; leitura?: { id: string; foto_url?: string | null; estado_conservacao?: string | null } | null; bem: { id: string; plaqueta: string | null; descricao: string; categoria: string | null; setor_nome: string | null; status: string; foto_url: string | null; estado_conservacao?: string | null } | null; codigo?: string; offline?: boolean; erro?: string }
type ItemFila = { codigo: string; origem: 'QR' | 'RFID' | 'MANUAL'; estado_conservacao?: string; observacao?: string; lido_por?: string; t: number }

const SIT: Record<Situacao, { label: string; cor: string; icone: React.ReactNode; dica: string }> = {
  ENCONTRADO: { label: 'Encontrado', cor: 'bg-emerald-500', icone: <CheckCircle2 className="w-7 h-7" />, dica: 'Bem deste setor, conferido.' },
  OUTRO_SETOR: { label: 'De outro setor', cor: 'bg-amber-500', icone: <AlertTriangle className="w-7 h-7" />, dica: 'Está cadastrado em outro setor. A comissão vai avaliar a transferência.' },
  DESCONHECIDO: { label: 'Não cadastrado', cor: 'bg-rose-500', icone: <HelpCircle className="w-7 h-7" />, dica: 'Este código não corresponde a nenhum bem. Se for um bem sem plaqueta, use "Sem plaqueta".' },
  SEM_PLAQUETA: { label: 'Cadastrado agora', cor: 'bg-sky-500', icone: <PackagePlus className="w-7 h-7" />, dica: 'Bem cadastrado na conferência. A comissão vai emitir a plaqueta.' },
  BAIXADO_PRESENTE: { label: 'Baixado, mas presente', cor: 'bg-purple-500', icone: <AlertTriangle className="w-7 h-7" />, dica: 'Este bem consta como baixado no cadastro e ainda está aqui.' },
}

const ESTADOS = [
  { v: 'BOM', l: 'Bom' },
  { v: 'REGULAR', l: 'Regular' },
  { v: 'RUIM', l: 'Ruim' },
  { v: 'INSERVIVEL', l: 'Inservível' },
]

function chaveFila(token: string) { return `inventario_fila_${token}` }

export default function ConferenciaSetorPage() {
  const params = useParams()
  const token = String(params.token || '').toLowerCase()

  const [dados, setDados] = useState<Dados | null>(null)
  const [erroCarga, setErroCarga] = useState('')
  const [aba, setAba] = useState<'pendentes' | 'lidos' | 'divergencias'>('pendentes')
  const [busca, setBusca] = useState('')
  const [scannerAberto, setScannerAberto] = useState(false)
  const [modoTeclado, setModoTeclado] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fila, setFila] = useState<ItemFila[]>([])
  const [online, setOnline] = useState(true)
  const [nome, setNome] = useState('')
  const [modalPlaqueta, setModalPlaqueta] = useState(false)
  const [modalSemPlaqueta, setModalSemPlaqueta] = useState(false)
  const [modalFechar, setModalFechar] = useState(false)
  const [plaquetaDigitada, setPlaquetaDigitada] = useState('')
  const [novoBem, setNovoBem] = useState({ descricao: '', categoria_id: '', estado_conservacao: 'BOM', marca: '', modelo: '', observacao: '' })
  const [fecharForm, setFecharForm] = useState({ nome: '', observacoes: '' })
  const [erroAcao, setErroAcao] = useState('')
  const tecladoRef = useRef<HTMLInputElement>(null)
  const ultimaLeitura = useRef<{ codigo: string; t: number }>({ codigo: '', t: 0 })
  /** Estado escolhido no cartão: só é salvo ao confirmar. */
  const [estadoSel, setEstadoSel] = useState<string | null>(null)
  const [salvandoCartao, setSalvandoCartao] = useState(false)
  const [erroCartao, setErroCartao] = useState('')
  /** Digitação em sequência: ao fechar o cartão, volta para o campo de digitar. */
  const sequenciaDigitada = useRef(false)
  /** Bem tocado na lista de pendentes, aguardando confirmação. */
  const [previa, setPrevia] = useState<Bem | null>(null)
  const [estadoPrevia, setEstadoPrevia] = useState<string | null>(null)
  /** Aviso rápido que não bloqueia a tela (ex.: conferido pela lista). */
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null)
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mostrarAviso = (texto: string, tom: 'ok' | 'erro' = 'ok') => {
    setAviso({ texto, tom })
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(null), 2800)
  }

  /**
   * Sons gerados no aparelho (Web Audio, sem arquivo, funciona offline):
   * bipe agudo = do setor, dois tons = outro setor / baixado, grave = desconhecido
   * ou erro. No iPhone o áudio só toca depois de um toque: o contexto é criado
   * nos botões de ação. Vibração curta acompanha no Android.
   */
  const [mudo, setMudo] = useState(false)
  const mudoRef = useRef(false) // lido dentro de callbacks memoizados
  const audioCtx = useRef<AudioContext | null>(null)
  useEffect(() => { try { const m = localStorage.getItem(LS_MUDO) === '1'; setMudo(m); mudoRef.current = m } catch { /* privado */ } }, [])
  useEffect(() => { mudoRef.current = mudo }, [mudo])
  const desbloquearAudio = () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      if (!audioCtx.current) audioCtx.current = new Ctx()
      if (audioCtx.current!.state === 'suspended') audioCtx.current!.resume()
    } catch { /* sem áudio */ }
  }
  const alternarMudo = () => {
    desbloquearAudio()
    setMudo((m) => { try { localStorage.setItem(LS_MUDO, m ? '0' : '1') } catch { /* privado */ } return !m })
  }
  const tocar = (som: Som) => {
    if (mudoRef.current) return
    try { navigator.vibrate?.(som === 'ok' ? 40 : som === 'outro' ? [40, 60, 40] : [120, 40, 120]) } catch { /* sem vibração */ }
    const ctx = audioCtx.current
    if (!ctx || ctx.state !== 'running') return
    const nota = (freq: number, inicio: number, dur: number, tipo: OscillatorType = 'sine', ganho = 0.25) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = tipo; o.frequency.value = freq
      g.gain.setValueAtTime(0, ctx.currentTime + inicio)
      g.gain.linearRampToValueAtTime(ganho, ctx.currentTime + inicio + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + dur)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + inicio); o.stop(ctx.currentTime + inicio + dur + 0.02)
    }
    if (som === 'ok') nota(1046, 0, 0.09)
    else if (som === 'outro') { nota(660, 0, 0.1); nota(520, 0.13, 0.14) }
    else nota(220, 0, 0.28, 'sawtooth', 0.18)
  }

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`${PUB}/inventario/${token}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.message || 'Link inválido ou expirado')
      }
      setDados(await res.json())
      setErroCarga('')
    } catch (e: any) {
      if (!dados) setErroCarga(e?.message || 'Não foi possível carregar a conferência')
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregar()
    try {
      setNome(localStorage.getItem(LS_NOME) || '')
      setFila(JSON.parse(localStorage.getItem(chaveFila(token)) || '[]'))
    } catch { /* privado */ }
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [carregar, token])

  const salvarFila = (itens: ItemFila[]) => {
    setFila(itens)
    try { localStorage.setItem(chaveFila(token), JSON.stringify(itens)) } catch { /* privado */ }
  }

  const postLeitura = useCallback(async (item: Omit<ItemFila, 't'>): Promise<Resultado> => {
    const res = await fetch(`${PUB}/inventario/${token}/leitura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, lido_por: item.lido_por || nome || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(json?.message || 'Erro ao registrar leitura'), { status: res.status })
    return json
  }, [token, nome])

  /** Reenvia o que ficou guardado sem internet. */
  const esvaziarFila = useCallback(async () => {
    if (!fila.length || !online) return
    const restante: ItemFila[] = []
    for (const item of fila) {
      try { await postLeitura(item) } catch (e: any) {
        if (e?.status) continue // resposta do servidor (ex.: campanha fechada): descarta
        restante.push(item)      // sem rede: mantém
      }
    }
    salvarFila(restante)
    carregar()
  }, [fila, online, postLeitura, carregar]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (online && fila.length) esvaziarFila() }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  const registrar = useCallback(async (codigo: string, origem: 'QR' | 'RFID' | 'MANUAL', extras?: { estado_conservacao?: string; observacao?: string }, opcoes?: { semCartao?: boolean; rotulo?: string }) => {
    const limpo = String(codigo || '').trim()
    if (!limpo) return
    const agora = Date.now()
    if (!extras && ultimaLeitura.current.codigo === limpo && agora - ultimaLeitura.current.t < 2500) return
    ultimaLeitura.current = { codigo: limpo, t: agora }
    setEnviando(true)
    setErroAcao('')
    try {
      const r = await postLeitura({ codigo: limpo, origem, ...extras })
      tocar(somDe(r.situacao))
      if (opcoes?.semCartao && r.situacao === 'ENCONTRADO') mostrarAviso(`✓ ${opcoes.rotulo || limpo} conferido`)
      else setResultado({ ...r, codigo: limpo })
      carregar()
    } catch (e: any) {
      if (e?.status) {
        setResultado({ situacao: 'DESCONHECIDO', bem: null, codigo: limpo, erro: e.message })
        tocar('erro')
      } else {
        salvarFila([...fila, { codigo: limpo, origem, ...extras, lido_por: nome || undefined, t: agora }])
        setResultado({ situacao: 'ENCONTRADO', bem: null, codigo: limpo, offline: true })
        tocar('outro')
      }
    } finally {
      setEnviando(false)
    }
  }, [postLeitura, carregar, fila, nome]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cada cartão novo começa com o estado já gravado na leitura ou, se não houver, o do cadastro
  useEffect(() => {
    setEstadoSel(resultado?.leitura?.estado_conservacao ?? resultado?.bem?.estado_conservacao ?? null)
    setErroCartao('')
  }, [resultado])

  const fecharCartao = () => {
    setResultado(null)
    if (sequenciaDigitada.current) setModalPlaqueta(true)
  }

  /** Confirma o cartão: grava o estado só se ele mudou em relação ao que já estava salvo. */
  const confirmarCartao = async () => {
    if (!resultado || salvandoCartao) return
    const salvo = resultado.leitura?.estado_conservacao ?? resultado.bem?.estado_conservacao ?? null
    const leituraId = resultado.leitura?.id
    if (!estadoSel || estadoSel === salvo || !leituraId || !resultado.bem) { fecharCartao(); return }
    setSalvandoCartao(true)
    setErroCartao('')
    try {
      const res = await fetch(`${PUB}/inventario/${token}/leituras/${leituraId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_conservacao: estadoSel }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErroCartao(json?.message || 'Não foi possível salvar o estado'); return }
      carregar()
      fecharCartao()
    } catch {
      // sem internet: vai na fila como releitura com o estado, que atualiza a mesma leitura
      salvarFila([...fila, { codigo: resultado.bem.plaqueta || resultado.bem.id, origem: 'MANUAL', estado_conservacao: estadoSel, lido_por: nome || undefined, t: Date.now() }])
      fecharCartao()
    } finally {
      setSalvandoCartao(false)
    }
  }

  /** Leitura feita por engano: apaga e o bem volta a contar como pendente. */
  const desfazerLeitura = async () => {
    const leituraId = resultado?.leitura?.id
    if (!resultado || !leituraId || salvandoCartao) return
    setSalvandoCartao(true)
    setErroCartao('')
    try {
      const res = await fetch(`${PUB}/inventario/${token}/leituras/${leituraId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErroCartao(json?.message || 'Não foi possível desfazer'); return }
      if (resultado.codigo) lidosSessao.current.delete(resultado.codigo.toUpperCase())
      ultimaLeitura.current = { codigo: '', t: 0 }
      mostrarAviso('Leitura desfeita', 'erro')
      carregar()
      fecharCartao()
    } catch {
      setErroCartao('Sem internet: não foi possível desfazer agora')
    } finally {
      setSalvandoCartao(false)
    }
  }

  // Enter confirma o cartão (digitação e leitor em sequência)
  useEffect(() => {
    if (!resultado) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); confirmarCartao() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const confirmarPrevia = () => {
    if (!previa) return
    const b = previa
    const extras = estadoPrevia && estadoPrevia !== b.estado_conservacao ? { estado_conservacao: estadoPrevia } : undefined
    setPrevia(null)
    registrar(b.plaqueta || b.id, 'MANUAL', extras, { semCartao: true, rotulo: b.plaqueta || b.descricao })
  }

  const onScan = (codes: { rawValue: string }[]) => {
    const raw = codes?.[0]?.rawValue
    if (!raw || enviando) return
    capturar(raw, 'QR')
  }

  /**
   * Modo varredura: as leituras (RFID, barras ou câmera) entram numa fila local
   * e sobem em lotes a cada 1,5 s para a rota de lote; nada de cartão por tag.
   * Ao encerrar, a sala é fechada com o resumo de irregularidades.
   */
  type ResultadoVarredura = { codigo: string; situacao?: Situacao; repetida?: boolean; erro?: string; bem?: { plaqueta: string | null; descricao: string; setor_nome: string | null } | null }
  const [varrendo, setVarrendo] = useState(false)
  const [varreduraLog, setVarreduraLog] = useState<ResultadoVarredura[]>([])
  const [varreduraCont, setVarreduraCont] = useState({ lidas: 0, encontrados: 0, outro_setor: 0, desconhecidos: 0, baixados: 0, repetidas: 0 })
  const [enviandoLote, setEnviandoLote] = useState(false)
  const [resumoVarredura, setResumoVarredura] = useState<null | { ausentes: Bem[]; outro_setor: Leitura[]; desconhecidos: Leitura[]; baixados: Leitura[] }>(null)
  const bufferVarredura = useRef<string[]>([])
  const varrendoRef = useRef(false)

  const enviarLote = useCallback(async () => {
    if (!bufferVarredura.current.length || enviandoLote) return
    const codigos = bufferVarredura.current.splice(0, 200)
    setEnviandoLote(true)
    try {
      const res = await fetch(`${PUB}/inventario/${token}/leituras-lote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigos, origem: 'RFID', lido_por: nome || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw Object.assign(new Error(json?.message || 'Erro no lote'), { status: res.status })
      const rs: ResultadoVarredura[] = json.resultados || []
      const novas = rs.filter((r) => !r.repetida)
      if (novas.length) tocar(novas.some((r) => !r.situacao || r.situacao === 'DESCONHECIDO') ? 'erro' : novas.some((r) => r.situacao === 'OUTRO_SETOR' || r.situacao === 'BAIXADO_PRESENTE') ? 'outro' : 'ok')
      setVarreduraLog((l) => [...rs.slice().reverse(), ...l].slice(0, 200))
      setVarreduraCont((c) => ({
        lidas: c.lidas + (json.novas || 0),
        encontrados: c.encontrados + rs.filter((r) => r.situacao === 'ENCONTRADO' && !r.repetida).length,
        outro_setor: c.outro_setor + rs.filter((r) => r.situacao === 'OUTRO_SETOR' && !r.repetida).length,
        desconhecidos: c.desconhecidos + rs.filter((r) => r.situacao === 'DESCONHECIDO' && !r.repetida).length,
        baixados: c.baixados + rs.filter((r) => r.situacao === 'BAIXADO_PRESENTE' && !r.repetida).length,
        repetidas: c.repetidas + (json.repetidas || 0),
      }))
    } catch (e: any) {
      if (e?.status) {
        setErroAcao(e.message)
      } else {
        // sem internet: cada código vai para a fila normal e sobe depois
        const agora = Date.now()
        salvarFila([...fila, ...codigos.map((codigo) => ({ codigo, origem: 'RFID' as const, lido_por: nome || undefined, t: agora }))])
        setVarreduraLog((l) => [...codigos.map((codigo) => ({ codigo, erro: 'guardado sem internet' })).reverse(), ...l].slice(0, 200))
      }
    } finally {
      setEnviandoLote(false)
    }
  }, [token, nome, enviandoLote, fila]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!varrendo) return
    const t = setInterval(enviarLote, 1500)
    return () => clearInterval(t)
  }, [varrendo, enviarLote])

  const capturar = (codigo: string, origem: 'QR' | 'RFID' | 'MANUAL') => {
    const limpo = String(codigo || '').trim()
    if (!limpo) return
    if (!varrendoRef.current) { registrar(limpo, origem); return }
    const chave = limpo.toUpperCase()
    if (lidosSessao.current.has(chave)) { setVarreduraCont((c) => ({ ...c, repetidas: c.repetidas + 1 })); return }
    lidosSessao.current.add(chave)
    bufferVarredura.current.push(limpo)
  }

  const iniciarVarredura = () => {
    desbloquearAudio()
    setResumoVarredura(null)
    setVarreduraLog([])
    setVarreduraCont({ lidas: 0, encontrados: 0, outro_setor: 0, desconhecidos: 0, baixados: 0, repetidas: 0 })
    bufferVarredura.current = []
    varrendoRef.current = true
    setVarrendo(true)
    setModoTeclado(true)
    setAba('pendentes')
  }

  const encerrarVarredura = async () => {
    varrendoRef.current = false
    await enviarLote()
    // espera o lote em andamento terminar antes de fechar a sala
    for (let i = 0; i < 20 && (bufferVarredura.current.length || enviandoLote); i++) await new Promise((r) => setTimeout(r, 250))
    setVarrendo(false)
    try {
      const res = await fetch(`${PUB}/inventario/${token}`)
      if (res.ok) {
        const d: Dados = await res.json()
        setDados(d)
        setResumoVarredura({
          ausentes: d.bens.filter((b) => !b.situacao),
          outro_setor: d.leituras.filter((l) => l.situacao === 'OUTRO_SETOR'),
          desconhecidos: d.leituras.filter((l) => l.situacao === 'DESCONHECIDO'),
          baixados: d.leituras.filter((l) => l.situacao === 'BAIXADO_PRESENTE'),
        })
      }
    } catch { /* mantém a tela; o usuário pode recarregar */ }
  }

  /**
   * Modo leitor (coletor Chainway C66 com Keyboard Emulator, leitor Bluetooth
   * em modo HID, leitor de barras): cada leitura chega como texto + Enter.
   * Um leitor RFID repete a mesma tag várias vezes por segundo: o que já foi
   * registrado nesta sessão é ignorado sem ir ao servidor.
   */
  const lidosSessao = useRef<Set<string>>(new Set())
  const [contadorLeitor, setContadorLeitor] = useState({ novas: 0, repetidas: 0 })
  const onTeclado = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    e.preventDefault()
    const v = (e.currentTarget.value || '').trim()
    e.currentTarget.value = ''
    if (!v) return
    if (varrendoRef.current) { capturar(v, 'RFID'); return }
    const chave = v.toUpperCase()
    if (lidosSessao.current.has(chave)) {
      setContadorLeitor((c) => ({ ...c, repetidas: c.repetidas + 1 }))
      return
    }
    lidosSessao.current.add(chave)
    setContadorLeitor((c) => ({ ...c, novas: c.novas + 1 }))
    registrar(v, 'RFID')
  }

  const cadastrarSemPlaqueta = async () => {
    setErroAcao('')
    try {
      const res = await fetch(`${PUB}/inventario/${token}/sem-plaqueta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novoBem, categoria_id: novoBem.categoria_id || undefined, lido_por: nome || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || 'Erro ao cadastrar')
      setModalSemPlaqueta(false)
      setNovoBem({ descricao: '', categoria_id: '', estado_conservacao: 'BOM', marca: '', modelo: '', observacao: '' })
      setResultado(json)
      carregar()
    } catch (e: any) { setErroAcao(e.message) }
  }

  const fecharSetor = async () => {
    setErroAcao('')
    try {
      const res = await fetch(`${PUB}/inventario/${token}/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fecharForm),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || 'Erro ao finalizar')
      setModalFechar(false)
      carregar()
    } catch (e: any) { setErroAcao(e.message) }
  }

  const guardarNome = (v: string) => {
    setNome(v)
    try { localStorage.setItem(LS_NOME, v) } catch { /* privado */ }
  }

  /**
   * Foto da leitura: tirada no cartão de resultado e anexada à leitura
   * recém-registrada (fica visível na comissão e na página do QR).
   */
  const inputFotoLeitura = useRef<HTMLInputElement>(null)
  const [fotoLeitura, setFotoLeitura] = useState<{ leituraId: string; url: string | null; enviando: boolean; erro: string }>({ leituraId: '', url: null, enviando: false, erro: '' })
  useEffect(() => {
    // novo resultado: zera o estado da foto (mantém a que veio do servidor, se houver)
    setFotoLeitura({ leituraId: resultado?.leitura?.id || '', url: resultado?.leitura?.foto_url || null, enviando: false, erro: '' })
  }, [resultado?.leitura?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviarFotoLeitura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const leituraId = resultado?.leitura?.id
    if (!file || !leituraId) return
    setFotoLeitura({ leituraId, url: null, enviando: true, erro: '' })
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (nome) fd.append('lido_por', nome)
      const res = await fetch(`${PUB}/inventario/${token}/leituras/${leituraId}/foto`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || 'Erro ao enviar a foto')
      setFotoLeitura({ leituraId, url: json.foto_url || null, enviando: false, erro: '' })
      carregar()
    } catch (err: any) {
      setFotoLeitura({ leituraId, url: null, enviando: false, erro: err?.message || 'Não foi possível enviar a foto' })
    }
  }

  // ─── derivados ──────────────────────────────────────────────────
  const pendentes = useMemo(() => (dados?.bens || []).filter((b) => !b.situacao), [dados])
  const lidos = useMemo(() => (dados?.bens || []).filter((b) => b.situacao === 'ENCONTRADO'), [dados])
  const divergencias = useMemo(() => (dados?.leituras || []).filter((l) => l.situacao !== 'ENCONTRADO'), [dados])
  const filtrar = (lista: Bem[]) => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((b) => (b.plaqueta || '').toLowerCase().includes(q) || b.descricao.toLowerCase().includes(q))
  }
  const total = dados?.bens.length || 0
  const pct = total ? Math.round((lidos.length / total) * 100) : 0
  const fechado = dados?.setor.status === 'FECHADO' || dados?.inventario.status === 'FECHADO'

  useEffect(() => { if (modoTeclado) tecladoRef.current?.focus() }, [modoTeclado])
  // Depois de fechar o cartão de resultado, o foco volta ao campo do leitor
  useEffect(() => { if (modoTeclado && !resultado) tecladoRef.current?.focus() }, [resultado, modoTeclado])

  // ─── telas de erro / carga ──────────────────────────────────────
  if (erroCarga) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <AlertTriangle className="w-12 h-12 mx-auto text-rose-400 mb-4" />
          <h1 className="text-xl font-bold mb-2">Link inválido</h1>
          <p className="text-slate-400 text-sm">{erroCarga}</p>
        </div>
      </div>
    )
  }
  if (!dados) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-amber-400" /></div>
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-32">
      {/* Cabeçalho */}
      <header className="bg-[#1f3a5f] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-blue-200 truncate">{dados.orgao.nome} · Inventário {dados.inventario.ano}</p>
            {(dados.setores_do_responsavel?.length || 0) > 1 ? (
              <label className="block">
                <span className="sr-only">Trocar de setor</span>
                <select
                  value={token}
                  onChange={(e) => {
                    const destino = e.target.value
                    if (destino === token) return
                    if (fila.length && !confirm(`Há ${fila.length} leitura(s) guardada(s) sem internet neste setor. Elas continuam guardadas e são enviadas quando você voltar a ele. Trocar mesmo assim?`)) return
                    window.location.href = `/inventario/${destino}`
                  }}
                  className="w-full max-w-full bg-transparent text-lg font-bold leading-tight truncate border-b border-dashed border-blue-300/60 focus:outline-none pr-6"
                >
                  {dados.setores_do_responsavel!.map((x) => (
                    <option key={x.token} value={x.token} className="text-slate-900 text-base font-normal">
                      {x.nome}{x.status === 'FECHADO' ? ' ✓ finalizado' : x.status === 'EM_ANDAMENTO' ? ' · em andamento' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-blue-200">Você confere {dados.setores_do_responsavel!.length} setores · toque no nome para trocar</span>
              </label>
            ) : (
              <h1 className="text-lg font-bold leading-tight truncate">{dados.setor.nome}</h1>
            )}
          </div>
          {!online && <span title="Sem internet" className="text-amber-300"><WifiOff className="w-5 h-5" /></span>}
          <button onClick={alternarMudo} aria-label={mudo ? 'Ativar sons' : 'Silenciar'} className={`p-1.5 rounded-lg ${mudo ? 'text-slate-400' : 'text-amber-300'}`}>
            {mudo ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-blue-100 mb-1">
            <span>{lidos.length} de {total} conferidos</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-blue-950/60 overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {fila.length > 0 && (
          <button onClick={esvaziarFila} className="mt-2 w-full text-left text-xs bg-amber-500/20 border border-amber-400/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 shrink-0" /> {fila.length} leitura(s) guardada(s) sem internet. Toque para reenviar.
          </button>
        )}
        {fechado && (
          <div className="mt-2 text-xs bg-emerald-500/20 border border-emerald-400/40 rounded-lg px-3 py-2">
            Conferência finalizada{dados.setor.fechado_por ? ` por ${dados.setor.fechado_por}` : ''}{dados.setor.fechado_em ? ` em ${new Date(dados.setor.fechado_em).toLocaleString('pt-BR')}` : ''}.
          </div>
        )}
      </header>

      {/* Nome de quem confere */}
      {!fechado && !nome && (
        <div className="mx-4 mt-3 rounded-xl bg-slate-800 border border-slate-700 p-3">
          <label className="text-xs text-slate-400">Seu nome (fica registrado em cada leitura)</label>
          <input
            id="nome-conferente"
            className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-sm"
            placeholder={dados.setor.responsavel_nome || 'Nome completo'}
            defaultValue={dados.setor.responsavel_nome || ''}
            onBlur={(e) => guardarNome(e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') guardarNome((e.target as HTMLInputElement).value.trim()) }}
          />
        </div>
      )}

      {/* Modo leitor (RFID/teclado) */}
      {modoTeclado && !fechado && (
        <div className="mx-4 mt-3 rounded-xl bg-slate-800 border border-amber-500/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-2"><Keyboard className="w-4 h-4 text-amber-400" /> Leitor conectado (modo teclado)</p>
            <button onClick={() => setModoTeclado(false)} className="text-slate-400"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Mantenha este campo em foco e aperte o gatilho do coletor (Chainway: ative o Keyboard Emulator com Enter ao final). Cada tag RFID ou código de barras lido é registrado; repetidas são ignoradas.</p>
          <input
            id="entrada-leitor"
            ref={tecladoRef}
            className="mt-2 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-3 text-base font-mono"
            placeholder="Aguardando leitura…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="none"
            onKeyDown={onTeclado}
            onBlur={() => setTimeout(() => { if (modoTeclado && !resultado && !modalPlaqueta && !modalSemPlaqueta && !modalFechar) tecladoRef.current?.focus() }, 150)}
          />
          <p className="text-[11px] text-slate-500 mt-1">Nesta sessão: {contadorLeitor.novas} leitura(s) nova(s), {contadorLeitor.repetidas} repetida(s) ignorada(s).</p>
        </div>
      )}

      {/* Varredura de sala ao vivo */}
      {varrendo && (
        <section className="px-4 mt-4 space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 py-2"><div className="text-2xl font-bold text-emerald-300">{varreduraCont.encontrados}</div><div className="text-[11px] text-emerald-200">do setor</div></div>
            <div className="rounded-xl bg-amber-500/20 border border-amber-500/40 py-2"><div className="text-2xl font-bold text-amber-300">{varreduraCont.outro_setor}</div><div className="text-[11px] text-amber-200">outro setor</div></div>
            <div className="rounded-xl bg-rose-500/20 border border-rose-500/40 py-2"><div className="text-2xl font-bold text-rose-300">{varreduraCont.desconhecidos}</div><div className="text-[11px] text-rose-200">desconhecidas</div></div>
            <div className="rounded-xl bg-slate-700 py-2"><div className="text-2xl font-bold">{pendentes.length - varreduraCont.encontrados < 0 ? 0 : pendentes.length - varreduraCont.encontrados}</div><div className="text-[11px] text-slate-300">faltam</div></div>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-2">
            {enviandoLote || bufferVarredura.current.length ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            Varrendo a sala: aperte o gatilho e passe o leitor pelos bens. {varreduraCont.repetidas > 0 ? `${varreduraCont.repetidas} leitura(s) repetida(s) ignorada(s).` : ''}
          </p>
          <div className="rounded-xl bg-slate-800 border border-slate-700 divide-y divide-slate-700 max-h-[45vh] overflow-y-auto">
            {varreduraLog.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">Nenhuma tag lida ainda.</p>}
            {varreduraLog.map((r, i) => (
              <div key={`${r.codigo}-${i}`} className="px-3 py-2 flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.erro ? 'bg-slate-500' : r.situacao === 'ENCONTRADO' ? 'bg-emerald-400' : r.situacao === 'OUTRO_SETOR' ? 'bg-amber-400' : r.situacao === 'BAIXADO_PRESENTE' ? 'bg-purple-400' : 'bg-rose-400'}`} />
                <span className="flex-1 min-w-0 truncate">
                  {r.bem ? <><span className="font-mono text-amber-300">{r.bem.plaqueta || '—'}</span> {r.bem.descricao}</> : <span className="font-mono text-slate-300">{r.codigo}</span>}
                  {r.situacao === 'OUTRO_SETOR' && r.bem?.setor_nome && <span className="text-xs text-amber-300"> · de {r.bem.setor_nome}</span>}
                  {r.erro && <span className="text-xs text-slate-400"> · {r.erro}</span>}
                </span>
                {r.repetida && <span className="text-[10px] text-slate-500">já lido</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Resultado da sala após a varredura */}
      {!varrendo && resumoVarredura && (
        <section className="px-4 mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Resultado da sala</h2>
            <button onClick={() => setResumoVarredura(null)} className="text-xs text-slate-400 underline underline-offset-2">ver listas</button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 py-2"><div className="text-2xl font-bold text-emerald-300">{lidos.length}</div><div className="text-[11px] text-emerald-200">conferidos de {total}</div></div>
            <div className={`rounded-xl py-2 border ${resumoVarredura.ausentes.length ? 'bg-rose-500/20 border-rose-500/40' : 'bg-slate-700 border-slate-600'}`}><div className={`text-2xl font-bold ${resumoVarredura.ausentes.length ? 'text-rose-300' : ''}`}>{resumoVarredura.ausentes.length}</div><div className="text-[11px] text-slate-300">não localizados</div></div>
          </div>
          {resumoVarredura.ausentes.length > 0 && (
            <div className="rounded-xl bg-slate-800 border border-rose-700/50">
              <div className="px-3 py-2 text-sm font-semibold text-rose-300">Não localizados na sala</div>
              <div className="divide-y divide-slate-700">
                {resumoVarredura.ausentes.map((b) => (
                  <div key={b.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                    <span className="font-mono text-amber-300 w-16 shrink-0">{b.plaqueta || '—'}</span>
                    <span className="flex-1 min-w-0 truncate">{b.descricao}</span>
                    {!fechado && <button onClick={() => registrar(b.plaqueta || b.id, 'MANUAL')} className="text-xs bg-slate-700 rounded-lg px-2 py-1">achei</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {resumoVarredura.outro_setor.length > 0 && (
            <div className="rounded-xl bg-slate-800 border border-amber-700/50">
              <div className="px-3 py-2 text-sm font-semibold text-amber-300">Bens de outro setor encontrados aqui</div>
              <div className="divide-y divide-slate-700">
                {resumoVarredura.outro_setor.map((l) => (
                  <div key={l.id} className="px-3 py-2 text-sm">
                    <span className="font-mono text-amber-300">{l.bem?.plaqueta || '—'}</span> {l.bem?.descricao}
                    <div className="text-xs text-slate-400">cadastrado em {l.setor_cadastro_nome || '?'} · a comissão decide a transferência</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {resumoVarredura.desconhecidos.length > 0 && (
            <div className="rounded-xl bg-slate-800 border border-rose-700/50">
              <div className="px-3 py-2 text-sm font-semibold text-rose-300">Tags que ninguém conhece</div>
              <div className="divide-y divide-slate-700">
                {resumoVarredura.desconhecidos.map((l) => (
                  <div key={l.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                    <span className="font-mono text-slate-300 flex-1 min-w-0 truncate">{l.codigo_lido}</span>
                    {!fechado && <button onClick={() => { setNovoBem((n) => ({ ...n, observacao: `Tag lida na varredura: ${l.codigo_lido}` })); setModalSemPlaqueta(true) }} className="text-xs bg-slate-700 rounded-lg px-2 py-1">cadastrar</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {resumoVarredura.baixados.length > 0 && (
            <div className="rounded-xl bg-slate-800 border border-purple-700/50">
              <div className="px-3 py-2 text-sm font-semibold text-purple-300">Baixados, mas ainda na sala</div>
              <div className="divide-y divide-slate-700">
                {resumoVarredura.baixados.map((l) => (
                  <div key={l.id} className="px-3 py-2 text-sm"><span className="font-mono text-amber-300">{l.bem?.plaqueta || '—'}</span> {l.bem?.descricao}</div>
                ))}
              </div>
            </div>
          )}
          {resumoVarredura.ausentes.length === 0 && resumoVarredura.outro_setor.length === 0 && resumoVarredura.desconhecidos.length === 0 && resumoVarredura.baixados.length === 0 && (
            <p className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Sala conferida sem irregularidades.</p>
          )}
          {!fechado && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={iniciarVarredura} className="rounded-xl bg-slate-700 py-3 font-semibold text-sm">Varrer de novo</button>
              <button onClick={() => { setFecharForm({ nome: nome || dados.setor.responsavel_nome || '', observacoes: '' }); setModalFechar(true) }} className="rounded-xl bg-emerald-500 text-slate-900 py-3 font-bold text-sm">Finalizar setor</button>
            </div>
          )}
        </section>
      )}

      {/* Abas + busca */}
      {!varrendo && !resumoVarredura && (<>
      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-800 p-1 text-sm">
          {([
            ['pendentes', `Pendentes (${pendentes.length})`],
            ['lidos', `Conferidos (${lidos.length})`],
            ['divergencias', `Divergências (${divergencias.length})`],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} className={`rounded-lg py-2 px-1 truncate ${aba === k ? 'bg-[#1f3a5f] text-white font-semibold' : 'text-slate-300'}`}>{l}</button>
          ))}
        </div>
        {aba !== 'divergencias' && (
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input id="busca-bens" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por plaqueta ou descrição" className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 py-2.5 text-sm" />
          </div>
        )}
      </div>

      {/* Listas */}
      <main className="px-4 mt-3 space-y-2">
        {aba === 'pendentes' && (
          !dados.setor.tem_cadastro && total === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Este setor não tem bens cadastrados. Leia as plaquetas encontradas: cada leitura registra a presença do bem.</p>
          ) : filtrar(pendentes).length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{busca ? 'Nada encontrado.' : 'Todos os bens do setor foram conferidos.'}</p>
          ) : filtrar(pendentes).map((b) => (
            <button key={b.id} onClick={() => { if (fechado) return; desbloquearAudio(); setPrevia(b); setEstadoPrevia(b.estado_conservacao || null) }} className="w-full text-left rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 flex items-center gap-3">
              <span className="font-mono text-amber-300 text-sm w-16 shrink-0">{b.plaqueta || '—'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{b.descricao}</span>
                <span className="block text-xs text-slate-400 truncate">{[b.categoria, b.marca, b.modelo].filter(Boolean).join(' · ')}</span>
              </span>
              {!fechado && <span className="text-[11px] text-slate-400 shrink-0">conferir</span>}
            </button>
          ))
        )}
        {aba === 'lidos' && (
          filtrar(lidos).length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Nenhum bem conferido ainda.</p>
          : filtrar(lidos).map((b) => (
            <div key={b.id} className="rounded-xl bg-slate-800 border border-emerald-700/50 px-3 py-2.5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="font-mono text-emerald-300 text-sm w-16 shrink-0">{b.plaqueta || '—'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{b.descricao}</span>
                <span className="block text-xs text-slate-400">{b.lido_em ? new Date(b.lido_em).toLocaleString('pt-BR') : ''}{b.estado_conservacao ? ` · ${b.estado_conservacao.toLowerCase()}` : ''}</span>
              </span>
            </div>
          ))
        )}
        {aba === 'divergencias' && (
          divergencias.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Nenhuma divergência registrada.</p>
          : divergencias.map((l) => (
            <div key={l.id} className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 flex gap-3">
              {l.foto_url && (
                <a href={`${API_URL}${l.foto_url}`} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={`${API_URL}${l.foto_url}`} alt="" className="w-14 h-14 rounded-lg object-cover bg-slate-700" />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full text-white ${SIT[l.situacao].cor}`}>{SIT[l.situacao].label}</span>
                  <span className="text-xs text-slate-400">{new Date(l.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-sm mt-1">{l.bem ? `${l.bem.plaqueta || ''} ${l.bem.descricao}`.trim() : <span className="font-mono">{l.codigo_lido}</span>}</p>
                {l.setor_cadastro_nome && l.situacao === 'OUTRO_SETOR' && <p className="text-xs text-amber-300">Cadastrado em: {l.setor_cadastro_nome}</p>}
                {l.observacao && <p className="text-xs text-slate-400">{l.observacao}</p>}
              </div>
            </div>
          ))
        )}
      </main>
      </>)}

      {/* Barra de ações */}
      {!fechado && varrendo && (
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setScannerAberto(true)} className="rounded-2xl bg-slate-800 py-4 font-semibold flex items-center justify-center gap-2"><Camera className="w-5 h-5" /> Ler QR</button>
            <button onClick={encerrarVarredura} className="rounded-2xl bg-amber-500 text-slate-900 font-bold py-4 flex items-center justify-center gap-2"><ClipboardCheck className="w-5 h-5" /> Encerrar varredura</button>
          </div>
        </nav>
      )}
      {!fechado && !varrendo && !resumoVarredura && (
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            <button onClick={() => setModalPlaqueta(true)} className="rounded-xl bg-slate-800 py-2 text-[11px] flex flex-col items-center gap-1"><Keyboard className="w-5 h-5" />Digitar</button>
            <button onClick={() => { desbloquearAudio(); setModoTeclado((v) => !v) }} className={`rounded-xl py-2 text-[11px] flex flex-col items-center gap-1 ${modoTeclado ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-800'}`}><ScanLine className="w-5 h-5" />Leitor</button>
            <button onClick={iniciarVarredura} className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 py-2 text-[11px] flex flex-col items-center gap-1"><RefreshCw className="w-5 h-5" />Varrer sala</button>
            <button onClick={() => setModalSemPlaqueta(true)} className="rounded-xl bg-slate-800 py-2 text-[11px] flex flex-col items-center gap-1"><PackagePlus className="w-5 h-5" />Sem plaq.</button>
            <button onClick={() => { setFecharForm({ nome: nome || dados.setor.responsavel_nome || '', observacoes: '' }); setModalFechar(true) }} className="rounded-xl bg-slate-800 py-2 text-[11px] flex flex-col items-center gap-1"><ClipboardCheck className="w-5 h-5" />Finalizar</button>
          </div>
          <button onClick={() => { desbloquearAudio(); setScannerAberto(true) }} className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-4 flex items-center justify-center gap-2 text-base">
            <Camera className="w-6 h-6" /> Ler plaqueta (QR)
          </button>
        </nav>
      )}

      {/* Scanner */}
      {scannerAberto && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 text-white bg-black/80 pt-[max(16px,env(safe-area-inset-top))]">
            <h2 className="font-bold flex items-center gap-2"><Camera className="w-5 h-5" /> Aponte para o QR da plaqueta</h2>
            <button onClick={() => setScannerAberto(false)} className="p-2 rounded-full bg-white/10"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <Scanner
              onScan={onScan}
              onError={(err: unknown) => setErroAcao((err as Error)?.message || 'Erro ao acessar a câmera')}
              paused={enviando || (!!resultado && !varrendo)}
              constraints={{ facingMode: 'environment' }}
              components={{ torch: true }}
              styles={{ container: { width: '100%', height: '100%' }, video: { objectFit: 'cover' } }}
            />
            {enviando && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-amber-400" /></div>}
          </div>
          <div className="p-3 bg-black/80 text-center text-xs text-slate-300">{varrendo ? `Varredura: ${varreduraCont.lidas} lida(s) · a câmera segue aberta` : `${lidos.length} de ${total} conferidos · a câmera continua aberta para o próximo bem`}</div>
        </div>
      )}

      {/* Resultado da leitura */}
      {resultado && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60">
          <div className="w-full max-w-md bg-slate-800 rounded-t-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            {resultado.offline ? (
              <>
                <div className="flex items-center gap-3 text-amber-300"><WifiOff className="w-7 h-7" /><p className="font-bold text-lg">Guardado sem internet</p></div>
                <p className="text-sm text-slate-300 mt-2">A leitura <span className="font-mono">{resultado.codigo}</span> será enviada quando a conexão voltar.</p>
              </>
            ) : resultado.erro ? (
              <>
                <div className="flex items-center gap-3 text-rose-300"><AlertTriangle className="w-7 h-7" /><p className="font-bold text-lg">Não registrado</p></div>
                <p className="text-sm text-slate-300 mt-2">{resultado.erro}</p>
              </>
            ) : (
              <>
                <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-white ${SIT[resultado.situacao].cor}`}>
                  {SIT[resultado.situacao].icone}
                  <div>
                    <p className="font-bold text-lg leading-tight">{SIT[resultado.situacao].label}{resultado.repetida ? ' (já lido)' : ''}</p>
                    <p className="text-xs opacity-90">{SIT[resultado.situacao].dica}</p>
                  </div>
                </div>
                {resultado.bem ? (
                  <div className="mt-4 flex gap-3">
                    {resultado.bem.foto_url && <img src={`${API_URL}${resultado.bem.foto_url}`} alt="" className="w-16 h-16 rounded-lg object-cover bg-slate-700" />}
                    <div className="min-w-0">
                      <p className="font-mono text-amber-300">{resultado.bem.plaqueta || 'sem plaqueta'}</p>
                      <p className="font-semibold leading-snug">{resultado.bem.descricao}</p>
                      <p className="text-xs text-slate-400">{[resultado.bem.categoria, resultado.bem.setor_nome && `cadastrado em ${resultado.bem.setor_nome}`].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 font-mono text-sm text-slate-300 break-all">{resultado.codigo}</p>
                )}
                {resultado.bem && resultado.leitura?.id && (
                  <div className="mt-4 flex items-center gap-3">
                    <input ref={inputFotoLeitura} type="file" accept="image/*" capture="environment" className="hidden" onChange={enviarFotoLeitura} />
                    {fotoLeitura.url ? (
                      <a href={`${API_URL}${fotoLeitura.url}`} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={`${API_URL}${fotoLeitura.url}`} alt="Foto da leitura" className="w-16 h-16 rounded-lg object-cover bg-slate-700 border border-emerald-500/60" />
                      </a>
                    ) : fotoLeitura.enviando ? (
                      <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center shrink-0"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => inputFotoLeitura.current?.click()}
                        disabled={fotoLeitura.enviando}
                        className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 text-sm flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4 text-amber-300" />{fotoLeitura.enviando ? 'Enviando foto…' : fotoLeitura.url ? 'Fotografar de novo' : 'Fotografar'}
                      </button>
                      {fotoLeitura.erro && <p className="text-xs text-rose-300 mt-1">{fotoLeitura.erro}</p>}
                      {!fotoLeitura.erro && !fotoLeitura.url && !fotoLeitura.enviando && <p className="text-[11px] text-slate-500 mt-1">Opcional: registra o estado do bem nesta conferência.</p>}
                    </div>
                  </div>
                )}
                {resultado.bem && resultado.situacao !== 'DESCONHECIDO' && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-400 mb-1">Estado de conservação <span className="text-slate-500">· toque para escolher, salva ao confirmar</span></p>
                    <SeletorEstado valor={estadoSel} onChange={setEstadoSel} />
                  </div>
                )}
              </>
            )}
            {erroCartao && <p className="mt-3 text-sm text-rose-300">{erroCartao}</p>}
            {!resultado.offline && !resultado.erro && resultado.leitura?.id && !resultado.repetida && (
              <p className="mt-4 text-[11px] text-emerald-300/80 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Leitura registrada. Leu ou digitou errado? Toque em Desfazer.</p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {!resultado.offline && resultado.leitura?.id && !resultado.repetida ? (
                <button onClick={desfazerLeitura} disabled={salvandoCartao} className="rounded-xl bg-slate-700 text-slate-200 py-3 text-sm disabled:opacity-50">Desfazer</button>
              ) : <span />}
              <button onClick={confirmarCartao} disabled={salvandoCartao} className="col-span-2 rounded-xl bg-amber-500 text-slate-900 font-bold py-3 disabled:opacity-60 flex items-center justify-center gap-2">
                {salvandoCartao && <Loader2 className="w-4 h-4 animate-spin" />}
                {sequenciaDigitada.current ? 'Confirmar e digitar outro' : 'Confirmar e próximo'}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-500">Enter também confirma</p>
          </div>
        </div>
      )}

      {/* Aviso rápido, não bloqueia */}
      {aviso && (
        <div className={`fixed top-[max(12px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[70] rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${aviso.tom === 'ok' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-200 text-slate-900'}`}>
          {aviso.texto}
        </div>
      )}

      {/* Prévia: bem tocado na lista de pendentes, só conta depois de confirmar */}
      {previa && (
        <Modal titulo="Conferir este bem?" onClose={() => setPrevia(null)}>
          <div className="flex gap-3">
            {previa.foto_url && <img src={`${API_URL}${previa.foto_url}`} alt="" className="w-16 h-16 rounded-lg object-cover bg-slate-700" />}
            <div className="min-w-0">
              <p className="font-mono text-amber-300">{previa.plaqueta || 'sem plaqueta'}</p>
              <p className="font-semibold leading-snug">{previa.descricao}</p>
              <p className="text-xs text-slate-400">{[previa.categoria, previa.marca, previa.modelo].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4 mb-1">Estado de conservação</p>
          <SeletorEstado valor={estadoPrevia} onChange={setEstadoPrevia} />
          <p className="text-[11px] text-slate-500 mt-3">Confirme só se o bem está fisicamente à sua frente.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={() => setPrevia(null)} className="rounded-xl bg-slate-700 py-3 text-sm">Cancelar</button>
            <button onClick={confirmarPrevia} className="col-span-2 rounded-xl bg-amber-500 text-slate-900 font-bold py-3">Confirmar conferência</button>
          </div>
        </Modal>
      )}

      {/* Modal: digitar plaqueta */}
      {modalPlaqueta && (
        <Modal titulo="Digitar plaqueta ou código" onClose={() => { sequenciaDigitada.current = false; setModalPlaqueta(false) }}>
          <input id="plaqueta-digitada" autoFocus value={plaquetaDigitada} onChange={(e) => setPlaquetaDigitada(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!plaquetaDigitada.trim()) return; sequenciaDigitada.current = true; setModalPlaqueta(false); registrar(plaquetaDigitada, 'MANUAL'); setPlaquetaDigitada('') } }} placeholder="Ex.: 000482" inputMode="text" className="w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-3 text-lg font-mono" />
          <button onClick={() => { if (!plaquetaDigitada.trim()) return; sequenciaDigitada.current = true; setModalPlaqueta(false); registrar(plaquetaDigitada, 'MANUAL'); setPlaquetaDigitada('') }} className="mt-3 w-full rounded-xl bg-amber-500 text-slate-900 font-bold py-3">Registrar</button>
          <p className="mt-2 text-[11px] text-slate-400 text-center">Digite o tombo e aperte Enter. No cartão, Enter confirma e este campo volta para o próximo.</p>
        </Modal>
      )}

      {/* Modal: bem sem plaqueta */}
      {modalSemPlaqueta && (
        <Modal titulo="Bem sem plaqueta" onClose={() => setModalSemPlaqueta(false)}>
          <p className="text-xs text-slate-400 mb-3">O bem é cadastrado agora, já neste setor, e recebe o próximo número. A comissão imprime a plaqueta depois.</p>
          <div className="space-y-2">
            <input id="novo-descricao" value={novoBem.descricao} onChange={(e) => setNovoBem({ ...novoBem, descricao: e.target.value })} placeholder="Descrição (ex.: Cadeira giratória preta)" className="w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm" />
            <select id="novo-categoria" value={novoBem.categoria_id} onChange={(e) => setNovoBem({ ...novoBem, categoria_id: e.target.value })} className="w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm">
              <option value="">Categoria (opcional)</option>
              {dados.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input id="novo-marca" value={novoBem.marca} onChange={(e) => setNovoBem({ ...novoBem, marca: e.target.value })} placeholder="Marca" className="rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm" />
              <input id="novo-modelo" value={novoBem.modelo} onChange={(e) => setNovoBem({ ...novoBem, modelo: e.target.value })} placeholder="Modelo" className="rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ESTADOS.map((e) => (
                <button key={e.v} onClick={() => setNovoBem({ ...novoBem, estado_conservacao: e.v })} className={`rounded-lg py-2 text-xs ${novoBem.estado_conservacao === e.v ? 'bg-amber-500 text-slate-900 font-semibold' : 'bg-slate-700'}`}>{e.l}</button>
              ))}
            </div>
            <input id="novo-observacao" value={novoBem.observacao} onChange={(e) => setNovoBem({ ...novoBem, observacao: e.target.value })} placeholder="Observação (opcional)" className="w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm" />
          </div>
          {erroAcao && <p className="text-xs text-rose-300 mt-2">{erroAcao}</p>}
          <button onClick={cadastrarSemPlaqueta} disabled={novoBem.descricao.trim().length < 3} className="mt-3 w-full rounded-xl bg-amber-500 disabled:opacity-50 text-slate-900 font-bold py-3">Cadastrar e registrar</button>
        </Modal>
      )}

      {/* Modal: finalizar setor */}
      {modalFechar && (
        <Modal titulo="Finalizar conferência do setor" onClose={() => setModalFechar(false)}>
          <div className="text-sm space-y-1 mb-3">
            <p><span className="text-emerald-300 font-semibold">{lidos.length}</span> conferidos de {total}</p>
            {pendentes.length > 0 && <p><span className="text-rose-300 font-semibold">{pendentes.length}</span> não localizados (ficam registrados como divergência)</p>}
            {divergencias.length > 0 && <p><span className="text-amber-300 font-semibold">{divergencias.length}</span> divergência(s) para a comissão</p>}
          </div>
          <input id="fechar-nome" value={fecharForm.nome} onChange={(e) => setFecharForm({ ...fecharForm, nome: e.target.value })} placeholder="Nome de quem finaliza" className="w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm" />
          <textarea id="fechar-obs" value={fecharForm.observacoes} onChange={(e) => setFecharForm({ ...fecharForm, observacoes: e.target.value })} placeholder="Observações (opcional): bens emprestados, em conserto, etc." rows={3} className="mt-2 w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm" />
          <p className="text-xs text-slate-400 mt-2">Ao finalizar, declaro que conferi fisicamente os bens deste setor. A comissão pode reabrir se precisar.</p>
          {erroAcao && <p className="text-xs text-rose-300 mt-2">{erroAcao}</p>}
          <button onClick={fecharSetor} disabled={fecharForm.nome.trim().length < 3} className="mt-3 w-full rounded-xl bg-emerald-500 disabled:opacity-50 text-slate-900 font-bold py-3">Finalizar setor</button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md bg-slate-800 rounded-t-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">{titulo}</h2>
          <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Botões de estado de conservação com o escolhido destacado. Não salva nada sozinho. */
function SeletorEstado({ valor, onChange }: { valor: string | null; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Estado de conservação">
      {ESTADOS.map((e) => {
        const ativo = valor === e.v
        return (
          <button
            key={e.v}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(e.v)}
            className={`rounded-lg py-2.5 text-xs border transition-colors ${ativo ? 'bg-amber-500 border-amber-300 text-slate-900 font-bold' : 'bg-slate-700 border-transparent text-slate-200'}`}
          >
            {ativo ? '● ' : ''}{e.l}
          </button>
        )
      })}
    </div>
  )
}
