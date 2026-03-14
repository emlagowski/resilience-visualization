import { useEffect, useRef } from 'react'
import { useFlowStore } from '../../store/flow-store'

interface ContextMenuProps {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export function ContextMenu({ nodeId, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const duplicateNode = useFlowStore((s) => s.duplicateNode)
  const removeNode = useFlowStore((s) => s.removeNode)
  const copyConfig = useFlowStore((s) => s.copyConfig)
  const pasteConfig = useFlowStore((s) => s.pasteConfig)
  const clipboardConfig = useFlowStore((s) => s.clipboardConfig)
  const nodes = useFlowStore((s) => s.nodes)
  const node = nodes.find((n) => n.id === nodeId)

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Element)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Clamp menu position so it doesn't go off-screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 9999,
  }

  const item = (
    label: string,
    icon: string,
    onClick: () => void,
    disabled = false,
    danger = false,
  ) => (
    <button
      key={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onClick()
          onClose()
        }
      }}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors rounded-sm
        ${disabled ? 'text-gray-600 cursor-default' : danger ? 'text-red-400 hover:bg-red-900/40 cursor-pointer' : 'text-gray-200 hover:bg-gray-700 cursor-pointer'}`}
    >
      <span className="w-4 text-center text-[11px] opacity-70">{icon}</span>
      {label}
    </button>
  )

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[160px] select-none"
    >
      <div className="px-3 py-1 mb-0.5 border-b border-gray-700">
        <span className="text-[10px] text-gray-500 font-medium truncate block max-w-[140px]">
          {node?.data.label ?? nodeId}
        </span>
      </div>

      {item('Duplicate', '⧉', () => duplicateNode(nodeId))}
      <div className="my-0.5 h-px bg-gray-700 mx-2" />
      {item('Copy Config', '📋', () => copyConfig(nodeId))}
      {item(
        clipboardConfig ? 'Paste Config' : 'Paste Config (empty)',
        '📌',
        () => pasteConfig(nodeId),
        !clipboardConfig,
      )}
      <div className="my-0.5 h-px bg-gray-700 mx-2" />
      {item('Delete', '🗑', () => removeNode(nodeId), false, true)}
    </div>
  )
}
