import type { ScenarioConfig, FlowNode, NodeMetrics } from '../types'
import { useFlowStore, createDefaultConfig } from '../store/flow-store'

function emptyMetrics(): NodeMetrics {
  return {
    totalRequests: 0, activeRequests: 0, queueDepth: 0, completedRequests: 0,
    errorCount: 0, timeoutCount: 0, rejectedCount: 0, circuitOpenCount: 0,
    avgLatency: 0, p99Latency: 0, minLatency: 0, maxLatency: 0,
    requestsPerSecond: 0, errorRate: 0, windowErrorRate: 0,
    threadPoolUsage: 0, connectionPoolUsage: 0,
  }
}

/** Strip runtime state before export — keeps only static scenario config */
function sanitizeNode(node: FlowNode): FlowNode {
  return {
    ...node,
    data: {
      ...node.data,
      metrics: emptyMetrics(),
      threadPool: { max: node.data.threadPool.max, active: 0 },
      connectionPool: { max: node.data.connectionPool.max, active: 0 },
      healthCheck: { ...node.data.healthCheck, healthy: true },
      circuitBreaker: {
        ...node.data.circuitBreaker,
        state: 'closed' as const,
        failureCount: 0,
        successCount: 0,
        lastStateChange: 0,
        failureTimestamps: [],
        requestTimestamps: [],
      },
    },
  }
}

export function exportScenario(name: string, description: string): string {
  const { nodes, edges } = useFlowStore.getState()
  const config: ScenarioConfig = {
    name,
    description,
    nodes: nodes.map(sanitizeNode),
    // Reset failed edge state — chaos state is not part of the scenario definition
    edges: edges.map((e) => ({ ...e, data: { ...e.data, failed: false } })),
  }
  return JSON.stringify(config, null, 2)
}

export function importScenario(json: string): void {
  const config: ScenarioConfig = JSON.parse(json)
  const store = useFlowStore.getState()
  // Ensure all runtime fields are properly initialized (handles old exports or missing fields)
  const nodes = config.nodes.map((node) =>
    sanitizeNode({
      ...node,
      data: createDefaultConfig({ ...node.data }),
    }),
  )
  store.setNodes(nodes)
  store.setEdges(config.edges.map((e) => ({ ...e, data: { ...e.data, failed: false } })))
}

export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
