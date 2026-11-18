import type { Tool } from './registry';

/**
 * Pages for the specific things people search for ("sign PDF", "fill PDF form", "edit scanned
 * PDF"…). Each one opens the same PDF editor, straight on the right tool, with help written
 * for that job. They are tools in their own right: the admin can switch each on or off.
 */

const editor = { category: 'pdf', opens: 'pdf-editor', limits: { publicMb: 25, memberMb: 100 } } as const;

export const EDITOR_PAGES: Tool[] = [
  {
    ...editor,
    slug: 'sign-pdf',
    no: 25,
    focus: 'sign',
    name: 'Sign PDF',
    short: 'Add your signature, initials and date to a PDF',
    title: 'Sign PDF Online Free – Add Signature to PDF, No Upload',
    description: 'Sign a PDF online for free: draw or upload your signature, save it, and place it with a click. Add initials, date and ticks. No upload, no watermark.',
    h1: 'Sign a PDF online',
    intro:
      'Draw your signature with a mouse, finger or stylus, or upload a photo of it, and place it anywhere on the PDF. Save it once and it is ready the next time, together with your initials, today’s date and tick marks for forms. The PDF stays on your device the whole time.',
    steps: [
      'Open the PDF you need to sign.',
      'In the Sign menu, draw or upload your signature (tick “Save for next time”), then click on the page where it goes.',
      'Add initials or the date the same way, then press Download PDF.',
    ],
    sections: [
      {
        h2: 'Everything you need to sign a document',
        list: [
          'Saved signatures: keep several signatures and initials, ready in one click.',
          'Initials on every page: choose your initials once and click each page to place them.',
          'Date stamp: today’s date in the format you pick, for example 16/11/2026 or 16 November 2026.',
          'Ticks and crosses: mark boxes on forms that have no fillable fields.',
          'Your details: name, address, phone and email can be dropped onto the page or filled into form fields.',
        ],
      },
      {
        h2: 'Is an electronic signature like this valid?',
        body: [
          'A signature image placed on a PDF is widely accepted for everyday paperwork such as offer letters, rental agreements, consent forms and invoices. Some documents need a certified digital signature (DSC) or Aadhaar eSign instead, for example certain government filings; check what the receiver asks for. This tool places your signature on the page; it does not add a certificate-based digital signature.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I save my signature for next time?', a: 'Yes. Tick “Save for next time” and it stays in your browser. With a free account it is kept on your account and works on any device you log in on.' },
      { q: 'Can I sign on my phone?', a: 'Yes. Draw your signature with your finger on the signing pad, then tap the page where it should go.' },
      { q: 'Can I use a scanned image of my signature?', a: 'Yes. Upload a photo or scan of your signature on white paper; it is placed as an image you can resize.' },
      { q: 'Is the signed PDF uploaded anywhere?', a: 'No. Signing happens in your browser and the signed file is saved straight to your device.' },
    ],
    related: ['pdf-editor', 'fill-pdf-form', 'protect-pdf', 'merge-pdf'],
    keywords: ['sign pdf', 'sign pdf online free', 'add signature to pdf', 'esign pdf', 'electronic signature pdf free', 'signature on pdf'],
  },
  {
    ...editor,
    slug: 'fill-pdf-form',
    no: 26,
    focus: 'forms',
    name: 'Fill PDF Form',
    short: 'Type into PDF forms, or add fields where there are none',
    title: 'Fill PDF Form Online Free – Type on PDF Forms, No Upload',
    description: 'Fill in PDF forms online: type into the form’s fields, tick boxes, or add text anywhere on forms without fields. Sign and download. Free, private, no watermark.',
    h1: 'Fill in a PDF form online',
    intro:
      'Open an application form, KYC form or admission form and type straight into it. Fillable forms are filled field by field; printed forms that have no fields can be filled by typing anywhere on the page, with ticks, the date and your signature added in a click.',
    steps: [
      'Open the PDF form.',
      'Click into a field and type. On a form without fields, choose Add Text and click where the answer goes.',
      'Add your signature and the date from the Sign menu, then press Download PDF.',
    ],
    sections: [
      {
        h2: 'Fill forms faster with saved details',
        body: [
          'Save your name, address, phone number and email once (Sign menu → My details). On forms with fields, “Fill this form’s fields from my details” fills the matching fields in one go; on printed forms, click a detail and then click where it goes. With a [free account](/signup) your details follow you to every device.',
        ],
      },
      {
        h2: 'Making your own fillable form',
        body: [
          'Need others to fill in your PDF? Use the Form tool to draw text fields and check boxes on any PDF, then share the downloaded file: it can be filled in Adobe Reader, browsers and phones.',
        ],
      },
    ],
    faqs: [
      { q: 'My form has no boxes to click. Can I still fill it?', a: 'Yes. Choose Add Text and click wherever you want to type. Use Sign → Tick for check boxes printed on the page.' },
      { q: 'Will the filled form open in Adobe Reader?', a: 'Yes. Filled fields keep their values in any PDF reader. You can also flatten the result by printing it to PDF if a portal asks for a non-editable file.' },
      { q: 'Can I fill a form on my phone?', a: 'Yes, in any mobile browser. Zoom in on the field, tap it and type.' },
      { q: 'Are my answers sent anywhere?', a: 'No. The form is filled in your browser and saved to your device.' },
    ],
    related: ['sign-pdf', 'pdf-editor', 'add-text-to-pdf', 'compress-pdf'],
    keywords: ['fill pdf form', 'fill pdf online', 'fillable pdf', 'type on pdf form', 'fill out pdf free', 'pdf form filler'],
  },
  {
    ...editor,
    slug: 'add-text-to-pdf',
    no: 27,
    focus: 'addtext',
    name: 'Add Text to PDF',
    short: 'Type anywhere on a PDF in any font, size and colour',
    title: 'Add Text to PDF Online Free – Type on PDF, Any Font',
    description: 'Add text to a PDF online: type anywhere on the page, choose font, size, colour and alignment, add Hindi text. Free, no upload, no watermark.',
    h1: 'Add text to a PDF',
    intro:
      'Click anywhere on a page and type: a note on a contract, a name on a certificate, an answer on a printed form or a correction on an invoice. Choose the font, size, colour, bold, italic and alignment, and move the text box wherever it fits.',
    steps: ['Open the PDF.', 'Choose Add Text, click on the page and type. Drag the box to place it exactly.', 'Press Download PDF.'],
    sections: [
      {
        h2: 'More than a text box',
        list: [
          'Fonts: standard fonts plus fonts you upload, and Devanagari for Hindi.',
          'Change what is already there: to change existing words rather than add new ones, use Edit Text on the [PDF editor](/pdf-editor).',
          'Headers and footers: add the same text, page numbers or a watermark to every page with Stamp. See [Watermark PDF](/watermark-pdf).',
          'Copy and paste: duplicate a text box with Ctrl+D, or copy it to another page.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I add text in Hindi?', a: 'Yes. Type or paste Hindi; it is shaped correctly on screen and in the downloaded PDF.' },
      { q: 'Can I change the existing text instead?', a: 'Yes, use Edit Text: click a line of the PDF and type. The old words are replaced, not covered.' },
      { q: 'Will the added text be selectable and searchable?', a: 'Yes. It is real text in the PDF, so it can be selected, copied and found with search.' },
    ],
    related: ['pdf-editor', 'fill-pdf-form', 'watermark-pdf', 'sign-pdf'],
    keywords: ['add text to pdf', 'type on pdf', 'write on pdf', 'insert text in pdf', 'add text to pdf online free'],
  },
  {
    ...editor,
    slug: 'edit-scanned-pdf',
    no: 28,
    focus: 'ocr',
    name: 'Edit Scanned PDF',
    short: 'Make scans searchable and editable with OCR',
    title: 'Edit Scanned PDF Online – OCR in English & Hindi, Free',
    description: 'Edit a scanned PDF: recognise its text with OCR in English or Hindi, then search, copy and edit it. Free online OCR that runs in your browser, no upload.',
    h1: 'Edit a scanned PDF',
    intro:
      'A scanned PDF is a picture of a page, so its words cannot be selected or changed. Text recognition (OCR) reads the words in the picture and adds them to the PDF, in English, Hindi or both. After that you can search the document, copy text from it and edit words like in any other PDF.',
    steps: [
      'Open the scanned PDF. Text recognition starts on its own: choose the language.',
      'Wait a few seconds per page while the text is read.',
      'Search, copy or edit the recognised text, then press Download PDF; the result stays searchable.',
    ],
    sections: [
      {
        h2: 'Getting the best results from OCR',
        list: [
          'Scan at 300 dpi: clearer pictures give more accurate text.',
          'Straight pages: rotate sideways pages first with the page tools.',
          'Pick the right language: choose “English and Hindi” for documents with both.',
          'Check numbers: proofread amounts, dates and ID numbers before you rely on them.',
        ],
      },
    ],
    faqs: [
      { q: 'Which languages can it read?', a: 'English and Hindi, separately or together on the same page.' },
      { q: 'Is the scan uploaded for OCR?', a: 'No. The recognition engine runs in your browser; only the engine itself is downloaded the first time.' },
      { q: 'Will the downloaded PDF look the same?', a: 'Yes. The page picture is kept as it is; the recognised words are added as an invisible text layer so the file becomes searchable.' },
      { q: 'Can it read handwriting?', a: 'Printed text works best. Neat handwriting may be partly recognised, but expect mistakes.' },
    ],
    related: ['pdf-editor', 'image-to-text', 'compress-pdf', 'redact-pdf'],
    keywords: ['edit scanned pdf', 'ocr pdf', 'scanned pdf to editable', 'hindi ocr pdf', 'make pdf searchable', 'pdf ocr online free'],
  },
  {
    ...editor,
    slug: 'redact-pdf',
    no: 29,
    focus: 'redact',
    name: 'Redact PDF',
    short: 'Black out text so it is removed from the file for good',
    title: 'Redact PDF Online Free – Black Out Text Permanently',
    description: 'Redact a PDF: black out names, account numbers and Aadhaar or PAN numbers so the text is really removed, not just covered. Find and redact all matches. Free.',
    h1: 'Redact a PDF',
    intro:
      'Drawing a black box over text in most editors only hides it: the words are still in the file and can be copied out. Secure redaction removes what is under the box from the PDF itself, so it cannot be recovered. Use it before sharing bank statements, salary slips, ID proofs or legal papers.',
    steps: [
      'Open the PDF.',
      'Drag over what must go, or use Find and redact to black out every email, phone number, PAN, Aadhaar or card number at once.',
      'Press Download PDF: redacted areas are removed from the file.',
    ],
    sections: [
      {
        h2: 'What is removed',
        list: [
          'The text under each box, which is removed from the page, not just painted over.',
          'Pictures under the box: the redacted page is rebuilt so nothing underneath remains.',
          'Hidden data, optionally: document properties, comments, attachments and other hidden content via File → Remove hidden data.',
        ],
      },
    ],
    faqs: [
      { q: 'How is this different from a black rectangle?', a: 'A rectangle only covers the text; it can still be selected or copied. Redaction removes the text and pictures under the box from the file.' },
      { q: 'Can it find all phone numbers or PAN numbers for me?', a: 'Yes. Find and redact looks for emails, phone numbers, PAN, Aadhaar (with its check digit), card numbers or any word, and covers every match.' },
      { q: 'Can I undo a redaction after downloading?', a: 'No, that is the point. Keep your original file if you might need the hidden text again.' },
    ],
    related: ['pdf-editor', 'protect-pdf', 'edit-scanned-pdf', 'compress-pdf'],
    keywords: ['redact pdf', 'black out text in pdf', 'remove text from pdf', 'redact pdf online free', 'hide text in pdf'],
  },
  {
    ...editor,
    slug: 'watermark-pdf',
    no: 30,
    focus: 'stamp',
    name: 'Watermark PDF',
    short: 'Add a watermark, page numbers, header or footer',
    title: 'Add Watermark to PDF Online Free – Text, Page Numbers',
    description: 'Add a text watermark such as CONFIDENTIAL or DRAFT, page numbers, headers, footers and stamps to every page of a PDF. Free, no upload.',
    h1: 'Add a watermark to a PDF',
    intro:
      'Put “CONFIDENTIAL”, “DRAFT”, “COPY” or your company name across every page, number the pages, or add a header and footer with the file name and date. Choose the size, angle, colour and transparency, and which pages get it.',
    steps: ['Open the PDF.', 'Choose Stamp, then a watermark, page numbers, header, footer or a ready-made stamp.', 'Adjust and press Download PDF.'],
    sections: [
      {
        h2: 'Page numbers, headers and footers',
        body: [
          'Page numbers can read “Page 3 of 12” or just “3”, in any corner. Headers and footers can include the page number, total pages and file name, so a printed bundle stays in order.',
        ],
      },
    ],
    faqs: [
      { q: 'Can the watermark be see-through?', a: 'Yes. Set the transparency so the page underneath stays readable.' },
      { q: 'Can I skip the first page?', a: 'Yes. Choose which pages get the watermark, numbers, header or footer.' },
      { q: 'Can I add my logo as a watermark?', a: 'Yes. Add the logo as an image, set its transparency and copy it to the pages you need.' },
    ],
    related: ['pdf-editor', 'add-text-to-pdf', 'protect-pdf', 'merge-pdf'],
    keywords: ['watermark pdf', 'add watermark to pdf', 'add page numbers to pdf', 'pdf header footer', 'stamp pdf'],
  },
  {
    ...editor,
    slug: 'add-image-to-pdf',
    no: 31,
    focus: 'image',
    name: 'Add Image to PDF',
    short: 'Insert a photo, logo or stamp into a PDF',
    title: 'Add Image to PDF Online Free – Insert Photo or Logo',
    description: 'Add an image to a PDF: insert a photo, logo, stamp or signature image, then move, resize and rotate it. Replace or remove pictures already in the PDF. Free.',
    h1: 'Add an image to a PDF',
    intro:
      'Insert a passport photo into an application form, a logo onto a letterhead, or a company stamp onto an invoice. Drop in a JPG, PNG or WebP, then move, resize and rotate it. Pictures already in the PDF can be moved, replaced or deleted too.',
    steps: ['Open the PDF.', 'Choose Add Image and pick your picture, or drop it on the page.', 'Place and size it, then press Download PDF.'],
    sections: [
      {
        h2: 'Working with pictures that are already in the PDF',
        body: [
          'Click a picture in the PDF to select it: drag to move it, use the handles to resize it, replace it with another image, or delete it. Useful for updating a logo or removing a stray image without recreating the document.',
        ],
      },
    ],
    faqs: [
      { q: 'Which image formats can I add?', a: 'JPG, PNG and WebP. Transparent PNGs keep their transparency, which suits logos and stamps.' },
      { q: 'Will the image lose quality?', a: 'No. It is placed at its own resolution; only its displayed size changes.' },
      { q: 'Can I turn images into a PDF instead?', a: 'Yes, use [JPG to PDF](/jpg-to-pdf) to make a new PDF with one page per picture.' },
    ],
    related: ['pdf-editor', 'jpg-to-pdf', 'sign-pdf', 'compress-image'],
    keywords: ['add image to pdf', 'insert image in pdf', 'add photo to pdf', 'add logo to pdf', 'put picture on pdf'],
  },
  {
    ...editor,
    slug: 'hindi-pdf-editor',
    no: 32,
    focus: 'edittext',
    lang: 'hi',
    alternates: { 'en-IN': '/pdf-editor' },
    name: 'Hindi PDF Editor',
    short: 'हिंदी में PDF एडिट करें – टेक्स्ट बदलें, साइन करें',
    title: 'PDF Editor in Hindi – हिंदी में PDF एडिट करें, Free',
    description: 'हिंदी PDF एडिटर: PDF का टेक्स्ट बदलें, हिंदी में लिखें, साइन करें, फॉर्म भरें और स्कैन PDF को OCR से एडिट करें। मुफ़्त, बिना अपलोड, बिना वॉटरमार्क।',
    h1: 'PDF एडिटर: हिंदी में PDF एडिट करें',
    intro:
      'PDF की किसी भी लाइन पर क्लिक करें और लिखें। पुराना टेक्स्ट हटकर नया टेक्स्ट उसी जगह, उसी फ़ॉन्ट में आ जाता है। हिंदी में टाइप करें, सिग्नेचर लगाएँ, फॉर्म भरें और स्कैन किए गए PDF को OCR से एडिट करें। आपकी फ़ाइल कहीं अपलोड नहीं होती, सब कुछ आपके ब्राउज़र में होता है।',
    steps: [
      'ऊपर दिए बटन से अपना PDF खोलें। फ़ाइल आपके फ़ोन या कंप्यूटर पर ही रहती है।',
      'Edit Text चुनें और जिस शब्द को बदलना है उस पर क्लिक करके टाइप करें, या Add Text, Sign, Image जैसे टूल चुनें।',
      'Download PDF दबाएँ। बदलाव वाला PDF बिना वॉटरमार्क के सेव हो जाएगा।',
    ],
    sections: [
      {
        h2: 'इस PDF एडिटर से क्या-क्या कर सकते हैं',
        list: [
          'टेक्स्ट बदलें: PDF में लिखे शब्द, नाम, तारीख और रकम सीधे बदलें।',
          'हिंदी में लिखें: मात्राएँ और संयुक्त अक्षर सही दिखते हैं, डाउनलोड किए PDF में भी।',
          'सिग्नेचर: एक बार सिग्नेचर बनाएँ या फ़ोटो अपलोड करें, अगली बार एक क्लिक में लगाएँ।',
          'फॉर्म भरें: आवेदन फॉर्म, KYC फॉर्म और एडमिशन फॉर्म में टाइप करें।',
          'स्कैन PDF: OCR से हिंदी और अंग्रेज़ी टेक्स्ट पढ़ें, फिर उसे खोजें, कॉपी करें या बदलें।',
          'पेज: पेज घुमाएँ, हटाएँ, क्रम बदलें, PDF जोड़ें या अलग करें, पेज नंबर और वॉटरमार्क लगाएँ।',
        ],
      },
      {
        h2: 'आपकी फ़ाइल सुरक्षित है',
        body: [
          'यह एडिटर आपके ब्राउज़र में चलता है। PDF किसी सर्वर पर अपलोड नहीं होता, इसलिए बैंक स्टेटमेंट, सैलरी स्लिप, आधार या PAN जैसे दस्तावेज़ भी बेझिझक एडिट करें। English में पूरी जानकारी के लिए [PDF Editor](/pdf-editor) पेज देखें।',
        ],
      },
    ],
    faqs: [
      { q: 'क्या यह PDF एडिटर मुफ़्त है?', a: 'हाँ, सभी फ़ीचर मुफ़्त हैं और डाउनलोड किए PDF पर कोई वॉटरमार्क नहीं आता।' },
      { q: 'क्या मैं PDF में पहले से लिखा हिंदी टेक्स्ट बदल सकता हूँ?', a: 'हाँ। Edit Text चुनकर उस लाइन पर क्लिक करें और नया टेक्स्ट लिखें। अगर PDF का फ़ॉन्ट उपलब्ध न हो, तो मिलता-जुलता हिंदी फ़ॉन्ट लगता है।' },
      { q: 'क्या मोबाइल पर PDF एडिट कर सकते हैं?', a: 'हाँ, किसी भी मोबाइल ब्राउज़र में। बारीक बदलाव के लिए बड़ी स्क्रीन ज़्यादा आसान रहती है।' },
      { q: 'स्कैन किया हुआ हिंदी PDF कैसे एडिट करें?', a: 'PDF खोलने पर टेक्स्ट पहचानने (OCR) का विकल्प आता है। भाषा में “Hindi” या “English and Hindi” चुनें, फिर टेक्स्ट एडिट करें।' },
      { q: 'क्या मेरी फ़ाइल अपलोड होती है?', a: 'नहीं। फ़ाइल आपके डिवाइस पर ही खुलती और सेव होती है।' },
    ],
    related: ['pdf-editor', 'sign-pdf', 'edit-scanned-pdf', 'fill-pdf-form'],
    keywords: ['hindi pdf editor', 'pdf edit kaise kare', 'हिंदी pdf एडिटर', 'pdf me hindi kaise likhe', 'pdf editor hindi', 'pdf mein edit kaise kare'],
  },
];
