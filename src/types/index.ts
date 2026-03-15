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

export type CbThresholdMode = 'count' | 'percentage' | 'both'

export interface CircuitBreakerConfig {
  enabled: boolean
  state: 'closed' | 'open' | 'half-open'
  thresholdMode: CbThresholdMode  // how to evaluate trip: count, %, or either
  failureThreshold: number         // count mode: absolute failures in window
  failureRateThreshold: number     // percentage mode: 0-100 (e.g. 50 = 50%)
  minSampleSize: number            // min requests in window before % mode can trip
  successThreshold: number
  openDuration: number // ms
  windowSize: number // ms
  failureCount: number
  successCount: number
  lastStateChange: number
  failureTimestamps: number[]
  requestTimestamps: number[]      // all request timestamps in window (for % calc)
}

export interface HealthCheckConfig {
  enabled: boolean
  interval: number // ms
  healthy: boolean
}

export type LoadBalancerStrategy = 'round-robin' | 'random' | 'least-connections'

export type ThreadModel = 'platform' | 'virtual'

export interface ServiceNodeConfig {
  label: string
  threadModel: ThreadModel   // 'platform' = blocking I/O, 'virtual' = async/non-blocking
  threadPool: ThreadPoolConfig
  queueSize: number   // max requests waiting for a thread; 0 = reject immediately when pool full
  queueTimeout: number // ms; max time a request waits in queue before rejected; 0 = disabled
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
  processingTimeMultiplier: number // chaos: 1 = normal, 5 = 5× slower, etc.
  miniChartMode: MiniChartMode     // per-node chart override
}

// ─── Chart / UI ────────────────────────────────────────────────────

export type MiniChartMode = 'none' | 'throughput' | 'latency' | 'error'

// ─── React Flow Node/Edge types ────────────────────────────────────

export type ServiceNodeData = ServiceNodeConfig & {
  metrics: NodeMetrics
  [key: string]: unknown
}

export type FlowNode = Node<ServiceNodeData, 'service'>

export interface FlowEdgeData extends Record<string, unknown> {
  failed?: boolean
}

export type FlowEdge = Edge<FlowEdgeData>

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
  progress: number // 0-1 animation progress on edge (visual only)
  edgeId: string | null // current edge being animated (visual only, does not block processing)
  direction: 'downstream' | 'upstream' // request or response
  nodeEntryTime: Record<string, number> // sim time when the request entered each node
  platformThreadsHeld: string[] // nodeIds whose platform threads are blocked waiting for this request
}

// ─── Metrics ───────────────────────────────────────────────────────

export interface NodeMetrics {
  totalRequests: number
  activeRequests: number  // threads actually in use (processing + platformHeld), never exceeds threadPool.max
  queueDepth: number      // requests waiting for a free thread (pending, not yet processing)
  completedRequests: number
  errorCount: number
  timeoutCount: number
  rejectedCount: number
  circuitOpenCount: number
  avgLatency: number
  p99Latency: number
  minLatency: number
  maxLatency: number
  requestsPerSecond: number
  errorRate: number          // cumulative: all failures / all completed
  windowErrorRate: number    // sliding window: CB window if CB enabled, else 30s
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
