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

  onNodesChange: OnNodesChange<FlowNode>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  addNode: (config: Partial<ServiceNodeData>, position?: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeConfig: (id: string, config: Partial<ServiceNodeData>) => void
  setSelectedNode: (id: string | null) => void
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: FlowEdge[]) => void
}

let nodeCounter = 0

export function createDefaultConfig(overrides: Partial<ServiceNodeData> = {}): ServiceNodeData {
  return {
    label: overrides.label ?? 'Service',
    threadPool: { max: 20, active: 0 },
    connectionPool: { max: 10, active: 0 },
    timeout: 3000,
    processingTime: { min: 50, max: 200 },
    errorRate: 0,
    circuitBreaker: {
      enabled: false,
      state: 'closed',
      failureThreshold: 5,
      successThreshold: 3,
      openDuration: 10000,
      windowSize: 60000,
      failureCount: 0,
      successCount: 0,
      lastStateChange: 0,
      failureTimestamps: [],
    },
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
    ...overrides,
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

  setSelectedNode: (id) => {
    set({ selectedNodeId: id })
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
}))
