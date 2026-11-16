import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { ALL_CLEANING, EMPTY_PROPS, NO_CLEANING, inspectHiddenData, type CleanOptions, type DocProps, type Found } from '../engines/PdfPrivacy';
import { readProperties } from '../engines/PdfRenderer';
import { FULL_PERMISSIONS, protectionProblem, restricts, type Permissions, type Protection } from '../engines/PdfTools';
import { getState, useEditorStore } from '../store/documentStore';

const field = 'mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800';
const label = 'block text-xs font-medium text-slate-600';
const primary = 'h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40';
const secondary = 'h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-float ${wide ? 'max-w-[560px]' : 'max-w-[440px]'}`} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- document properties ---------------------------------------------------------------------------

function PropertiesDialog() {
  const saved = useEditorStore((s) => s.docProps);
  const [values, setValues] = useState<DocProps>(EMPTY_PROPS);
  const [dates, setDates] = useState<{ created: string; modified: string }>({ created: '', modified: '' });
  const [loading, setLoading] = useState(true);
  const close = () => getState().setPrivacyDialog(null);

  useEffect(() => {
    let dead = false;
    readProperties().then((r) => {
      if (dead) return;
      setValues(saved ?? r.props);
      setDates({ created: r.created, modified: r.modified });
      setLoading(false);
    });
    return () => {
      dead = true;
    };
  }, []);

  const rows: [keyof DocProps, string, string][] = [
    ['title', 'Title', ''],
    ['author', 'Author', ''],
    ['subject', 'Subject', ''],
    ['keywords', 'Keywords', 'Separated by commas'],
    ['creator', 'Created with', 'The program that made the original'],
    ['producer', 'PDF produced by', 'The program that wrote the PDF'],
  ];
  return (
    <Modal title="Document properties" onClose={close}>
      <p className="mb-3 text-xs leading-snug text-slate-500">
        These are saved in the file when you download it. They often show who made a document and with what, so check them before sharing.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Reading the file…
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(([key, name, hint]) => (
            <label key={key} className={label}>
              {name}
              {hint && <span className="ml-1.5 font-normal text-slate-400">{hint}</span>}
              <input value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className={field} />
            </label>
          ))}
          {(dates.created || dates.modified) && (
            <p className="text-[11px] text-slate-500">
              {dates.created && `Created ${dates.created}. `}
              {dates.modified && `Last modified ${dates.modified}.`} Dates are not changed here; use "Remove hidden data" to clear them.
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setValues(EMPTY_PROPS)} className={`${secondary} mr-auto`}>
          Clear all fields
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => {
              getState().setDocProps(null);
              close();
            }}
            className={secondary}
          >
            Keep the file's own
          </button>
        )}
        <button type="button" disabled={loading} onClick={() => (getState().setDocProps(values), close(), getState().toast('The properties will be saved with your next download.', 'success'))} className={primary}>
          Save
        </button>
      </div>
    </Modal>
  );
}

// ---- remove hidden data ----------------------------------------------------------------------------

const CLEAN_ROWS: { key: keyof CleanOptions; title: string; text: string }[] = [
  { key: 'properties', title: 'Document properties and metadata', text: 'Title, author, program names, dates and any custom entries, including the hidden copy some programs keep.' },
  { key: 'comments', title: 'Comments and markup', text: 'Notes, highlights and reviewer comments that the document already has. Links and form fields stay.' },
  { key: 'attachments', title: 'Attached files', text: 'Files embedded in the PDF, which can be easy to overlook.' },
  { key: 'scripts', title: 'Scripts and automatic actions', text: 'JavaScript and actions that run when the file opens or a field changes.' },
  { key: 'bookmarks', title: 'Bookmarks', text: 'The outline in the side panel, which often repeats headings or names.' },
  { key: 'privateData', title: 'Thumbnails and other programs’ data', text: 'Small preview pictures and data that editing programs leave behind.' },
];

function CleanDialog() {
  const saved = useEditorStore((s) => s.clean);
  const [choice, setChoice] = useState<CleanOptions>(saved);
  const [found, setFound] = useState<Found[] | null>(null);
  const close = () => getState().setPrivacyDialog(null);

  useEffect(() => {
    let dead = false;
    const bytes = getState().bytes;
    (bytes ? inspectHiddenData(bytes) : Promise.resolve([])).then((f) => !dead && setFound(f)).catch(() => !dead && setFound([]));
    return () => {
      dead = true;
    };
  }, []);

  const foundLabel = (key: keyof CleanOptions) => found?.find((f) => f.key === key)?.label;
  return (
    <Modal title="Remove hidden data" onClose={close} wide>
      <p className="mb-3 text-xs leading-snug text-slate-500">
        A PDF can carry more than the pages you see. Tick what should be removed from the original document when you download it. Things you add yourself in the editor are kept.
      </p>
      <div className="space-y-1.5">
        {CLEAN_ROWS.map((row) => {
          const hit = foundLabel(row.key);
          return (
            <label key={row.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5" checked={choice[row.key]} onChange={(e) => setChoice({ ...choice, [row.key]: e.target.checked })} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {row.title}
                  {found && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${hit ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{hit ? 'Found' : 'None found'}</span>
                  )}
                </span>
                <span className="block text-[11px] leading-snug text-slate-500">{row.text}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!found && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Loader2 size={12} className="animate-spin" /> Looking for what this file carries…
        </p>
      )}
      <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-snug text-slate-600">
        <p className="flex gap-1.5">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>
            Pages with a redaction are always rebuilt, and anything that was removed or replaced is deleted from the file itself, not just hidden.
            This does not change what is written on the pages: use Redact for that. Typed-in form field values and the file name are not touched.
          </span>
        </p>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setChoice(ALL_CLEANING)} className={`${secondary} mr-auto`}>
          Select all
        </button>
        <button type="button" onClick={() => setChoice(NO_CLEANING)} className={secondary}>
          None
        </button>
        <button type="button" onClick={() => (getState().setClean(choice), close(), getState().toast(Object.values(choice).some(Boolean) ? 'The chosen data will be removed when you download.' : 'Nothing will be removed.', 'success'))} className={primary}>
          Apply
        </button>
      </div>
    </Modal>
  );
}

// ---- protect -----------------------------------------------------------------------------------------

function ProtectDialog() {
  const existing = useEditorStore((s) => s.protection);
  const [user, setUser] = useState(existing?.userPassword ?? '');
  const [owner, setOwner] = useState(existing?.ownerPassword ?? '');
  const [perm, setPerm] = useState<Permissions>(existing?.permissions ?? FULL_PERMISSIONS);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => getState().setPrivacyDialog(null);
  const limited = restricts(perm);
  const toggle = (k: keyof Permissions) => (e: React.ChangeEvent<HTMLInputElement>) => setPerm({ ...perm, [k]: e.target.checked });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Protection = { userPassword: user, ownerPassword: owner, permissions: perm };
    const problem = protectionProblem(p);
    if (problem) return setError(problem);
    getState().setProtection(p);
    close();
    getState().toast(
      user ? 'Password set. It applies to every download of this document until you remove it.' : 'Restrictions set. They apply to every download of this document until you remove them.',
      'success',
    );
  };
  const box = (k: keyof Permissions, text: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" className="mt-1" checked={perm[k] as boolean} onChange={toggle(k)} />
      <span>
        {text}
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </label>
  );

  return (
    <Modal title="Protect this document" onClose={close} wide>
      <form onSubmit={submit}>
        <p className="mb-3 text-xs leading-snug text-slate-500">
          Downloads of this document will be encrypted (AES-256). The passwords are used on this device only and are not saved: if you forget them, the file cannot be opened or unlocked.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Password to open the file
            <span className="block font-normal text-slate-400">Leave empty to let anyone open it</span>
            <input type={shown ? 'text' : 'password'} autoComplete="new-password" value={user} onChange={(e) => (setUser(e.target.value), setError(null))} className={field} />
          </label>
          <label className={label}>
            Password to change these settings
            <span className="block font-normal text-slate-400">{limited ? 'Required, and different from the one to open' : 'Needed only when you restrict something'}</span>
            <input type={shown ? 'text' : 'password'} autoComplete="new-password" value={owner} onChange={(e) => (setOwner(e.target.value), setError(null))} className={field} />
          </label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} /> Show the passwords while typing
        </label>

        <fieldset className="mt-4 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">What people may do with the file</legend>
          <label className="mb-2 flex items-center justify-between gap-3 text-sm text-slate-700">
            Printing
            <select value={perm.printing} onChange={(e) => setPerm({ ...perm, printing: e.target.value as Permissions['printing'] })} className="h-8 rounded-md border border-slate-200 px-1 text-sm">
              <option value="high">Allowed</option>
              <option value="low">Low quality only</option>
              <option value="none">Not allowed</option>
            </select>
          </label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {box('copying', 'Copy text and pictures')}
            {box('modifying', 'Edit the content')}
            {box('annotating', 'Add comments')}
            {box('fillingForms', 'Fill in forms')}
            {box('assembling', 'Insert, rotate or delete pages')}
            {box('accessibility', 'Read aloud by screen readers', 'Better left on')}
          </div>
        </fieldset>
        <p className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
          Restrictions are honoured by Acrobat, browsers and most PDF programs, but some tools ignore them. Only the password to open the file keeps the contents secret.
        </p>
        {error && (
          <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {existing && (
            <button
              type="button"
              onClick={() => {
                getState().setProtection(null);
                close();
                getState().toast('Downloads of this document are no longer protected.', 'info');
              }}
              className={`${secondary} mr-auto`}
            >
              Remove protection
            </button>
          )}
          <button type="button" onClick={close} className={secondary}>
            Cancel
          </button>
          <button type="submit" className={primary}>
            {existing ? 'Update' : 'Set protection'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The three privacy dialogs: document properties, remove hidden data, protect. */
export function PrivacyDialogs() {
  const which = useEditorStore((s) => s.privacyDialog);
  if (which === 'properties') return <PropertiesDialog />;
  if (which === 'clean') return <CleanDialog />;
  if (which === 'protect') return <ProtectDialog />;
  return null;
}
