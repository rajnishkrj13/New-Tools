import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { Arrow, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Transformer } from 'react-konva';
import { isPageEdit } from '../types/objects';
import type { EditorObject, ImageObject, TableObject, TextEditObject, TextStyle } from '../types/objects';
import type { PageImage } from '../engines/PdfImages';
import type { PageInfo } from '../types/pdf';
import { arrowHeadSize } from '../engines/PdfExporter';
import { findPageImages, getPdfPage } from '../engines/PdfRenderer';
import { getCachedTextModel, loadTextModel } from '../engines/PdfTextExtractor';
import { MARK_OPACITY, markForArea, markShapes, marksForBox } from '../engines/TextHighlighter';
import { layoutTextEdit, layoutTextObject, runStyle, type TextRun } from '../engines/TextEditLayout';
import { findPageLinks, type PageLink } from '../engines/PdfRenderer';
import { objectBounds, shiftObject } from '../store/selectionActions';
import type { FieldObject } from '../types/objects';
import { cellAt, layoutTable } from '../engines/TableLayout';
import { getState, useEditorStore } from '../store/documentStore';
import { liftPageImage, moveObjectToPage } from '../store/imageActions';
import { cssFont } from '../utils/fontUtils';
import { newId } from '../utils/imageUtils';

/** Draws text runs exactly as the exporter does: alphabetic baseline, fitted to the run width. */
function drawRuns(context: Konva.Context, runs: TextRun[], style: TextStyle) {
  const c = (context as any)._context as CanvasRenderingContext2D;
  c.fillStyle = style.color;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  for (const r of runs) {
    c.font = cssFont({ ...runStyle(style, r), fontSize: r.fontSize });
    const natural = c.measureText(r.text).width;
    const sx = natural > 0 && r.width > 0 ? r.width / natural : 1;
    c.save();
    c.translate(r.x, r.baseline);
    c.scale(sx, 1);
    c.fillText(r.text, 0, 0);
    c.restore();
    if (style.underline) {
      const t = Math.max(0.5, r.fontSize * 0.06);
      c.fillRect(r.x, r.baseline + r.fontSize * 0.11 - t / 2, r.width, t);
    }
  }
}

/** Draws a table exactly as the exporter does: header fill, grid lines, then the text of every cell. */
function drawTable(context: Konva.Context, o: TableObject, skip: { row: number; col: number } | null) {
  const c = (context as any)._context as CanvasRenderingContext2D;
  const layout = layoutTable(o);
  if (o.fill) {
    c.fillStyle = o.fill;
    c.fillRect(0, 0, layout.width, layout.height);
  }
  if (o.headerRow) {
    c.fillStyle = o.headerFill;
    c.fillRect(0, 0, layout.width, layout.rowY[1]);
  }
  if (o.borderWidth > 0) {
    c.strokeStyle = o.borderColor;
    c.lineWidth = o.borderWidth;
    c.lineCap = 'square';
    c.beginPath();
    for (const x of layout.colX) {
      c.moveTo(x, 0);
      c.lineTo(x, layout.height);
    }
    for (const y of layout.rowY) {
      c.moveTo(0, y);
      c.lineTo(layout.width, y);
    }
    c.stroke();
  }
  // The cell that is being typed is shown by its text field.
  for (const cell of layout.cells) if (!(skip && skip.row === cell.row && skip.col === cell.col)) drawRuns(context, cell.runs, cell.style);
}

/** A new form field as it will look: a white box with its value, or a tick for a check box. */
function drawField(context: Konva.Context, o: FieldObject) {
  const c = (context as any)._context as CanvasRenderingContext2D;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, o.width, o.height);
  c.strokeStyle = '#64748b';
  c.lineWidth = 1;
  c.strokeRect(0, 0, o.width, o.height);
  if (o.kind === 'checkbox') {
    if (!o.checked) return;
    c.strokeStyle = '#111827';
    c.lineWidth = Math.max(1, o.width * 0.12);
    c.beginPath();
    c.moveTo(o.width * 0.2, o.height * 0.55);
    c.lineTo(o.width * 0.42, o.height * 0.78);
    c.lineTo(o.width * 0.82, o.height * 0.24);
    c.stroke();
    return;
  }
  c.save();
  c.beginPath();
  c.rect(1, 1, o.width - 2, o.height - 2);
  c.clip();
  c.textBaseline = 'middle';
  c.font = `${o.fontSize}px Arial, Helvetica, sans-serif`;
  // An empty field shows its name in grey so it can be told apart while editing.
  c.fillStyle = o.value ? '#111827' : '#94a3b8';
  c.fillText(o.value || o.name, 3, o.height / 2);
  c.restore();
}

function useHtmlImage(url?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return setImg(null);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => {
      el.onload = null;
    };
  }, [url]);
  return img;
}

function ImageNode({ o, nodeProps }: { o: ImageObject; nodeProps: Record<string, unknown> }) {
  const url = useEditorStore((s) => s.assets[o.assetId]?.url);
  const img = useHtmlImage(url);
  return (
    <KonvaImage image={img ?? undefined} x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation} opacity={o.opacity} {...nodeProps} />
  );
}

function TextEditNode({ o, fontVersion }: { o: TextEditObject; fontVersion: number }) {
  const layout = layoutTextEdit(o);
  return (
    <>
      {layout.masks.map((m, i) => (
        <Rect key={i} x={m.x} y={m.y} width={m.width} height={m.height} fill={o.maskColor} listening={false} />
      ))}
      <Shape
        key={`t${fontVersion}`}
        listening={false}
        opacity={o.style.opacity}
        sceneFunc={(ctx) => drawRuns(ctx, layout.runs, o.style)}
      />
    </>
  );
}

/** The page element under a screen point, if any. */
function pageElementAt(x: number, y: number): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-page]')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
  }
  return null;
}

/** Marks the page an object would land on while it is dragged outside its own page. */
let dropTarget: HTMLElement | null = null;
function markDropTarget(el: HTMLElement | null) {
  if (dropTarget === el) return;
  if (dropTarget) dropTarget.style.outline = '';
  dropTarget = el;
  if (el) el.style.outline = '3px solid #2f7df6';
}

const clientPoint = (evt: MouseEvent | TouchEvent) => {
  const t = 'changedTouches' in evt ? evt.changedTouches[0] : evt;
  return t ? { x: t.clientX, y: t.clientY } : null;
};

const CURSORS: Partial<Record<string, string>> = { addtext: 'text', highlight: 'text', eraser: 'cell', select: 'default' };

export function ObjectLayer({ page }: { page: PageInfo }) {
  const zoom = useEditorStore((s) => s.zoom);
  const tool = useEditorStore((s) => s.tool);
  const selectedId = useEditorStore((s) => s.selectedId);
  const editingTextId = useEditorStore((s) => s.editingTextId);
  const fontVersion = useEditorStore((s) => s.fontVersion);
  const editingCell = useEditorStore((s) => s.editingCell);
  const all = useEditorStore((s) => s.objects);
  const objects = useMemo(() => all.filter((o) => o.pageIndex === page.index), [all, page.index]);

  const trRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Node>());
  const origin = useRef<{ x: number; y: number } | null>(null);
  const erasing = useRef(false);
  /** True while the mark being dragged follows text (false: a free area, e.g. on a scan). */
  const onText = useRef(false);
  const [draft, setDraft] = useState<EditorObject | null>(null);

  const extraSelected = useEditorStore((s) => s.extraSelected);
  const selected = objects.find((o) => o.id === selectedId && !isPageEdit(o));
  /** Everything selected on this page (more than one after Shift+click). */
  const selection = objects.filter((o) => (o.id === selectedId || extraSelected.includes(o.id)) && !isPageEdit(o));
  const multi = selection.length > 1;
  const [pdfImages, setPdfImages] = useState<PageImage[]>([]);
  const [pdfLinks, setPdfLinks] = useState<PageLink[]>([]);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  /** Alignment guides shown while an object is dragged: x positions and y positions. */
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const canSelect = tool === 'select';

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const list = canSelect ? selection.filter((o) => editingTextId !== o.id).map((o) => nodes.current.get(o.id)).filter((n): n is Konva.Node => !!n) : [];
    tr.nodes(list);
    tr.getLayer()?.batchDraw();
  });

  // Links the original page already has can be picked up with the Link tool.
  useEffect(() => {
    if (tool !== 'link') return;
    let dead = false;
    findPageLinks(page).then((list) => !dead && setPdfLinks(list));
    return () => {
      dead = true;
    };
  }, [tool, page]);

  /**
   * Snaps a dragged object to the page edges and centre and to the edges and centres of the
   * other objects, and shows the guide it snapped to. Hold Alt to move freely.
   */
  const snap = (node: Konva.Node, self: EditorObject, free: boolean) => {
    const layer = node.getLayer();
    if (!layer || free) return setGuides({ v: [], h: [] });
    const box = node.getClientRect({ relativeTo: layer as never, skipStroke: true, skipShadow: true });
    const xs = [0, page.width / 2, page.width];
    const ys = [0, page.height / 2, page.height];
    for (const o of objects) {
      if (o.id === self.id || isPageEdit(o)) continue;
      const b = objectBounds(o);
      xs.push(b.x, b.x + b.width / 2, b.x + b.width);
      ys.push(b.y, b.y + b.height / 2, b.y + b.height);
    }
    const tol = 6 / zoom;
    const nearest = (targets: number[], edges: number[]) => {
      let best: { d: number; t: number } | null = null;
      for (const t of targets) for (const e of edges) if (Math.abs(t - e) < tol && (!best || Math.abs(t - e) < Math.abs(best.d))) best = { d: t - e, t };
      return best;
    };
    const sx = nearest(xs, [box.x, box.x + box.width / 2, box.x + box.width]);
    const sy = nearest(ys, [box.y, box.y + box.height / 2, box.y + box.height]);
    if (sx) node.x(node.x() + sx.d);
    if (sy) node.y(node.y() + sy.d);
    setGuides({ v: sx ? [sx.t] : [], h: sy ? [sy.t] : [] });
  };

  // The highlighter snaps to the page's text, which is read once per page.
  useEffect(() => {
    if (tool !== 'highlight' || getCachedTextModel(page.index)) return;
    getPdfPage(page)
      .then((p) => loadTextModel(p, page))
      .catch(() => undefined);
  }, [tool, page]);

  // Pictures of the original page can be picked up with the Select tool.
  useEffect(() => {
    if (tool !== 'select') return;
    let dead = false;
    findPageImages(page).then((list) => !dead && setPdfImages(list));
    return () => {
      dead = true;
    };
  }, [tool, page]);

  /** The other page under the pointer while an object is dragged, with the offset between the two pages. */
  const otherPage = (e: Konva.KonvaEventObject<DragEvent>) => {
    const pt = clientPoint(e.evt as unknown as MouseEvent | TouchEvent);
    const stage = e.target.getStage();
    if (!pt || !stage) return null;
    const src = stage.container().getBoundingClientRect();
    if (pt.x >= src.left && pt.x <= src.right && pt.y >= src.top && pt.y <= src.bottom) return null;
    const el = pageElementAt(pt.x, pt.y);
    const index = el ? Number(el.dataset.page) : NaN;
    if (!el || !Number.isInteger(index) || index === page.index) return null;
    const dst = el.getBoundingClientRect();
    return { el, index, dx: (src.left - dst.left) / zoom, dy: (src.top - dst.top) / zoom };
  };

  const pointer = (e: Konva.KonvaEventObject<PointerEvent>) => e.target.getStage()!.getRelativePointerPosition()!;

  const eraseAt = (target: Konva.Node) => {
    const hit = objects.find((o) => o.id === target.id());
    if (hit?.type === 'path') getState().removeObject(hit.id);
  };

  const onDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    // A text box that is being typed is saved (through its blur handler) before anything else happens.
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) active.blur();
    const s = getState();
    const p = pointer(e);
    const base = { id: newId(), pageIndex: page.index };
    const ts = s.toolStyle;
    switch (tool) {
      case 'select':
        if (e.target === e.target.getStage() || e.target.name() === 'pdfimage') s.select(null);
        return;
      case 'addtext':
        return; // handled on click, so the new text field keeps the focus
      case 'eraser':
        erasing.current = true;
        eraseAt(e.target);
        return;
      case 'whiteout':
      case 'redact':
        setDraft({ ...base, type: tool, x: p.x, y: p.y, width: 0, height: 0, fill: tool === 'redact' ? '#000000' : '#ffffff' });
        break;
      case 'highlight':
        onText.current = false;
        setDraft({ ...base, type: 'highlight', mode: ts.markMode, color: ts.markColor, opacity: MARK_OPACITY[ts.markMode], rects: [] });
        break;
      case 'link':
        setDraft({ ...base, type: 'link', x: p.x, y: p.y, width: 0, height: 0, url: '' });
        break;
      case 'textfield':
      case 'checkbox': {
        const kind = tool === 'checkbox' ? 'checkbox' : 'text';
        // A name nobody else uses: Text1, Text2 ... / Check1, Check2 ...
        const taken = new Set(s.objects.map((o) => (o.type === 'field' ? o.name : '')));
        let n = 1;
        while (taken.has(`${kind === 'text' ? 'Text' : 'Check'}${n}`)) n++;
        setDraft({ ...base, type: 'field', kind, name: `${kind === 'text' ? 'Text' : 'Check'}${n}`, x: p.x, y: p.y, width: 0, height: 0, value: '', checked: false, fontSize: 11 });
        break;
      }
      case 'note':
        return; // placed on click
      case 'rect':
      case 'ellipse':
        setDraft({
          ...base, type: tool, x: p.x, y: p.y, width: 0, height: 0, rotation: 0,
          fill: ts.shapeFill, stroke: ts.shapeStroke, strokeWidth: ts.shapeStrokeWidth, opacity: 1,
        });
        break;
      case 'line':
      case 'arrow':
        setDraft({ ...base, type: tool, points: [p.x, p.y, p.x, p.y], stroke: ts.shapeStroke, strokeWidth: ts.shapeStrokeWidth, opacity: 1 });
        break;
      case 'draw':
        setDraft({ ...base, type: 'path', points: [p.x, p.y], stroke: ts.drawColor, strokeWidth: ts.drawWidth, opacity: 1 });
        break;
      default:
        return;
    }
    origin.current = p;
  };

  const onClick = (e: Konva.KonvaEventObject<Event>) => {
    if (tool === 'note') {
      const s = getState();
      const p = e.target.getStage()!.getRelativePointerPosition()!;
      s.setTool('select');
      getState().addObject({ id: newId(), pageIndex: page.index, type: 'note', x: p.x - 9, y: p.y - 9, width: 18, height: 18, text: '', author: '', color: '#facc15', replies: [] });
      // The note's text is typed in the panel on the right.
      setTimeout(() => document.querySelector<HTMLTextAreaElement>('#note-text')?.focus(), 80);
      return;
    }
    if (tool !== 'addtext') return;
    const s = getState();
    const p = e.target.getStage()!.getRelativePointerPosition()!;
    const style = s.toolStyle.text;
    const width = Math.max(60, Math.min(220, page.width - p.x - 8));
    s.setTool('select');
    s.setDraftText({ id: newId(), pageIndex: page.index, type: 'text', x: p.x, y: p.y - style.fontSize * 0.6, width, rotation: 0, text: '', ...style });
  };

  const onMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (erasing.current) return eraseAt(e.target);
    const o = origin.current;
    if (!draft || !o) return;
    const p = pointer(e);
    if (draft.type === 'highlight') {
      const box = { x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), width: Math.abs(p.x - o.x), height: Math.abs(p.y - o.y) };
      const rects = marksForBox(getCachedTextModel(page.index)?.lines ?? [], box);
      onText.current = rects.length > 0;
      setDraft({ ...draft, rects: rects.length ? rects : [markForArea(box)] });
    } else if (draft.type === 'path') {
      const pts = draft.points;
      if (Math.hypot(p.x - pts[pts.length - 2], p.y - pts[pts.length - 1]) < 0.6 / zoom) return;
      setDraft({ ...draft, points: [...pts, p.x, p.y] });
    } else if (draft.type === 'line' || draft.type === 'arrow') {
      setDraft({ ...draft, points: [o.x, o.y, p.x, p.y] });
    } else if ('height' in draft) {
      setDraft({ ...draft, x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), width: Math.abs(p.x - o.x), height: Math.abs(p.y - o.y) });
    }
  };

  const onUp = () => {
    erasing.current = false;
    const d = draft;
    if (!d) return;
    setDraft(null);
    origin.current = null;
    let ok = true;
    if (d.type === 'line' || d.type === 'arrow') ok = Math.hypot(d.points[2] - d.points[0], d.points[3] - d.points[1]) > 3;
    else if (d.type === 'path') ok = d.points.length >= 2;
    else if (d.type === 'highlight') ok = d.rects.length > 0 && (onText.current || (d.rects[0].width > 3 && d.rects[0].height > 3));
    else if (d.type === 'field' && (d.width <= 3 || d.height <= 3)) {
      // A plain click places a field of the usual size.
      const size = d.kind === 'checkbox' ? { width: 14, height: 14 } : { width: 160, height: 22 };
      getState().setTool('select');
      return getState().addObject({ ...d, ...size });
    } else if ('width' in d && 'height' in d) ok = d.width > 3 && d.height > 3;
    if (!ok) return;
    if (d.type === 'link' || d.type === 'field') {
      // Its address / name is filled in next, in the panel on the right.
      getState().setTool('select');
      getState().addObject(d);
      if (d.type === 'link') setTimeout(() => document.querySelector<HTMLInputElement>('#link-url')?.focus(), 80);
    } else getState().addObject(d, false);
  };

  /** Lines and freehand paths keep no transform: it is baked into their points. */
  const bake = (o: Extract<EditorObject, { points: number[] }>, node: Konva.Node) => {
    const t = node.getTransform().copy();
    const pts: number[] = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      const p = t.point({ x: o.points[i], y: o.points[i + 1] });
      pts.push(p.x, p.y);
    }
    node.setAttrs({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    getState().updateObject(o.id, { points: pts } as Partial<EditorObject>);
  };

  const nodeProps = (o: EditorObject, isDraft: boolean) => {
    const active = !isDraft && (canSelect || (tool === 'eraser' && o.type === 'path'));
    return {
      id: o.id,
      listening: active,
      draggable: !isDraft && canSelect && o.type !== 'highlight',
      ref: (n: Konva.Node | null) => {
        if (isDraft) return;
        if (n) nodes.current.set(o.id, n);
        else nodes.current.delete(o.id);
      },
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!canSelect) return;
        const s = getState();
        const isSelected = s.selectedId === o.id || s.extraSelected.includes(o.id);
        // Shift or Ctrl adds to / removes from the selection; a selected object keeps the group when dragged.
        if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) s.toggleSelect(o.id);
        else if (!isSelected) s.select(o.id);
      },
      onTouchStart: () => canSelect && getState().select(o.id),
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        // Several selected objects are moved together by the transformer; they do not snap.
        if (multi) return;
        const node = e.target;
        const away = otherPage(e)?.el ?? null;
        markDropTarget(away);
        snap(node, o, !!away || (e.evt as unknown as MouseEvent).altKey);
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        setGuides({ v: [], h: [] });
        if (multi) {
          // Every object of the group reports its own move; the shared key makes it one undo step.
          markDropTarget(null);
          const s = getState();
          const dx = node.x() - ('x' in o ? o.x : 0);
          const dy = node.y() - ('x' in o ? o.y : 0);
          if ('points' in o) node.position({ x: 0, y: 0 });
          return s.commit(s.objects.map((x) => (x.id === o.id ? shiftObject(x, dx, dy) : x)), 'group-drag');
        }
        const to = otherPage(e);
        markDropTarget(null);
        if (to && o.type !== 'highlight') {
          // Dropped on another page: the object moves there, at the place it was dropped.
          const dx = to.dx + node.x() - ('x' in o ? o.x : 0);
          const dy = to.dy + node.y() - ('x' in o ? o.y : 0);
          node.position('x' in o ? { x: o.x, y: o.y } : { x: 0, y: 0 });
          return moveObjectToPage(o.id, to.index, dx, dy);
        }
        if ('points' in o) bake(o, node);
        else getState().updateObject(o.id, { x: node.x(), y: node.y() } as Partial<EditorObject>);
      },
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
        const node = e.target;
        if ('points' in o) return bake(o, node);
        if (o.type === 'textedit' || o.type === 'highlight') return;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        const patch: Record<string, number> = { x: node.x(), y: node.y(), width: Math.max(4, o.width * sx) };
        if ('rotation' in o) patch.rotation = node.rotation();
        if ('height' in o) patch.height = Math.max(4, o.height * sy);
        if (o.type === 'table') patch.width = Math.max(o.colW.length * 12, o.width * sx);
        getState().updateObject(o.id, patch as Partial<EditorObject>);
      },
    };
  };

  const renderObject = (o: EditorObject, isDraft = false) => {
    const props = nodeProps(o, isDraft);
    switch (o.type) {
      case 'textedit':
        return <TextEditNode key={o.id} o={o} fontVersion={fontVersion} />;
      case 'imagecut': {
        // Slightly larger than the picture, so its soft edge does not show around the cover.
        const pad = Math.max(0.75, 1.5 / zoom);
        return <Rect key={o.id} x={o.x} y={o.y} offsetX={pad} offsetY={pad} width={o.width + pad * 2} height={o.height + pad * 2} rotation={o.rotation} fill={o.fill} listening={false} />;
      }
      case 'text': {
        const layout = layoutTextObject(o);
        return (
          <Shape
            key={`${o.id}:${fontVersion}`}
            x={o.x} y={o.y} width={o.width} height={layout.height} rotation={o.rotation} opacity={o.opacity}
            visible={editingTextId !== o.id}
            sceneFunc={(ctx) => {
              if (o.frame) {
                const c = (ctx as any)._context as CanvasRenderingContext2D;
                const f = o.frame;
                c.strokeStyle = f.color;
                c.lineWidth = f.width;
                c.strokeRect(-f.padding, -f.padding, o.width + f.padding * 2, layout.height + f.padding * 2);
              }
              drawRuns(ctx, layout.lines, o);
            }}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.rect(0, 0, shape.width(), shape.height());
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            onDblClick={() => getState().setEditingText(o.id)}
            onDblTap={() => getState().setEditingText(o.id)}
            {...props}
          />
        );
      }
      case 'table': {
        const layout = layoutTable(o);
        const openCell = (e: Konva.KonvaEventObject<Event>) => {
          const p = e.target.getRelativePointerPosition();
          const cell = p && cellAt(layout, p.x, p.y);
          if (cell) getState().setEditingCell({ id: o.id, ...cell });
        };
        return (
          <Shape
            key={`${o.id}:${fontVersion}`}
            x={o.x} y={o.y} width={o.width} height={layout.height} rotation={o.rotation}
            sceneFunc={(ctx) => drawTable(ctx, o, editingCell?.id === o.id ? editingCell : null)}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.rect(0, 0, shape.width(), shape.height());
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            onDblClick={openCell}
            onDblTap={openCell}
            {...props}
          />
        );
      }
      case 'link':
        // A deleted link of the original document has nothing to show.
        if (o.removed) return null;
        return (
          <Rect
            key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} fill="rgba(47,125,246,0.12)"
            stroke="#2f7df6" strokeWidth={1 / zoom} dash={[4 / zoom, 3 / zoom]} strokeScaleEnabled={false}
            {...props}
          />
        );
      case 'note':
        return (
          <Group key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} {...props}>
            <Rect width={o.width} height={o.height} fill={o.color} stroke="#4b5563" strokeWidth={0.7} cornerRadius={1.5} />
            <Line points={[4, 5.5, 14, 5.5]} stroke="#4b5563" strokeWidth={0.7} listening={false} />
            <Line points={[4, 9, 14, 9]} stroke="#4b5563" strokeWidth={0.7} listening={false} />
            <Line points={[4, 12.5, 10, 12.5]} stroke="#4b5563" strokeWidth={0.7} listening={false} />
          </Group>
        );
      case 'field':
        return (
          <Shape
            key={o.id} x={o.x} y={o.y} width={o.width} height={o.height}
            sceneFunc={(ctx) => drawField(ctx, o)}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.rect(0, 0, shape.width(), shape.height());
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            {...props}
          />
        );
      case 'image':
        return <ImageNode key={o.id} o={o} nodeProps={props} />;
      case 'whiteout':
      case 'redact':
        return (
          <Rect
            key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} fill={o.fill}
            stroke={tool === 'whiteout' || tool === 'redact' || isDraft ? '#94a3b8' : undefined}
            strokeWidth={0.6 / zoom} dash={[3 / zoom, 3 / zoom]} strokeScaleEnabled={false}
            {...props}
          />
        );
      case 'highlight':
        return (
          <Group key={o.id} {...props}>
            {markShapes(o).map((r, i) => (
              <Rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={o.color} opacity={o.opacity} />
            ))}
            {/* Thin lines are hard to hit: the whole text band selects an underline or strikethrough. */}
            {o.mode !== 'highlight' && o.rects.map((r, i) => <Rect key={`h${i}`} x={r.x} y={r.y} width={r.width} height={r.height} fill="rgba(0,0,0,0)" />)}
          </Group>
        );
      case 'rect':
        return (
          <Rect
            key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation} opacity={o.opacity}
            fill={o.fill ?? undefined} stroke={o.stroke ?? undefined} strokeWidth={o.stroke ? o.strokeWidth : 0}
            {...props}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            key={o.id} x={o.x} y={o.y} radiusX={o.width / 2} radiusY={o.height / 2} offsetX={-o.width / 2} offsetY={-o.height / 2}
            rotation={o.rotation} opacity={o.opacity}
            fill={o.fill ?? undefined} stroke={o.stroke ?? undefined} strokeWidth={o.stroke ? o.strokeWidth : 0}
            {...props}
          />
        );
      case 'line':
        return <Line key={o.id} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} lineCap="round" hitStrokeWidth={14} {...props} />;
      case 'arrow': {
        const head = arrowHeadSize(o.strokeWidth);
        return (
          <Arrow
            key={o.id} points={o.points} stroke={o.stroke} fill={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity}
            pointerLength={head} pointerWidth={head} hitStrokeWidth={14} {...props}
          />
        );
      }
      case 'path':
        return (
          <Line
            key={o.id} points={o.points.length === 2 ? [...o.points, o.points[0] + 0.01, o.points[1]] : o.points}
            stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} lineCap="round" lineJoin="round" hitStrokeWidth={14} {...props}
          />
        );
    }
  };

  const tr = multi
    ? // Several objects are moved together; resizing and rotating work on one object at a time.
      { anchors: [] as string[], keepRatio: false, rotate: false }
    : selected
    ? selected.type === 'image'
      ? { anchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], keepRatio: selected.keepRatio, rotate: true }
      : selected.type === 'highlight' || selected.type === 'note'
        ? { anchors: [] as string[], keepRatio: false, rotate: false }
        : selected.type === 'link' || selected.type === 'field'
        ? { anchors: undefined, keepRatio: false, rotate: false }
        : selected.type === 'text'
        ? { anchors: ['middle-left', 'middle-right'], keepRatio: false, rotate: true }
        : { anchors: undefined, keepRatio: false, rotate: selected.type !== 'whiteout' && selected.type !== 'redact' }
    : null;

  // Edited original text sits directly on the page, under everything the user added.
  const edits = objects.filter(isPageEdit);
  const rest = objects.filter((o) => !isPageEdit(o));
  const cutKeys = new Set(objects.map((o) => (o.type === 'imagecut' ? o.key : '')));
  const pickable = canSelect ? pdfImages.filter((img) => !cutKeys.has(img.key)) : [];
  // A picture that fills the page (a scan) needs a double-click, so a stray click does not pick up the whole page.
  const isBackdrop = (img: PageImage) => img.width * img.height > page.width * page.height * 0.8;

  return (
    <Stage
      width={page.width * zoom}
      height={page.height * zoom}
      scaleX={zoom}
      scaleY={zoom}
      className="absolute inset-0"
      style={{ cursor: CURSORS[tool] ?? 'crosshair', touchAction: tool === 'select' ? 'auto' : 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onClick={onClick}
      onTap={onClick}
    >
      <Layer>
        {edits.map((o) => renderObject(o))}
        {pickable.map((img) => {
          const backdrop = isBackdrop(img);
          const hot = hoverImage === img.key;
          const pick = () => liftPageImage(page, img);
          return (
            <Rect
              key={`pdfimage${img.key}`} name="pdfimage" x={img.x} y={img.y} width={img.width} height={img.height} rotation={img.rotation}
              fill={hot ? 'rgba(47,125,246,0.12)' : 'rgba(0,0,0,0)'} stroke={hot ? '#2f7df6' : undefined} strokeWidth={1.5 / zoom} dash={[5 / zoom, 4 / zoom]}
              draggable={!backdrop}
              onMouseEnter={(e) => {
                setHoverImage(img.key);
                const el = e.target.getStage()!.container();
                el.style.cursor = backdrop ? 'default' : 'move';
                el.title = backdrop ? 'Double-click to edit this full-page picture' : 'Click to select this picture, or drag it to move it';
              }}
              onMouseLeave={(e) => {
                setHoverImage(null);
                const el = e.target.getStage()!.container();
                el.style.cursor = CURSORS[tool] ?? 'crosshair';
                el.title = '';
              }}
              onDragStart={() => setHoverImage(img.key)}
              onDragEnd={(e) => {
                // The picture is picked up where it was and put down where the outline was dropped.
                const node = e.target;
                const dx = node.x() - img.x;
                const dy = node.y() - img.y;
                node.position({ x: img.x, y: img.y });
                setHoverImage(null);
                liftPageImage(page, img, dx, dy);
              }}
              onClick={backdrop ? undefined : pick}
              onTap={backdrop ? undefined : pick}
              onDblClick={pick}
              onDblTap={pick}
            />
          );
        })}
        {rest.map((o) => renderObject(o))}
        {tool === 'link' &&
          pdfLinks
            .filter((l) => !objects.some((o) => o.type === 'link' && o.sourceRef === l.ref))
            .map((l) => (
              <Rect
                key={`pdflink${l.ref}`} x={l.x} y={l.y} width={l.width} height={l.height}
                fill="rgba(16,185,129,0.12)" stroke="#10b981" strokeWidth={1 / zoom} dash={[4 / zoom, 3 / zoom]}
                onMouseDown={(e) => {
                  // Picks up a link the document already has, so its address can be changed or the link removed.
                  e.cancelBubble = true;
                  getState().setTool('select');
                  getState().addObject({ id: newId(), pageIndex: page.index, type: 'link', x: l.x, y: l.y, width: l.width, height: l.height, url: l.url, sourceRef: l.ref });
                }}
              />
            ))}
        {draft && renderObject(draft, true)}
        {guides.v.map((x) => (
          <Line key={`gv${x}`} points={[x, 0, x, page.height]} stroke="#f43f5e" strokeWidth={1 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />
        ))}
        {guides.h.map((y) => (
          <Line key={`gh${y}`} points={[0, y, page.width, y]} stroke="#f43f5e" strokeWidth={1 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />
        ))}
        <Transformer
          ref={trRef}
          rotateEnabled={tr?.rotate ?? true}
          keepRatio={tr?.keepRatio ?? false}
          enabledAnchors={tr?.anchors}
          flipEnabled={false}
          ignoreStroke
          anchorSize={10}
          anchorCornerRadius={5}
          anchorStroke="#2f7df6"
          borderStroke="#2f7df6"
          rotateAnchorOffset={26}
          rotationSnaps={[0, 90, 180, 270]}
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 6 || Math.abs(newBox.height) < 6 ? oldBox : newBox)}
        />
      </Layer>
    </Stage>
  );
}
