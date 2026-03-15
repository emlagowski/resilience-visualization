import { useEffect, useRef } from 'react'
import { useFlowStore } from '../../store/flow-store'
import type { MiniChartMode } from '../../types'

interface ContextMenuProps {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

const LATENCY_LEVELS = [1, 2, 5, 10] as const

export function ContextMenu({ nodeId, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const duplicateNode = useFlowStore((s) => s.duplicateNode)
  const removeNode = useFlowStore((s) => s.removeNode)
  const copyConfig = useFlowStore((s) => s.copyConfig)
  const pasteConfig = useFlowStore((s) => s.pasteConfig)
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const clipboardConfig = useFlowStore((s) => s.clipboardConfig)
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === nodeId))

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

  if (!node) return null

  const data = node.data
  const isKilled = data.healthCheck.enabled && !data.healthCheck.healthy
  const cbEnabled = data.circuitBreaker.enabled
  const isVirtual = data.threadModel === 'virtual'
  const latencyMul = data.processingTimeMultiplier ?? 1
  const chartMode: MiniChartMode = data.miniChartMode ?? 'none'

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 420),
    zIndex: 9999,
  }

  function act(fn: () => void) {
    fn()
    onClose()
  }

  const item = (
    label: string,
    icon: string,
    onClick: () => void,
    disabled = false,
    danger = false,
    active = false,
  ) => (
    <button
      key={label}
      disabled={disabled}
      onClick={() => { if (!disabled) act(onClick) }}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors rounded-sm
        ${disabled
          ? 'text-gray-600 cursor-default'
          : danger
            ? 'text-red-400 hover:bg-red-900/40 cursor-pointer'
            : active
              ? 'text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 cursor-pointer'
              : 'text-gray-200 hover:bg-gray-700 cursor-pointer'}`}
    >
      <span className="w-4 text-center text-[11px] opacity-70">{icon}</span>
      {label}
    </button>
  )

  const sectionLabel = (text: string) => (
    <div className="px-3 pt-1.5 pb-0.5">
      <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider">{text}</span>
    </div>
  )

  const divider = () => <div className="my-0.5 h-px bg-gray-700 mx-2" />

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[190px] select-none"
    >
      {/* Header */}
      <div className="px-3 py-1 mb-0.5 border-b border-gray-700">
        <span className="text-[10px] text-gray-500 font-medium truncate block max-w-[170px]">
          {data.label ?? nodeId}
        </span>
      </div>

      {/* ── Chaos ─────────────────────────────────────── */}
      {sectionLabel('Chaos')}

      {/* Kill / Recover */}
      {isKilled
        ? item('Recover node', '💚', () =>
            updateNodeConfig(nodeId, {
              healthCheck: { ...data.healthCheck, healthy: true },
            }),
          )
        : item('Kill node', '💀', () =>
            updateNodeConfig(nodeId, {
              healthCheck: { ...data.healthCheck, enabled: true, healthy: false },
            }),
            false, true,
          )
      }

      {/* Circuit Breaker toggle */}
      {item(
        cbEnabled ? 'Disable circuit breaker' : 'Enable circuit breaker',
        cbEnabled ? '🔓' : '🔒',
        () => updateNodeConfig(nodeId, {
          circuitBreaker: { ...data.circuitBreaker, enabled: !cbEnabled },
        }),
        false, false, cbEnabled,
      )}

      {/* Thread model toggle */}
      {item(
        isVirtual ? 'Switch to platform threads' : 'Switch to virtual threads',
        isVirtual ? '⚙️' : '⚡',
        () => updateNodeConfig(nodeId, { threadModel: isVirtual ? 'platform' : 'virtual' }),
        false, false, isVirtual,
      )}

      {/* Latency multiplier */}
      <div className="px-3 py-1">
        <div className="text-[9px] text-gray-500 mb-1">Latency injection</div>
        <div className="flex gap-1">
          {LATENCY_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => { updateNodeConfig(nodeId, { processingTimeMultiplier: lvl }); onClose() }}
              className={`flex-1 py-0.5 rounded text-[11px] font-mono transition-colors
                ${latencyMul === lvl
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {lvl}×
            </button>
          ))}
        </div>
      </div>

      {divider()}

      {/* ── Chart ─────────────────────────────────────── */}
      {sectionLabel('Node chart')}
      <div className="px-3 py-1">
        <div className="grid grid-cols-2 gap-1">
          {(['none', 'throughput', 'latency', 'error'] as MiniChartMode[]).map((mode) => {
            const labels: Record<MiniChartMode, string> = {
              none: 'None',
              throughput: 'Throughput',
              latency: 'Latency',
              error: 'Errors',
            }
            const colors: Record<MiniChartMode, string> = {
              none: 'bg-gray-700 text-gray-400',
              throughput: 'bg-blue-700 text-blue-200',
              latency: 'bg-yellow-700 text-yellow-200',
              error: 'bg-red-700 text-red-200',
            }
            const active = chartMode === mode
            return (
              <button
                key={mode}
                onClick={() => { updateNodeConfig(nodeId, { miniChartMode: mode }); onClose() }}
                className={`py-0.5 px-1 rounded text-[10px] transition-colors text-center
                  ${active ? colors[mode] + ' ring-1 ring-white/30' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
              >
                {labels[mode]}
              </button>
            )
          })}
        </div>
      </div>

      {divider()}

      {/* ── Node ops ──────────────────────────────────── */}
      {sectionLabel('Node')}
      {item('Duplicate', '⧉', () => duplicateNode(nodeId))}
      {item('Copy Config', '📋', () => copyConfig(nodeId))}
      {item(
        clipboardConfig ? 'Paste Config' : 'Paste Config (empty)',
        '📌',
        () => pasteConfig(nodeId),
        !clipboardConfig,
      )}
      {divider()}
      {item('Delete', '🗑', () => removeNode(nodeId), false, true)}
    </div>
  )
}
