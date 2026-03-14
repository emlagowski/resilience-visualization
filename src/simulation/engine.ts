import type {
  FlowNode,
  FlowEdge,
  SimRequest,
  NodeMetrics,
  CircuitBreakerConfig,
  LoadBalancerStrategy,
} from '../types'
import { useFlowStore } from '../store/flow-store'
import { useSimulationStore } from '../store/simulation-store'

let requestIdCounter = 0
let animFrameId: number | null = null
let lastTime = 0

// Per-node tracking: latencies and RPS windows now track EVERY node a request passes through
const nodeLatencies: Record<string, number[]> = {}
const nodeRpsWindow: Record<string, number[]> = {}
const requestAccumulator: Record<string, number> = {}
// Round-robin counter per node
const rrCounter: Record<string, number> = {}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function getDownstreamEdges(nodeId: string, edges: FlowEdge[]): FlowEdge[] {
  return edges.filter((e) => e.source === nodeId)
}

function pickDownstreamEdge(
  nodeId: string,
  downEdges: FlowEdge[],
  strategy: LoadBalancerStrategy,
  nodeMap: Map<string, FlowNode>,
  requests: SimRequest[],
): FlowEdge | null {
  // Filter out unhealthy targets
  const healthy = downEdges.filter((e) => {
    const target = nodeMap.get(e.target)
    if (!target) return false
    if (target.data.healthCheck.enabled && !target.data.healthCheck.healthy) return false
    return true
  })
  if (healthy.length === 0) return null

  if (strategy === 'round-robin') {
    if (!rrCounter[nodeId]) rrCounter[nodeId] = 0
    const idx = rrCounter[nodeId]! % healthy.length
    rrCounter[nodeId] = (rrCounter[nodeId]! + 1)
    return healthy[idx]!
  }

  if (strategy === 'random') {
    return healthy[Math.floor(Math.random() * healthy.length)]!
  }

  if (strategy === 'least-connections') {
    // Pick the target with fewest active requests
    let best = healthy[0]!
    let bestCount = Infinity
    for (const edge of healthy) {
      const count = requests.filter(
        (r) =>
          r.currentNodeId === edge.target &&
          (r.status === 'processing' || r.status === 'pending'),
      ).length
      if (count < bestCount) {
        bestCount = count
        best = edge
      }
    }
    return best
  }

  return healthy[0]!
}

function checkCircuitBreaker(cb: CircuitBreakerConfig, now: number): boolean {
  if (!cb.enabled) return true
  if (cb.state === 'open') {
    return now - cb.lastStateChange >= cb.openDuration // allow if duration passed (half-open transition)
  }
  return true // closed or half-open allow traffic
}

function shouldTripCircuitBreaker(cb: CircuitBreakerConfig): boolean {
  const mode = cb.thresholdMode ?? 'count'
  const totalInWindow = (cb.requestTimestamps ?? []).length
  const failuresInWindow = cb.failureTimestamps.length
  const minSample = cb.minSampleSize ?? 10
  const rateThreshold = (cb.failureRateThreshold ?? 50) / 100

  const countTrips = failuresInWindow >= cb.failureThreshold
  const percentageTrips =
    totalInWindow >= minSample && totalInWindow > 0 && failuresInWindow / totalInWindow >= rateThreshold

  if (mode === 'count') return countTrips
  if (mode === 'percentage') return percentageTrips
  // 'both' — either condition is enough
  return countTrips || percentageTrips
}

function updateCircuitBreakerOnResult(
  cb: CircuitBreakerConfig,
  success: boolean,
  now: number,
): CircuitBreakerConfig {
  if (!cb.enabled) return cb
  const updated = { ...cb }

  // Purge old timestamps outside the sliding window
  updated.failureTimestamps = updated.failureTimestamps.filter(
    (t) => now - t < updated.windowSize,
  )
  updated.requestTimestamps = (updated.requestTimestamps ?? []).filter(
    (t) => now - t < updated.windowSize,
  )

  if (updated.state === 'closed') {
    // Track every result in the window
    updated.requestTimestamps = [...updated.requestTimestamps, now]
    if (!success) {
      updated.failureTimestamps = [...updated.failureTimestamps, now]
    }
    updated.failureCount = updated.failureTimestamps.length

    if (shouldTripCircuitBreaker(updated)) {
      updated.state = 'open'
      updated.lastStateChange = now
      updated.failureCount = 0
      updated.successCount = 0
      updated.failureTimestamps = []
      updated.requestTimestamps = []
    }
  } else if (updated.state === 'half-open') {
    if (success) {
      updated.successCount++
      if (updated.successCount >= updated.successThreshold) {
        updated.state = 'closed'
        updated.lastStateChange = now
        updated.failureCount = 0
        updated.successCount = 0
        updated.failureTimestamps = []
        updated.requestTimestamps = []
      }
    } else {
      updated.state = 'open'
      updated.lastStateChange = now
      updated.failureCount = 0
      updated.successCount = 0
      updated.failureTimestamps = []
      updated.requestTimestamps = []
    }
  }

  return updated
}

/**
 * Record completion metrics for EVERY node in the request's path.
 * For each node, latency = completedAt - nodeEntryTime[nodeId].
 */
function recordCompletion(req: SimRequest, now: number) {
  const realNow = Date.now()
  for (const nodeId of req.path) {
    const entryTime = req.nodeEntryTime[nodeId]
    if (entryTime == null) continue
    const latency = now - entryTime

    if (!nodeLatencies[nodeId]) nodeLatencies[nodeId] = []
    nodeLatencies[nodeId]!.push(latency)
    // Trim to avoid unbounded growth
    if (nodeLatencies[nodeId]!.length > 1000) {
      nodeLatencies[nodeId] = nodeLatencies[nodeId]!.slice(-500)
    }

    if (!nodeRpsWindow[nodeId]) nodeRpsWindow[nodeId] = []
    nodeRpsWindow[nodeId]!.push(realNow)
  }
}

function computeMetrics(nodeId: string, requests: SimRequest[], node: FlowNode): NodeMetrics {
  const active = requests.filter(
    (r) =>
      r.currentNodeId === nodeId &&
      (r.status === 'processing' || r.status === 'pending'),
  ).length
  const latencies = nodeLatencies[nodeId] ?? []
  const sorted = [...latencies].sort((a, b) => a - b)
  const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0
  const p99 = sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.99)] ?? 0) : 0

  const rpsTimestamps = nodeRpsWindow[nodeId] ?? []
  const realNow = Date.now()
  const recentRps = rpsTimestamps.filter((t) => realNow - t < 1000).length

  // Clean up old RPS timestamps
  if (rpsTimestamps.length > 500) {
    nodeRpsWindow[nodeId] = rpsTimestamps.filter((t) => realNow - t < 2000)
  }

  const completedCount = nodeLatencies[nodeId]?.length ?? 0
  const total = completedCount + active
  const errorCount = requests.filter(
    (r) => r.path.includes(nodeId) && (r.status === 'error' || r.status === 'timeout'),
  ).length

  const minLat = sorted.length > 0 ? sorted[0]! : 0
  const maxLat = sorted.length > 0 ? sorted[sorted.length - 1]! : 0

  return {
    totalRequests: total,
    activeRequests: active,
    completedRequests: completedCount,
    errorCount,
    timeoutCount: requests.filter((r) => r.path.includes(nodeId) && r.status === 'timeout').length,
    rejectedCount: requests.filter(
      (r) => r.path.includes(nodeId) && (r.status === 'rejected' || r.status === 'circuit_open'),
    ).length,
    circuitOpenCount: node.data.circuitBreaker.state === 'open' ? 1 : 0,
    avgLatency: Math.round(avg),
    p99Latency: Math.round(p99),
    minLatency: Math.round(minLat),
    maxLatency: Math.round(maxLat),
    requestsPerSecond: recentRps,
    errorRate: total > 0 ? errorCount / total : 0,
    threadPoolUsage: node.data.threadPool.max > 0 ? active / node.data.threadPool.max : 0,
    connectionPoolUsage:
      node.data.connectionPool.max > 0
        ? node.data.connectionPool.active / node.data.connectionPool.max
        : 0,
  }
}

function tick(deltaMs: number) {
  const flowStore = useFlowStore.getState()
  const simStore = useSimulationStore.getState()

  if (!simStore.running) return

  const speed = simStore.speed
  const simDelta = deltaMs * speed
  const now = simStore.simTime + simDelta

  const nodes = flowStore.nodes
  const edges = flowStore.edges
  let requests = [...simStore.requests]
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const nodeUpdates: Record<string, Partial<FlowNode['data']>> = {}

  // Helper to apply CB update
  function applyCbResult(upstreamNodeId: string, success: boolean) {
    const upNode = nodeMap.get(upstreamNodeId)
    if (!upNode) return
    const currentCb =
      (nodeUpdates[upstreamNodeId]?.circuitBreaker as CircuitBreakerConfig | undefined) ??
      upNode.data.circuitBreaker
    const updatedCb = updateCircuitBreakerOnResult(currentCb, success, now)
    nodeUpdates[upstreamNodeId] = {
      ...nodeUpdates[upstreamNodeId],
      circuitBreaker: updatedCb,
    }
  }

  function freeConnectionPool(nodeId: string) {
    const node = nodeMap.get(nodeId)
    if (!node) return
    const current = nodeUpdates[nodeId]?.connectionPool ?? node.data.connectionPool
    nodeUpdates[nodeId] = {
      ...nodeUpdates[nodeId],
      connectionPool: {
        ...current,
        active: Math.max(current.active - 1, 0),
      },
    }
  }

  // Free connection pools and update CBs for ALL upstream nodes in the path
  function finalizeRequest(req: SimRequest, success: boolean) {
    // Every node in the path (except the current/leaf) had a connection pool slot allocated
    for (let i = 0; i < req.path.length - 1; i++) {
      const upId = req.path[i]!
      freeConnectionPool(upId)
      applyCbResult(upId, success)
    }
  }

  // 1. Generate new requests from source nodes
  for (const node of nodes) {
    if (!node.data.isSource) continue
    const rps = node.data.requestsPerSecond
    if (!requestAccumulator[node.id]) requestAccumulator[node.id] = 0
    requestAccumulator[node.id]! += (rps * simDelta) / 1000
    const count = Math.floor(requestAccumulator[node.id]!)
    requestAccumulator[node.id]! -= count
    for (let i = 0; i < count; i++) {
      requests.push({
        id: `req-${++requestIdCounter}`,
        status: 'pending',
        sourceNodeId: node.id,
        currentNodeId: node.id,
        path: [node.id],
        createdAt: now,
        startedProcessingAt: null,
        completedAt: null,
        processingDoneAt: null,
        deadlineAt: null,
        progress: 0,
        edgeId: null,
        direction: 'downstream',
        nodeEntryTime: { [node.id]: now },
      })
    }
  }

  // 2. Process each request (edge animation does NOT block processing)
  const completedIds = new Set<string>()

  for (const req of requests) {
    // Skip terminal states, garbage collect old ones
    if (
      req.status === 'completed' ||
      req.status === 'error' ||
      req.status === 'timeout' ||
      req.status === 'rejected' ||
      req.status === 'circuit_open'
    ) {
      if (req.completedAt && now - req.completedAt > 2000) {
        completedIds.add(req.id)
      }
      continue
    }

    const currentNode = nodeMap.get(req.currentNodeId)
    if (!currentNode) {
      req.status = 'error'
      req.completedAt = now
      continue
    }

    // NOTE: No edge traversal blocking here. edgeId is purely visual and
    // is updated in a separate pass at the end of the tick.

    // ── PENDING — try to enter the node's thread pool ──
    if (req.status === 'pending') {
      const activeInNode = requests.filter(
        (r) => r.currentNodeId === currentNode.id && r.status === 'processing',
      ).length

      if (activeInNode >= currentNode.data.threadPool.max) {
        req.status = 'rejected'
        req.completedAt = now
        recordCompletion(req, now)
        finalizeRequest(req, false)
        continue
      }

      // Check deadline from upstream
      if (req.deadlineAt && now >= req.deadlineAt) {
        req.status = 'timeout'
        req.completedAt = now
        recordCompletion(req, now)
        finalizeRequest(req, false)
        continue
      }

      // Enter processing
      req.status = 'processing'
      req.startedProcessingAt = now
      req.processingDoneAt =
        now + randomBetween(currentNode.data.processingTime.min, currentNode.data.processingTime.max)

      // Random error at this node
      if (Math.random() < currentNode.data.errorRate) {
        req.status = 'error'
        req.completedAt = now
        recordCompletion(req, now)
        finalizeRequest(req, false)
        continue
      }
    }

    // ── PROCESSING — wait for local processing to finish ──
    if (req.status === 'processing') {
      // Check deadline timeout while processing
      if (req.deadlineAt && now >= req.deadlineAt) {
        req.status = 'timeout'
        req.completedAt = now
        recordCompletion(req, now)
        finalizeRequest(req, false)
        continue
      }

      // Still processing locally
      if (!req.processingDoneAt || now < req.processingDoneAt) {
        continue
      }

      // Processing done! Check if we need to go downstream
      const downEdges = getDownstreamEdges(currentNode.id, edges)
      if (downEdges.length > 0 && req.direction === 'downstream') {
        // Check circuit breaker before sending downstream
        const cbAllowed = checkCircuitBreaker(currentNode.data.circuitBreaker, now)
        if (!cbAllowed) {
          req.status = 'circuit_open'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        // Transition to half-open if needed
        if (
          currentNode.data.circuitBreaker.enabled &&
          currentNode.data.circuitBreaker.state === 'open'
        ) {
          nodeUpdates[currentNode.id] = {
            ...nodeUpdates[currentNode.id],
            circuitBreaker: {
              ...currentNode.data.circuitBreaker,
              state: 'half-open' as const,
              lastStateChange: now,
            },
          }
        }

        // Check connection pool
        const cp =
          (nodeUpdates[currentNode.id]?.connectionPool as typeof currentNode.data.connectionPool | undefined) ??
          currentNode.data.connectionPool
        if (cp.active >= cp.max) {
          req.status = 'rejected'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        // Pick downstream target using load balancer strategy
        const edge = pickDownstreamEdge(
          currentNode.id,
          downEdges,
          currentNode.data.loadBalancer,
          nodeMap,
          requests,
        )

        if (!edge) {
          // All downstream targets unhealthy
          req.status = 'error'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        // Send downstream — allocate connection pool on current node
        nodeUpdates[currentNode.id] = {
          ...nodeUpdates[currentNode.id],
          connectionPool: {
            ...currentNode.data.connectionPool,
            active: Math.min(cp.active + 1, cp.max),
          },
        }

        // Set edgeId for visual animation only — does NOT block processing
        req.edgeId = edge.id
        req.progress = 0
        req.currentNodeId = edge.target
        req.path.push(edge.target)
        req.nodeEntryTime[edge.target] = now
        req.status = 'pending'
        req.processingDoneAt = null
        req.deadlineAt = now + currentNode.data.timeout

        // The request is immediately 'pending' at the target node and will be
        // picked up for processing in this same tick (or the next if thread pool
        // is full). The edgeId/progress are updated visually below.
      } else {
        // Leaf node or no downstream — request completed successfully
        req.status = 'completed'
        req.completedAt = now
        recordCompletion(req, now)
        finalizeRequest(req, true)
      }
    }
  }

  // 3. Update edge animation progress (purely visual, never blocks simulation)
  for (const req of requests) {
    if (req.edgeId) {
      req.progress += 0.003 * speed * deltaMs
      if (req.progress >= 1) {
        req.progress = 0
        req.edgeId = null
      }
    }
  }

  // Remove old completed requests
  requests = requests.filter((r) => !completedIds.has(r.id))

  // Apply node config updates (circuit breakers, connection pools)
  for (const [nodeId, updates] of Object.entries(nodeUpdates)) {
    flowStore.updateNodeConfig(nodeId, updates)
  }

  // Update metrics on all nodes
  const freshNodes = useFlowStore.getState().nodes
  for (const node of freshNodes) {
    const metrics = computeMetrics(node.id, requests, node)
    flowStore.updateNodeConfig(node.id, { metrics })
  }

  // Store state
  simStore.setSimTime(now)
  simStore.setTick(simStore.tick + 1)
  simStore.setRequests(requests)

  // Snapshot metrics every ~1s of sim time
  if (Math.floor(now / 1000) > Math.floor((now - simDelta) / 1000)) {
    const metricsNodes = useFlowStore.getState().nodes
    const nodeMetrics: Record<string, NodeMetrics> = {}
    for (const node of metricsNodes) {
      nodeMetrics[node.id] = node.data.metrics
    }
    simStore.addMetricsSnapshot({ timestamp: now, nodeMetrics })
  }
}

export function startSimulationLoop() {
  if (animFrameId !== null) return
  lastTime = performance.now()

  function loop(time: number) {
    const delta = Math.min(time - lastTime, 50)
    lastTime = time
    tick(delta)
    animFrameId = requestAnimationFrame(loop)
  }

  animFrameId = requestAnimationFrame(loop)
}

export function stopSimulationLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
}

export function resetSimulation() {
  stopSimulationLoop()
  for (const key of Object.keys(nodeLatencies)) delete nodeLatencies[key]
  for (const key of Object.keys(nodeRpsWindow)) delete nodeRpsWindow[key]
  for (const key of Object.keys(requestAccumulator)) delete requestAccumulator[key]
  for (const key of Object.keys(rrCounter)) delete rrCounter[key]
  requestIdCounter = 0

  const flowStore = useFlowStore.getState()
  for (const node of flowStore.nodes) {
    flowStore.updateNodeConfig(node.id, {
      threadPool: { ...node.data.threadPool, active: 0 },
      connectionPool: { ...node.data.connectionPool, active: 0 },
      circuitBreaker: {
        ...node.data.circuitBreaker,
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        failureTimestamps: [],
      },
    })
  }

  useSimulationStore.getState().reset()
}
