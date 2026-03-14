import { useSimulationStore } from '../../store/simulation-store'
import { startSimulationLoop, stopSimulationLoop, resetSimulation } from '../../simulation/engine'
import { ParamSlider } from '../Shared/ParamSlider'

export function SimulationControls() {
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
    <div className="flex items-center gap-3 p-3 bg-gray-900 border-b border-gray-700">
      <button
        onClick={handleToggle}
        className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${
          running
            ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
        }`}
      >
        {running ? 'Pause' : 'Play'}
      </button>
      <button
        onClick={handleReset}
        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
      >
        Reset
      </button>

      <div className="w-32">
        <ParamSlider
          label="Speed"
          value={speed}
          min={0.5}
          max={10}
          step={0.5}
          unit="x"
          onChange={setSpeed}
        />
      </div>

      <div className="flex gap-4 ml-auto text-xs text-gray-400">
        <span>
          Time: <span className="text-gray-200 font-mono">{(simTime / 1000).toFixed(1)}s</span>
        </span>
        <span>
          Active:{' '}
          <span className="text-gray-200 font-mono">{activeRequests}</span>
        </span>
        <span>
          Total:{' '}
          <span className="text-gray-200 font-mono">{requests.length}</span>
        </span>
      </div>
    </div>
  )
}
