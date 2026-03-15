import { useFlowStore, createDefaultConfig } from '../../store/flow-store'

const nodePresets = [
  { label: 'Source', config: { label: 'Source', isSource: true, requestsPerSecond: 10 } },
  { label: 'Service', config: { label: 'Service' } },
  {
    label: 'Load Balancer',
    config: {
      label: 'Load Balancer',
      healthCheck: { ...createDefaultConfig().healthCheck, enabled: true },
    },
  },
  {
    label: 'Backend',
    config: {
      label: 'Backend',
      processingTime: { min: 10, max: 500 },
      threadPool: { max: 50, active: 0 },
    },
  },
]

export function Toolbar() {
  const addNode = useFlowStore((s) => s.addNode)

  return (
    <div className="flex gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700 overflow-x-auto">
      <span className="text-gray-400 text-sm self-center mr-2">Add:</span>
      {nodePresets.map((preset) => (
        <button
          key={preset.label}
          onClick={() => addNode(preset.config)}
          className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-600 transition-colors"
        >
          + {preset.label}
        </button>
      ))}
    </div>
  )
}
