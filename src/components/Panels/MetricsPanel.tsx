import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useSimulationStore } from '../../store/simulation-store'
import { useFlowStore } from '../../store/flow-store'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export function MetricsPanel() {
  const metricsHistory = useSimulationStore((s) => s.metricsHistory)
  const nodes = useFlowStore((s) => s.nodes)
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)

  const displayNodes = selectedNodeId ? nodes.filter((n) => n.id === selectedNodeId) : nodes

  if (metricsHistory.length < 2) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Start simulation to see metrics
      </div>
    )
  }

  const latencyData = metricsHistory.slice(-60).map((snapshot) => {
    const point: Record<string, number> = { time: Math.round(snapshot.timestamp / 1000) }
    for (const node of displayNodes) {
      const m = snapshot.nodeMetrics[node.id]
      if (m) point[node.data.label] = m.avgLatency
    }
    return point
  })

  const errorData = metricsHistory.slice(-60).map((snapshot) => {
    const point: Record<string, number> = { time: Math.round(snapshot.timestamp / 1000) }
    for (const node of displayNodes) {
      const m = snapshot.nodeMetrics[node.id]
      if (m) point[node.data.label] = Math.round(m.errorRate * 100)
    }
    return point
  })

  const rpsData = metricsHistory.slice(-60).map((snapshot) => {
    const point: Record<string, number> = { time: Math.round(snapshot.timestamp / 1000) }
    for (const node of displayNodes) {
      const m = snapshot.nodeMetrics[node.id]
      if (m) point[node.data.label] = m.requestsPerSecond
    }
    return point
  })

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {selectedNodeId ? `Metrics: ${displayNodes[0]?.data.label}` : 'All Nodes Metrics'}
      </h3>

      <ChartBlock title="Latency" data={latencyData} nodes={displayNodes} yUnit="ms" />
      <ChartBlock title="Error Rate" data={errorData} nodes={displayNodes} yUnit="%" />
      <ChartBlock title="Throughput" data={rpsData} nodes={displayNodes} yUnit="req/s" />
    </div>
  )
}

function ChartBlock({
  title,
  data,
  nodes,
  yUnit,
}: {
  title: string
  data: Record<string, number>[]
  nodes: ReturnType<typeof useFlowStore.getState>['nodes']
  yUnit: string
}) {
  const formatY = (v: string | number) => `${v}${yUnit === 'req/s' ? '' : yUnit}`
  const formatX = (v: string | number) => `${v}s`

  return (
    <div>
      <div className="text-[11px] text-gray-400 mb-1">
        {title} <span className="text-gray-600">({yUnit})</span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={formatX}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={45}
            tickFormatter={formatY}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '11px',
            }}
            formatter={(value: unknown) => [`${value} ${yUnit}`, undefined]}
            labelFormatter={(label: unknown) => `${label}s`}
          />
          {nodes.map((node, i) => (
            <Line
              key={node.id}
              type="monotone"
              dataKey={node.data.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
