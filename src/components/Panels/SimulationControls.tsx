import { useSimulationStore } from '../../store/simulation-store'
import { startSimulationLoop, stopSimulationLoop, resetSimulation } from '../../simulation/engine'
import { ParamSlider } from '../Shared/ParamSlider'

interface Props {
  onToggleToolbar: () => void
  toolbarOpen: boolean
}

export function SimulationControls({ onToggleToolbar, toolbarOpen }: Props) {
  const running = useSimulationStore((s) => s.running)
  const speed = useSimulationStore((s) => s.speed)
  const simTime = useSimulationStore((s) => s.simTime)
  const requests = useSimulationStore((s) => s.requests)
  const setSpeed = useSimulationStore((s) => s.setSpeed)

  const handleToggle = () => {
    if (running) {
      useSimulationStore.getState().pause()
      stopSimulationLoop()
    } else {
      useSimulationStore.getState().start()
      startSimulationLoop()
    }
  }

  const handleReset = () => {
    resetSimulation()
  }

  const activeRequests = requests.filter(
    (r) => r.status === 'pending' || r.status === 'processing' || r.status === 'waiting_downstream',
  ).length

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700">
      <button
        onClick={handleToggle}
        className={`px-4 py-1.5 text-sm rounded font-medium transition-colors shrink-0 ${
          running
            ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
        }`}
      >
        {running ? 'Pause' : 'Play'}
      </button>
      <button
        onClick={handleReset}
        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors shrink-0"
      >
        Reset
      </button>

      <div className="w-32 shrink-0">
        <ParamSlider
          label="Speed"
          value={speed}
          min={0.1}
          max={10}
          step={0.1}
          unit="x"
          onChange={(v) => setSpeed(Math.round(v * 10) / 10)}
        />
      </div>

      <div className="flex gap-3 ml-auto text-xs text-gray-400">
        <span>
          Time: <span className="text-gray-200 font-mono">{(simTime / 1000).toFixed(1)}s</span>
        </span>
        <span className="hidden sm:inline">
          Active:{' '}
          <span className="text-gray-200 font-mono">{activeRequests}</span>
        </span>
        <span className="hidden sm:inline">
          Total:{' '}
          <span className="text-gray-200 font-mono">{requests.length}</span>
        </span>
      </div>

      {/* Mobile-only toolbar toggle */}
      <button
        onClick={onToggleToolbar}
        className="md:hidden shrink-0 px-2 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors"
        title="Add nodes"
      >
        {toolbarOpen ? '✕' : '＋'}
      </button>
    </div>
  )
}
