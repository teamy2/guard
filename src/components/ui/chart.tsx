"use client"

import * as React from "react"
import * as ReactDOM from "react-dom"
import {
  CartesianGrid,
  Label,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"

// Chart container context
const ChartContext = React.createContext<{
  config: ChartConfig
} | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a ChartContainer")
  }
  return context
}

export type ChartConfig = {
  [key: string]: {
    label?: string
    color?: string
  }
}

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
  children: React.ReactNode
}

function ChartContainer({ config, children, className, ...props }: ChartContainerProps) {
  const uniqueId = React.useId()
  const chartId = `chart-${uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart-container"
        className={cn("w-full", className)}
        style={
          {
            "--chart-1": "oklch(0.646 0.222 41.116)",
            "--chart-2": "oklch(0.6 0.118 184.704)",
            "--chart-3": "oklch(0.398 0.07 227.392)",
            "--chart-4": "oklch(0.828 0.189 84.429)",
            "--chart-5": "oklch(0.769 0.188 70.08)",
            ...Object.entries(config).reduce(
              (acc, [key, value]) => {
                if (value.color) {
                  acc[`--color-${key}`] = value.color
                }
                return acc
              },
              {} as Record<string, string>
            ),
          } as React.CSSProperties
        }
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

interface ChartTooltipProps extends React.ComponentProps<typeof Tooltip> {
  content?: React.ReactElement
}

function ChartTooltip({ content, ...props }: ChartTooltipProps) {
  return <Tooltip {...props} content={content} />
}

interface ChartTooltipContentProps extends React.ComponentProps<typeof Tooltip> {
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: "dot" | "line" | "dashed"
  nameKey?: string
  labelKey?: string
}

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  hideIndicator = false,
  indicator = "dot",
  nameKey,
  labelKey,
  ...props
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  const tooltipLabel = labelKey && payload[0]?.payload?.[labelKey] ? payload[0].payload[labelKey] : label

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-2 shadow-md",
        "grid gap-1.5"
      )}
    >
      {!hideLabel && tooltipLabel && (
        <div className="grid gap-1.5 px-1.5 py-1">
          <div className="text-sm font-medium leading-none">{tooltipLabel}</div>
        </div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${item.dataKey || item.name || `item-${index}`}`
          const configItem = config[key]
          const indicatorColor = item.color || configItem?.color || `var(--chart-${(index % 5) + 1})`

          return (
            <div
              key={item.name}
              className={cn(
                "flex items-center gap-2 px-1.5 py-1",
                "rounded-sm"
              )}
            >
              {!hideIndicator && (
                <div
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    indicator === "line" && "h-0.5 w-4 rounded-none",
                    indicator === "dashed" && "h-0.5 w-4 rounded-none border-t-2 border-dashed bg-transparent"
                  )}
                  style={{
                    backgroundColor: indicator === "dashed" ? "transparent" : indicatorColor,
                    borderColor: indicator === "dashed" ? indicatorColor : undefined,
                  }}
                />
              )}
              <div
                className={cn(
                  "flex flex-1 items-center justify-between gap-4"
                )}
              >
                <div className="flex items-center gap-2 leading-none">
                  {configItem?.label || item.name}
                </div>
                {item.value && (
                  <div className="font-mono text-sm font-medium tabular-nums">
                    {item.value.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
}
