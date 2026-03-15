import { memo, useMemo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { ServiceNodeData, MiniChartMode } from '../../types'
import { useFlowStore } from '../../store/flow-store'
import { useSimulationStore } from '../../store/simulation-store'

function getHealthColor(data: ServiceNodeData): string {
  if (!data.healthCheck.healthy && data.healthCheck.enabled) return 'border-red-500 bg-red-950'
  if (data.circuitBreaker.state === 'open') return 'border-orange-500 bg-orange-950'
  if (data.circuitBreaker.state === 'half-open') return 'border-yellow-500 bg-yellow-950'
  // Node colour driven by the sliding-window rate — reacts quickly to kills/recoveries
  if (data.metrics.windowErrorRate > 0.5) return 'border-red-500 bg-red-950'
  if (data.metrics.windowErrorRate > 0.1) return 'border-yellow-500 bg-yellow-950'
  return 'border-emerald-500 bg-gray-900'
}

function getCbBadge(state: string): { label: string; color: string } | null {
  if (state === 'open') return { label: 'CB OPEN', color: 'bg-red-600' }
  if (state === 'half-open') return { label: 'CB HALF', color: 'bg-yellow-600' }
  return null
}

function PoolBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(used / max, 1) : 0
  const color = pct > 0.9 ? 'bg-red-500' : pct > 0.7 ? 'bg-yellow-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="w-8 text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-[40px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="text-gray-500 w-10 text-right">
        {Math.round(used)}/{max}
      </span>
    </div>
  )
}

const SPARKLINE_WIDTH = 160
const SPARKLINE_HEIGHT = 28
const SPARKLINE_POINTS = 30

function Sparkline({ nodeId, mode }: { nodeId: string; mode: MiniChartMode }) {
  const metricsHistory = useSimulationStore((s) => s.metricsHistory)

  const { points, label, color, currentValue } = useMemo(() => {
    const sliced = metricsHistory.slice(-SPARKLINE_POINTS)
    const values = sliced.map((snap) => {
      const m = snap.nodeMetrics[nodeId]
      if (!m) return 0
      if (mode === 'throughput') return m.requestsPerSecond
      if (mode === 'latency') return m.avgLatency
      return m.errorRate * 100
    })

    const maxVal = Math.max(...values, 1)
    const pts = values.map((v, i) => {
      const x = (i / Math.max(SPARKLINE_POINTS - 1, 1)) * SPARKLINE_WIDTH
      const y = SPARKLINE_HEIGHT - (v / maxVal) * (SPARKLINE_HEIGHT - 2)
      return `${x},${y}`
    })

    const cfg = mode === 'throughput'
      ? { label: 'rps', color: '#3b82f6' }
      : mode === 'latency'
        ? { label: 'ms', color: '#f59e0b' }
        : { label: 'err%', color: '#ef4444' }

    return {
      points: pts.join(' '),
      label: cfg.label,
      color: cfg.color,
      currentValue: values.length > 0 ? values[values.length - 1]! : 0,
    }
  }, [metricsHistory, nodeId, mode])

  if (metricsHistory.length < 2) return null

  return (
    <div className="mb-1 bg-gray-950/60 rounded px-1 py-0.5">
      <div className="flex items-center justify-between text-[9px] mb-0.5">
        <span className="text-gray-500">{mode}</span>
        <span style={{ color }}>
          {mode === 'error' ? currentValue.toFixed(1) : Math.round(currentValue)} {label}
        </span>
      </div>
      <svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} className="w-full">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

export const ServiceNode = memo(function ServiceNode({ data, id, selected }: NodeProps<Node<ServiceNodeData>>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode)
  // Per-node chart mode takes precedence over global; fall back to global
  const globalChartMode = useSimulationStore((s) => s.miniChartMode)
  const effectiveChartMode: MiniChartMode =
    data.miniChartMode && data.miniChartMode !== 'none' ? data.miniChartMode : globalChartMode

  const healthColor = getHealthColor(data)
  const cbBadge = data.circuitBreaker.enabled ? getCbBadge(data.circuitBreaker.state) : null
  const isKilled = data.healthCheck.enabled && !data.healthCheck.healthy
  const latencyMul = data.processingTimeMultiplier ?? 1

  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 w-[210px] shadow-lg transition-colors ${healthColor} ${selected ? 'ring-2 ring-blue-400' : ''}`}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-3 !h-3" />

      {effectiveChartMode !== 'none' && (
        <Sparkline nodeId={id} mode={effectiveChartMode} />
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-white truncate max-w-[110px]">{data.label}</span>
        <div className="flex gap-1 flex-wrap justify-end">
          {data.isSource && (
            <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded">SOURCE</span>
          )}
          {isKilled && (
            <span className="text-[9px] bg-red-700 text-red-200 px-1.5 py-0.5 rounded" title="Node killed — not receiving new traffic">DEAD</span>
          )}
          {latencyMul > 1 && (
            <span className="text-[9px] bg-orange-700 text-orange-200 px-1.5 py-0.5 rounded" title={`Processing time slowed ${latencyMul}×`}>{latencyMul}× SLOW</span>
          )}
          {data.threadModel === 'virtual' && !isKilled && (
            <span className="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded" title="Virtual/async threads — released while waiting downstream">ASYNC</span>
          )}
          {/* CB badge: show state when open/half-open, else just "CB" when enabled */}
          {cbBadge ? (
            <span className={`text-[9px] text-white px-1.5 py-0.5 rounded ${cbBadge.color}`}>
              {cbBadge.label}
            </span>
          ) : data.circuitBreaker.enabled && (
            <span className="text-[9px] bg-teal-900 text-teal-400 px-1.5 py-0.5 rounded" title="Circuit breaker enabled (closed)">CB</span>
          )}
        </div>
      </div>

      <div className="space-y-1 mb-1.5">
        <PoolBar label="TH" used={data.metrics.activeRequests} max={data.threadPool.max} />
        <PoolBar label="CN" used={data.connectionPool.active} max={data.connectionPool.max} />
      </div>

      {/* Fixed-layout row — tabular-nums + justify-between prevent width thrashing */}
      <div className="flex justify-between text-[10px] tabular-nums">
        <span className="text-gray-400">{data.metrics.requestsPerSecond} rps</span>
        <span className="text-gray-400">{data.metrics.avgLatency}ms</span>
        <span className={
          data.metrics.windowErrorRate > 0.5 ? 'text-red-400 font-semibold' :
          data.metrics.windowErrorRate > 0.1 ? 'text-yellow-400' :
          'text-gray-600'
        }>
          {(data.metrics.windowErrorRate * 100).toFixed(1)}% err
        </span>
      </div>

      {data.instances > 1 && (
        <div className="text-[9px] text-gray-500 mt-1">
          {data.instances} instances
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  )
})
