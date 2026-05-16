'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    VLibras?: {
      Widget: new (url: string) => unknown
    }
  }
}

export function VLibrasWidget() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const scriptId = 'vlibras-plugin-script'
    const container = containerRef.current
    const accessButton = container?.querySelector<HTMLDivElement>('.active')
    const pluginWrapper = container?.querySelector<HTMLDivElement>('.vw-plugin-wrapper')

    container?.setAttribute('vw', '')
    accessButton?.setAttribute('vw-access-button', '')
    pluginWrapper?.setAttribute('vw-plugin-wrapper', '')

    function initializeVLibras() {
      if (!window.VLibras?.Widget) return
      if (document.documentElement.dataset.vlibrasInitialized === 'true') return

      new window.VLibras.Widget('https://vlibras.gov.br/app')
      document.documentElement.dataset.vlibrasInitialized = 'true'
    }

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existingScript) {
      initializeVLibras()
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js'
    script.async = true
    script.onload = initializeVLibras
    document.body.appendChild(script)
  }, [])

  return (
    <div ref={containerRef} className="enabled vlibras-widget-root" aria-label="VLibras">
      <div className="active" />
      <div className="vw-plugin-wrapper">
        <div className="vw-plugin-top-wrapper" />
      </div>
    </div>
  )
}
