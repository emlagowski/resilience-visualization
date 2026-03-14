import type { ScenarioConfig } from '../types'
import { createDefaultConfig } from '../store/flow-store'

function emptyMetrics() {
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

function makeNode(
  id: string,
  label: string,
  x: number,
  y: number,
  overrides: Parameters<typeof createDefaultConfig>[0] = {},
) {
  return {
    id,
    type: 'service' as const,
    position: { x, y },
    data: { ...createDefaultConfig({ label, ...overrides }), metrics: emptyMetrics() },
  }
}

export const presets: ScenarioConfig[] = [
  // ─── 1. Classic BFF → LB → 3 backends ─────────────────────────
  {
    name: 'Mobile App → BFF → F5 → 3x Backend',
    description: 'Classic flow with load balancer distributing to 3 backend instances',
    nodes: [
      makeNode('n-am', 'Mobile App', 50, 250, {
        isSource: true,
        requestsPerSecond: 100,
        connectionPool: { max: 200, active: 0 },
        timeout: 3000,
      }),
      makeNode('n-bff-1', 'BFF-1', 350, 150, {
        threadPool: { max: 200, active: 0 },
        connectionPool: { max: 200, active: 0 },
        timeout: 3000,
        processingTime: { min: 100, max: 200 },
        circuitBreaker: {
          ...createDefaultConfig().circuitBreaker,
          enabled: true,
          failureThreshold: 5,
          successThreshold: 3,
          openDuration: 10000,
          windowSize: 60000,
        },
      }),
      makeNode('n-bff-2', 'BFF-2', 350, 350, {
        threadPool: { max: 200, active: 0 },
        connectionPool: { max: 200, active: 0 },
        timeout: 3000,
        processingTime: { min: 100, max: 200 },
        circuitBreaker: {
          ...createDefaultConfig().circuitBreaker,
          enabled: true,
          failureThreshold: 5,
          successThreshold: 3,
          openDuration: 10000,
          windowSize: 60000,
        },
      }),
      makeNode('n-f5', 'F5 LB', 650, 250, {
        threadPool: { max: 200, active: 0 },
        connectionPool: { max: 200, active: 0 },
        timeout: 5000,
        processingTime: { min: 10, max: 20 },
        loadBalancer: 'round-robin',
        healthCheck: { enabled: true, interval: 5000, healthy: true },
      }),
      makeNode('n-be1', 'Backend #1', 1000, 100, {
        threadPool: { max: 35, active: 0 },
        processingTime: { min: 500, max: 1000 },
        errorRate: 0.0,
      }),
      makeNode('n-be2', 'Backend #2', 1000, 250, {
        threadPool: { max: 35, active: 0 },
        processingTime: { min: 500, max: 1000 },
        errorRate: 0.0,
      }),
      makeNode('n-be3', 'Backend #3', 1000, 400, {
        threadPool: { max: 35, active: 0 },
        processingTime: { min: 500, max: 1000 },
        errorRate: 0.0,
      }),
    ],
    edges: [
      { id: 'e1', source: 'n-am', target: 'n-bff-1' },
      { id: 'e2', source: 'n-am', target: 'n-bff-2' },
      { id: 'e3', source: 'n-bff-1', target: 'n-f5' },
      { id: 'e4', source: 'n-bff-2', target: 'n-f5' },
      { id: 'e5', source: 'n-f5', target: 'n-be1' },
      { id: 'e6', source: 'n-f5', target: 'n-be2' },
      { id: 'e7', source: 'n-f5', target: 'n-be3' },
    ],
  },

  // ─── 2. Large cluster: LB → 8 backends ────────────────────────
  {
    name: 'High Traffic → LB → 8x Backend',
    description: '100 rps load balanced across 8 backends. Try killing nodes and watch redistribution.',
    nodes: [
      makeNode('n-src', 'Traffic Source', 50, 350, {
        isSource: true,
        requestsPerSecond: 100,
        connectionPool: { max: 60, active: 0 },
        threadPool: { max: 100, active: 0 },
        timeout: 5000,
      }),
      makeNode('n-lb', 'Load Balancer', 400, 350, {
        threadPool: { max: 200, active: 0 },
        connectionPool: { max: 100, active: 0 },
        timeout: 4000,
        processingTime: { min: 1, max: 3 },
        loadBalancer: 'round-robin',
        healthCheck: { enabled: true, interval: 5000, healthy: true },
      }),
      ...Array.from({ length: 8 }, (_, i) =>
        makeNode(`n-be${i + 1}`, `BE-${i + 1}`, 800, 50 + i * 90, {
          threadPool: { max: 15, active: 0 },
          processingTime: { min: 20, max: 200 },
          errorRate: 0.01,
          healthCheck: { enabled: true, interval: 5000, healthy: true },
        }),
      ),
    ],
    edges: [
      { id: 'e-src-lb', source: 'n-src', target: 'n-lb' },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `e-lb-be${i + 1}`,
        source: 'n-lb',
        target: `n-be${i + 1}`,
      })),
    ],
  },

  // ─── 3. Cascading failure ──────────────────────────────────────
  {
    name: 'Cascading Failure',
    description:
      'DB slows down → Backend thread pool fills → BFF timeouts → Mobile errors. Classic cascading failure.',
    nodes: [
      makeNode('n-mob', 'Mobile App', 50, 200, {
        isSource: true,
        requestsPerSecond: 25,
        connectionPool: { max: 15, active: 0 },
        timeout: 4000,
      }),
      makeNode('n-bff', 'BFF', 350, 200, {
        threadPool: { max: 20, active: 0 },
        connectionPool: { max: 15, active: 0 },
        timeout: 3000,
        processingTime: { min: 5, max: 20 },
      }),
      makeNode('n-api', 'Order API', 650, 200, {
        threadPool: { max: 15, active: 0 },
        connectionPool: { max: 10, active: 0 },
        timeout: 2500,
        processingTime: { min: 10, max: 50 },
      }),
      makeNode('n-db', 'Database', 950, 200, {
        threadPool: { max: 10, active: 0 },
        processingTime: { min: 500, max: 3000 },
        errorRate: 0.05,
      }),
    ],
    edges: [
      { id: 'e1', source: 'n-mob', target: 'n-bff' },
      { id: 'e2', source: 'n-bff', target: 'n-api' },
      { id: 'e3', source: 'n-api', target: 'n-db' },
    ],
  },

  // ─── 4. Circuit breaker demo ───────────────────────────────────
  {
    name: 'Circuit Breaker Demo',
    description:
      'Client with CB calling a flaky API (40% errors). Watch CB open → half-open → close cycle.',
    nodes: [
      makeNode('n-cli', 'Client', 100, 200, {
        isSource: true,
        requestsPerSecond: 15,
        timeout: 3000,
        circuitBreaker: {
          ...createDefaultConfig().circuitBreaker,
          enabled: true,
          failureThreshold: 3,
          successThreshold: 2,
          openDuration: 5000,
          windowSize: 30000,
        },
      }),
      makeNode('n-api', 'Flaky API', 500, 200, {
        threadPool: { max: 10, active: 0 },
        processingTime: { min: 100, max: 2000 },
        errorRate: 0.4,
      }),
    ],
    edges: [{ id: 'e1', source: 'n-cli', target: 'n-api' }],
  },

  // ─── 5. Connection pool exhaustion ─────────────────────────────
  {
    name: 'Connection Pool Exhaustion',
    description:
      'Tiny connection pool (5) vs 50 rps + slow backend = massive rejections.',
    nodes: [
      makeNode('n-src', 'High Traffic', 100, 200, {
        isSource: true,
        requestsPerSecond: 50,
        connectionPool: { max: 5, active: 0 },
        timeout: 2000,
      }),
      makeNode('n-slow', 'Slow Backend', 500, 200, {
        threadPool: { max: 5, active: 0 },
        processingTime: { min: 500, max: 2000 },
      }),
    ],
    edges: [{ id: 'e1', source: 'n-src', target: 'n-slow' }],
  },

  // ─── 6. Retry storm / thundering herd ──────────────────────────
  {
    name: 'Retry Storm',
    description:
      'Three clients hitting one API. Set error rate high and observe how combined retries overwhelm the backend.',
    nodes: [
      makeNode('n-c1', 'Web App', 50, 80, {
        isSource: true,
        requestsPerSecond: 20,
        connectionPool: { max: 10, active: 0 },
        timeout: 3000,
      }),
      makeNode('n-c2', 'Mobile App', 50, 250, {
        isSource: true,
        requestsPerSecond: 15,
        connectionPool: { max: 10, active: 0 },
        timeout: 3000,
      }),
      makeNode('n-c3', 'Partner API', 50, 420, {
        isSource: true,
        requestsPerSecond: 10,
        connectionPool: { max: 8, active: 0 },
        timeout: 5000,
      }),
      makeNode('n-gw', 'API Gateway', 400, 250, {
        threadPool: { max: 50, active: 0 },
        connectionPool: { max: 30, active: 0 },
        timeout: 4000,
        processingTime: { min: 2, max: 10 },
        loadBalancer: 'least-connections',
      }),
      makeNode('n-be', 'Backend', 750, 250, {
        threadPool: { max: 15, active: 0 },
        processingTime: { min: 50, max: 500 },
        errorRate: 0.1,
      }),
    ],
    edges: [
      { id: 'e1', source: 'n-c1', target: 'n-gw' },
      { id: 'e2', source: 'n-c2', target: 'n-gw' },
      { id: 'e3', source: 'n-c3', target: 'n-gw' },
      { id: 'e4', source: 'n-gw', target: 'n-be' },
    ],
  },

  // ─── 7. Microservice mesh ──────────────────────────────────────
  {
    name: 'Microservice Mesh',
    description:
      'Realistic e-commerce: Gateway → User Svc + Product Svc + Inventory → shared DB cluster.',
    nodes: [
      makeNode('n-gw', 'API Gateway', 50, 300, {
        isSource: true,
        requestsPerSecond: 40,
        threadPool: { max: 50, active: 0 },
        connectionPool: { max: 40, active: 0 },
        timeout: 5000,
        processingTime: { min: 2, max: 10 },
        loadBalancer: 'round-robin',
      }),
      makeNode('n-user', 'User Service', 400, 100, {
        threadPool: { max: 20, active: 0 },
        connectionPool: { max: 10, active: 0 },
        timeout: 2000,
        processingTime: { min: 10, max: 100 },
      }),
      makeNode('n-product', 'Product Service', 400, 300, {
        threadPool: { max: 25, active: 0 },
        connectionPool: { max: 15, active: 0 },
        timeout: 2000,
        processingTime: { min: 20, max: 150 },
      }),
      makeNode('n-inv', 'Inventory Service', 400, 500, {
        threadPool: { max: 15, active: 0 },
        connectionPool: { max: 10, active: 0 },
        timeout: 3000,
        processingTime: { min: 30, max: 300 },
        circuitBreaker: {
          ...createDefaultConfig().circuitBreaker,
          enabled: true,
          failureThreshold: 4,
          successThreshold: 2,
          openDuration: 8000,
          windowSize: 30000,
        },
      }),
      makeNode('n-db1', 'User DB', 800, 100, {
        threadPool: { max: 50, active: 0 },
        processingTime: { min: 5, max: 50 },
        errorRate: 0.005,
      }),
      makeNode('n-db2', 'Product DB', 800, 300, {
        threadPool: { max: 50, active: 0 },
        processingTime: { min: 5, max: 80 },
        errorRate: 0.005,
      }),
      makeNode('n-db3', 'Inventory DB', 800, 500, {
        threadPool: { max: 20, active: 0 },
        processingTime: { min: 10, max: 200 },
        errorRate: 0.02,
      }),
    ],
    edges: [
      { id: 'e1', source: 'n-gw', target: 'n-user' },
      { id: 'e2', source: 'n-gw', target: 'n-product' },
      { id: 'e3', source: 'n-gw', target: 'n-inv' },
      { id: 'e4', source: 'n-user', target: 'n-db1' },
      { id: 'e5', source: 'n-product', target: 'n-db2' },
      { id: 'e6', source: 'n-inv', target: 'n-db3' },
    ],
  },

  // ─── 8. Slow dependency with timeout tuning ────────────────────
  {
    name: 'Timeout Tuning',
    description:
      'Chain of 4 services with different timeouts. Adjust timeouts to see how they cascade.',
    nodes: [
      makeNode('n-fe', 'Frontend', 50, 200, {
        isSource: true,
        requestsPerSecond: 10,
        connectionPool: { max: 10, active: 0 },
        timeout: 10000,
      }),
      makeNode('n-agg', 'Aggregator', 300, 200, {
        threadPool: { max: 20, active: 0 },
        connectionPool: { max: 10, active: 0 },
        timeout: 5000,
        processingTime: { min: 10, max: 30 },
      }),
      makeNode('n-svc', 'Core Service', 550, 200, {
        threadPool: { max: 15, active: 0 },
        connectionPool: { max: 10, active: 0 },
        timeout: 3000,
        processingTime: { min: 20, max: 100 },
      }),
      makeNode('n-ext', 'External API', 800, 200, {
        threadPool: { max: 5, active: 0 },
        processingTime: { min: 200, max: 4000 },
        errorRate: 0.05,
      }),
    ],
    edges: [
      { id: 'e1', source: 'n-fe', target: 'n-agg' },
      { id: 'e2', source: 'n-agg', target: 'n-svc' },
      { id: 'e3', source: 'n-svc', target: 'n-ext' },
    ],
  },
]
