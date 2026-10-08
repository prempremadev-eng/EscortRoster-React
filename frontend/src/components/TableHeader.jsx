export default function TableHeader({ rotation }) {
  const routes = Array.from({ length: rotation }, (_, i) => i + 1);
  return (
    <thead>
      <tr>
        <th rowSpan={2} className="col-sno">S.No</th>
        <th rowSpan={2} className="col-name">Name of Escort</th>
        <th rowSpan={2}>Agency</th>
        <th rowSpan={2}>Mobile No</th>
        <th rowSpan={2}>ID No</th>
        {routes.map(i => <th key={i} colSpan={2}>Route {i}</th>)}
        <th rowSpan={2}>Remarks</th>
        <th rowSpan={2} className="delcell-col no-print"></th>
      </tr>
      <tr className="sub">
        {routes.map(i => <th key={i} colSpan={2}>Out | In</th>)}
      </tr>
    </thead>
  );
}
