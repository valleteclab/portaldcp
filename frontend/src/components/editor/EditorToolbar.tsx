"use client"

import { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Table as TableIcon,
} from 'lucide-react'

interface EditorToolbarProps {
  editor: Editor | null
  salvo?: boolean
  wordCount?: number
}

function ToolBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
        active
          ? 'bg-[#1351b4] text-white'
          : disabled
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />
}

export function EditorToolbar({ editor, salvo, wordCount }: EditorToolbarProps) {
  if (!editor) return null

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-200 bg-white flex-wrap shrink-0">
      {/* Undo / Redo */}
      <ToolBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Desfazer (Ctrl+Z)"
      >
        <Undo className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Refazer (Ctrl+Y)"
      >
        <Redo className="w-3.5 h-3.5" />
      </ToolBtn>

      <Sep />

      {/* Headings */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Título 1"
      >
        <Heading1 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Título 2"
      >
        <Heading2 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Título 3"
      >
        <Heading3 className="w-3.5 h-3.5" />
      </ToolBtn>

      <Sep />

      {/* Text formatting */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Negrito (Ctrl+B)"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Itálico (Ctrl+I)"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Sublinhado (Ctrl+U)"
      >
        <Underline className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Tachado"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolBtn>

      <Sep />

      {/* Lists */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Lista com marcadores"
      >
        <List className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Lista numerada"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolBtn>

      <Sep />

      {/* Alignment */}
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="Alinhar à esquerda"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="Centralizar"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="Alinhar à direita"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToolBtn>

      <Sep />

      {/* Table */}
      <ToolBtn onClick={insertTable} title="Inserir tabela">
        <TableIcon className="w-3.5 h-3.5" />
      </ToolBtn>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status and word count */}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {wordCount !== undefined && (
          <span>
            {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'}
          </span>
        )}
        <span
          className={
            salvo === undefined
              ? 'text-gray-400'
              : salvo
                ? 'text-green-600 font-medium'
                : 'text-amber-500 font-medium'
          }
        >
          {salvo === undefined ? '' : salvo ? '✓ Salvo' : '● Salvando…'}
        </span>
      </div>
    </div>
  )
}
