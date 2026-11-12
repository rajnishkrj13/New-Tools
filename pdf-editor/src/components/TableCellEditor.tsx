import { useEffect, useRef, useState } from 'react';
import type { TableObject } from '../types/objects';
import { cssFamily } from '../engines/FontManager';
import { CELL_PAD, layoutTable, resizeTable } from '../engines/TableLayout';
import { getState, useEditorStore } from '../store/documentStore';
import { LINE_HEIGHT_EM } from '../utils/fontUtils';

/**
 * Textarea shown over one table cell while it is typed. Tab and Shift+Tab move to the next
 * and previous cell (Tab in the last cell adds a row); Esc or a click elsewhere finishes.
 */
export function TableCellEditor({ table, row, col }: { table: TableObject; row: number; col: number }) {
  const zoom = useEditorStore((s) => s.zoom);
  const [value, setValue] = useState(table.cells[row]?.[col] ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.select();
  }, []);

  /** Saves the cell and optionally opens another one. */
  const finish = (next?: { row: number; col: number }) => {
    if (done.current) return;
    done.current = true;
    const s = getState();
    let t = s.objects.find((o) => o.id === table.id);
    if (!t || t.type !== 'table') return s.setEditingCell(null);
    const text = value.replace(/\s+$/, '');
    let changed = text !== (t.cells[row]?.[col] ?? '');
    if (changed) t = { ...t, cells: t.cells.map((r, i) => (i === row ? r.map((c, j) => (j === col ? text : c)) : r)) };
    if (next && next.row >= t.cells.length) {
      t = resizeTable(t, t.cells.length + 1, t.colW.length);
      changed = true;
    }
    if (changed) s.updateObject(t.id, t);
    getState().setEditingCell(next ? { id: table.id, ...next } : null);
  };

  const cell = layoutTable(table).cells.find((c) => c.row === row && c.col === col);
  if (!cell) return null;
  const cols = table.colW.length;
  return (
    <div className="absolute z-20" style={{ left: table.x * zoom, top: table.y * zoom, transform: `rotate(${table.rotation}deg)`, transformOrigin: '0 0' }}>
      <textarea
        ref={ref}
        value={value}
        spellCheck={false}
        aria-label={`Table cell, row ${row + 1}, column ${col + 1}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            const n = row * cols + col + (e.shiftKey ? -1 : 1);
            if (n < 0) finish();
            else finish({ row: Math.floor(n / cols), col: n % cols });
          }
        }}
        className="absolute m-0 resize-none overflow-hidden border-0 bg-white outline outline-2 outline-brand-500"
        style={{
          left: cell.x * zoom,
          top: cell.y * zoom,
          width: cell.width * zoom,
          height: cell.height * zoom,
          padding: CELL_PAD * zoom,
          fontFamily: cssFamily(cell.style.fontFamily),
          fontSize: cell.style.fontSize * zoom,
          fontWeight: cell.style.bold ? 700 : 400,
          fontStyle: cell.style.italic ? 'italic' : 'normal',
          lineHeight: LINE_HEIGHT_EM,
          color: cell.style.color,
          textAlign: cell.style.align,
        }}
      />
    </div>
  );
}
