"use client"

import { MapPin, ArrowRight, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateInput } from "@/components/ui/date-input"
import { FiscalEstadual } from "./types"
import { FileUpload } from "./FileUpload"

interface FiscalEstadualTabProps {
  fiscalEstadual: FiscalEstadual
  setFiscalEstadual: (fiscal: FiscalEstadual) => void
  onNext?: () => void
  onBack?: () => void
}

export function FiscalEstadualTab({ fiscalEstadual, setFiscalEstadual, onNext, onBack }: FiscalEstadualTabProps) {
  const updateCertidao = (key: 'certidaoEstadual' | 'certidaoMunicipal', field: string, value: string) => {
    setFiscalEstadual({
      ...fiscalEstadual,
      [key]: {
        ...fiscalEstadual[key],
        [field]: value
      }
    })
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Regularidade Fiscal Estadual/Distrital e Municipal
        </CardTitle>
        <CardDescription>
          Inscrições e certidões de regularidade estadual e municipal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Inscrições */}
        <div className="p-4 border rounded-lg space-y-4">
          <h4 className="font-medium">Inscrição Estadual e Municipal</h4>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Inscrição Estadual */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Inscrição Estadual</Label>
                <Input
                  value={fiscalEstadual.inscricaoEstadual}
                  onChange={(e) => setFiscalEstadual({...fiscalEstadual, inscricaoEstadual: e.target.value})}
                  placeholder="Número da inscrição"
                />
              </div>
              <FileUpload
                label="Arquivo Comprobatório"
                file={fiscalEstadual.inscricaoEstadualArquivo}
                onFileChange={(file, uploadInfo) => setFiscalEstadual({...fiscalEstadual, inscricaoEstadualArquivo: file, inscricaoEstadualArquivoInfo: uploadInfo})}
                onRemove={() => setFiscalEstadual({...fiscalEstadual, inscricaoEstadualArquivo: null, inscricaoEstadualArquivoInfo: undefined})}
                tipo="fiscal-estadual"
                savedFilename={fiscalEstadual.inscricaoEstadualArquivoInfo?.originalname}
                savedUrl={fiscalEstadual.inscricaoEstadualArquivoInfo?.url}
              />
            </div>

            {/* Inscrição Municipal */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Inscrição Municipal</Label>
                <Input
                  value={fiscalEstadual.inscricaoMunicipal}
                  onChange={(e) => setFiscalEstadual({...fiscalEstadual, inscricaoMunicipal: e.target.value})}
                  placeholder="Número da inscrição"
                />
              </div>
              <FileUpload
                label="Arquivo Comprobatório"
                file={fiscalEstadual.inscricaoMunicipalArquivo}
                onFileChange={(file, uploadInfo) => setFiscalEstadual({...fiscalEstadual, inscricaoMunicipalArquivo: file, inscricaoMunicipalArquivoInfo: uploadInfo})}
                onRemove={() => setFiscalEstadual({...fiscalEstadual, inscricaoMunicipalArquivo: null, inscricaoMunicipalArquivoInfo: undefined})}
                tipo="fiscal-estadual"
                savedFilename={fiscalEstadual.inscricaoMunicipalArquivoInfo?.originalname}
                savedUrl={fiscalEstadual.inscricaoMunicipalArquivoInfo?.url}
              />
            </div>
          </div>
        </div>

        {/* Certidão Estadual */}
        <div className="p-4 border rounded-lg space-y-4">
          <h4 className="font-medium">Comprovante de Regularidade Estadual/Distrital</h4>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Comprovante</Label>
              <Select 
                value={fiscalEstadual.certidaoEstadual.tipoComprovante}
                onValueChange={(v) => updateCertidao('certidaoEstadual', 'tipoComprovante', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CERTIDAO">Certidão</SelectItem>
                  <SelectItem value="DECISAO_JUDICIAL">Decisão Judicial</SelectItem>
                  <SelectItem value="ISENCAO">Isenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Código de Controle da Certidão</Label>
              <Input
                value={fiscalEstadual.certidaoEstadual.codigoControle}
                onChange={(e) => updateCertidao('certidaoEstadual', 'codigoControle', e.target.value)}
                placeholder="Código de controle"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data de Validade</Label>
              <DateInput
                value={fiscalEstadual.certidaoEstadual.dataValidade}
                onChange={(value) => updateCertidao('certidaoEstadual', 'dataValidade', value)}
              />
            </div>
          </div>

          <FileUpload
            label="Arquivo da Certidão Estadual"
            file={fiscalEstadual.certidaoEstadual.arquivo || null}
            onFileChange={(file, uploadInfo) => setFiscalEstadual({
              ...fiscalEstadual,
              certidaoEstadual: { ...fiscalEstadual.certidaoEstadual, arquivo: file, arquivoInfo: uploadInfo }
            })}
            onRemove={() => setFiscalEstadual({
              ...fiscalEstadual,
              certidaoEstadual: { ...fiscalEstadual.certidaoEstadual, arquivo: null, arquivoInfo: undefined }
            })}
            tipo="fiscal-estadual"
            savedFilename={fiscalEstadual.certidaoEstadual.arquivoInfo?.originalname}
            savedUrl={fiscalEstadual.certidaoEstadual.arquivoInfo?.url}
          />
        </div>

        {/* Certidão Municipal */}
        <div className="p-4 border rounded-lg space-y-4">
          <h4 className="font-medium">Comprovante de Regularidade Municipal</h4>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Comprovante</Label>
              <Select 
                value={fiscalEstadual.certidaoMunicipal.tipoComprovante}
                onValueChange={(v) => updateCertidao('certidaoMunicipal', 'tipoComprovante', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CERTIDAO">Certidão</SelectItem>
                  <SelectItem value="DECISAO_JUDICIAL">Decisão Judicial</SelectItem>
                  <SelectItem value="ISENCAO">Isenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Código de Controle da Certidão</Label>
              <Input
                value={fiscalEstadual.certidaoMunicipal.codigoControle}
                onChange={(e) => updateCertidao('certidaoMunicipal', 'codigoControle', e.target.value)}
                placeholder="Código de controle"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data de Validade</Label>
              <DateInput
                value={fiscalEstadual.certidaoMunicipal.dataValidade}
                onChange={(value) => updateCertidao('certidaoMunicipal', 'dataValidade', value)}
              />
            </div>
          </div>

          <FileUpload
            label="Arquivo da Certidão Municipal"
            file={fiscalEstadual.certidaoMunicipal.arquivo || null}
            onFileChange={(file, uploadInfo) => setFiscalEstadual({
              ...fiscalEstadual,
              certidaoMunicipal: { ...fiscalEstadual.certidaoMunicipal, arquivo: file, arquivoInfo: uploadInfo }
            })}
            onRemove={() => setFiscalEstadual({
              ...fiscalEstadual,
              certidaoMunicipal: { ...fiscalEstadual.certidaoMunicipal, arquivo: null, arquivoInfo: undefined }
            })}
            tipo="fiscal-estadual"
            savedFilename={fiscalEstadual.certidaoMunicipal.arquivoInfo?.originalname}
            savedUrl={fiscalEstadual.certidaoMunicipal.arquivoInfo?.url}
          />
        </div>
      </CardContent>
    </Card>

    {/* Botões de Navegação */}
    <div className="flex justify-between mt-4">
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
    </>
  )
}
