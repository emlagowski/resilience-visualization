import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react'
import type { FlowNode, FlowEdge, ServiceNodeData } from '../types'

interface FlowState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | null
  clipboardConfig: Partial<ServiceNodeData> | null

  onNodesChange: OnNodesChange<FlowNode>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  addNode: (config: Partial<ServiceNodeData>, position?: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeConfig: (id: string, config: Partial<ServiceNodeData>) => void
  updateNodePosition: (id: string, position: { x: number; y: number }) => void
  duplicateNode: (id: string, position?: { x: number; y: number }) => string
  copyConfig: (id: string) => void
  pasteConfig: (id: string) => void
  setSelectedNode: (id: string | null) => void
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: FlowEdge[]) => void
}

let nodeCounter = 0

export function createDefaultConfig(overrides: Partial<ServiceNodeData> = {}): ServiceNodeData {
  // Deep-merge circuitBreaker so partial overrides keep new fields' defaults
  const { circuitBreaker: cbOverride, ...rest } = overrides
  const circuitBreaker = {
    enabled: false,
    state: 'closed' as const,
    thresholdMode: 'percentage' as const,
    failureThreshold: 5,
    failureRateThreshold: 50,
    minSampleSize: 50,
    successThreshold: 3,
    openDuration: 10000,
    windowSize: 60000,
    failureCount: 0,
    successCount: 0,
    lastStateChange: 0,
    failureTimestamps: [] as number[],
    requestTimestamps: [] as number[],
    ...cbOverride,
  }

  return {
    label: rest.label ?? 'Service',
    threadPool: { max: 20, active: 0 },
    connectionPool: { max: 10, active: 0 },
    timeout: 3000,
    processingTime: { min: 50, max: 200 },
    errorRate: 0,
    circuitBreaker,
    healthCheck: {
      enabled: false,
      interval: 5000,
      healthy: true,
    },
    loadBalancer: 'round-robin',
    instances: 1,
    requestsPerSecond: 10,
    isSource: false,
    metrics: createEmptyMetrics(),
    ...rest,
    // rest may also override circuitBreaker with a partial but that's covered above
  }
}

function createEmptyMetrics() {
  return {
    totalRequests: 0,
    activeRequests: 0,
    completedRequests: 0,
    errorCount: 0,
    timeoutCount: 0,
    rejectedCount: 0,
    circuitOpenCount: 0,
    avgLatency: 0,
    p99Latency: 0,
    minLatency: 0,
    maxLatency: 0,
    requestsPerSecond: 0,
    errorRate: 0,
    threadPoolUsage: 0,
    connectionPoolUsage: 0,
  }
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  clipboardConfig: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as FlowNode[] })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) })
  },

  addNode: (config, position) => {
    const id = `node-${++nodeCounter}`
    const fullConfig = createDefaultConfig(config)
    const newNode: FlowNode = {
      id,
      type: 'service',
      position: position ?? { x: 100 + nodeCounter * 250, y: 200 },
      data: fullConfig,
    }
    set({ nodes: [...get().nodes, newNode] })
    return id
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...config } } : node,
      ),
    })
  },

  updateNodePosition: (id, position) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, position } : node,
      ),
    })
  },

  duplicateNode: (id, position) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return ''
    const newId = `node-${++nodeCounter}`
    const newNode: FlowNode = {
      ...node,
      id: newId,
      position: position ?? { x: node.position.x + 30, y: node.position.y + 30 },
      data: {
        ...node.data,
        label: `${node.data.label} (copy)`,
        metrics: createEmptyMetrics(),
        // reset runtime state in CB and pools
        circuitBreaker: {
          ...node.data.circuitBreaker,
          state: 'closed',
          failureCount: 0,
          successCount: 0,
          failureTimestamps: [],
          requestTimestamps: [],
        },
        connectionPool: { ...node.data.connectionPool, active: 0 },
        threadPool: { ...node.data.threadPool, active: 0 },
      },
      selected: false,
    }
    set({ nodes: [...get().nodes, newNode] })
    return newId
  },

  copyConfig: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    // Copy everything except label and runtime metrics/state
    const { metrics: _m, label: _l, ...config } = node.data
    set({ clipboardConfig: config as Partial<ServiceNodeData> })
  },

  pasteConfig: (id) => {
    const config = get().clipboardConfig
    if (!config) return
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                ...config,
                // preserve label, metrics, and reset runtime pool/CB state
                label: n.data.label,
                metrics: n.data.metrics,
                connectionPool: { ...(config.connectionPool ?? n.data.connectionPool), active: n.data.connectionPool.active },
                circuitBreaker: {
                  ...(config.circuitBreaker ?? n.data.circuitBreaker),
                  state: 'closed',
                  failureCount: 0,
                  successCount: 0,
                  failureTimestamps: [],
                  requestTimestamps: [],
                },
              },
            }
          : n,
      ),
    })
  },

  setSelectedNode: (id) => {
    set({ selectedNodeId: id })
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
}))
