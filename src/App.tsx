import { useState, useRef, useCallback, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { FlowCanvas } from './components/Canvas/FlowCanvas'
import { Toolbar } from './components/Canvas/Toolbar'
import { SimulationControls } from './components/Panels/SimulationControls'
import { ConfigPanel } from './components/Panels/ConfigPanel'
import { MetricsPanel } from './components/Panels/MetricsPanel'
import { StatsTable } from './components/Panels/StatsTable'
import { useFlowStore } from './store/flow-store'
import { useSimulationStore, type MiniChartMode } from './store/simulation-store'
import { exportScenario, importScenario, downloadJson } from './utils/serialization'
import { presets } from './utils/presets'

type RightTab = 'config' | 'metrics'

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('config')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setNodes = useFlowStore((s) => s.setNodes)
  const setEdges = useFlowStore((s) => s.setEdges)
  const miniChartMode = useSimulationStore((s) => s.miniChartMode)
  const setMiniChartMode = useSimulationStore((s) => s.setMiniChartMode)

  useEffect(() => {
    const first = presets[0]
    if (first) { setNodes(first.nodes); setEdges(first.edges) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      window.umami?.track('preset_selected', { name: preset.name })
    },
    [setNodes, setEdges],
  )

  return (
    <ReactFlowProvider>
      {/*
        Mobile : natural document scroll — no height / overflow constraints
        Desktop: h-screen overflow-hidden, side-by-side layout
      */}
      <div className="flex flex-col bg-gray-950 text-gray-100 md:h-screen md:overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
          <h1 className="text-base font-bold text-white tracking-tight shrink-0">
            Resilience Visualizer
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-gray-500 hidden sm:inline">Charts:</span>
              <select
                value={miniChartMode}
                onChange={(e) => setMiniChartMode(e.target.value as MiniChartMode)}
                className="text-[11px] bg-gray-800 border border-gray-600 text-gray-300 rounded px-1.5 py-0.5"
              >
                <option value="none">None</option>
                <option value="throughput">Throughput</option>
                <option value="latency">Latency</option>
                <option value="error">Error Rate</option>
              </select>
            </div>

            <div className="w-px h-5 bg-gray-700 hidden sm:block" />

            <select
              value={selectedPreset}
              onChange={(e) => { const i = Number(e.target.value); setSelectedPreset(i); handlePreset(i) }}
              className="text-xs bg-gray-800 border border-gray-600 text-gray-200 rounded px-1.5 py-1 max-w-[130px]"
            >
              {presets.map((p, i) => (
                <option key={p.name} value={i}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-600"
            >
              Export
            </button>
            <button
              onClick={handleImport}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-600"
            >
              Import
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
          </div>
        </div>

        {/* Simulation controls */}
        <SimulationControls
          onToggleToolbar={() => setToolbarOpen((o) => !o)}
          toolbarOpen={toolbarOpen}
        />

        {/* Toolbar — always on desktop, toggled on mobile */}
        <div className={`${toolbarOpen ? 'block' : 'hidden'} md:block shrink-0`}>
          <Toolbar />
        </div>

        {/*
          Main content
          Mobile : flex-col, canvas has fixed h-[55vh], config flows below naturally
          Desktop: flex-row flex-1, side-by-side, overflow-hidden
        */}
        <div className="flex flex-col md:flex-row md:flex-1 md:overflow-hidden md:min-h-0">

          {/* Canvas */}
          <div className="h-[55vh] md:h-auto md:flex-1 md:min-h-0">
            <FlowCanvas />
          </div>

          {/* Config / Metrics panel
              Mobile : natural block height (no overflow), tab header is sticky
              Desktop: fixed-width sidebar with internal scroll
          */}
          <div className="border-t border-gray-700 bg-gray-900 md:border-t-0 md:border-l md:w-80 md:flex md:flex-col md:overflow-hidden md:shrink-0">

            {/* Tab header — sticky on mobile so it's always reachable while scrolling */}
            <div className="flex border-b border-gray-700 bg-gray-900 sticky top-0 z-10 md:static md:shrink-0">
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

            {/* Panel content
                Mobile : no overflow constraint — expands to full content height
                Desktop: flex-1 + overflow-y-auto for sidebar scroll
            */}
            <div className="md:flex-1 md:overflow-y-auto md:min-h-0">
              {rightTab === 'config' ? <ConfigPanel /> : <MetricsPanel />}
            </div>
          </div>
        </div>

        {/* Stats table */}
        <StatsTable />

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-4 py-1 bg-gray-900 border-t border-gray-800 text-[10px] text-gray-600 select-none">
          <span>
            Resilience Visualizer © {new Date().getFullYear()}
            {' · '}
            Made by{' '}
            <a
              href="https://mlagowski.com/?utm_source=resilience-visualization.vercel.app/&utm_content=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              Marcin Łagowski
            </a>
          </span>
          <a
            href="https://buymeacoffee.com/emlagowski"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-600 hover:text-amber-400 hover:bg-gray-800 transition-colors"
          >
            <span>☕</span>
            <span>Buy me a coffee</span>
          </a>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
