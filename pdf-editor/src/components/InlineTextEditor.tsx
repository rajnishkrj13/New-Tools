import { useEffect, useRef, useState } from 'react';
import type { TextObject } from '../types/objects';
import { layoutTextObject } from '../engines/TextEditLayout';
import { getState, useEditorStore } from '../store/documentStore';
import { cssFamily } from '../engines/FontManager';
import { LINE_HEIGHT_EM } from '../utils/fontUtils';

/**
 * Textarea shown over a text box while its content is typed. The whole typing session
 * becomes a single undo step when the field loses focus.
 */
export function InlineTextEditor({ obj, isNew }: { obj: TextObject; isNew: boolean }) {
  const zoom = useEditorStore((s) => s.zoom);
  const [value, setValue] = useState(obj.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.select();
  }, []);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const s = getState();
    const text = value.replace(/\s+$/, '');
    if (isNew) {
      s.setDraftText(null);
      if (text.trim()) s.addObject({ ...obj, text });
    } else {
      s.setEditingText(null);
      if (!text.trim()) s.removeObject(obj.id);
      else if (text !== obj.text) s.updateObject(obj.id, { text });
    }
  };

  const height = layoutTextObject({ ...obj, text: value || ' ' }).height;
  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck={false}
      placeholder="Type text"
      aria-label="Text box content"
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish();
        }
      }}
      className="absolute z-20 m-0 resize-none overflow-hidden border-0 bg-white/80 p-0 outline outline-2 outline-brand-500"
      style={{
        left: obj.x * zoom,
        top: obj.y * zoom,
        width: obj.width * zoom,
        height: height * zoom + 2,
        transform: `rotate(${obj.rotation}deg)`,
        transformOrigin: '0 0',
        fontFamily: cssFamily(obj.fontFamily),
        fontSize: obj.fontSize * zoom,
        fontWeight: obj.bold ? 700 : 400,
        fontStyle: obj.italic ? 'italic' : 'normal',
        textDecoration: obj.underline ? 'underline' : 'none',
        lineHeight: LINE_HEIGHT_EM,
        color: obj.color,
        textAlign: obj.align,
      }}
    />
  );
}
