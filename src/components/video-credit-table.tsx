/** Pricing content is supplied by the block; this component owns layout only. */
export function VideoCreditTable({
  title,
  description,
  modelLabel,
  creditLabel,
  rows,
}: {
  title: string;
  description: string;
  modelLabel: string;
  creditLabel: string;
  rows: { tier: string; model: string; prices: Record<string, number> }[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h3 className="text-center text-2xl font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-3 text-center text-sm">
        {description}
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className="p-4">
                {modelLabel}
              </th>
              {['480p', '720p', '1080p'].map((resolution) => (
                <th key={resolution} scope="col" className="p-4 text-right">
                  {resolution}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model} className="border-t">
                <th scope="row" className="p-4 font-normal">
                  <strong>{row.tier}</strong>
                  <span className="text-muted-foreground mt-1 block">
                    {row.model}
                  </span>
                </th>
                {['480p', '720p', '1080p'].map((resolution) => (
                  <td
                    key={resolution}
                    className="p-4 text-right whitespace-nowrap"
                  >
                    {row.prices[resolution] === undefined
                      ? '—'
                      : `${row.prices[resolution]} ${creditLabel}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
