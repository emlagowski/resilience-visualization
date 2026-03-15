import { useState, useCallback } from 'react'

interface ParamSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number        // slider granularity
  stepButton?: number  // +/- button increment (defaults to step)
  unit?: string
  onChange: (value: number) => void
}

export function ParamSlider({ label, value, min, max, step = 1, stepButton, unit = '', onChange }: ParamSliderProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(value))

  const inc = stepButton ?? step

  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, v)),
    [min, max],
  )

  const handleDecrement = () => {
    onChange(clamp(value - inc))
  }

  const handleIncrement = () => {
    onChange(clamp(value + inc))
  }

  const handleInputBlur = () => {
    const parsed = Number(inputValue)
    if (!isNaN(parsed)) {
      // Free-form input: clamp only, no snap to step
      onChange(clamp(Math.round(parsed)))
    }
    setEditing(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-400">{label}</span>
        <div className="flex items-center gap-0">
          <button
            onClick={handleDecrement}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-[11px] font-mono leading-none"
            title={`-${inc}`}
          >
            -
          </button>
          {editing ? (
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              autoFocus
              className="w-14 h-5 text-center text-[11px] font-mono text-white bg-gray-800 border border-blue-500 rounded outline-none px-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <button
              onClick={() => {
                setInputValue(String(value))
                setEditing(true)
              }}
              className="h-5 min-w-[3rem] px-1 text-[11px] font-mono text-gray-200 hover:text-white hover:bg-gray-700 rounded text-center cursor-text"
              title="Click to edit"
            >
              {value}{unit}
            </button>
          )}
          <button
            onClick={handleIncrement}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-[11px] font-mono leading-none"
            title={`+${inc}`}
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  )
}
