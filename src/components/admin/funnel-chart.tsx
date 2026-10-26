import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type FunnelChartStage = {
  label: string;
  visitors: number;
  conversionFromPrevious: number | null;
  dropOff: number | null;
};

export function FunnelChart({
  stages,
  visitorsLabel,
  conversionLabel,
  dropOffLabel,
}: {
  stages: FunnelChartStage[];
  visitorsLabel: string;
  conversionLabel: string;
  dropOffLabel: string;
}) {
  const height = Math.max(230, stages.length * 48);
  return (
    <div className="space-y-3">
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stages}
            layout="vertical"
            margin={{ top: 4, right: 42, bottom: 4, left: 4 }}
            barCategoryGap={12}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={148}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <Tooltip
              cursor={false}
              formatter={(value) => [Number(value ?? 0), visitorsLabel]}
            />
            <Bar
              dataKey="visitors"
              fill="var(--chart-1)"
              radius={[0, 6, 6, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="visitors"
                position="right"
                fill="var(--foreground)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((stage) => (
          <div
            className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs"
            key={stage.label}
          >
            <span className="text-muted-foreground">{stage.label}</span>
            <span className="tabular-nums">
              {stage.conversionFromPrevious === null
                ? '—'
                : `${conversionLabel}: ${(stage.conversionFromPrevious * 100).toFixed(1)}%`}
              {stage.dropOff === null
                ? ''
                : ` · ${dropOffLabel}: ${stage.dropOff}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
