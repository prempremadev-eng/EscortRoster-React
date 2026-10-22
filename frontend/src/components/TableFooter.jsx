const LABELS = ['Total Trip', 'IPF Security', 'ISI Security', 'BSS Security'];

export default function TableFooter({ rotation, showIn }) {
  return (
    <tfoot>
      {LABELS.map((label, idx) => (
        <tr key={label}>
          <td className="col-sno footer-blank"></td>
          <td className="col-name footer-label">{label}</td>
          <td className="footer-blank"></td>
          <td className="footer-light"></td>
          <td className="footer-light"></td>
          {showIn && <td className="footer-light"></td>}
          {idx === 0 && (
            <>
              <td colSpan={rotation * 2} rowSpan={LABELS.length} className="footer-grand">Grand Total</td>
              <td rowSpan={LABELS.length} className="footer-light"></td>
              <td rowSpan={LABELS.length} className="delcell-col no-print"></td>
            </>
          )}
        </tr>
      ))}
    </tfoot>
  );
}
