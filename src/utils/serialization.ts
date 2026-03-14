import type { ScenarioConfig } from '../types'
import { useFlowStore } from '../store/flow-store'

export function exportScenario(name: string, description: string): string {
  const { nodes, edges } = useFlowStore.getState()
  const config: ScenarioConfig = { name, description, nodes, edges }
  return JSON.stringify(config, null, 2)
}

export function importScenario(json: string): void {
  const config: ScenarioConfig = JSON.parse(json)
  const store = useFlowStore.getState()
  store.setNodes(config.nodes)
  store.setEdges(config.edges)
}

export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
