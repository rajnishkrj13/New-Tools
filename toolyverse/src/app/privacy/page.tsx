import type { Metadata } from 'next';
import { InfoPage } from '@/components/InfoPage';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Privacy Policy – Your Files Stay on Your Device',
  description: 'How Toolyverse handles your files and data: files are processed in your browser and never uploaded; accounts store only what you save.',
  path: '/privacy',
});

export default function Privacy() {
  return (
    <InfoPage label="Privacy" title="Privacy policy">
      <h2>Your files</h2>
      <p>
        PDFs, images and documents you open in Toolyverse tools are processed by your own browser. They are not uploaded to our servers, and we cannot see them. When
        you close the page they are gone, unless you turned on a feature that keeps a copy in your own browser (for example auto-save in the PDF editor).
      </p>
      <h2>If you create an account</h2>
      <p>
        We store your name, email address and a securely hashed password, the dates you joined and last signed in, and the items you choose to save to your account
        (such as signatures, form details or invoice settings). You can delete saved items at any time from your account page, and ask us to delete the account.
      </p>
      <h2>Cookies</h2>
      <p>
        One cookie keeps you signed in. It is only set when you log in and contains a random token, not your details. We do not use advertising or tracking cookies.
      </p>
      <h2>Server logs</h2>
      <p>Like every website, our server records basic request information (such as the address of a page and the time) to keep the service working and secure.</p>
      <h2>Contact</h2>
      <p>For any privacy question or a deletion request, use the contact page.</p>
    </InfoPage>
  );
}
