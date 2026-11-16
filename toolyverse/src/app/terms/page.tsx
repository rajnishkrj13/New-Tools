import type { Metadata } from 'next';
import { InfoPage } from '@/components/InfoPage';

export const metadata: Metadata = { title: 'Terms of use', description: 'The terms for using Toolyverse tools.', alternates: { canonical: '/terms' } };

export default function Terms() {
  return (
    <InfoPage label="Terms" title="Terms of use">
      <p>By using Toolyverse you agree to these terms.</p>
      <h2>Using the tools</h2>
      <p>
        The tools are provided free of charge and as they are. Use them only with files you have the right to work on. Check important results, such as tax amounts,
        invoices and legal documents, before you rely on them; Toolyverse is not tax or legal advice.
      </p>
      <h2>Accounts</h2>
      <p>
        Keep your password private. We may suspend accounts that are used to abuse the service. You can stop using the service and ask us to delete your account at any
        time.
      </p>
      <h2>Liability</h2>
      <p>
        To the extent the law allows, Toolyverse is not liable for any loss arising from use of the tools. Keep a copy of your original files: the tools create new
        files and do not change the originals on your device.
      </p>
      <h2>Changes</h2>
      <p>We may change these terms or the tools. Significant changes will be shown on the site.</p>
    </InfoPage>
  );
}
