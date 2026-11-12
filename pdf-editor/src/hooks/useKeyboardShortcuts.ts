import { useEffect } from 'react';
import { getState } from '../store/documentStore';
import { hasUnsavedWork } from './useAutoSave';

const isTyping = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  return !!node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable);
};

/** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Delete, Escape, Ctrl+D, arrow-key nudging, Ctrl +/- zoom. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      if (!s.doc) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const typing = isTyping(e.target);

      if (mod && key === 'z') {
        // While typing, let the field undo its own keystrokes first.
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y') {
        if (typing) return;
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.key === 'Escape') {
        if (typing) return; // editors handle Escape themselves
        if (s.signatureOpen) s.setSignatureOpen(false);
        else if (s.textSel) s.setTextSel(null);
        else if (s.selectedId) s.select(null);
        else if (s.tool !== 'select') s.setTool('select');
        return;
      }
      if (typing) return;
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        s.zoomBy(1.2);
        return;
      }
      if (mod && key === '-') {
        e.preventDefault();
        s.zoomBy(1 / 1.2);
        return;
      }
      const selected = s.objects.find((o) => o.id === s.selectedId);
      if (!selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.removeObject(selected.id);
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateObject(selected.id);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        if ('points' in selected) {
          s.updateObject(selected.id, { points: selected.points.map((v, i) => v + (i % 2 ? dy : dx)) } as any, 'nudge');
        } else if ('x' in selected) {
          s.updateObject(selected.id, { x: selected.x + dx, y: selected.y + dy }, 'nudge');
        }
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      // With auto-save up to date there is nothing to lose, so the browser does not need to ask.
      if (hasUnsavedWork()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);
}
