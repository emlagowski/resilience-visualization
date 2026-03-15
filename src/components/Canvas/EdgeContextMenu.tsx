import { useEffect, useRef } from 'react'
import { useFlowStore } from '../../store/flow-store'

interface EdgeContextMenuProps {
  edgeId: string
  x: number
  y: number
  onClose: () => void
}

export function EdgeContextMenu({ edgeId, x, y, onClose }: EdgeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const removeEdge = useFlowStore((s) => s.removeEdge)

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

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 160),
    top: Math.min(y, window.innerHeight - 100),
    zIndex: 9999,
  }

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[140px] select-none"
    >
      <div className="px-3 py-1 mb-0.5 border-b border-gray-700">
        <span className="text-[10px] text-gray-500 font-medium">Connection</span>
      </div>
      <button
        onClick={() => {
          removeEdge(edgeId)
          onClose()
        }}
        className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-900/40 cursor-pointer transition-colors rounded-sm"
      >
        <span className="w-4 text-center text-[11px] opacity-70">🗑</span>
        Delete
      </button>
    </div>
  )
}
