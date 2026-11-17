import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage } from '@/components/InfoPage';
import { JsonLd } from '@/components/JsonLd';
import { SITE } from '@/lib/config';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'About – Free Tools That Run in Your Browser',
  description: 'Toolyverse is a set of free tools for PDFs, images, GST and conversions that run in your browser, so your files stay on your device.',
  path: '/about',
});

export default function About() {
  return (
    <InfoPage label="About" title="Why Toolyverse exists">
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About Toolyverse', url: `${SITE.url}/about`, about: { '@id': `${SITE.url}/#org` } }} />
      <p>
        Most everyday file jobs are small: shrink a photo for a form, join two PDFs, fix a word in a document, work out the GST on a quote. Most websites that do them
        want you to upload your files first, wait, and trust them to delete what they received.
      </p>
      <p>
        Toolyverse does the work inside your browser instead. When you open a PDF or a photo here, it is read by your own computer or phone. It is not sent to us, so
        there is nothing for us to keep, lose or look at. That is also why the tools are quick: there is no upload and no download from a server.
      </p>
      <h2>What it costs</h2>
      <p>
        The tools are free and add no watermarks. A free account gives you larger file limits and keeps a few things, such as saved signatures and your invoice details,
        on your account so they follow you between devices.
      </p>
      <h2>Made for India, useful anywhere</h2>
      <p>
        GST is split the way invoices need it, amounts are written in lakh and crore, photo sizes match what exam and job forms ask for, and the PDF editor handles
        Hindi text. Everything else works the same wherever you are.
      </p>
      <p>
        Missing a tool you need? <Link href="/contact">Tell us</Link>.
      </p>
    </InfoPage>
  );
}
