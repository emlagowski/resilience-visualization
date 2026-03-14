import { useState, useEffect, useRef } from 'react'
import { useFlowStore } from '../../store/flow-store'
import { useSimulationStore } from '../../store/simulation-store'

export function StatsTable() {
  const nodes = useFlowStore((s) => s.nodes)
  const showStatsTable = useSimulationStore((s) => s.showStatsTable)
  const setShowStatsTable = useSimulationStore((s) => s.setShowStatsTable)

  // Maintain explicit row order for drag-reorder; sync when nodes change
  const [rowOrder, setRowOrder] = useState<string[]>(() => nodes.map((n) => n.id))
  useEffect(() => {
    setRowOrder((prev) => {
      const ids = nodes.map((n) => n.id)
      const kept = prev.filter((id) => ids.includes(id))
      const added = ids.filter((id) => !prev.includes(id))
      return [...kept, ...added]
    })
  }, [nodes])

  const dragId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const onDragStart = (e: React.DragEvent, id: string) => {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(id)
  }
  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const from = dragId.current
    if (!from || from === targetId) { setDragOver(null); return }
    setRowOrder((prev) => {
      const arr = [...prev]
      const fi = arr.indexOf(from), ti = arr.indexOf(targetId)
      if (fi === -1 || ti === -1) return prev
      arr.splice(fi, 1)
      arr.splice(ti, 0, from)
      return arr
    })
    dragId.current = null
    setDragOver(null)
  }
  const onDragEnd = () => { dragId.current = null; setDragOver(null) }

  if (!showStatsTable) {
    return (
      <div className="border-t border-gray-700 bg-gray-900 px-3 py-1">
        <button
          onClick={() => setShowStatsTable(true)}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Show Stats Table
        </button>
      </div>
    )
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const orderedNodes = rowOrder.map((id) => nodeMap.get(id)).filter(Boolean) as typeof nodes

  return (
    <div className="border-t border-gray-700 bg-gray-900 max-h-[250px] flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Stats Table
          <span className="ml-2 text-[10px] text-gray-600 font-normal normal-case">drag ⠿ to reorder rows</span>
        </span>
        <button
          onClick={() => setShowStatsTable(false)}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Hide
        </button>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="w-5 px-1 py-1" />
              <th className="text-left px-2 py-1 font-medium">Node</th>
              <th className="text-right px-2 py-1 font-medium">Total</th>
              <th className="text-right px-2 py-1 font-medium">Active</th>
              <th className="text-right px-2 py-1 font-medium">OK</th>
              <th className="text-right px-2 py-1 font-medium">Errors</th>
              <th className="text-right px-2 py-1 font-medium">Timeouts</th>
              <th className="text-right px-2 py-1 font-medium">Rejected</th>
              <th className="text-right px-2 py-1 font-medium">RPS</th>
              <th className="text-right px-2 py-1 font-medium">Avg ms</th>
              <th className="text-right px-2 py-1 font-medium">P99 ms</th>
              <th className="text-right px-2 py-1 font-medium">Min ms</th>
              <th className="text-right px-2 py-1 font-medium">Max ms</th>
              <th className="text-right px-2 py-1 font-medium">Err%</th>
              <th className="text-right px-2 py-1 font-medium">TH Pool</th>
              <th className="text-right px-2 py-1 font-medium">CN Pool</th>
            </tr>
          </thead>
          <tbody>
            {orderedNodes.map((node) => {
              const m = node.data.metrics
              const errPct = (m.errorRate * 100).toFixed(1)
              const thPct = (m.threadPoolUsage * 100).toFixed(0)
              const cnPct = (m.connectionPoolUsage * 100).toFixed(0)
              const isOver = dragOver === node.id
              return (
                <tr
                  key={node.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.id)}
                  onDragOver={(e) => onDragOver(e, node.id)}
                  onDrop={(e) => onDrop(e, node.id)}
                  onDragEnd={onDragEnd}
                  className={`border-b transition-colors ${
                    isOver
                      ? 'bg-blue-900/30 border-blue-500'
                      : 'border-gray-800/50 hover:bg-gray-800/50'
                  }`}
                >
                  <td
                    className="px-1 py-1 text-center text-gray-600 cursor-grab active:cursor-grabbing select-none"
                    title="Drag to reorder"
                  >
                    ⠿
                  </td>
                  <td className="text-left px-2 py-1 text-white font-medium max-w-[120px] truncate">
                    {node.data.label}
                    {node.data.isSource && (
                      <span className="ml-1 text-[9px] text-blue-400">SRC</span>
                    )}
                  </td>
                  <td className="text-right px-2 py-1 text-gray-300">{m.totalRequests}</td>
                  <td className="text-right px-2 py-1 text-gray-300">{m.activeRequests}</td>
                  <td className="text-right px-2 py-1 text-emerald-400">{m.completedRequests}</td>
                  <td className={`text-right px-2 py-1 ${m.errorCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {m.errorCount}
                  </td>
                  <td className={`text-right px-2 py-1 ${m.timeoutCount > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                    {m.timeoutCount}
                  </td>
                  <td className={`text-right px-2 py-1 ${m.rejectedCount > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {m.rejectedCount}
                  </td>
                  <td className="text-right px-2 py-1 text-blue-300">{m.requestsPerSecond}</td>
                  <td className="text-right px-2 py-1 text-gray-300">{m.avgLatency}</td>
                  <td className="text-right px-2 py-1 text-gray-300">{m.p99Latency}</td>
                  <td className="text-right px-2 py-1 text-gray-500">{m.minLatency}</td>
                  <td className="text-right px-2 py-1 text-gray-500">{m.maxLatency}</td>
                  <td className={`text-right px-2 py-1 ${Number(errPct) > 10 ? 'text-red-400' : Number(errPct) > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {errPct}%
                  </td>
                  <td className={`text-right px-2 py-1 ${Number(thPct) > 90 ? 'text-red-400' : Number(thPct) > 70 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {thPct}%
                  </td>
                  <td className={`text-right px-2 py-1 ${Number(cnPct) > 90 ? 'text-red-400' : Number(cnPct) > 70 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {cnPct}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
