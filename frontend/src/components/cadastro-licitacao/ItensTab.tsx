"use client"

import { useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, Plus, Trash2, Upload, Download, FileSpreadsheet, AlertCircle } from "lucide-react"
import { ItemLicitacao, UNIDADES } from "./types"

interface ItensTabProps {
  itens: ItemLicitacao[]
  onChange: (itens: ItemLicitacao[]) => void
}

export function ItensTab({ itens, onChange }: ItensTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addItem = () => {
    onChange([...itens, { 
      numero: itens.length + 1, 
      descricao: "", 
      quantidade: 1, 
      unidade: "UNIDADE", 
      valor_unitario: 0 
    }])
  }

  const updateItem = (index: number, field: keyof ItemLicitacao, value: any) => {
    const novosItens = itens.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    )
    onChange(novosItens)
  }

  const removeItem = (index: number) => {
    const novosItens = itens
      .filter((_, i) => i !== index)
      .map((item, i) => ({ ...item, numero: i + 1 }))
    onChange(novosItens)
  }

  const calcularValorTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valor_unitario), 0)
  }

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // === IMPORTAÇÃO CSV ===
  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      
      // Pula o header
      const dataLines = lines.slice(1)
      
      const novosItens: ItemLicitacao[] = dataLines.map((line, index) => {
        // Suporta tanto ; quanto , como separador
        const separator = line.includes(';') ? ';' : ','
        const cols = line.split(separator).map(col => col.trim().replace(/"/g, ''))
        return {
          numero: index + 1,
          descricao: cols[0] || '',
          quantidade: parseFloat(cols[1]?.replace(',', '.')) || 1,
          unidade: cols[2]?.toUpperCase() || 'UNIDADE',
          valor_unitario: parseFloat(cols[3]?.replace(',', '.')) || 0,
          codigo_catmat: cols[4] || '',
          codigo_catser: cols[5] || '',
        }
      }).filter(item => item.descricao)

      if (novosItens.length > 0) {
        onChange(novosItens)
      }
    }
    reader.readAsText(file, 'UTF-8')
    
    // Limpa o input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const downloadModeloCSV = () => {
    const modelo = `Descrição;Quantidade;Unidade;Valor Unitário;Código CATMAT;Código CATSER
"Caneta esferográfica azul";100;UNIDADE;1,50;;
"Papel A4 500 folhas";50;RESMA;25,00;123456;
"Serviço de limpeza mensal";12;MES;5000,00;;789012`
    
    const blob = new Blob(['\ufeff' + modelo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo_itens_licitacao.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Importação CSV */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Importar itens via CSV</p>
                <p className="text-sm text-muted-foreground">
                  Importe uma planilha com os itens da licitação
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadModeloCSV}>
                <Download className="h-4 w-4 mr-2" />
                Baixar Modelo
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleImportCSV}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Itens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Itens da Licitação
              </CardTitle>
              <CardDescription>
                Adicione os itens que serão licitados
              </CardDescription>
            </div>
            <Button onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {itens.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum item cadastrado</p>
              <p className="text-sm mb-4">Adicione itens manualmente ou importe via CSV</p>
              <Button variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Item
              </Button>
            </div>
          ) : (
            <>
              {itens.map((item, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3 bg-slate-50">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-blue-600">Item {item.numero}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Descrição *</Label>
                      <Input 
                        placeholder="Descrição do item"
                        value={item.descricao}
                        onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quantidade *</Label>
                      <Input 
                        type="text"
                        inputMode="decimal"
                        value={item.quantidade === 0 ? '' : item.quantidade}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            updateItem(index, 'quantidade', val === '' ? 0 : parseFloat(val))
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '' || parseFloat(e.target.value) < 1) {
                            updateItem(index, 'quantidade', 1)
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unidade</Label>
                      <Select 
                        value={item.unidade} 
                        onValueChange={(v) => updateItem(index, 'unidade', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIDADES.map(u => (
                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor Unit. Estimado</Label>
                      <Input 
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={item.valor_unitario === 0 ? '' : item.valor_unitario}
                        onChange={(e) => {
                          const val = e.target.value.replace(',', '.')
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            updateItem(index, 'valor_unitario', val === '' ? 0 : parseFloat(val))
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Código CATMAT</Label>
                      <Input 
                        placeholder="Opcional"
                        value={item.codigo_catmat || ''}
                        onChange={(e) => updateItem(index, 'codigo_catmat', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Código CATSER</Label>
                      <Input 
                        placeholder="Opcional"
                        value={item.codigo_catser || ''}
                        onChange={(e) => updateItem(index, 'codigo_catser', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 flex items-end justify-end">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="font-medium text-blue-600">
                          {formatarMoeda(item.quantidade * item.valor_unitario)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Totalizador */}
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-blue-700">Total de Itens: <strong>{itens.length}</strong></p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-700">Valor Total Estimado</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {formatarMoeda(calcularValorTotal())}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
