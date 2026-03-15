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
type MobileView = 'canvas' | 'panel'

export default function App() {
  const [rightTab, setRightTab] = useState<RightTab>('config')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('canvas')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setNodes = useFlowStore((s) => s.setNodes)
  const setEdges = useFlowStore((s) => s.setEdges)
  const miniChartMode = useSimulationStore((s) => s.miniChartMode)
  const setMiniChartMode = useSimulationStore((s) => s.setMiniChartMode)

  // Load the first preset on initial mount
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
    },
    [setNodes, setEdges],
  )

  const openPanel = (tab: RightTab) => {
    setRightTab(tab)
    setMobileView('panel')
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700">
          <h1 className="text-base font-bold text-white tracking-tight shrink-0">
            Resilience Visualizer
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Mini-chart selector */}
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
                <option key={p.name} value={i}>
                  {p.name}
                </option>
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Simulation controls — toolbar toggle button visible on mobile */}
        <SimulationControls
          onToggleToolbar={() => setToolbarOpen((o) => !o)}
          toolbarOpen={toolbarOpen}
        />

        {/* Toolbar — always visible on desktop, toggled on mobile */}
        <div className={`${toolbarOpen ? 'block' : 'hidden'} md:block`}>
          <Toolbar />
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row min-h-0">
          {/* Canvas — hidden on mobile when viewing the panel */}
          <div className={`flex-1 min-h-0 ${mobileView === 'panel' ? 'hidden md:flex' : 'flex'} flex-col`}>
            <FlowCanvas />
          </div>

          {/* Config/Metrics panel
              Mobile canvas view : only the tab-header strip is visible (no content)
              Mobile panel view  : flex-1, takes all remaining height
              Desktop            : fixed w-80, full height sidebar
          */}
          <div
            className={[
              'bg-gray-900 flex flex-col border-gray-700 shrink-0',
              'md:w-80 md:border-l md:flex',
              mobileView === 'canvas'
                ? 'w-full border-t'
                : 'flex-1 min-h-0 w-full border-t',
            ].join(' ')}
          >
            {/* Tab header */}
            <div className="flex border-b border-gray-700 items-center shrink-0">
              {/* Back button — mobile panel view only */}
              {mobileView === 'panel' && (
                <button
                  onClick={() => setMobileView('canvas')}
                  className="md:hidden px-3 py-2 text-gray-400 text-sm shrink-0"
                  aria-label="Back to canvas"
                >
                  ←
                </button>
              )}
              <button
                onClick={() => openPanel('config')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  rightTab === 'config'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Config
              </button>
              <button
                onClick={() => openPanel('metrics')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  rightTab === 'metrics'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Metrics
              </button>
            </div>

            {/* Panel content — hidden on mobile canvas view */}
            <div
              className={`flex-1 overflow-y-auto min-h-0 ${
                mobileView === 'canvas' ? 'hidden md:block' : ''
              }`}
            >
              {rightTab === 'config' ? <ConfigPanel /> : <MetricsPanel />}
            </div>
          </div>
        </div>

        {/* Stats table at bottom */}
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
