'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ToolProps } from './kit';

/**
 * Each tool's code is its own chunk, so a page downloads only the tool it shows. Tools are
 * server-rendered too (heavy libraries are imported inside event handlers), which gives search
 * engines and slow connections the real form instead of a spinner.
 */
const loading = () => <div className="h-[260px] border border-ink bg-card" aria-hidden="true" />;

const TOOLS: Record<string, ComponentType<ToolProps>> = {
  'pdf-editor': dynamic(() => import('./pdf-editor'), { loading }),
  'merge-pdf': dynamic(() => import('./merge-pdf'), { loading }),
  'split-pdf': dynamic(() => import('./split-pdf'), { loading }),
  'compress-pdf': dynamic(() => import('./compress-pdf'), { loading }),
  'rotate-pdf': dynamic(() => import('./rotate-pdf'), { loading }),
  'jpg-to-pdf': dynamic(() => import('./jpg-to-pdf'), { loading }),
  'pdf-to-jpg': dynamic(() => import('./pdf-to-jpg'), { loading }),
  'protect-pdf': dynamic(() => import('./protect-pdf'), { loading }),
  'compress-image': dynamic(() => import('./compress-image'), { loading }),
  'resize-image': dynamic(() => import('./resize-image'), { loading }),
  'crop-image': dynamic(() => import('./crop-image'), { loading }),
  'convert-image': dynamic(() => import('./convert-image'), { loading }),
  'gst-calculator': dynamic(() => import('./gst-calculator'), { loading }),
  'gstin-validator': dynamic(() => import('./gstin-validator'), { loading }),
  'gst-invoice-generator': dynamic(() => import('./gst-invoice-generator'), { loading }),
  'gstr1-to-excel': dynamic(() => import('./gstr1-to-excel'), { loading }),
  'gstr3b-to-excel': dynamic(() => import('./gstr3b-to-excel'), { loading }),
  'gstr1-vs-gstr3b': dynamic(() => import('./gstr1-vs-gstr3b'), { loading }),
  'gstr2b-merger': dynamic(() => import('./gstr2b-merger'), { loading }),
  'unit-converter': dynamic(() => import('./unit-converter'), { loading }),
  'number-to-words': dynamic(() => import('./number-to-words'), { loading }),
  'age-calculator': dynamic(() => import('./age-calculator'), { loading }),
  'case-converter': dynamic(() => import('./case-converter'), { loading }),
  'word-counter': dynamic(() => import('./word-counter'), { loading }),
};

export function ToolHost({ slug, ...props }: ToolProps & { slug: string }) {
  const Tool = TOOLS[slug];
  return Tool ? <Tool {...props} /> : null;
}
