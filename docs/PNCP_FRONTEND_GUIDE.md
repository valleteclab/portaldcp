# Guia de Integração PNCP - Frontend

## Índice
1. [Estrutura de Arquivos](#estrutura-de-arquivos)
2. [Usando o Serviço PNCP](#usando-o-serviço-pncp)
3. [Exemplos de Componentes](#exemplos-de-componentes)
4. [Fluxos de Trabalho](#fluxos-de-trabalho)
5. [Tratamento de Erros](#tratamento-de-erros)

---

## Estrutura de Arquivos

```
frontend/src/
├── lib/
│   └── pncp.ts              # Serviço de integração PNCP
├── app/
│   └── orgao/
│       └── pncp/
│           └── page.tsx     # Página principal de integração
└── components/
    └── pncp/                # Componentes específicos (a criar)
        ├── PcaForm.tsx
        ├── CompraForm.tsx
        ├── ResultadoForm.tsx
        └── AtaForm.tsx
```

---

## Usando o Serviço PNCP

### Importação

```typescript
import { pncpService, MODALIDADES, MODO_DISPUTA } from '@/lib/pncp';
import type { Compra, Resultado, Ata, PncpResponse } from '@/lib/pncp';
```

### Exemplos de Uso

#### 1. Incluir Compra/Edital

```typescript
const handleIncluirCompra = async () => {
  try {
    const compra: Compra = {
      codigo_unidade: '1',
      ano_compra: 2025,
      numero_processo: '001/2025',
      objeto: 'Aquisição de equipamentos de informática',
      modalidade_id: MODALIDADES.PREGAO_ELETRONICO,
      modo_disputa_id: MODO_DISPUTA.ABERTO,
      tipo_instrumento_id: 1,
      amparo_legal_id: 1,
      srp: false,
      data_abertura_proposta: '2025-01-20T09:00:00',
      data_encerramento_proposta: '2025-01-25T18:00:00',
      titulo_documento: 'Edital de Pregão 001/2025',
      itens: [
        {
          numero_item: 1,
          descricao: 'Notebook Dell Inspiron 15',
          tipo: 'MATERIAL',
          quantidade: 10,
          unidade_medida: 'Unidade',
          valor_unitario: 5000,
          valor_total: 50000,
        }
      ]
    };

    const response = await pncpService.incluirCompra(compra);
    
    if (response.sucesso) {
      toast.success(`Compra enviada! ${response.mensagem}`);
      // Atualizar lista
    }
  } catch (error: any) {
    toast.error(error.message);
  }
};
```

#### 2. Incluir Resultado do Item

```typescript
const handleIncluirResultado = async (anoCompra: number, seqCompra: number, numeroItem: number) => {
  try {
    const resultado: Resultado = {
      data_resultado: '2025-01-26',
      cnpj_fornecedor: '33014556000196',
      nome_fornecedor: 'Empresa Vencedora LTDA',
      quantidade_homologada: 10,
      valor_unitario_homologado: 4800,
      valor_total_homologado: 48000,
      percentual_desconto: 4,
    };

    const response = await pncpService.incluirResultado(
      anoCompra, 
      seqCompra, 
      numeroItem, 
      resultado
    );
    
    if (response.sucesso) {
      toast.success('Resultado incluído com sucesso!');
    }
  } catch (error: any) {
    toast.error(error.message);
  }
};
```

#### 3. Incluir Ata de Registro de Preço

```typescript
const handleIncluirAta = async (anoCompra: number, seqCompra: number) => {
  try {
    const ata: Ata = {
      numero_ata: '001/2025',
      ano_ata: 2025,
      data_assinatura: '2025-02-15',
      data_vigencia_inicio: '2025-02-15',
      data_vigencia_fim: '2026-02-14',
      cnpj_fornecedor: '33014556000196',
      nome_fornecedor: 'Empresa Fornecedora LTDA',
      itens: [
        {
          numero_item: 1,
          quantidade: 100,
          valor_unitario: 24,
          valor_total: 2400,
        }
      ]
    };

    const response = await pncpService.incluirAta(anoCompra, seqCompra, ata);
    
    if (response.sucesso) {
      toast.success('Ata incluída com sucesso!');
    }
  } catch (error: any) {
    toast.error(error.message);
  }
};
```

#### 4. Excluir com Justificativa

```typescript
const handleExcluirCompra = async (ano: number, seq: number) => {
  const justificativa = prompt('Informe a justificativa para exclusão:');
  
  if (!justificativa) {
    toast.error('Justificativa é obrigatória');
    return;
  }

  try {
    const response = await pncpService.excluirCompra(ano, seq, justificativa);
    
    if (response.sucesso) {
      toast.success('Compra excluída com sucesso!');
    }
  } catch (error: any) {
    toast.error(error.message);
  }
};
```

---

## Exemplos de Componentes

### Formulário de Compra

```tsx
// components/pncp/CompraForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pncpService, MODALIDADES, MODO_DISPUTA } from '@/lib/pncp';
import type { Compra, ItemCompra } from '@/lib/pncp';

interface CompraFormProps {
  onSuccess?: () => void;
}

export function CompraForm({ onSuccess }: CompraFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Compra>>({
    ano_compra: new Date().getFullYear(),
    modalidade_id: MODALIDADES.PREGAO_ELETRONICO,
    modo_disputa_id: MODO_DISPUTA.ABERTO,
    tipo_instrumento_id: 1,
    amparo_legal_id: 1,
    srp: false,
    itens: [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await pncpService.incluirCompra(formData as Compra);
      
      if (response.sucesso) {
        alert(`Compra enviada com sucesso!\n${response.mensagem}`);
        onSuccess?.();
      }
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Número do Processo</Label>
          <Input
            value={formData.numero_processo || ''}
            onChange={(e) => setFormData({ ...formData, numero_processo: e.target.value })}
            placeholder="001/2025"
            required
          />
        </div>
        
        <div>
          <Label>Ano da Compra</Label>
          <Input
            type="number"
            value={formData.ano_compra}
            onChange={(e) => setFormData({ ...formData, ano_compra: parseInt(e.target.value) })}
            required
          />
        </div>
      </div>

      <div>
        <Label>Objeto</Label>
        <Input
          value={formData.objeto || ''}
          onChange={(e) => setFormData({ ...formData, objeto: e.target.value })}
          placeholder="Descrição do objeto da contratação"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Modalidade</Label>
          <Select
            value={String(formData.modalidade_id)}
            onValueChange={(v) => setFormData({ ...formData, modalidade_id: parseInt(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Pregão Eletrônico</SelectItem>
              <SelectItem value="7">Pregão Presencial</SelectItem>
              <SelectItem value="4">Concorrência Eletrônica</SelectItem>
              <SelectItem value="8">Dispensa</SelectItem>
              <SelectItem value="9">Inexigibilidade</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Modo de Disputa</Label>
          <Select
            value={String(formData.modo_disputa_id)}
            onValueChange={(v) => setFormData({ ...formData, modo_disputa_id: parseInt(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Aberto</SelectItem>
              <SelectItem value="2">Fechado</SelectItem>
              <SelectItem value="3">Aberto-Fechado</SelectItem>
              <SelectItem value="5">Não se aplica</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Data Abertura Proposta</Label>
          <Input
            type="datetime-local"
            value={formData.data_abertura_proposta || ''}
            onChange={(e) => setFormData({ ...formData, data_abertura_proposta: e.target.value })}
            required
          />
        </div>

        <div>
          <Label>Data Encerramento Proposta</Label>
          <Input
            type="datetime-local"
            value={formData.data_encerramento_proposta || ''}
            onChange={(e) => setFormData({ ...formData, data_encerramento_proposta: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="srp"
          checked={formData.srp}
          onChange={(e) => setFormData({ ...formData, srp: e.target.checked })}
        />
        <Label htmlFor="srp">Sistema de Registro de Preços (SRP)</Label>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Enviando...' : 'Enviar para PNCP'}
      </Button>
    </form>
  );
}
```

### Formulário de Resultado

```tsx
// components/pncp/ResultadoForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pncpService } from '@/lib/pncp';
import type { Resultado } from '@/lib/pncp';

interface ResultadoFormProps {
  anoCompra: number;
  sequencialCompra: number;
  numeroItem: number;
  onSuccess?: () => void;
}

export function ResultadoForm({ anoCompra, sequencialCompra, numeroItem, onSuccess }: ResultadoFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Resultado>>({
    data_resultado: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar CNPJ
      if (!pncpService.validarCNPJ(formData.cnpj_fornecedor || '')) {
        throw new Error('CNPJ inválido');
      }

      const response = await pncpService.incluirResultado(
        anoCompra,
        sequencialCompra,
        numeroItem,
        formData as Resultado
      );
      
      if (response.sucesso) {
        alert('Resultado incluído com sucesso!');
        onSuccess?.();
      }
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>CNPJ do Fornecedor</Label>
        <Input
          value={formData.cnpj_fornecedor || ''}
          onChange={(e) => setFormData({ ...formData, cnpj_fornecedor: e.target.value })}
          placeholder="00.000.000/0000-00"
          required
        />
      </div>

      <div>
        <Label>Nome/Razão Social</Label>
        <Input
          value={formData.nome_fornecedor || ''}
          onChange={(e) => setFormData({ ...formData, nome_fornecedor: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Quantidade Homologada</Label>
          <Input
            type="number"
            step="0.0001"
            value={formData.quantidade_homologada || ''}
            onChange={(e) => setFormData({ ...formData, quantidade_homologada: parseFloat(e.target.value) })}
            required
          />
        </div>

        <div>
          <Label>Valor Unitário</Label>
          <Input
            type="number"
            step="0.0001"
            value={formData.valor_unitario_homologado || ''}
            onChange={(e) => setFormData({ ...formData, valor_unitario_homologado: parseFloat(e.target.value) })}
            required
          />
        </div>

        <div>
          <Label>Valor Total</Label>
          <Input
            type="number"
            step="0.0001"
            value={formData.valor_total_homologado || ''}
            onChange={(e) => setFormData({ ...formData, valor_total_homologado: parseFloat(e.target.value) })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Data do Resultado</Label>
          <Input
            type="date"
            value={formData.data_resultado || ''}
            onChange={(e) => setFormData({ ...formData, data_resultado: e.target.value })}
            required
          />
        </div>

        <div>
          <Label>Percentual de Desconto (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.percentual_desconto || ''}
            onChange={(e) => setFormData({ ...formData, percentual_desconto: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Enviando...' : 'Incluir Resultado'}
      </Button>
    </form>
  );
}
```

---

## Fluxos de Trabalho

### Fluxo Completo de Licitação

```
1. CRIAR COMPRA/EDITAL
   └── pncpService.incluirCompra()
   
2. AGUARDAR PROCESSO LICITATÓRIO
   
3. REGISTRAR RESULTADO DOS ITENS
   └── pncpService.incluirResultado() [para cada item]
   
4. SE SRP, CRIAR ATA
   └── pncpService.incluirAta()
   
5. CRIAR CONTRATO (se aplicável)
   └── pncpService.incluirContrato()
```

### Fluxo de Retificação

```
1. IDENTIFICAR ERRO
   
2. CHAMAR MÉTODO DE RETIFICAÇÃO
   └── pncpService.retificarCompra()
   └── pncpService.retificarResultado() [requer situacao_id]
   └── pncpService.retificarAta() [requer justificativa]
   
3. VERIFICAR SUCESSO
```

### Fluxo de Exclusão

```
1. CONFIRMAR EXCLUSÃO COM USUÁRIO
   
2. SOLICITAR JUSTIFICATIVA
   
3. CHAMAR MÉTODO DE EXCLUSÃO
   └── pncpService.excluirCompra(ano, seq, justificativa)
   └── pncpService.excluirAta(ano, seq, seqAta, justificativa)
   
4. ATUALIZAR INTERFACE
```

---

## Tratamento de Erros

### Erros Comuns

| Código | Mensagem | Solução |
|--------|----------|---------|
| 400 | CNPJ inválido | Verificar formatação do CNPJ |
| 400 | Sigla de tipo de pessoa inválida | Usar "PJ", "PF" ou "PE" |
| 422 | Não há conformidade | Verificar combinação modalidade/instrumento/amparo |
| 422 | Justificativa não informada | Adicionar justificativa obrigatória |
| 422 | Situação do resultado inválida | Adicionar situacao_id na retificação |

### Exemplo de Tratamento

```typescript
try {
  const response = await pncpService.incluirCompra(compra);
  
  if (response.sucesso) {
    // Sucesso
    toast.success(response.mensagem);
  }
} catch (error: any) {
  // Tratar erro específico
  if (error.message.includes('CNPJ')) {
    toast.error('CNPJ do fornecedor é inválido');
  } else if (error.message.includes('conformidade')) {
    toast.error('Verifique a combinação de modalidade, instrumento e amparo legal');
  } else {
    toast.error(error.message);
  }
}
```

---

## Checklist de Implementação

- [ ] Importar serviço PNCP (`@/lib/pncp`)
- [ ] Criar formulários para cada operação
- [ ] Implementar validações de CNPJ
- [ ] Adicionar feedback visual (loading, toast)
- [ ] Tratar erros específicos do PNCP
- [ ] Implementar confirmação para exclusões
- [ ] Adicionar links para portal PNCP

---

*Documentação gerada em 01/12/2025*
