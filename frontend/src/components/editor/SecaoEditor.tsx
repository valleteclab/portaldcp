"use no memo"
"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef, useCallback } from 'react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react'

interface SecaoEditorProps {
  /** Conteúdo HTML inicial da seção */
  value: string
  /** Chamado quando o conteúdo muda (HTML) */
  onChange: (html: string) => void
  /** Placeholder exibido quando vazio */
  placeholder?: string
  /** Desabilita edição */
  readOnly?: boolean
}

function MiniToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  const btn = (
    label: string,
    active: boolean,
    disabled: boolean,
    onClick: () => void,
    icon: React.ReactNode,
  ) => (
    <button
      key={label}
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
        active
          ? 'bg-[#1351b4] text-white'
          : disabled
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      }`}
    >
      {icon}
    </button>
  )

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50/80 rounded-t-lg flex-wrap">
      {btn('Negrito (Ctrl+B)', editor.isActive('bold'), false, () => editor.chain().focus().toggleBold().run(), <Bold className="w-3 h-3" />)}
      {btn('Itálico (Ctrl+I)', editor.isActive('italic'), false, () => editor.chain().focus().toggleItalic().run(), <Italic className="w-3 h-3" />)}
      {btn('Sublinhado (Ctrl+U)', editor.isActive('underline'), false, () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className="w-3 h-3" />)}
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      {btn('Lista', editor.isActive('bulletList'), false, () => editor.chain().focus().toggleBulletList().run(), <List className="w-3 h-3" />)}
      {btn('Lista numerada', editor.isActive('orderedList'), false, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="w-3 h-3" />)}
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      {btn('Alinhar esquerda', editor.isActive({ textAlign: 'left' }), false, () => editor.chain().focus().setTextAlign('left').run(), <AlignLeft className="w-3 h-3" />)}
      {btn('Centralizar', editor.isActive({ textAlign: 'center' }), false, () => editor.chain().focus().setTextAlign('center').run(), <AlignCenter className="w-3 h-3" />)}
      {btn('Alinhar direita', editor.isActive({ textAlign: 'right' }), false, () => editor.chain().focus().setTextAlign('right').run(), <AlignRight className="w-3 h-3" />)}
    </div>
  )
}

export function SecaoEditor({ value, onChange, placeholder, readOnly = false }: SecaoEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const initializedRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Escreva o conteúdo desta seção…' }),
    ],
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Evita emitir "<p></p>" como mudança relevante
      const effective = html === '<p></p>' ? '' : html
      onChangeRef.current(effective)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2 text-gray-800 leading-relaxed',
      },
    },
  })

  // Sincronizar valor externo APENAS na primeira montagem
  const syncValue = useCallback(() => {
    if (!editor || initializedRef.current) return
    initializedRef.current = true
    if (value && value !== '<p></p>') {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  useEffect(() => {
    syncValue()
  }, [syncValue])

  return (
    <div className="rounded-lg border border-gray-200 focus-within:border-[#1351b4] focus-within:ring-1 focus-within:ring-[#1351b4]/30 transition-all bg-white overflow-hidden">
      <MiniToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
