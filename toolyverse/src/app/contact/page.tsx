import type { Metadata } from 'next';
import { InfoPage } from '@/components/InfoPage';
import { JsonLd } from '@/components/JsonLd';
import { SITE } from '@/lib/config';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Contact Toolyverse – Tool Requests and Help',
  description: 'Get in touch with Toolyverse: ask for a new tool, report a problem with a PDF, image or GST tool, or ask a privacy question.',
  path: '/contact',
});

export default function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <InfoPage label="Contact" title="Get in touch">
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'ContactPage', name: 'Contact Toolyverse', url: `${SITE.url}/contact`, about: { '@id': `${SITE.url}/#org` } }} />
      <p>Found a problem, or need a tool we do not have yet? We read every message.</p>
      {email ? (
        <p>
          Email: <a href={`mailto:${email}`}>{email}</a>
        </p>
      ) : (
        <p>The contact address will appear here soon.</p>
      )}
      <p>When reporting a problem, say which tool and which browser you used. Please do not send the file itself unless we ask: your files are your business.</p>
    </InfoPage>
  );
}
