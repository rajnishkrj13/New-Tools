import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { installBundledFonts } from './engines/bundledFonts';
import { invalidateLayouts } from './engines/TextEditLayout';
import { exportPdf } from './engines/PdfExporter';
import { rasterizePage } from './engines/PdfRenderer';
import { getCachedTextModel } from './engines/PdfTextExtractor';
import { openPdfBytes } from './hooks/usePdfDocument';
import { useEditorStore } from './store/documentStore';
import * as textEdit from './store/textEditActions';
import * as pageTools from './store/pageActions';
import * as autoSave from './hooks/useAutoSave';
import { initAutoSave } from './hooks/useAutoSave';

installBundledFonts(() => {
  invalidateLayouts();
  useEditorStore.getState().bumpFonts();
});

initAutoSave();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Development-only handle for automated tests and debugging. Not part of production builds.
if (import.meta.env.DEV) {
  (window as any).__pdfEditor = { store: useEditorStore, openPdfBytes, exportPdf, rasterizePage, getCachedTextModel, textEdit, pageTools, autoSave };
}
