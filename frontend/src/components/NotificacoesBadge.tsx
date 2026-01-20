'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { API_URL, authFetch } from '@/lib/api';

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  prioridade: string;
  lida: boolean;
  link: string | null;
  created_at: string;
  entidade_tipo: string | null;
  entidade_id: string | null;
}

const TIPO_ICONS: Record<string, string> = {
  REQUISICAO_AGUARDANDO_APROVACAO: '📋',
  REQUISICAO_APROVADA: '✅',
  REQUISICAO_NEGADA: '❌',
  ORDEM_GERADA: '📦',
  ORDEM_ENVIADA: '📤',
  RECEBIMENTO_PENDENTE: '📥',
  SISTEMA: '💬',
  ALERTA: '⚠️',
};

const PRIORIDADE_COLORS: Record<string, string> = {
  URGENTE: 'border-l-red-500',
  ALTA: 'border-l-orange-500',
  NORMAL: 'border-l-blue-500',
  BAIXA: 'border-l-gray-300',
};

export function NotificacoesBadge() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [count, setCount] = useState(0);

  const carregarContagem = useCallback(async () => {
    try {
      const response = await authFetch(`${API_URL}/api/notificacoes/nao-lidas/count`);
      if (response.ok) {
        const data = await response.json();
        setCount(data.count);
      }
    } catch (error) {
      // Silently fail - not critical
    }
  }, []);

  const carregarNotificacoes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/notificacoes?limite=20`);
      if (response.ok) {
        const data = await response.json();
        setNotificacoes(data);
      }
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarContagem();
    // Atualiza a cada 30 segundos
    const interval = setInterval(carregarContagem, 30000);
    return () => clearInterval(interval);
  }, [carregarContagem]);

  useEffect(() => {
    if (open) {
      carregarNotificacoes();
    }
  }, [open, carregarNotificacoes]);

  const marcarComoLida = async (id: string) => {
    try {
      const response = await authFetch(`${API_URL}/api/notificacoes/${id}/marcar-lida`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setNotificacoes(prev => 
          prev.map(n => n.id === id ? { ...n, lida: true } : n)
        );
        setCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const marcarTodasComoLidas = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/notificacoes/marcar-todas-lidas`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
        setCount(0);
      }
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    }
  };

  const handleClick = (notificacao: Notificacao) => {
    if (!notificacao.lida) {
      marcarComoLida(notificacao.id);
    }
    
    if (notificacao.link) {
      window.location.href = notificacao.link;
    }
    
    setOpen(false);
  };

  const formatarData = (data: string) => {
    const date = new Date(data);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500"
            >
              {count > 99 ? '99+' : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Notificações</h3>
          {count > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs"
              onClick={marcarTodasComoLidas}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : notificacoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y">
              {notificacoes.map((notificacao) => (
                <div
                  key={notificacao.id}
                  className={`
                    px-4 py-3 cursor-pointer transition-colors border-l-4
                    ${PRIORIDADE_COLORS[notificacao.prioridade] || 'border-l-gray-200'}
                    ${notificacao.lida ? 'bg-white' : 'bg-blue-50'}
                    hover:bg-gray-50
                  `}
                  onClick={() => handleClick(notificacao)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">
                      {TIPO_ICONS[notificacao.tipo] || '📌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium truncate ${notificacao.lida ? 'text-gray-700' : 'text-gray-900'}`}>
                          {notificacao.titulo}
                        </p>
                        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                          {formatarData(notificacao.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {notificacao.mensagem}
                      </p>
                    </div>
                    {!notificacao.lida && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {notificacoes.length > 0 && (
          <div className="px-4 py-2 border-t">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-sm"
              onClick={() => {
                setOpen(false);
                // Opcional: navegar para página de todas as notificações
              }}
            >
              Ver todas as notificações
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
