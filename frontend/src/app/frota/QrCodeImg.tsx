'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import QRCode from 'qrcode'

/**
 * QR gerado no próprio aparelho (antes vinha de api.qrserver.com — sem
 * internet a imagem sumia; agora o vereador mostra o QR no pátio mesmo offline).
 */
export function QrCodeImg({
  value, size = 200, alt = 'QR Code', className, style,
}: { value: string; size?: number; alt?: string; className?: string; style?: CSSProperties }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let ativo = true
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (ativo) setSrc(url) })
      .catch(() => { if (ativo) setSrc('') })
    return () => { ativo = false }
  }, [value, size])

  if (!src) {
    return <div className={className} style={{ width: size, height: size, ...style }} role="img" aria-label="Gerando QR Code" />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={className} style={style} />
}
