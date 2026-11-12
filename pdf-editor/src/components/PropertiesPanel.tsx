import {
  AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Copy, ImageUp, Italic, RotateCcw, SendToBack, ShieldCheck, Trash2, TriangleAlert, Underline,
} from 'lucide-react';
import type { EditorObject, MarkMode, TextStyle } from '../types/objects';
import { MARK_OPACITY } from '../engines/TextHighlighter';
import { listFonts } from '../engines/FontManager';
import { getCachedTextModel } from '../engines/PdfTextExtractor';
import { getState, useEditorStore } from '../store/documentStore';
import { findTextEdit, revertParagraph, styleParagraph } from '../store/textEditActions';
import { moveObjectToPage, replaceImage } from '../store/imageActions';
import { isPageEdit } from '../types/objects';
import { layoutTable, resizeTable, setColumnShare } from '../engines/TableLayout';
import { IconToggle } from './FloatingTextToolbar';
import { paragraphStyle } from './TextEditor';

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Num(props: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
      <span>{props.label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={round(props.value)}
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && (props.min === undefined || v >= props.min) && (props.max === undefined || v <= props.max)) props.onChange(v);
          }}
          className="h-7 w-[72px] rounded-md border border-slate-200 px-1.5 text-right text-xs tabular-nums text-slate-800"
        />
        <span className="w-4 text-[10px] text-slate-400">{props.suffix ?? 'pt'}</span>
      </span>
    </label>
  );
}

function Color(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
      <span>{props.label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase text-slate-400">{props.value}</span>
        <input type="color" value={props.value} onChange={(e) => props.onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" />
      </span>
    </label>
  );
}

function Opacity({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
      <span>Opacity</span>
      <span className="flex items-center gap-2">
        <input type="range" min={0.05} max={1} step={0.05} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-24" />
        <span className="w-8 text-right tabular-nums">{Math.round(value * 100)}%</span>
      </span>
    </label>
  );
}

function TextControls({ style, onChange }: { style: TextStyle; onChange: (patch: Partial<TextStyle>, key: string) => void }) {
  useEditorStore((s) => s.fontVersion);
  return (
    <>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>Font</span>
        <select value={style.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value }, 'family')} className="h-7 w-[128px] rounded-md border border-slate-200 px-1 text-xs text-slate-800">
          {listFonts().map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <Num label="Size" value={style.fontSize} min={4} max={200} step={0.5} onChange={(v) => onChange({ fontSize: v }, 'size')} />
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Style</span>
        <span className="flex gap-1">
          <IconToggle title="Bold" active={style.bold} onClick={() => onChange({ bold: !style.bold }, 'bold')}><Bold size={15} /></IconToggle>
          <IconToggle title="Italic" active={style.italic} onClick={() => onChange({ italic: !style.italic }, 'italic')}><Italic size={15} /></IconToggle>
          <IconToggle title="Underline" active={style.underline} onClick={() => onChange({ underline: !style.underline }, 'underline')}><Underline size={15} /></IconToggle>
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Alignment</span>
        <span className="flex gap-1">
          <IconToggle title="Align left" active={style.align === 'left'} onClick={() => onChange({ align: 'left' }, 'align')}><AlignLeft size={15} /></IconToggle>
          <IconToggle title="Align center" active={style.align === 'center'} onClick={() => onChange({ align: 'center' }, 'align')}><AlignCenter size={15} /></IconToggle>
          <IconToggle title="Align right" active={style.align === 'right'} onClick={() => onChange({ align: 'right' }, 'align')}><AlignRight size={15} /></IconToggle>
        </span>
      </div>
      <Color label="Text color" value={style.color} onChange={(v) => onChange({ color: v }, 'color')} />
      <Opacity value={style.opacity} onChange={(v) => onChange({ opacity: v }, 'opacity')} />
    </>
  );
}

function Actions({ o }: { o: EditorObject }) {
  const s = getState();
  const btn = 'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50';
  return (
    <Section title="Arrange">
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => s.reorderObject(o.id, 'forward')}><BringToFront size={14} /> Forward</button>
        <button type="button" className={btn} onClick={() => s.reorderObject(o.id, 'backward')}><SendToBack size={14} /> Backward</button>
      </div>
      <div className="flex gap-2">
        {o.type !== 'highlight' && <button type="button" className={btn} onClick={() => s.duplicateObject(o.id)}><Copy size={14} /> Duplicate</button>}
        <button type="button" className={`${btn} !border-red-200 !text-red-600 hover:!bg-red-50`} onClick={() => s.removeObject(o.id)}><Trash2 size={14} /> Delete</button>
      </div>
    </Section>
  );
}

const TITLES: Record<string, string> = {
  text: 'Text box', image: 'Image', rect: 'Rectangle', ellipse: 'Circle', line: 'Line', arrow: 'Arrow', path: 'Drawing',
  whiteout: 'Whiteout', redact: 'Secure redaction', highlight: 'Text mark', table: 'Table',
};

function ObjectProperties({ o }: { o: Exclude<EditorObject, { type: 'textedit' }> }) {
  const pageCount = useEditorStore((s) => s.pages.length);
  const update = (patch: Partial<EditorObject>, key: string) => getState().updateObject(o.id, patch, key);
  const box = 'x' in o;
  return (
    <>
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">{o.type === 'image' && o.signature ? 'Signature' : TITLES[o.type]}</div>
        <div className="text-[11px] text-slate-500">Page {o.pageIndex + 1}</div>
      </div>
      {o.type === 'image' && (
        <Section title="Picture">
          <label className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <ImageUp size={14} /> Replace image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) replaceImage(o.id, file);
              }}
            />
          </label>
          <p className="text-[11px] leading-snug text-slate-500">Drag to move it, also onto another page. Corner handles resize, the top handle rotates.</p>
        </Section>
      )}
      {o.type === 'table' && (
        <>
          <Section title="Table">
            <Num label="Rows" value={o.cells.length} min={1} max={60} suffix="" onChange={(v) => Number.isInteger(v) && update(resizeTable(o, v, o.colW.length), 'rows')} />
            <Num label="Columns" value={o.colW.length} min={1} max={12} suffix="" onChange={(v) => Number.isInteger(v) && update(resizeTable(o, o.cells.length, v), 'cols')} />
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>Header row</span>
              <input type="checkbox" checked={o.headerRow} onChange={(e) => update({ headerRow: e.target.checked }, 'header')} />
            </label>
            {o.headerRow && <Color label="Header color" value={o.headerFill} onChange={(v) => update({ headerFill: v }, 'headerFill')} />}
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>Background</span>
              <input type="checkbox" checked={o.fill != null} onChange={(e) => update({ fill: e.target.checked ? '#ffffff' : null }, 'fillOn')} />
            </label>
            {o.fill != null && <Color label="Background color" value={o.fill} onChange={(v) => update({ fill: v }, 'fill')} />}
            <Color label="Line color" value={o.borderColor} onChange={(v) => update({ borderColor: v }, 'border')} />
            <Num label="Line width" value={o.borderWidth} min={0} max={6} step={0.25} onChange={(v) => update({ borderWidth: v }, 'bw')} />
            <p className="text-[11px] leading-snug text-slate-500">Double-click a cell to type in it. Tab moves to the next cell and adds a row after the last one.</p>
          </Section>
          {o.colW.length > 1 && (
            <Section title="Column widths">
              {o.colW.map((w, i) => (
                <Num key={i} label={`Column ${i + 1}`} value={w * 100} min={3} max={97} suffix="%" onChange={(v) => update(setColumnShare(o, i, v / 100), `col${i}`)} />
              ))}
            </Section>
          )}
          <Section title="Text">
            <TextControls style={o.style} onChange={(patch, key) => update({ style: { ...o.style, ...patch } }, key)} />
          </Section>
        </>
      )}
      {o.type === 'text' && (
        <Section title="Text">
          <TextControls style={o} onChange={(patch, key) => update(patch, key)} />
        </Section>
      )}
      {(o.type === 'rect' || o.type === 'ellipse') && (
        <Section title="Appearance">
          <label className="flex items-center justify-between text-xs text-slate-600">
            <span>Fill</span>
            <input type="checkbox" checked={o.fill !== null} onChange={(e) => update({ fill: e.target.checked ? '#fde68a' : null }, 'fillOn')} />
          </label>
          {o.fill !== null && <Color label="Fill color" value={o.fill} onChange={(v) => update({ fill: v }, 'fill')} />}
          <label className="flex items-center justify-between text-xs text-slate-600">
            <span>Border</span>
            <input type="checkbox" checked={o.stroke !== null} onChange={(e) => update({ stroke: e.target.checked ? '#dc2626' : null }, 'strokeOn')} />
          </label>
          {o.stroke !== null && <Color label="Border color" value={o.stroke} onChange={(v) => update({ stroke: v }, 'stroke')} />}
          {o.stroke !== null && <Num label="Border width" value={o.strokeWidth} min={0.25} max={60} step={0.5} onChange={(v) => update({ strokeWidth: v }, 'sw')} />}
          <Opacity value={o.opacity} onChange={(v) => update({ opacity: v }, 'opacity')} />
        </Section>
      )}
      {(o.type === 'line' || o.type === 'arrow' || o.type === 'path') && (
        <Section title="Appearance">
          <Color label="Color" value={o.stroke} onChange={(v) => update({ stroke: v }, 'stroke')} />
          <Num label="Thickness" value={o.strokeWidth} min={0.25} max={60} step={0.5} onChange={(v) => update({ strokeWidth: v }, 'sw')} />
          <Opacity value={o.opacity} onChange={(v) => update({ opacity: v }, 'opacity')} />
        </Section>
      )}
      {o.type === 'highlight' && (
        <Section title="Appearance">
          <label className="flex items-center justify-between text-xs text-slate-600">
            <span>Style</span>
            <select
              value={o.mode}
              onChange={(e) => {
                const mode = e.target.value as MarkMode;
                update({ mode, opacity: MARK_OPACITY[mode] }, 'mode');
              }}
              className="h-7 rounded-md border border-slate-200 px-1 text-xs"
            >
              <option value="highlight">Highlight</option>
              <option value="underline">Underline</option>
              <option value="strike">Strikethrough</option>
            </select>
          </label>
          <Color label="Color" value={o.color} onChange={(v) => update({ color: v }, 'color')} />
          <Opacity value={o.opacity} onChange={(v) => update({ opacity: v }, 'opacity')} />
          <p className="text-[11px] leading-snug text-slate-500">A mark stays on its text and cannot be moved. Delete it and drag again to change what it covers.</p>
        </Section>
      )}
      {o.type === 'whiteout' && (
        <Section title="Appearance">
          <Color label="Cover color" value={o.fill} onChange={(v) => update({ fill: v }, 'fill')} />
          <p className="text-[11px] leading-snug text-slate-500">Whiteout hides content visually. The covered text stays inside the file. Use Secure redact to remove it.</p>
        </Section>
      )}
      {o.type === 'redact' && (
        <Section title="Secure redaction">
          <p className="flex gap-1.5 text-[11px] leading-snug text-slate-600">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            On export, page {o.pageIndex + 1} is converted to an image with this box burned in. Text, annotations and hidden content of the page are removed from the file.
          </p>
        </Section>
      )}
      {o.type !== 'highlight' && pageCount > 1 && (
        <Section title="Page">
          <Num label="On page" value={o.pageIndex + 1} min={1} max={pageCount} suffix="" onChange={(v) => Number.isInteger(v) && v - 1 !== o.pageIndex && moveObjectToPage(o.id, v - 1)} />
        </Section>
      )}
      {box && (
        <Section title="Position and size">
          <Num label="Position X" value={o.x} step={1} onChange={(v) => update({ x: v }, 'x')} />
          <Num label="Position Y" value={o.y} step={1} onChange={(v) => update({ y: v }, 'y')} />
          <Num
            label="Width"
            value={o.width}
            min={2}
            onChange={(v) => update(o.type === 'image' && o.keepRatio ? { width: v, height: (v * o.height) / o.width } : { width: v }, 'w')}
          />
          {o.type !== 'text' && (
            <Num
              label="Height"
              value={o.type === 'table' ? layoutTable(o).height : o.height}
              min={2}
              onChange={(v) => update(o.type === 'image' && o.keepRatio ? { height: v, width: (v * o.width) / o.height } : { height: v }, 'h')}
            />
          )}
          {'rotation' in o && <Num label="Rotation" value={o.rotation} min={-360} max={360} suffix="°" onChange={(v) => update({ rotation: v }, 'rot')} />}
          {o.type === 'image' && (
            <>
              <Opacity value={o.opacity} onChange={(v) => update({ opacity: v }, 'opacity')} />
              <label className="flex items-center justify-between text-xs text-slate-600">
                <span>Lock aspect ratio</span>
                <input type="checkbox" checked={o.keepRatio} onChange={(e) => update({ keepRatio: e.target.checked }, 'ratio')} />
              </label>
              {!o.keepRatio && <p className="text-[11px] text-slate-500">Free resize is on: corner handles stretch the image.</p>}
            </>
          )}
        </Section>
      )}
      <Actions o={o} />
    </>
  );
}

function ParagraphProperties() {
  const sel = useEditorStore((s) => s.textSel)!;
  useEditorStore((s) => s.objects);
  const para = getCachedTextModel(sel.pageIndex)?.paragraphs.find((p) => p.id === sel.paragraphId);
  if (!para) return null;
  const edit = findTextEdit(para.id);
  const style = paragraphStyle(para, edit);
  return (
    <>
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">Existing text</div>
        <div className="text-[11px] text-slate-500">
          Page {sel.pageIndex + 1} · {para.lines.length} line{para.lines.length > 1 ? 's' : ''} in this paragraph
        </div>
      </div>
      <Section title="Paragraph style">
        <TextControls
          style={style}
          onChange={(patch, key) => {
            (document.activeElement as HTMLElement | null)?.blur?.();
            styleParagraph(para, patch, key);
          }}
        />
        <p className="text-[11px] leading-snug text-slate-500">Style changes apply to the whole paragraph, which is then redrawn and re-wrapped.</p>
      </Section>
      <Section title="Font">
        <p className="text-xs text-slate-700">Original: {style.originalName}</p>
        {style.match === 'substituted' ? (
          <p className="flex gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            This font cannot be reused for new text. Edited text is drawn with the closest available font. Upload the matching TTF/OTF for an exact result.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">{style.match === 'custom' ? 'Using your uploaded font.' : 'Standard PDF font, matched.'}</p>
        )}
        {edit && (
          <button
            type="button"
            onClick={() => revertParagraph(para.id)}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={14} /> Restore original paragraph
          </button>
        )}
      </Section>
    </>
  );
}

const TIPS: Record<string, string> = {
  select: 'Select an object on the page to change its properties here. Click a picture of the PDF to move, resize, replace or delete it.',
  edittext: 'Click a word, line or letter in the document to change it. Formatting options appear next to the text and here.',
  addtext: 'Click anywhere on a page to start a new text box.',
  highlight: 'Drag across text to highlight, underline or strike it through.',
  whiteout: 'Drag over content to cover it with a white box.',
  redact: 'Drag over content that must be removed from the file for good.',
  draw: 'Draw freehand on the page with the mouse, a pen or a finger.',
  eraser: 'Click or drag over a pen stroke to erase it.',
  rect: 'Drag on the page to draw a rectangle.',
  ellipse: 'Drag on the page to draw a circle or ellipse.',
  line: 'Drag on the page to draw a line.',
  arrow: 'Drag on the page to draw an arrow.',
};

export function PropertiesPanel() {
  const selected = useEditorStore((s) => s.objects.find((o) => o.id === s.selectedId));
  const textSel = useEditorStore((s) => s.textSel);
  const tool = useEditorStore((s) => s.tool);
  const count = useEditorStore((s) => s.objects.length);
  const hasContent = (selected && !isPageEdit(selected)) || textSel;

  return (
    <aside
      className={`${hasContent ? 'absolute bottom-0 right-0 top-0 z-30 flex shadow-float' : 'hidden'} w-[264px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white lg:static lg:flex lg:shadow-none`}
      aria-label="Properties"
    >
      {selected && !isPageEdit(selected) ? (
        <ObjectProperties o={selected} />
      ) : textSel ? (
        <ParagraphProperties />
      ) : (
        <div className="px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">Properties</div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{TIPS[tool]}</p>
          <p className="mt-4 text-xs text-slate-500">
            {count === 0 ? 'No edits yet.' : `${count} edit${count > 1 ? 's' : ''} in this document.`}
          </p>
          <dl className="mt-4 space-y-1.5 text-[11px] text-slate-500">
            {[['Ctrl + Z', 'Undo'], ['Ctrl + Y', 'Redo'], ['Delete', 'Remove selection'], ['Esc', 'Leave tool / cancel'], ['Ctrl + D', 'Duplicate'], ['Arrows', 'Nudge 1 pt (Shift: 10)']].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt><kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] text-slate-600">{k}</kbd></dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </aside>
  );
}
