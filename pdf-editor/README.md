# PDF Editor

Browser-based PDF editor (React, Vite, TypeScript, Tailwind, PDF.js, pdf-lib, Konva).
All processing happens in the browser; no file is uploaded.

## Install and run

```bash
npm install
npm run dev        # http://localhost:5173
```

## Production build

```bash
npm run build      # output in dist/
npm run preview
```

The production build adds a Content-Security-Policy that blocks connections to other origins.

## Tests

```bash
npm run make-samples   # writes test-assets/sample.pdf (5 pages)
npm test               # 26 engine tests: coordinates, reflow, history, export, fonts, text removal, shaping, page tools, text marks
npm run typecheck
```

## How edited text is saved

- Original text that you change is deleted from the page content (`src/engines/TextRemover.ts`),
  so the old wording is no longer found by search or copy. Text around it keeps its exact position.
- If a page's text cannot be mapped safely (unusual encodings, text inside form XObjects,
  vertical writing), that text is covered instead and the export dialog says so.
- Whiteout always only covers. Secure redact turns the whole page into an image.

## Highlight, underline, strikethrough

The **Highlight** tool marks text: drag across it and the mark snaps to the characters and
lines the drag covers (`src/engines/TextHighlighter.ts`). The options row switches between
highlight, underline and strikethrough and sets the color.

- A mark stays on its text: it can be selected, recolored, restyled and deleted, not moved.
- On a page without readable text (a scan) the dragged area itself is marked.
- Highlights are saved with multiply blending, so the text under them stays dark.
- Marks follow the original text positions. A paragraph changed with Edit Text may have
  re-wrapped, so a mark on it can land where the text used to be.

## Auto-save

The open document and everything done to it are kept in this browser's IndexedDB
(`src/hooks/useAutoSave.ts`), about half a second after each change. After closing the tab
or a crash, the start screen offers **Continue where you left off** (or **Discard**).

- Kept: the PDF, added PDFs, inserted images and signatures, uploaded fonts, page order
  and rotation, and all edits. Not kept: the undo history.
- One document is kept: opening another PDF replaces the stored copy.
- It is stored on this device, in this browser profile only. The **Auto-save in this
  browser** switch in the sidebar turns it off and erases the stored copy; use that on a
  shared computer. Private/incognito windows discard it when they close.
- If the browser has no storage space left, a warning appears and the leave-page prompt
  comes back.

## Page tools

In the page list on the left: rotate, move up/down, delete (buttons on each thumbnail),
drag a thumbnail to reorder, **Blank page** and **Add PDF** (inserts another PDF's pages
after the current page). All of it is undoable, and edits stay on their page.

- The original file is not changed while editing; the exporter applies the page list
  (`applyPageStructure` in `src/engines/PdfExporter.ts`) in place, so bookmarks and form
  fields of the original document are kept.
- A deleted page's content is removed from the exported file. Images that were used only
  on a deleted page may remain inside the file as unused data.
- Rotating a page removes changes made to that page's original text (after asking);
  added objects rotate with the page.

## Fonts

- Standard fonts (Helvetica, Times, Courier) are used when they match the original.
- Noto Sans (SIL Open Font License, from `@expo-google-fonts/noto-sans`) is bundled. It is
  used automatically for characters the chosen font lacks (rupee sign, Cyrillic, Greek,
  Latin Extended) and can be picked as a font. Each style used adds about 0.3 MB to the file.
- Upload a TTF/OTF for an exact match with a document's own font.

## Known limits

- Original embedded fonts cannot be reused; the closest font is used with a warning.
- Hindi and other scripts that need letter joining are shaped with HarfBuzz
  (`src/engines/TextShaper.ts`, WebAssembly, loaded locally only when needed) and drawn
  with the bundled Noto Sans or an uploaded font. Noto Sans covers Devanagari; other
  Indic scripts, Arabic, Hebrew or Thai need an uploaded font for that script.
- Right-to-left text is shaped per line; lines mixing it with numbers or Latin words may
  be ordered incorrectly. The export dialog warns when this applies.
- Characters no available font covers (for example Chinese, Japanese, emoji) stop the
  export with an error rather than being dropped; upload a font that contains them.
- Text that is sideways on screen cannot be edited in place.
- Encrypted PDFs can be viewed but not saved.
