'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Save, Trash2, Settings, AlertTriangle, CheckCircle, Users, DollarSign, Building2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, adminFetch } from '@/lib/api';

interface Orgao {
  id: string;
  nome: string;
  cnpj: string;
}

interface ConfiguracaoAprovacao {
  id: string;
  nivel: number;
  nome: string;
  descricao: string | null;
  valor_minimo: number;
  valor_maximo: number | null;
  tipo_aprovador: string;
  perfis_permitidos: string[] | null;
  usuarios_aprovadores_ids: string[] | null;
  bloquear_auto_aprovacao: boolean;
  exigir_justificativa_aprovacao: boolean;
  exigir_justificativa_negacao: boolean;
  notificar_email_aprovador: boolean;
  notificar_email_solicitante: boolean;
  ativo: boolean;
}

const TIPOS_APROVADOR = {
  QUALQUER_USUARIO: 'Qualquer usuário com acesso ao módulo',
  PERFIL_ESPECIFICO: 'Usuários com perfil específico',
  USUARIO_ESPECIFICO: 'Usuários específicos',
  GESTOR_SETOR: 'Gestor do setor solicitante',
};

const PERFIS_DISPONIVEIS = [
  { codigo: 'ADMIN', nome: 'Administrador' },
  { codigo: 'GESTOR_ALMOXARIFADO', nome: 'Gestor de Almoxarifado' },
  { codigo: 'ORDENADOR_DESPESA', nome: 'Ordenador de Despesa' },
  { codigo: 'FISCAL', nome: 'Fiscal' },
];

export default function AdminConfiguracoesAprovacaoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [orgaoSelecionado, setOrgaoSelecionado] = useState<string>('');
  const [configuracoes, setConfiguracoes] = useState<ConfiguracaoAprovacao[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<ConfiguracaoAprovacao | null>(null);
  
  // Form state
  const [form, setForm] = useState({
    nivel: 1,
    nome: '',
    descricao: '',
    valor_minimo: 0,
    valor_maximo: '',
    tipo_aprovador: 'QUALQUER_USUARIO',
    perfis_permitidos: [] as string[],
    bloquear_auto_aprovacao: true,
    exigir_justificativa_aprovacao: false,
    exigir_justificativa_negacao: true,
    notificar_email_aprovador: true,
    notificar_email_solicitante: true,
  });

  useEffect(() => {
    carregarOrgaos();
  }, []);

  useEffect(() => {
    if (orgaoSelecionado) {
      carregarConfiguracoes();
    }
  }, [orgaoSelecionado]);

  const carregarOrgaos = async () => {
    try {
      setLoading(true);
      const response = await adminFetch(`${API_URL}/api/orgaos`);
      
      if (response.ok) {
        const data = await response.json();
        setOrgaos(Array.isArray(data) ? data : data.value || []);
      }
    } catch (error) {
      console.error('Erro ao carregar órgãos:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarConfiguracoes = async () => {
    if (!orgaoSelecionado) return;
    
    try {
      setLoading(true);
      const response = await adminFetch(`${API_URL}/api/almoxarifado/configuracoes/aprovacao?orgaoId=${orgaoSelecionado}`);
      
      if (response.ok) {
        const data = await response.json();
        setConfiguracoes(data);
      } else {
        setConfiguracoes([]);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      setConfiguracoes([]);
    } finally {
      setLoading(false);
    }
  };

  const criarConfiguracaoPadrao = async () => {
    if (!orgaoSelecionado) {
      alert('Selecione um órgão primeiro');
      return;
    }
    
    try {
      setSaving(true);
      const response = await adminFetch(`${API_URL}/api/almoxarifado/configuracoes/aprovacao/padrao?orgaoId=${orgaoSelecionado}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        await carregarConfiguracoes();
        alert('Configuração padrão criada com sucesso!');
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao criar configuração padrão:', error);
      alert('Erro ao criar configuração padrão');
    } finally {
      setSaving(false);
    }
  };

  const abrirModalNovo = () => {
    if (!orgaoSelecionado) {
      alert('Selecione um órgão primeiro');
      return;
    }
    
    setEditando(null);
    setForm({
      nivel: configuracoes.length + 1,
      nome: '',
      descricao: '',
      valor_minimo: 0,
      valor_maximo: '',
      tipo_aprovador: 'QUALQUER_USUARIO',
      perfis_permitidos: [],
      bloquear_auto_aprovacao: true,
      exigir_justificativa_aprovacao: false,
      exigir_justificativa_negacao: true,
      notificar_email_aprovador: true,
      notificar_email_solicitante: true,
    });
    setShowModal(true);
  };

  const abrirModalEditar = (config: ConfiguracaoAprovacao) => {
    setEditando(config);
    setForm({
      nivel: config.nivel,
      nome: config.nome,
      descricao: config.descricao || '',
      valor_minimo: Number(config.valor_minimo),
      valor_maximo: config.valor_maximo ? String(config.valor_maximo) : '',
      tipo_aprovador: config.tipo_aprovador,
      perfis_permitidos: config.perfis_permitidos || [],
      bloquear_auto_aprovacao: config.bloquear_auto_aprovacao,
      exigir_justificativa_aprovacao: config.exigir_justificativa_aprovacao,
      exigir_justificativa_negacao: config.exigir_justificativa_negacao,
      notificar_email_aprovador: config.notificar_email_aprovador,
      notificar_email_solicitante: config.notificar_email_solicitante,
    });
    setShowModal(true);
  };

  const salvarConfiguracao = async () => {
    if (!form.nome.trim()) {
      alert('Informe o nome da configuração');
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        ...form,
        valor_maximo: form.valor_maximo ? Number(form.valor_maximo) : null,
        perfis_permitidos: form.tipo_aprovador === 'PERFIL_ESPECIFICO' ? form.perfis_permitidos : null,
      };

      let response;
      if (editando) {
        response = await adminFetch(`${API_URL}/api/almoxarifado/configuracoes/aprovacao/${editando.id}?orgaoId=${orgaoSelecionado}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        response = await adminFetch(`${API_URL}/api/almoxarifado/configuracoes/aprovacao?orgaoId=${orgaoSelecionado}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        setShowModal(false);
        await carregarConfiguracoes();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const desativarConfiguracao = async (id: string) => {
    if (!confirm('Deseja realmente desativar esta configuração?')) {
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/api/almoxarifado/configuracoes/aprovacao/${id}?orgaoId=${orgaoSelecionado}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await carregarConfiguracoes();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao desativar:', error);
      alert('Erro ao desativar configuração');
    }
  };

  const formatarMoeda = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined) return 'Sem limite';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const togglePerfil = (codigo: string) => {
    setForm(prev => ({
      ...prev,
      perfis_permitidos: prev.perfis_permitidos.includes(codigo)
        ? prev.perfis_permitidos.filter(p => p !== codigo)
        : [...prev.perfis_permitidos, codigo],
    }));
  };

  const orgaoAtual = orgaos.find(o => o.id === orgaoSelecionado);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-7 w-7 text-blue-600" />
            Configuração de Aprovações
          </h1>
          <p className="text-gray-500 mt-1">
            Defina os níveis de aprovação para cada órgão
          </p>
        </div>
      </div>

      {/* Seletor de Órgão */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Selecione o Órgão
          </CardTitle>
          <CardDescription>
            Escolha o órgão para configurar os níveis de aprovação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={orgaoSelecionado} onValueChange={setOrgaoSelecionado}>
            <SelectTrigger className="w-full md:w-96">
              <SelectValue placeholder="Selecione um órgão..." />
            </SelectTrigger>
            <SelectContent>
              {orgaos.map((orgao) => (
                <SelectItem key={orgao.id} value={orgao.id}>
                  {orgao.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {orgaoSelecionado && (
        <>
          {/* Explicação */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">
                    Configurando aprovações para: <strong>{orgaoAtual?.nome}</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Cada nível define uma faixa de valor e quem pode aprovar</li>
                    <li>O sistema verifica automaticamente qual nível se aplica ao valor da requisição</li>
                    <li>Se não houver configuração, qualquer usuário com permissão de aprovador pode aprovar</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex justify-end gap-2">
            {configuracoes.length === 0 && (
              <Button variant="outline" onClick={criarConfiguracaoPadrao} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Criar Configuração Padrão
              </Button>
            )}
            <Button onClick={abrirModalNovo}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Nível
            </Button>
          </div>

          {/* Lista de Configurações */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : configuracoes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Settings className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Nenhuma configuração para este órgão
                </h3>
                <p className="text-gray-500 mb-4">
                  Crie níveis de aprovação ou use a configuração padrão
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={criarConfiguracaoPadrao} disabled={saving}>
                    Criar Configuração Padrão
                  </Button>
                  <Button onClick={abrirModalNovo}>
                    Criar Manualmente
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Níveis de Aprovação</CardTitle>
                <CardDescription>
                  Requisições serão encaminhadas conforme o valor e as regras definidas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Nível</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Faixa de Valor</TableHead>
                      <TableHead>Tipo de Aprovador</TableHead>
                      <TableHead className="text-center">Regras</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configuracoes.map((config) => (
                      <TableRow key={config.id} className={!config.ativo ? 'opacity-50' : ''}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {config.nivel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{config.nome}</p>
                            {config.descricao && (
                              <p className="text-xs text-gray-500">{config.descricao}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-gray-400" />
                            <span>{formatarMoeda(Number(config.valor_minimo))}</span>
                            <span className="text-gray-400">até</span>
                            <span>{formatarMoeda(config.valor_maximo)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">
                              {TIPOS_APROVADOR[config.tipo_aprovador as keyof typeof TIPOS_APROVADOR]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            {config.bloquear_auto_aprovacao && (
                              <Badge variant="outline" className="text-xs">Bloqueia auto-aprovação</Badge>
                            )}
                            {config.notificar_email_aprovador && (
                              <Badge variant="outline" className="text-xs bg-green-50">Email aprovador</Badge>
                            )}
                            {config.notificar_email_solicitante && (
                              <Badge variant="outline" className="text-xs bg-blue-50">Email solicitante</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {config.ativo ? (
                            <Badge className="bg-green-100 text-green-800">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirModalEditar(config)}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                            {config.ativo && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => desativarConfiguracao(config.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal de Edição/Criação */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar Nível de Aprovação' : 'Novo Nível de Aprovação'}
            </DialogTitle>
            <DialogDescription>
              Configure as regras para este nível de aprovação - {orgaoAtual?.nome}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Informações Básicas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nivel">Nível</Label>
                <Input
                  id="nivel"
                  type="number"
                  min="1"
                  value={form.nivel}
                  onChange={(e) => setForm({ ...form, nivel: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-gray-500 mt-1">Ordem de prioridade</p>
              </div>
              <div>
                <Label htmlFor="nome">Nome*</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Aprovação Gestor"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Descrição opcional"
                rows={2}
              />
            </div>

            {/* Faixa de Valor */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Faixa de Valor
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="valor_minimo">Valor Mínimo (R$)</Label>
                  <Input
                    id="valor_minimo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_minimo}
                    onChange={(e) => setForm({ ...form, valor_minimo: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="valor_maximo">Valor Máximo (R$)</Label>
                  <Input
                    id="valor_maximo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_maximo}
                    onChange={(e) => setForm({ ...form, valor_maximo: e.target.value })}
                    placeholder="Deixe vazio para sem limite"
                  />
                </div>
              </div>
            </div>

            {/* Tipo de Aprovador */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Quem pode aprovar
              </h4>
              
              <div className="mb-4">
                <Label>Tipo de Aprovador</Label>
                <Select
                  value={form.tipo_aprovador}
                  onValueChange={(value) => setForm({ ...form, tipo_aprovador: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS_APROVADOR).map(([codigo, nome]) => (
                      <SelectItem key={codigo} value={codigo}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Perfis permitidos (se tipo = PERFIL_ESPECIFICO) */}
              {form.tipo_aprovador === 'PERFIL_ESPECIFICO' && (
                <div>
                  <Label>Perfis Permitidos</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {PERFIS_DISPONIVEIS.map((perfil) => (
                      <div
                        key={perfil.codigo}
                        className={`p-2 border rounded cursor-pointer transition-colors ${
                          form.perfis_permitidos.includes(perfil.codigo)
                            ? 'bg-blue-50 border-blue-300'
                            : 'hover:bg-gray-100'
                        }`}
                        onClick={() => togglePerfil(perfil.codigo)}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.perfis_permitidos.includes(perfil.codigo)}
                            onChange={() => togglePerfil(perfil.codigo)}
                            className="rounded"
                          />
                          <span className="text-sm">{perfil.nome}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Opções Adicionais */}
            <div className="space-y-4">
              <h4 className="font-medium">Opções</h4>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Bloquear auto-aprovação</Label>
                  <p className="text-xs text-gray-500">Impede que o solicitante aprove sua própria requisição</p>
                </div>
                <Switch
                  checked={form.bloquear_auto_aprovacao}
                  onCheckedChange={(checked) => setForm({ ...form, bloquear_auto_aprovacao: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Exigir justificativa ao aprovar</Label>
                  <p className="text-xs text-gray-500">Obriga informar observação ao aprovar</p>
                </div>
                <Switch
                  checked={form.exigir_justificativa_aprovacao}
                  onCheckedChange={(checked) => setForm({ ...form, exigir_justificativa_aprovacao: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Exigir justificativa ao negar</Label>
                  <p className="text-xs text-gray-500">Obriga informar motivo ao negar</p>
                </div>
                <Switch
                  checked={form.exigir_justificativa_negacao}
                  onCheckedChange={(checked) => setForm({ ...form, exigir_justificativa_negacao: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificar aprovador por email</Label>
                  <p className="text-xs text-gray-500">Envia email quando há requisição pendente</p>
                </div>
                <Switch
                  checked={form.notificar_email_aprovador}
                  onCheckedChange={(checked) => setForm({ ...form, notificar_email_aprovador: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificar solicitante por email</Label>
                  <p className="text-xs text-gray-500">Envia email ao solicitante sobre o resultado</p>
                </div>
                <Switch
                  checked={form.notificar_email_solicitante}
                  onCheckedChange={(checked) => setForm({ ...form, notificar_email_solicitante: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarConfiguracao} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
