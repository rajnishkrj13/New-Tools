'use client';

import { useEffect, useMemo } from 'react';

/** Shows a Blob as an image, freeing the object URL when it changes. */
export function BlobImage({ blob, alt, className }: { blob: Blob | null; alt: string; className?: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className={className} /> : null;
}
