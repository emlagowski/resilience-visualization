import type { Node, Edge } from '@xyflow/react'

// ─── Service Node Configuration ────────────────────────────────────

export interface ThreadPoolConfig {
  max: number
  active: number
}

export interface ConnectionPoolConfig {
  max: number
  active: number
}

export interface CircuitBreakerConfig {
  enabled: boolean
  state: 'closed' | 'open' | 'half-open'
  failureThreshold: number
  successThreshold: number
  openDuration: number // ms
  windowSize: number // ms
  failureCount: number
  successCount: number
  lastStateChange: number
  failureTimestamps: number[]
}

export interface HealthCheckConfig {
  enabled: boolean
  interval: number // ms
  healthy: boolean
}

export type LoadBalancerStrategy = 'round-robin' | 'random' | 'least-connections'

export interface ServiceNodeConfig {
  label: string
  threadPool: ThreadPoolConfig
  connectionPool: ConnectionPoolConfig
  timeout: number // ms
  processingTime: { min: number; max: number } // ms
  errorRate: number // 0-1
  circuitBreaker: CircuitBreakerConfig
  healthCheck: HealthCheckConfig
  loadBalancer: LoadBalancerStrategy
  instances: number
  requestsPerSecond: number // only for source nodes
  isSource: boolean
}

// ─── React Flow Node/Edge types ────────────────────────────────────

export type ServiceNodeData = ServiceNodeConfig & {
  metrics: NodeMetrics
  [key: string]: unknown
}

export type FlowNode = Node<ServiceNodeData, 'service'>
export type FlowEdge = Edge

// ─── Simulation ────────────────────────────────────────────────────

export type RequestStatus =
  | 'pending'
  | 'processing'
  | 'waiting_downstream'
  | 'completed'
  | 'timeout'
  | 'error'
  | 'rejected'
  | 'circuit_open'

export interface SimRequest {
  id: string
  status: RequestStatus
  sourceNodeId: string
  currentNodeId: string
  path: string[]
  createdAt: number
  startedProcessingAt: number | null
  completedAt: number | null
  processingDoneAt: number | null // when local processing finishes
  deadlineAt: number | null // upstream timeout deadline
  progress: number // 0-1 animation progress on edge
  edgeId: string | null // current edge being traversed
  direction: 'downstream' | 'upstream' // request or response
}

// ─── Metrics ───────────────────────────────────────────────────────

export interface NodeMetrics {
  totalRequests: number
  activeRequests: number
  completedRequests: number
  errorCount: number
  timeoutCount: number
  rejectedCount: number
  circuitOpenCount: number
  avgLatency: number
  p99Latency: number
  requestsPerSecond: number
  errorRate: number
  threadPoolUsage: number // 0-1
  connectionPoolUsage: number // 0-1
}

export interface MetricsSnapshot {
  timestamp: number
  nodeMetrics: Record<string, NodeMetrics>
}

// ─── Serialization ─────────────────────────────────────────────────

export interface ScenarioConfig {
  name: string
  description: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}
