import { useRef } from 'react';
import {
  Check, Circle, Download, Eraser, EyeOff, FileText, FolderOpen, ImagePlus, Maximize, Minus, MousePointer2, MoveHorizontal,
  MoveUpRight, PaintBucket, Pencil, Redo2, Shapes, Signature, Square, TextCursorInput, Type, Undo2, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { Tool } from '../types/editor';
import { SHAPE_TOOLS } from '../types/editor';
import type { EditLevel } from '../types/text';
import { listFonts, registerCustomFont } from '../engines/FontManager';
import { applyChanges, downloadPdf } from '../hooks/useExport';
import { insertImageFile, openPdfFile } from '../hooks/usePdfDocument';
import { getState, useEditorStore } from '../store/documentStore';

function ToolButton(props: { icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={props.title ?? props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`flex h-[50px] min-w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        props.active ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500/40' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {props.icon}
      <span className="whitespace-nowrap">{props.label}</span>
    </button>
  );
}

function IconButton(props: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
    >
      {props.icon}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-8 w-px shrink-0 bg-slate-200" />;

function Segmented<T extends string>(props: { value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
            props.value === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const colorInput = 'h-7 w-8 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5';
const numberInput = 'h-7 w-16 rounded-md border border-slate-200 px-1.5 text-xs';
const hint = 'text-xs text-slate-500';

/** Second row: options of the active tool. */
function ToolOptions() {
  const tool = useEditorStore((s) => s.tool);
  const level = useEditorStore((s) => s.editLevel);
  const ts = useEditorStore((s) => s.toolStyle);
  useEditorStore((s) => s.fontVersion);
  const fontInput = useRef<HTMLInputElement>(null);
  const set = getState().setToolStyle;

  let content: React.ReactNode;
  if (tool === 'edittext') {
    content = (
      <>
        <span className={hint}>Click text to edit</span>
        <Segmented<EditLevel>
          value={level}
          onChange={getState().setEditLevel}
          options={[
            { value: 'word', label: 'Word', title: 'Select and replace single words' },
            { value: 'line', label: 'Line', title: 'Select and replace a whole line' },
            { value: 'char', label: 'Letter', title: 'Select and replace single characters' },
          ]}
        />
        <button
          type="button"
          onClick={() => fontInput.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload size={13} /> Upload font (TTF/OTF)
        </button>
        <input
          ref={fontInput}
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const f = await registerCustomFont(file);
              getState().bumpFonts();
              getState().toast(`Font "${f.label}" added. Pick it in the font list of the selected text.`, 'success');
            } catch (err: any) {
              getState().toast(err?.message ?? 'The font could not be loaded.', 'error');
            }
          }}
        />
        <span className={`${hint} hidden xl:inline`}>Enter confirms · Esc cancels · longer text re-wraps the paragraph</span>
      </>
    );
  } else if (tool === 'addtext') {
    content = (
      <>
        <span className={hint}>Click on the page to place a text box</span>
        <select
          aria-label="Font"
          value={ts.text.fontFamily}
          onChange={(e) => set({ text: { ...ts.text, fontFamily: e.target.value } })}
          className="h-7 rounded-md border border-slate-200 px-1 text-xs"
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
          value={ts.text.fontSize}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (v >= 4 && v <= 200) set({ text: { ...ts.text, fontSize: v } });
          }}
          className={numberInput}
        />
        <input aria-label="Text color" type="color" value={ts.text.color} onChange={(e) => set({ text: { ...ts.text, color: e.target.value } })} className={colorInput} />
      </>
    );
  } else if (tool === 'whiteout' || tool === 'redact') {
    content = (
      <>
        <Segmented<Tool>
          value={tool}
          onChange={getState().setTool}
          options={[
            { value: 'whiteout', label: <><Eraser size={13} /> Whiteout</>, title: 'Cover content with a white box' },
            { value: 'redact', label: <><EyeOff size={13} /> Secure redact</>, title: 'Permanently remove what is under the box' },
          ]}
        />
        <span className={hint}>
          {tool === 'whiteout'
            ? 'Drag to cover an area. Whiteout only hides content: the text underneath stays in the file and can still be copied.'
            : 'Drag over sensitive content. On export the whole page is turned into an image, so nothing under the box remains (page text is no longer selectable).'}
        </span>
      </>
    );
  } else if (tool === 'draw' || tool === 'eraser') {
    content = (
      <>
        <Segmented<Tool>
          value={tool}
          onChange={getState().setTool}
          options={[
            { value: 'draw', label: <><Pencil size={13} /> Pen</> },
            { value: 'eraser', label: <><Eraser size={13} /> Eraser</>, title: 'Click or drag over a pen stroke to remove it' },
          ]}
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Color
          <input type="color" value={ts.drawColor} onChange={(e) => set({ drawColor: e.target.value })} className={colorInput} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Width
          <input type="range" min={0.5} max={12} step={0.5} value={ts.drawWidth} onChange={(e) => set({ drawWidth: parseFloat(e.target.value) })} />
          <span className="w-8 tabular-nums">{ts.drawWidth}pt</span>
        </label>
      </>
    );
  } else if (SHAPE_TOOLS.includes(tool)) {
    content = (
      <>
        <Segmented<Tool>
          value={tool}
          onChange={getState().setTool}
          options={[
            { value: 'rect', label: <><Square size={13} /> Rectangle</> },
            { value: 'ellipse', label: <><Circle size={13} /> Circle</> },
            { value: 'line', label: <><Minus size={13} /> Line</> },
            { value: 'arrow', label: <><MoveUpRight size={13} /> Arrow</> },
          ]}
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Border
          <input type="color" value={ts.shapeStroke} onChange={(e) => set({ shapeStroke: e.target.value })} className={colorInput} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Width
          <input
            type="number" min={0.5} max={40} step={0.5} value={ts.shapeStrokeWidth} className={numberInput}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (v > 0 && v <= 40) set({ shapeStrokeWidth: v });
            }}
          />
        </label>
        {(tool === 'rect' || tool === 'ellipse') && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <PaintBucket size={13} /> Fill
            <input type="checkbox" checked={ts.shapeFill !== null} onChange={(e) => set({ shapeFill: e.target.checked ? '#fde68a' : null })} />
            {ts.shapeFill !== null && <input type="color" value={ts.shapeFill} onChange={(e) => set({ shapeFill: e.target.value })} className={colorInput} />}
          </label>
        )}
        <span className={hint}>Drag on the page to draw</span>
      </>
    );
  } else {
    content = <span className={hint}>Click an object to select it · drag to move · handles resize and rotate · Delete removes · double-click a text box to retype it</span>;
  }
  // Keyed by tool so the inputs of one tool are never reused for another.
  return (
    <div key={tool} className="flex min-h-[38px] items-center gap-3 overflow-x-auto border-t border-slate-100 px-4 py-1.5">
      {content}
    </div>
  );
}

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const lastShape = useEditorStore((s) => s.lastShape);
  const zoom = useEditorStore((s) => s.zoom);
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);
  const dirty = useEditorStore((s) => s.dirty);
  const fileName = useEditorStore((s) => s.doc?.fileName);
  const pdfInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const s = getState();
  const pick = (t: Tool) => () => s.setTool(tool === t && t !== 'select' ? 'select' : t);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="mr-1 flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
            <FileText size={17} />
          </span>
          <div className="hidden max-w-[150px] leading-tight 2xl:block">
            <div className="text-[13px] font-semibold text-slate-900">PDF Editor</div>
            <div className="truncate text-[11px] text-slate-500" title={fileName}>{fileName}</div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
          <ToolButton icon={<FolderOpen size={18} />} label="Upload PDF" onClick={() => pdfInput.current?.click()} />
          <Divider />
          <ToolButton icon={<MousePointer2 size={18} />} label="Select" active={tool === 'select'} onClick={pick('select')} />
          <ToolButton icon={<TextCursorInput size={18} />} label="Edit Text" active={tool === 'edittext'} onClick={pick('edittext')} />
          <ToolButton icon={<Type size={18} />} label="Add Text" active={tool === 'addtext'} onClick={pick('addtext')} />
          <ToolButton icon={<ImagePlus size={18} />} label="Add Image" onClick={() => imageInput.current?.click()} />
          <ToolButton icon={<Eraser size={18} />} label="Whiteout" active={tool === 'whiteout' || tool === 'redact'} onClick={pick(tool === 'redact' ? 'redact' : 'whiteout')} />
          <ToolButton icon={<Pencil size={18} />} label="Draw" active={tool === 'draw' || tool === 'eraser'} onClick={pick(tool === 'eraser' ? 'eraser' : 'draw')} />
          <ToolButton icon={<Signature size={18} />} label="Signature" onClick={() => s.setSignatureOpen(true)} />
          <ToolButton icon={<Shapes size={18} />} label="Shapes" active={SHAPE_TOOLS.includes(tool)} onClick={pick(SHAPE_TOOLS.includes(tool) ? tool : lastShape)} />
          <Divider />
          <ToolButton icon={<Undo2 size={18} />} label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={s.undo} />
          <ToolButton icon={<Redo2 size={18} />} label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={s.redo} />
          <Divider />
          <IconButton icon={<ZoomOut size={18} />} label="Zoom Out" onClick={() => s.zoomBy(1 / 1.2)} />
          <button
            type="button"
            title="Reset zoom to 100%"
            onClick={() => s.setZoom(1)}
            className="h-9 w-12 shrink-0 rounded-md text-xs font-semibold tabular-nums text-slate-700 hover:bg-slate-100"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton icon={<ZoomIn size={18} />} label="Zoom In" onClick={() => s.zoomBy(1.2)} />
          <IconButton icon={<MoveHorizontal size={18} />} label="Fit Width" onClick={s.fitWidth} />
          <IconButton icon={<Maximize size={18} />} label="Fit Page" onClick={s.fitPage} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={applyChanges}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-brand-500 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Check size={16} /> Apply Changes
            {dirty && <span className="h-2 w-2 rounded-full bg-amber-500" title="There are edits that were not applied yet" />}
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            <Download size={16} /> Download PDF
          </button>
        </div>
      </div>
      <ToolOptions />
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) openPdfFile(f);
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          files.forEach((f) => insertImageFile(f));
        }}
      />
    </header>
  );
}
