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
npm run make-samples   # writes test-assets/sample.pdf (5 pages) and sample-images.pdf (pictures)
npm test               # 55 tests: engines, features and file tools (ranges, ZIP, pictures to PDF, passwords, compression, duplicates, OCR layer)
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

## Pictures

- **Pictures already in the PDF:** with the Select tool, click a picture or drag it. It
  becomes an ordinary image object and can then be moved, resized, rotated, replaced or
  deleted. Undo puts the original back. A picture that fills the page (a scan) needs a
  double-click.
- **Replace:** select an image and use **Replace image** in the properties panel. It keeps
  its place and width.
- **Move to another page:** drag an object out of its page and drop it on another one (the
  target page is outlined), or set **On page** in the properties panel.
- On export the picture's paint operator is removed from the page content
  (`src/engines/PdfImages.ts`), so the old picture is not drawn any more. If the page
  content does not match what was shown, the picture is covered instead and the export
  dialog says so.
- The removed picture's data may stay inside the file as unused data.
- A picture inside a form XObject can be edited too, but it is covered in the exported
  file instead of removed (the export dialog says so).
- Not editable this way: pictures of annotations, inline images, stencil masks, and
  mirrored or skewed pictures. A picture taken from the PDF is stored
  again as JPEG (or PNG when it has transparency or is small).
- On screen the old place of a picture is covered with the paper colour, which also hides
  anything the page drew on top of it; the exported file keeps that content.

## Tables

The **Table** button adds a 3 x 3 table to the current page and opens its first cell.

- Double-click a cell to type in it. Tab and Shift+Tab move between cells; Tab in the last
  cell adds a row. Text wraps inside its cell and the row grows with it.
- The properties panel sets rows, columns, column widths, header row, background, line
  colour and width, and the font. The table is moved, resized and rotated like an image.
- It is saved as real text and vector lines (`src/engines/TableLayout.ts`), so the text
  stays selectable and searchable.
- One font, size and alignment apply to the whole table; cells cannot be merged.
- Tables that are already in a PDF are not recognised as tables: change their text with
  Edit Text.

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

## Find, links, comments, forms and page elements

- **Find and replace** (Find button or Ctrl+F): searches the PDF's text as it currently reads and
  the text boxes you added. Replace all is one undo step. A match must lie within one line.
- **Links** (Link tool): drag an area, then give it a web address or a page of the document.
  Links the PDF already has are outlined in green with the Link tool; click one to change or remove it.
- **Comments** (Comment tool): a sticky note with a name, text and replies. Exported as a standard
  PDF note with its own icon.
- **Forms**: fields the PDF already has can be filled in directly on the page (Select tool).
  The Form tool adds new text fields and check boxes, which become real PDF form fields.
- **Stamp button**: header, footer and page numbers ({page}, {pages}, {date}, {file}), watermark,
  and stamps such as APPROVED. Each becomes a normal text box on its pages; "Delete it on all
  pages" removes the whole set.
- **Lists and mixed styles**: in a text box, the list buttons or "Formatting marks" turn on
  `- ` / `1. ` list items, `**bold**` and `*italic*`.
- **Selection**: Shift+click selects several objects on a page (move together, align, copy,
  delete). Ctrl+C / Ctrl+X / Ctrl+V, Ctrl+A, Ctrl+D. Objects snap to the page and to each other
  while dragged, with a guide line; hold Alt to move freely.

Limits: comments already in a PDF cannot be edited; form fields and links of pages added from
another PDF are not editable; several selected objects can be moved but not resized together;
the clipboard is internal to the editor.

## File tools (File menu) and several documents

- **Tabs**: every PDF you open gets its own tab; switch, close, or open more with "+".
  Auto-save keeps all of them. Switching re-reads the file, which takes a moment for large PDFs.
- **Extract pages**: save chosen pages (for example `1-3, 5`), with their edits, as a new PDF.
  **Duplicate page** is on each thumbnail. **Add PDF** asks which pages to bring in.
- **Export**: pages as PNG or JPG (several pages come as one ZIP), or all text as a `.txt` file.
  There is no Word export.
- **New PDF from pictures**: one page per PNG, JPG or WebP picture (File menu or start screen).
- **Smaller file**: re-encodes photos (JPEG pictures in RGB or grey) at a lower resolution and
  quality. Text, drawings and other picture types are left as they are, so a PDF without photos
  does not get smaller.
- **Passwords**: a protected PDF asks for its password and opens as an unprotected working copy
  (files that only restrict editing open without a question). "Protect with a password" locks
  every download of that document. The password is never stored; the auto-saved working copy in
  this browser is the unprotected one.
- **OCR** (Recognise text): reads the text of scanned pages in English and/or Hindi with
  Tesseract, which is served by the app itself (`public/ocr`, copied on install). The text can
  then be found, highlighted and edited, and the download carries it as a hidden searchable
  layer. Results are kept until the document is closed or the page is reloaded; run it again to
  edit recognised text after resuming. Editing a scan covers the old letters and draws new ones
  in a standard font, so it will not match the scan's print exactly.

Libraries added for these: `tesseract.js` (Apache-2.0), `@tesseract.js-data/eng` and `/hin`
(MIT), `@cantoo/pdf-lib` (MIT, used only to add and remove passwords).
