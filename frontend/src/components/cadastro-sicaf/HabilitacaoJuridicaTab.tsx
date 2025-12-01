"use client"

import { Scale, CheckCircle, XCircle, ArrowRight, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { HabilitacaoJuridica } from "./types"
import { FileUpload } from "./FileUpload"

interface HabilitacaoJuridicaTabProps {
  habilitacao: HabilitacaoJuridica
  setHabilitacao: (hab: HabilitacaoJuridica) => void
  usarProcurador: boolean
  onNext?: () => void
  onBack?: () => void
}

export function HabilitacaoJuridicaTab({
  habilitacao, setHabilitacao, usarProcurador, onNext, onBack
}: HabilitacaoJuridicaTabProps) {
  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Habilitação Jurídica
        </CardTitle>
        <CardDescription>
          Documentos necessários para habilitação jurídica
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* CNPJ Regular */}
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          habilitacao.cnpjRegular 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <CheckCircle className={`h-5 w-5 ${habilitacao.cnpjRegular ? 'text-green-600' : 'text-red-600'}`} />
          <div>
            <p className={`font-medium ${habilitacao.cnpjRegular ? 'text-green-800' : 'text-red-800'}`}>
              {habilitacao.cnpjRegular ? 'CNPJ em situação regular' : 'CNPJ com pendências'}
            </p>
            <p className={`text-sm ${habilitacao.cnpjRegular ? 'text-green-600' : 'text-red-600'}`}>
              {habilitacao.cnpjRegular 
                ? 'Verificado automaticamente via API da Receita Federal'
                : 'Anexe o Cartão CNPJ ou Certidão da Junta Comercial'}
            </p>
          </div>
        </div>

        {/* Se CNPJ não estiver regular, pedir documento */}
        {!habilitacao.cnpjRegular && (
          <FileUpload
            label="Cartão CNPJ ou Certidão da Junta Comercial *"
            file={null}
            onFileChange={() => {}}
            onRemove={() => {}}
            description="Documento comprobatório da situação cadastral"
          />
        )}

        {/* Contrato Social */}
        <FileUpload
          label="Contrato Social ou Estatuto *"
          file={habilitacao.contratoSocial}
          onFileChange={(file, uploadInfo) => setHabilitacao({ 
            ...habilitacao, 
            contratoSocial: file,
            contratoSocialInfo: uploadInfo
          })}
          onRemove={() => setHabilitacao({ ...habilitacao, contratoSocial: null, contratoSocialInfo: undefined })}
          description="Documento vigente com cláusulas que autorizem o objeto da licitação e identifiquem o representante legal"
          tipo="habilitacao-juridica"
          savedFilename={habilitacao.contratoSocialInfo?.originalname}
          savedUrl={habilitacao.contratoSocialInfo?.url}
        />

        {/* Documento do Representante */}
        <FileUpload
          label="Documento do Representante Legal (RG ou CNH) *"
          file={habilitacao.documentoRepresentante}
          onFileChange={(file, uploadInfo) => setHabilitacao({ 
            ...habilitacao, 
            documentoRepresentante: file,
            documentoRepresentanteInfo: uploadInfo
          })}
          onRemove={() => setHabilitacao({ ...habilitacao, documentoRepresentante: null, documentoRepresentanteInfo: undefined })}
          tipo="habilitacao-juridica"
          savedFilename={habilitacao.documentoRepresentanteInfo?.originalname}
          savedUrl={habilitacao.documentoRepresentanteInfo?.url}
        />

        {/* Documentos do Procurador (se aplicável) */}
        {usarProcurador && (
          <>
            <div className="border-t pt-4">
              <h4 className="font-medium mb-4">Documentos do Procurador</h4>
            </div>
            
            <FileUpload
              label="Procuração *"
              file={habilitacao.procuracaoArquivo}
              onFileChange={(file, uploadInfo) => setHabilitacao({ 
                ...habilitacao, 
                procuracaoArquivo: file,
                procuracaoArquivoInfo: uploadInfo
              })}
              onRemove={() => setHabilitacao({ ...habilitacao, procuracaoArquivo: null, procuracaoArquivoInfo: undefined })}
              description="Procuração com poderes específicos para representar a empresa em licitações"
              tipo="habilitacao-juridica"
              savedFilename={habilitacao.procuracaoArquivoInfo?.originalname}
              savedUrl={habilitacao.procuracaoArquivoInfo?.url}
            />

            <FileUpload
              label="Documento do Procurador (RG ou CNH) *"
              file={habilitacao.documentoProcurador}
              onFileChange={(file, uploadInfo) => setHabilitacao({ 
                ...habilitacao, 
                documentoProcurador: file,
                documentoProcuradorInfo: uploadInfo
              })}
              onRemove={() => setHabilitacao({ ...habilitacao, documentoProcurador: null, documentoProcuradorInfo: undefined })}
              tipo="habilitacao-juridica"
              savedFilename={habilitacao.documentoProcuradorInfo?.originalname}
              savedUrl={habilitacao.documentoProcuradorInfo?.url}
            />
          </>
        )}
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
