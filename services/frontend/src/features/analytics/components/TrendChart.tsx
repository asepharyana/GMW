import type { TrendBucket } from "../../../shared/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

interface TrendChartProps {
  trend: TrendBucket[];
  loading: boolean;
}

export function TrendChart({ trend, loading }: TrendChartProps) {
  if (loading && !trend?.length) {
    return <LoadingBox />;
  }

  if (!trend?.length) {
    return null;
  }

  const data = trend.map((bucket) => ({
    date: bucket.date,
    clean: bucket.clean,
    warned: 0,
    flagged: bucket.flagged,
    error: bucket.error,
    total: bucket.count,
  }));

  const totalMessages = data.reduce((sum, item) => sum + item.total, 0);

  return (
    <Card className="col-span-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Tren Harian</CardTitle>
        <CardDescription className="text-xs">
          Volume pesan per hari dengan status moderasi — area pink = flagged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <LegendDot color="bg-primary" label="Total" />
            <LegendDot color="bg-emerald-400" label="Clean" />
            <LegendDot color="bg-accent" label="Flagged" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white/60 p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Rangkuman 7 hari terakhir</span>
              <span>{totalMessages} total pesan</span>
            </div>

            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${Math.max((data.length - 1) * 56, 56)} 220`}
                className="h-55 min-w-130 w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7EC8E3" stopOpacity="0.35" />
                    <stop
                      offset="100%"
                      stopColor="#7EC8E3"
                      stopOpacity="0.02"
                    />
                  </linearGradient>
                  <linearGradient
                    id="trendFillPink"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#FF9EBB" stopOpacity="0.3" />
                    <stop
                      offset="100%"
                      stopColor="#FF9EBB"
                      stopOpacity="0.02"
                    />
                  </linearGradient>
                </defs>

                <g stroke="#cbd5e1" strokeWidth="1" opacity="0.35">
                  {Array.from({ length: 4 }, (_, index) => {
                    const y = 40 + index * 45;
                    return (
                      <line
                        key={index}
                        x1="0"
                        x2={Math.max((data.length - 1) * 56, 56)}
                        y1={y}
                        y2={y}
                      />
                    );
                  })}
                </g>

                <TrendArea
                  data={data}
                  keyName="total"
                  fill="url(#trendFill)"
                  stroke="#7EC8E3"
                />
                <TrendLine
                  data={data}
                  keyName="total"
                  color="#7EC8E3"
                  strokeWidth={2.5}
                />
                <TrendLine
                  data={data}
                  keyName="clean"
                  color="#34d399"
                  strokeWidth={1.8}
                />
                <TrendLine
                  data={data}
                  keyName="flagged"
                  color="#FF9EBB"
                  strokeWidth={1.8}
                />
                <TrendArea
                  data={data}
                  keyName="flagged"
                  fill="url(#trendFillPink)"
                  stroke="#FF9EBB"
                />

                {data.map((item, index) => {
                  const x =
                    data.length <= 1
                      ? 0
                      : (index / (data.length - 1)) *
                        Math.max((data.length - 1) * 56, 56);
                  return (
                    <g key={item.date} transform={`translate(${x}, 188)`}>
                      <circle cx="0" cy="0" r="2.5" fill="#7EC8E3" />
                      <text
                        x="0"
                        y="18"
                        textAnchor="middle"
                        className="fill-muted-foreground text-[10px]"
                      >
                        {item.date.slice(5)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

function TrendLine({
  data,
  color,
  strokeWidth,
  keyName,
}: {
  data: Array<Record<string, number | string>>;
  color: string;
  strokeWidth: number;
  keyName: string;
}) {
  const path = buildPath(data, keyName, 220, false);

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

function TrendArea({
  data,
  keyName,
  fill,
  stroke,
}: {
  data: Array<Record<string, number | string>>;
  keyName: string;
  fill: string;
  stroke: string;
}) {
  const path = buildPath(data, keyName, 220, true);
  return <path d={path} fill={fill} stroke={stroke} strokeOpacity={0.2} />;
}

function buildPath(
  data: Array<Record<string, number | string>>,
  keyName: string,
  height: number,
  closePath: boolean,
): string {
  const values = data.map((item) => Number(item[keyName] ?? 0));
  const maxValue = Math.max(...values, 1);
  const width = Math.max((data.length - 1) * 56, 56);
  const points = values.map((value, index) => {
    const x = data.length <= 1 ? 0 : (index / (data.length - 1)) * width;
    const y = height - 35 - (value / maxValue) * 130;
    return { x, y };
  });

  if (points.length === 0) {
    return "";
  }

  const segments: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    segments.push(`Q ${controlX} ${previous.y} ${current.x} ${current.y}`);
  }

  if (closePath) {
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    segments.push(`L ${lastPoint.x} ${height - 24}`);
    segments.push(`L ${firstPoint.x} ${height - 24}`);
    segments.push("Z");
  }

  return segments.join(" ");
}

function LoadingBox() {
  return (
    <Card className="col-span-3">
      <CardContent className="flex h-65 items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}
