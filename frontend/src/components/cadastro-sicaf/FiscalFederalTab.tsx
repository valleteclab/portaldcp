"use client"

import { Landmark, ArrowRight, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateInput } from "@/components/ui/date-input"
import { FiscalFederal } from "./types"
import { FileUpload } from "./FileUpload"

interface FiscalFederalTabProps {
  fiscalFederal: FiscalFederal
  setFiscalFederal: (fiscal: FiscalFederal) => void
  onNext?: () => void
  onBack?: () => void
}

const CERTIDOES_FEDERAIS = [
  { key: 'receitaFederal', label: 'Comprovante de Regularidade da Receita Federal e PGFN' },
  { key: 'fgts', label: 'Comprovante de Regularidade do FGTS' },
  { key: 'tst', label: 'Comprovante de Regularidade do TST (CNDT)' },
] as const

export function FiscalFederalTab({ fiscalFederal, setFiscalFederal, onNext, onBack }: FiscalFederalTabProps) {
  const updateCertidao = (key: keyof FiscalFederal, field: string, value: string) => {
    setFiscalFederal({
      ...fiscalFederal,
      [key]: {
        ...fiscalFederal[key],
        [field]: value
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Regularidade Fiscal e Trabalhista Federal
          </CardTitle>
          <CardDescription>
            Certidões de regularidade junto aos órgãos federais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {CERTIDOES_FEDERAIS.map(({ key, label }) => (
            <div key={key} className="p-4 border rounded-lg space-y-4 bg-gray-50">
              <h4 className="font-medium text-orange-700 flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full" />
                {label}
              </h4>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Comprovante</Label>
                  <Select 
                    value={fiscalFederal[key].tipoComprovante}
                    onValueChange={(v) => updateCertidao(key, 'tipoComprovante', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CERTIDAO">Certidão</SelectItem>
                      <SelectItem value="DECISAO_JUDICIAL">Decisão Judicial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Código de Controle</Label>
                  <Input
                    value={fiscalFederal[key].codigoControle}
                    onChange={(e) => updateCertidao(key, 'codigoControle', e.target.value)}
                    placeholder="Ex: 772E763AD659473E"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Data de Validade</Label>
                  <DateInput
                    value={fiscalFederal[key].dataValidade}
                    onChange={(value) => updateCertidao(key, 'dataValidade', value)}
                  />
                </div>
              </div>

              {/* Upload do documento */}
              <FileUpload
                label="Arquivo da Certidão (PDF ou Imagem)"
                file={fiscalFederal[key].arquivo || null}
                onFileChange={(file, uploadInfo) => {
                  setFiscalFederal({
                    ...fiscalFederal,
                    [key]: { ...fiscalFederal[key], arquivo: file, arquivoInfo: uploadInfo }
                  })
                }}
                onRemove={() => {
                  setFiscalFederal({
                    ...fiscalFederal,
                    [key]: { ...fiscalFederal[key], arquivo: null, arquivoInfo: undefined }
                  })
                }}
                tipo="fiscal-federal"
                savedFilename={fiscalFederal[key].arquivoInfo?.originalname}
                savedUrl={fiscalFederal[key].arquivoInfo?.url}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Botões de Navegação */}
      <div className="flex justify-between">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        )}
        <div className="flex-1" />
        {onNext && (
          <Button onClick={onNext}>
            Avançar <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
