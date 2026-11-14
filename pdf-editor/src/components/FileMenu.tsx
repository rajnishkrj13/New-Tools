import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileImage, FileOutput, FileText, Images, Lock, LockOpen, Menu, Minimize2, ScanText } from 'lucide-react';
import { useEditorStore } from '../store/documentStore';
import { createFromImages, downloadSmaller, exportImages, exportText, extractPages, recognizeText, setPassword } from '../hooks/useFileTools';

/** Drop-down with the tools that work on the whole file. */
export function FileMenu() {
  const [open, setOpen] = useState(false);
  const locked = useEditorStore((s) => !!s.exportPassword);
  const ref = useRef<HTMLDivElement>(null);
  const images = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const item = (icon: React.ReactNode, label: string, hint: string, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        action();
      }}
      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-100"
    >
      <span className="mt-0.5 shrink-0 text-slate-500">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-[11px] leading-snug text-slate-500">{hint}</span>
      </span>
    </button>
  );
  const group = (title: string) => <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Menu size={16} /> File <ChevronDown size={14} />
        {locked && <Lock size={13} className="text-amber-600" aria-label="Downloads are password-protected" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 max-h-[78vh] w-[310px] overflow-y-auto rounded-xl bg-white p-1.5 shadow-float">
          {group('Pages')}
          {item(<FileOutput size={16} />, 'Extract pages…', 'Save chosen pages as a new PDF', extractPages)}
          {group('Save in another form')}
          {item(<FileImage size={16} />, 'Pages as PNG pictures', 'Sharp, larger files; several pages come as a ZIP', () => exportImages('png'))}
          {item(<FileImage size={16} />, 'Pages as JPG pictures', 'Smaller files, good for photos and scans', () => exportImages('jpeg'))}
          {item(<FileText size={16} />, 'Text only (.txt)', 'All the text of the document, without layout', exportText)}
          {group('Smaller file')}
          {item(<Minimize2 size={16} />, 'Download smaller file', 'Photos at screen quality; text and drawings unchanged', () => downloadSmaller('balanced'))}
          {item(<Minimize2 size={16} />, 'Download smallest file', 'Photos clearly reduced, for e-mail', () => downloadSmaller('small'))}
          {group('Scans')}
          {item(<ScanText size={16} />, 'Recognise text on this page (OCR)', 'Makes a scanned page searchable and editable', () => recognizeText('page'))}
          {item(<ScanText size={16} />, 'Recognise text on all scanned pages', 'Every page that has no text of its own', () => recognizeText('all'))}
          {group('Protection')}
          {locked
            ? item(<LockOpen size={16} />, 'Remove the password', 'Downloads will open without a password again', setPassword)
            : item(<Lock size={16} />, 'Protect with a password…', 'Downloads will only open with a password', setPassword)}
          {group('New')}
          {item(<Images size={16} />, 'New PDF from pictures…', 'One page per PNG, JPG or WebP picture, in a new tab', () => images.current?.click())}
        </div>
      )}
      <input
        ref={images}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          createFromImages(files);
        }}
      />
    </div>
  );
}
