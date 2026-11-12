import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Italic, RotateCcw, Trash2, TriangleAlert, Underline } from 'lucide-react';
import type { TextEditObject, TextStyle } from '../types/objects';
import type { Paragraph } from '../types/text';
import { listFonts } from '../engines/FontManager';
import { layoutTextEdit } from '../engines/TextEditLayout';
import { useEditorStore } from '../store/documentStore';
import { revertParagraph, styleParagraph } from '../store/textEditActions';
import { paragraphStyle } from './TextEditor';

interface Props {
  para: Paragraph;
  edit?: TextEditObject;
  anchor: { x: number; top: number; bottom: number };
  pageWidth: number;
  /** Called before a style change so text being typed is saved first. */
  beforeChange: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}

const WIDTH = 452;

export function IconToggle(props: { active?: boolean; title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        props.active ? 'bg-brand-100 text-brand-700' : props.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {props.children}
    </button>
  );
}

/** Formatting bar that floats next to the selected text of the original PDF. */
export function FloatingTextToolbar({ para, edit, anchor, pageWidth, beforeChange, onDelete, onConfirm }: Props) {
  useEditorStore((s) => s.fontVersion);
  const style = paragraphStyle(para, edit);
  const apply = (patch: Partial<TextStyle>, key: string) => {
    beforeChange();
    styleParagraph(para, patch, key);
  };
  const above = anchor.top > 96;
  const left = Math.max(4, Math.min(anchor.x, pageWidth - WIDTH - 4));
  const overflow = edit ? layoutTextEdit(edit).overflow : 0;
  const warn =
    style.match === 'substituted'
      ? `Original font "${style.originalName}" cannot be reused. Edited text is drawn in ${style.fontFamily.replace('custom:', '')}. Upload the matching TTF/OTF (toolbar) for an exact match.`
      : null;

  return (
    <div
      className="absolute z-30 rounded-xl bg-white p-1.5 shadow-float"
      style={{ left, width: WIDTH, ...(above ? { top: anchor.top - 8, transform: 'translateY(-100%)' } : { top: anchor.bottom + 8 }) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <select
          aria-label="Font family"
          value={style.fontFamily}
          onChange={(e) => apply({ fontFamily: e.target.value }, 'family')}
          className="h-7 w-[118px] rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700"
        >
          {listFonts().map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Font size"
          type="number"
          min={4}
          max={200}
          step={0.5}
          value={Math.round(style.fontSize * 10) / 10}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v >= 4 && v <= 200) apply({ fontSize: v }, 'size');
          }}
          className="h-7 w-14 rounded-md border border-slate-200 px-1 text-xs text-slate-700"
        />
        <IconToggle title="Bold" active={style.bold} onClick={() => apply({ bold: !style.bold }, 'bold')}>
          <Bold size={15} />
        </IconToggle>
        <IconToggle title="Italic" active={style.italic} onClick={() => apply({ italic: !style.italic }, 'italic')}>
          <Italic size={15} />
        </IconToggle>
        <IconToggle title="Underline" active={style.underline} onClick={() => apply({ underline: !style.underline }, 'underline')}>
          <Underline size={15} />
        </IconToggle>
        <input
          aria-label="Text color"
          title="Text color"
          type="color"
          value={style.color}
          onChange={(e) => apply({ color: e.target.value }, 'color')}
          className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
        />
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        <IconToggle title="Align left" active={style.align === 'left'} onClick={() => apply({ align: 'left' }, 'align')}>
          <AlignLeft size={15} />
        </IconToggle>
        <IconToggle title="Align center" active={style.align === 'center'} onClick={() => apply({ align: 'center' }, 'align')}>
          <AlignCenter size={15} />
        </IconToggle>
        <IconToggle title="Align right" active={style.align === 'right'} onClick={() => apply({ align: 'right' }, 'align')}>
          <AlignRight size={15} />
        </IconToggle>
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        {edit && (
          <IconToggle title="Restore original paragraph" onClick={() => revertParagraph(para.id)}>
            <RotateCcw size={15} />
          </IconToggle>
        )}
        <IconToggle title="Delete selected text" danger onClick={onDelete}>
          <Trash2 size={15} />
        </IconToggle>
        <button
          type="button"
          title="Confirm"
          aria-label="Confirm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onConfirm}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500 text-white hover:bg-brand-600"
        >
          <Check size={15} />
        </button>
      </div>
      {(warn || overflow > 0) && (
        <div className="mt-1.5 flex gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>
            {warn}
            {warn && overflow > 0 ? ' ' : ''}
            {overflow > 0 && 'The paragraph is now longer than the space under it and overlaps the content below.'}
          </span>
        </div>
      )}
    </div>
  );
}
