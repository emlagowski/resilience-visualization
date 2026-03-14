import { useFlowStore } from '../../store/flow-store'
import { ParamSlider } from '../Shared/ParamSlider'
import type { ServiceNodeData, LoadBalancerStrategy } from '../../types'

export function ConfigPanel() {
  const nodes = useFlowStore((s) => s.nodes)
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig)
  const removeNode = useFlowStore((s) => s.removeNode)

  const node = nodes.find((n) => n.id === selectedNodeId)
  if (!node) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Select a node to configure
      </div>
    )
  }

  const data = node.data

  const update = (patch: Partial<ServiceNodeData>) => {
    updateNodeConfig(node.id, patch)
  }

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <input
          className="text-lg font-bold bg-transparent text-white border-b border-gray-600 focus:border-blue-400 outline-none w-full mr-2"
          value={data.label}
          onChange={(e) => update({ label: e.target.value })}
        />
        <button
          onClick={() => removeNode(node.id)}
          className="text-red-400 hover:text-red-300 text-xs shrink-0"
        >
          Delete
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={data.isSource}
          onChange={(e) => update({ isSource: e.target.checked })}
          className="accent-blue-500"
        />
        Source node (generates requests)
      </label>

      {data.isSource && (
        <ParamSlider
          label="Requests/sec"
          value={data.requestsPerSecond}
          min={1}
          max={200}
          onChange={(v) => update({ requestsPerSecond: v })}
          unit=" rps"
        />
      )}

      <Section title="Thread Pool">
        <ParamSlider
          label="Max threads"
          value={data.threadPool.max}
          min={1}
          max={200}
          onChange={(v) => update({ threadPool: { ...data.threadPool, max: v } })}
        />
      </Section>

      <Section title="Connection Pool">
        <ParamSlider
          label="Max connections"
          value={data.connectionPool.max}
          min={1}
          max={200}
          onChange={(v) => update({ connectionPool: { ...data.connectionPool, max: v } })}
        />
      </Section>

      <Section title="Load Balancer">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400">Strategy (downstream)</span>
          <select
            value={data.loadBalancer}
            onChange={(e) => update({ loadBalancer: e.target.value as LoadBalancerStrategy })}
            className="text-sm bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1"
          >
            <option value="round-robin">Round Robin</option>
            <option value="random">Random</option>
            <option value="least-connections">Least Connections</option>
          </select>
        </div>
      </Section>

      <Section title="Timing">
        <ParamSlider
          label="Timeout"
          value={data.timeout}
          min={100}
          max={30000}
          step={100}
          unit="ms"
          onChange={(v) => update({ timeout: v })}
        />
        <ParamSlider
          label="Processing min"
          value={data.processingTime.min}
          min={1}
          max={5000}
          step={10}
          unit="ms"
          onChange={(v) =>
            update({ processingTime: { ...data.processingTime, min: v } })
          }
        />
        <ParamSlider
          label="Processing max"
          value={data.processingTime.max}
          min={1}
          max={10000}
          step={10}
          unit="ms"
          onChange={(v) =>
            update({ processingTime: { ...data.processingTime, max: v } })
          }
        />
        <ParamSlider
          label="Error rate"
          value={Math.round(data.errorRate * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => update({ errorRate: v / 100 })}
        />
      </Section>

      <Section title="Circuit Breaker">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={data.circuitBreaker.enabled}
            onChange={(e) =>
              update({
                circuitBreaker: { ...data.circuitBreaker, enabled: e.target.checked },
              })
            }
            className="accent-blue-500"
          />
          Enabled
        </label>
        {data.circuitBreaker.enabled && (
          <>
            <div className="text-xs mt-1">
              State:{' '}
              <span
                className={
                  data.circuitBreaker.state === 'open'
                    ? 'text-red-400'
                    : data.circuitBreaker.state === 'half-open'
                      ? 'text-yellow-400'
                      : 'text-emerald-400'
                }
              >
                {data.circuitBreaker.state.toUpperCase()}
              </span>
            </div>
            <ParamSlider
              label="Failure threshold"
              value={data.circuitBreaker.failureThreshold}
              min={1}
              max={50}
              onChange={(v) =>
                update({
                  circuitBreaker: { ...data.circuitBreaker, failureThreshold: v },
                })
              }
            />
            <ParamSlider
              label="Success threshold (half-open)"
              value={data.circuitBreaker.successThreshold}
              min={1}
              max={20}
              onChange={(v) =>
                update({
                  circuitBreaker: { ...data.circuitBreaker, successThreshold: v },
                })
              }
            />
            <ParamSlider
              label="Open duration"
              value={data.circuitBreaker.openDuration}
              min={1000}
              max={60000}
              step={1000}
              unit="ms"
              onChange={(v) =>
                update({
                  circuitBreaker: { ...data.circuitBreaker, openDuration: v },
                })
              }
            />
            <ParamSlider
              label="Window size"
              value={data.circuitBreaker.windowSize}
              min={5000}
              max={120000}
              step={5000}
              unit="ms"
              onChange={(v) =>
                update({
                  circuitBreaker: { ...data.circuitBreaker, windowSize: v },
                })
              }
            />
          </>
        )}
      </Section>

      <Section title="Health Check">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={data.healthCheck.enabled}
            onChange={(e) =>
              update({
                healthCheck: { ...data.healthCheck, enabled: e.target.checked },
              })
            }
            className="accent-blue-500"
          />
          Enabled
        </label>
        {data.healthCheck.enabled && (
          <>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={data.healthCheck.healthy}
                onChange={(e) =>
                  update({
                    healthCheck: { ...data.healthCheck, healthy: e.target.checked },
                  })
                }
                className="accent-emerald-500"
              />
              Healthy
            </label>
          </>
        )}
      </Section>

      <Section title="Chaos Controls">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => update({ healthCheck: { ...data.healthCheck, healthy: false, enabled: true } })}
            className="px-2 py-1 text-[11px] bg-red-900 hover:bg-red-800 text-red-200 rounded border border-red-700"
          >
            Kill Node
          </button>
          <button
            onClick={() =>
              update({
                processingTime: { min: data.processingTime.min * 5, max: data.processingTime.max * 5 },
              })
            }
            className="px-2 py-1 text-[11px] bg-yellow-900 hover:bg-yellow-800 text-yellow-200 rounded border border-yellow-700"
          >
            Slow Down 5x
          </button>
          <button
            onClick={() => update({ errorRate: Math.min(data.errorRate + 0.5, 1) })}
            className="px-2 py-1 text-[11px] bg-orange-900 hover:bg-orange-800 text-orange-200 rounded border border-orange-700"
          >
            Error Spike +50%
          </button>
          <button
            onClick={() =>
              update({
                errorRate: 0,
                processingTime: { min: 50, max: 200 },
                healthCheck: { ...data.healthCheck, healthy: true },
              })
            }
            className="px-2 py-1 text-[11px] bg-emerald-900 hover:bg-emerald-800 text-emerald-200 rounded border border-emerald-700"
          >
            Recover
          </button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-1">
        {title}
      </h3>
      {children}
    </div>
  )
}
