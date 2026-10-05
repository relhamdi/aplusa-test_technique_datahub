import type { StatsOut } from "../types/api";
import { formatCell, formatNumber, formatPercent } from "../utils/formatCell";

const NONE = "—"; // min/max/average of a column with no value

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface StatsSummaryProps {
  stats: StatsOut;
  // Checkbox 2 is ticked AND the table is filtered: the total no longer covers every value.
  valueFiltersApplied: boolean;
}

export function StatsSummary({
  stats,
  valueFiltersApplied,
}: StatsSummaryProps) {
  const { boolean, numeric } = stats;
  return (
    <section aria-label="Résumé">
      <dl className="stats-grid">
        <Stat label="Valeurs (hors vides)" value={formatNumber(stats.count)} />
        <Stat label="Valeurs vides" value={formatNumber(stats.empty_count)} />
        {boolean && (
          <>
            <Stat
              label="Vrai"
              value={`${formatNumber(boolean.true_count)} (${formatPercent(boolean.true_percent)})`}
            />
            <Stat
              label="Faux"
              value={`${formatNumber(boolean.false_count)} (${formatPercent(boolean.false_percent)})`}
            />
          </>
        )}
        {numeric && (
          <>
            <Stat
              label="Minimum"
              value={
                numeric.min === null
                  ? NONE
                  : formatCell(numeric.min, stats.type)
              }
            />
            <Stat
              label="Maximum"
              value={
                numeric.max === null
                  ? NONE
                  : formatCell(numeric.max, stats.type)
              }
            />
            <Stat
              label="Moyenne"
              value={numeric.avg === null ? NONE : formatNumber(numeric.avg)}
            />
          </>
        )}
      </dl>

      {boolean && (
        <div
          className="split-bar"
          role="img"
          aria-label={`Vrai ${formatPercent(boolean.true_percent)}, faux ${formatPercent(boolean.false_percent)}`}
        >
          <span
            className="split-true"
            style={{ width: `${boolean.true_percent}%` }}
          />
          <span
            className="split-false"
            style={{ width: `${boolean.false_percent}%` }}
          />
        </div>
      )}

      {valueFiltersApplied && (
        <p className="hint">
          Le total ne compte que les valeurs correspondant aux filtres du tableau ci-dessous.
        </p>
      )}
    </section>
  );
}
