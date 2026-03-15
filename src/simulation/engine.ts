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

// Per-node historical counters — all grow monotonically and are only cleared on reset.
// Using historical counts (not live-request filtering) prevents the errorRate from
// drifting toward 0 as the totalRequests denominator grows unboundedly.
const nodeLatencies: Record<string, number[]> = {}   // latencies of SUCCESSFUL completions only
const nodeRpsWindow: Record<string, number[]> = {}   // wall-clock timestamps for RPS (all requests)
const nodeTotalCount: Record<string, number> = {}    // all terminal requests through this node
const nodeOkCount: Record<string, number> = {}       // completed successfully
const nodeErrorCount: Record<string, number> = {}    // error + circuit_open
const nodeTimeoutCount: Record<string, number> = {}  // timeout
const nodeRejectedCount: Record<string, number> = {} // rejected (thread/connection pool full)
// Sliding-window error tracking (sim-time timestamps, for the windowed error rate metric).
// Window size = CB window when CB enabled, 30 s otherwise.
const nodeWindowAll: Record<string, number[]> = {}     // sim-time stamps of all completions
const nodeWindowFail: Record<string, number[]> = {}    // sim-time stamps of failures
const requestAccumulator: Record<string, number> = {}
// Round-robin counter per node
const rrCounter: Record<string, number> = {}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function getDownstreamEdges(nodeId: string, edges: FlowEdge[]): FlowEdge[] {
  return edges.filter((e) => e.source === nodeId && !e.data?.failed)
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
 *
 * Rules:
 * - Latency is tracked ONLY for successful (completed) requests. Recording
 *   rejections/errors (which complete near-instantly) would artificially lower
 *   avgLatency when the system is shedding load.
 * - Error/timeout/rejected counters are historical accumulators so errorRate
 *   stays accurate over long simulations (doesn't drift to 0 as total grows).
 * - RPS window tracks all request types (throughput = all attempts).
 */
function recordCompletion(req: SimRequest, now: number) {
  const realNow = Date.now()
  const status = req.status

  for (const nodeId of req.path) {
    const entryTime = req.nodeEntryTime[nodeId]
    if (entryTime == null) continue

    // ── Historical counters (always updated) ───────────────────────
    nodeTotalCount[nodeId] = (nodeTotalCount[nodeId] ?? 0) + 1

    if (status === 'completed') {
      nodeOkCount[nodeId] = (nodeOkCount[nodeId] ?? 0) + 1
      // Latency only for successes — keeps avg/p99 meaningful under load shedding
      const latency = now - entryTime
      if (!nodeLatencies[nodeId]) nodeLatencies[nodeId] = []
      nodeLatencies[nodeId]!.push(latency)
      if (nodeLatencies[nodeId]!.length > 1000) {
        nodeLatencies[nodeId] = nodeLatencies[nodeId]!.slice(-500)
      }
    } else if (status === 'timeout') {
      nodeTimeoutCount[nodeId] = (nodeTimeoutCount[nodeId] ?? 0) + 1
    } else if (status === 'rejected') {
      nodeRejectedCount[nodeId] = (nodeRejectedCount[nodeId] ?? 0) + 1
    } else {
      // error, circuit_open
      nodeErrorCount[nodeId] = (nodeErrorCount[nodeId] ?? 0) + 1
    }

    // ── Sliding-window failure tracking (sim time) ─────────────────
    if (!nodeWindowAll[nodeId]) nodeWindowAll[nodeId] = []
    nodeWindowAll[nodeId]!.push(now)
    if (status !== 'completed') {
      if (!nodeWindowFail[nodeId]) nodeWindowFail[nodeId] = []
      nodeWindowFail[nodeId]!.push(now)
    }

    // ── RPS window (wall-clock, all request types) ──────────────────
    if (!nodeRpsWindow[nodeId]) nodeRpsWindow[nodeId] = []
    nodeRpsWindow[nodeId]!.push(realNow)
  }
}

function computeMetrics(nodeId: string, requests: SimRequest[], node: FlowNode, now: number): NodeMetrics {
  // ── Thread/pool occupancy (from live requests) ──────────────────────
  const processingAtNode = requests.filter(
    (r) => r.currentNodeId === nodeId && r.status === 'processing',
  ).length
  const queuedAtNode = requests.filter(
    (r) => r.currentNodeId === nodeId && r.status === 'pending',
  ).length
  // In platform mode, also count threads blocked waiting for downstream responses
  const platformHeld =
    node.data.threadModel === 'platform'
      ? requests.filter((r) => r.platformThreadsHeld.includes(nodeId)).length
      : 0
  // threadsInUse: actual thread pool consumption — never exceeds threadPool.max
  const threadsInUse = processingAtNode + platformHeld
  // total in-flight (threads + queue) — used for totalRequests count
  const active = processingAtNode + queuedAtNode + platformHeld

  // ── Historical counters ─────────────────────────────────────────────
  const totalCompleted = nodeTotalCount[nodeId] ?? 0
  const okCount = nodeOkCount[nodeId] ?? 0
  const errCount = nodeErrorCount[nodeId] ?? 0
  const toCount = nodeTimeoutCount[nodeId] ?? 0
  const rejCount = nodeRejectedCount[nodeId] ?? 0
  // All failure types count toward error rate (including rejections/circuit_open)
  const allFailures = errCount + toCount + rejCount
  const total = totalCompleted + active

  // ── Latency stats (successes only) ─────────────────────────────────
  const latencies = nodeLatencies[nodeId] ?? []
  const sorted = [...latencies].sort((a, b) => a - b)
  const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0
  const p99 = sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.99)] ?? 0) : 0
  const minLat = sorted.length > 0 ? sorted[0]! : 0
  const maxLat = sorted.length > 0 ? sorted[sorted.length - 1]! : 0

  // ── Sliding-window error rate (sim time) ───────────────────────────
  // Use the CB window size when CB is enabled, otherwise default to 30 s.
  const windowMs = node.data.circuitBreaker.enabled ? node.data.circuitBreaker.windowSize : 30_000
  const winAll = (nodeWindowAll[nodeId] ?? []).filter((t) => now - t <= windowMs)
  const winFail = (nodeWindowFail[nodeId] ?? []).filter((t) => now - t <= windowMs)
  // Trim stale entries to avoid unbounded growth
  nodeWindowAll[nodeId] = winAll
  nodeWindowFail[nodeId] = winFail
  const windowErrorRate = winAll.length > 0 ? winFail.length / winAll.length : 0

  // ── RPS (all request types, 1s wall-clock window) ───────────────────
  const rpsTimestamps = nodeRpsWindow[nodeId] ?? []
  const realNow = Date.now()
  const recentRps = rpsTimestamps.filter((t) => realNow - t < 1000).length
  if (rpsTimestamps.length > 500) {
    nodeRpsWindow[nodeId] = rpsTimestamps.filter((t) => realNow - t < 2000)
  }

  return {
    totalRequests: total,
    activeRequests: threadsInUse,  // threads actually occupied (≤ threadPool.max)
    queueDepth: queuedAtNode,      // requests waiting for a free thread
    completedRequests: okCount,
    errorCount: errCount,
    timeoutCount: toCount,
    rejectedCount: rejCount,
    circuitOpenCount: node.data.circuitBreaker.state === 'open' ? 1 : 0,
    avgLatency: Math.round(avg),
    p99Latency: Math.round(p99),
    minLatency: Math.round(minLat),
    maxLatency: Math.round(maxLat),
    requestsPerSecond: recentRps,
    // cumulative rate — never resets, useful for full-session view
    errorRate: totalCompleted > 0 ? allFailures / totalCompleted : 0,
    // sliding-window rate — drives node coloring, reacts quickly to changes
    windowErrorRate,
    threadPoolUsage: node.data.threadPool.max > 0 ? threadsInUse / node.data.threadPool.max : 0,
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
    // Release all platform threads that were held waiting for this request
    req.platformThreadsHeld = []
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
        platformThreadsHeld: [],
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
      // 1. Check upstream deadline (request waited too long overall)
      if (req.deadlineAt && now >= req.deadlineAt) {
        req.status = 'timeout'
        req.completedAt = now
        recordCompletion(req, now)
        finalizeRequest(req, false)
        continue
      }

      const activeProcessing = requests.filter(
        (r) => r.currentNodeId === currentNode.id && r.status === 'processing',
      ).length
      // In platform mode, also count threads blocked waiting for downstream responses
      const platformHeld =
        currentNode.data.threadModel === 'platform'
          ? requests.filter((r) => r.platformThreadsHeld.includes(currentNode.id)).length
          : 0
      const activeInNode = activeProcessing + platformHeld

      if (activeInNode >= currentNode.data.threadPool.max) {
        if (req.deadlineAt === null) {
          // Source-originated request with no upstream deadline — reject immediately (back-pressure)
          req.status = 'rejected'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        const queueSize = currentNode.data.queueSize ?? 50
        if (queueSize === 0) {
          // Queue disabled — reject immediately
          req.status = 'rejected'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        // 2. Check local queue timeout (only when actually queuing)
        // queueTimeout=0 → reject immediately if pool was busy on any prior tick; >0 → reject after N ms
        const queueTimeout = currentNode.data.queueTimeout ?? 0
        const waitedMs = now - (req.nodeEntryTime[currentNode.id] ?? now)
        const timedOut = queueTimeout === 0 ? waitedMs > 0 : waitedMs >= queueTimeout
        if (timedOut) {
          req.status = 'rejected'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        // Check queue capacity (exclude self from count)
        const currentQueueDepth = requests.filter(
          (r) => r.currentNodeId === currentNode.id && r.status === 'pending' && r.id !== req.id,
        ).length
        if (currentQueueDepth >= queueSize) {
          // Queue full — reject (queue overflow)
          req.status = 'rejected'
          req.completedAt = now
          recordCompletion(req, now)
          finalizeRequest(req, false)
          continue
        }

        // Space in queue — stay pending until a thread frees up or timeout hits
        continue
      }

      // Enter processing
      req.status = 'processing'
      req.startedProcessingAt = now
      const latencyMul = currentNode.data.processingTimeMultiplier ?? 1
      req.processingDoneAt =
        now + randomBetween(currentNode.data.processingTime.min, currentNode.data.processingTime.max) * latencyMul

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
      // allDownEdges includes failed edges — used to distinguish "leaf node" from "all edges down"
      const allDownEdges = edges.filter((e) => e.source === currentNode.id)
      const downEdges = getDownstreamEdges(currentNode.id, edges)
      if (allDownEdges.length > 0 && req.direction === 'downstream') {
        // Node has downstream connections but all edges are currently marked as failed
        if (downEdges.length === 0) {
          req.status = 'error'
          req.completedAt = now
          recordCompletion(req, now)
          // Treat as downstream failure so CB at this node can track it
          applyCbResult(currentNode.id, false)
          finalizeRequest(req, false)
          continue
        }

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
          // All downstream targets are unhealthy (health check)
          req.status = 'error'
          req.completedAt = now
          recordCompletion(req, now)
          // Treat as downstream failure so CB at this node can track it
          applyCbResult(currentNode.id, false)
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

        // In platform thread mode, the current node's thread stays blocked while
        // waiting for the downstream response — record it in platformThreadsHeld
        if (currentNode.data.threadModel === 'platform') {
          req.platformThreadsHeld = [...req.platformThreadsHeld, currentNode.id]
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
    const metrics = computeMetrics(node.id, requests, node, now)
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
  for (const key of Object.keys(nodeTotalCount)) delete nodeTotalCount[key]
  for (const key of Object.keys(nodeOkCount)) delete nodeOkCount[key]
  for (const key of Object.keys(nodeErrorCount)) delete nodeErrorCount[key]
  for (const key of Object.keys(nodeTimeoutCount)) delete nodeTimeoutCount[key]
  for (const key of Object.keys(nodeRejectedCount)) delete nodeRejectedCount[key]
  for (const key of Object.keys(nodeWindowAll)) delete nodeWindowAll[key]
  for (const key of Object.keys(nodeWindowFail)) delete nodeWindowFail[key]
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
