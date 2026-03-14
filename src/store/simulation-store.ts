import { create } from 'zustand'
import type { SimRequest, MetricsSnapshot } from '../types'

interface SimulationState {
  running: boolean
  speed: number // multiplier: 0.5 - 10
  tick: number
  simTime: number // ms elapsed in simulation
  requests: SimRequest[]
  metricsHistory: MetricsSnapshot[]

  start: () => void
  pause: () => void
  reset: () => void
  setSpeed: (speed: number) => void
  setTick: (tick: number) => void
  setSimTime: (time: number) => void
  setRequests: (requests: SimRequest[]) => void
  addMetricsSnapshot: (snapshot: MetricsSnapshot) => void
  clearMetrics: () => void
}

const MAX_HISTORY = 300 // ~5 min at 1 snapshot/s

export const useSimulationStore = create<SimulationState>((set, get) => ({
  running: false,
  speed: 1,
  tick: 0,
  simTime: 0,
  requests: [],
  metricsHistory: [],

  start: () => set({ running: true }),
  pause: () => set({ running: false }),
  reset: () =>
    set({
      running: false,
      tick: 0,
      simTime: 0,
      requests: [],
      metricsHistory: [],
    }),
  setSpeed: (speed) => set({ speed }),
  setTick: (tick) => set({ tick }),
  setSimTime: (time) => set({ simTime: time }),
  setRequests: (requests) => set({ requests }),
  addMetricsSnapshot: (snapshot) => {
    const history = get().metricsHistory
    const trimmed = history.length >= MAX_HISTORY ? history.slice(1) : history
    set({ metricsHistory: [...trimmed, snapshot] })
  },
  clearMetrics: () => set({ metricsHistory: [] }),
}))
