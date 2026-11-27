import { NextResponse, type NextRequest } from 'next/server';

/**
 * Pages written in Hindi: the root layout reads this header and sets <html lang="hi-IN">, so
 * browsers, screen readers and search engines get the page's real language. Runs only on these
 * pages (the matcher has to be a plain list; a test keeps it equal to the pages marked lang: 'hi').
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-page-lang', 'hi-IN');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/hindi-pdf-editor', '/hindi-image-to-text'],
};
