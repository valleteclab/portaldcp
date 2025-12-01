"use client"

import { useRef, useState, useEffect } from "react"
import { Upload, CheckCircle, Trash2, Download, Loader2, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

interface UploadedFileInfo {
  filename: string
  originalname: string
  url: string
  size: number
}

interface FileUploadProps {
  label: string
  file: File | null
  onFileChange: (file: File | null, uploadInfo?: UploadedFileInfo) => void
  onRemove: () => void
  description?: string
  accept?: string
  tipo?: string
  fornecedorId?: string
  savedFilename?: string // Nome do arquivo já salvo no banco
  savedUrl?: string // URL do arquivo já salvo
}

export function FileUpload({ 
  label, 
  file, 
  onFileChange, 
  onRemove,
  description,
  accept = ".pdf,.jpg,.jpeg,.png",
  tipo = "documentos",
  fornecedorId,
  savedFilename,
  savedUrl
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedInfo, setUploadedInfo] = useState<UploadedFileInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Se já tem arquivo salvo, mostra ele
  const hasFile = file || savedFilename

  const handleButtonClick = () => {
    inputRef.current?.click()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    if (!selectedFile) return

    setError(null)

    // Verifica tamanho do arquivo
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`Arquivo muito grande (${formatFileSize(selectedFile.size)}). O tamanho máximo é ${formatFileSize(MAX_FILE_SIZE)}. Tente comprimir o PDF ou reduzir a resolução da imagem.`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    // Faz upload para o servidor
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('tipo', tipo)
      if (fornecedorId) {
        formData.append('fornecedor_id', fornecedorId)
      }

      const res = await fetch(`${API_URL}/api/uploads`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Erro ao fazer upload')
      }

      const data = await res.json()
      const info: UploadedFileInfo = {
        filename: data.filename,
        originalname: data.originalname,
        url: data.url,
        size: data.size,
      }
      setUploadedInfo(info)
      
      // Passa o arquivo E as informações do upload para o componente pai
      onFileChange(selectedFile, info)
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err)
      setError(err.message || 'Erro ao fazer upload do arquivo')
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = () => {
    if (uploadedInfo?.url) {
      window.open(`${API_URL}${uploadedInfo.url}`, '_blank')
    } else if (savedUrl) {
      window.open(`${API_URL}${savedUrl}`, '_blank')
    } else if (file) {
      const url = URL.createObjectURL(file)
      window.open(url, '_blank')
    }
  }

  const handleRemove = () => {
    setUploadedInfo(null)
    setError(null)
    onRemove()
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const displayName = file?.name || savedFilename || uploadedInfo?.originalname

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Erro no upload</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {hasFile && !error ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          {uploading ? (
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          <FileText className="h-4 w-4 text-green-600" />
          <span className="flex-1 text-sm text-green-800 truncate">{displayName}</span>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={uploading}>
            <Download className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="text-red-600 hover:text-red-700" 
            onClick={handleRemove}
            disabled={uploading}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : !error && (
        <div className="flex items-center gap-2">
          <input 
            ref={inputRef}
            type="file" 
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
          />
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleButtonClick}
            className="gap-2"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Selecionar Arquivo
          </Button>
          <span className="text-sm text-muted-foreground">
            Nenhum arquivo selecionado
          </span>
        </div>
      )}
      
      <p className="text-xs text-muted-foreground">
        {description && <span>{description} • </span>}
        Tamanho máximo: {formatFileSize(MAX_FILE_SIZE)}
      </p>
    </div>
  )
}
