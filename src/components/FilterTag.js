export default function FilterTags({ allYears = false, monthIgnored = false }) {
  if (!allYears && !monthIgnored) return null;
  return (
    <div className="filter-tags">
      {allYears ? <span className="filter-tag">All years</span> : null}
      {monthIgnored ? <span className="filter-tag">Month filter not available for this data</span> : null}
    </div>
  );
}
