import type { Metadata } from 'next';
import { InfoPage } from '@/components/InfoPage';

export const metadata: Metadata = { title: 'Contact', description: 'Get in touch with Toolyverse: tool requests, problems and privacy questions.', alternates: { canonical: '/contact' } };

export default function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <InfoPage label="Contact" title="Get in touch">
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
