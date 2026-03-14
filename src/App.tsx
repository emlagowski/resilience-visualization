import { useState, useRef, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { FlowCanvas } from './components/Canvas/FlowCanvas'
import { Toolbar } from './components/Canvas/Toolbar'
import { SimulationControls } from './components/Panels/SimulationControls'
import { ConfigPanel } from './components/Panels/ConfigPanel'
import { MetricsPanel } from './components/Panels/MetricsPanel'
import { useFlowStore } from './store/flow-store'
import { exportScenario, importScenario, downloadJson } from './utils/serialization'
import { presets } from './utils/presets'

type RightTab = 'config' | 'metrics'

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('config')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setNodes = useFlowStore((s) => s.setNodes)
  const setEdges = useFlowStore((s) => s.setEdges)

  const handleExport = useCallback(() => {
    const json = exportScenario('My Scenario', 'Exported scenario')
    downloadJson('resilience-scenario.json', json)
  }, [])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          importScenario(ev.target?.result as string)
        } catch {
          alert('Invalid scenario file')
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [],
  )

  const handlePreset = useCallback(
    (index: number) => {
      const preset = presets[index]
      if (!preset) return
      setNodes(preset.nodes)
      setEdges(preset.edges)
    },
    [setNodes, setEdges],
  )

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
          <h1 className="text-lg font-bold text-white tracking-tight">
            Resilience Visualizer
          </h1>
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => handlePreset(Number(e.target.value))}
              defaultValue=""
              className="text-sm bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1"
            >
              <option value="" disabled>
                Load preset...
              </option>
              {presets.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleExport}
              className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-600"
            >
              Export JSON
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-600"
            >
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Simulation controls */}
        <SimulationControls />

        {/* Toolbar */}
        <Toolbar />

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Canvas */}
          <FlowCanvas />

          {/* Right sidebar */}
          <div className="w-80 border-l border-gray-700 bg-gray-900 flex flex-col shrink-0">
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setRightTab('config')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  rightTab === 'config'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Config
              </button>
              <button
                onClick={() => setRightTab('metrics')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  rightTab === 'metrics'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Metrics
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {rightTab === 'config' ? <ConfigPanel /> : <MetricsPanel />}
            </div>
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
