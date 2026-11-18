import type { Tool } from './registry';

/**
 * The QR Code Generator and one page per thing people search for ("wifi qr code generator",
 * "upi qr code generator", "qr code with logo"). Each page opens the same generator already
 * set to that kind of code (preset.type / preset.logo) and carries help for that job only,
 * so no two pages say the same thing.
 */

const UPDATED = '2026-11-18';
const qr = { category: 'qr', opens: 'qr-code-generator', updated: UPDATED } as const;

export const QR_TOOL: Tool = {
  slug: 'qr-code-generator',
  category: 'qr',
  no: 46,
  updated: UPDATED,
  name: 'QR Code Generator',
  short: 'Free QR codes with or without a logo: links, WiFi, UPI, vCard',
  title: 'QR Code Generator – Free, With Logo, PNG, SVG & PDF',
  description: 'Free QR code generator with or without a logo. Links, WiFi, UPI, WhatsApp, vCard and more. Custom colours, download PNG, JPG, SVG or PDF. No sign-up.',
  h1: 'Free QR Code Generator, with or without a logo',
  intro:
    'Make a QR code for a website, WiFi password, UPI payment, WhatsApp chat, contact card or any of 20 other uses. Choose colours and shapes, put your logo in the middle if you want one, and download it as PNG, JPG, SVG or a print-ready PDF. Every code is checked by reading it back before you download, so you know it scans. It is free, needs no account, and the codes never expire.',
  steps: [
    'Choose what the code should open: a website, text, WiFi, contact, WhatsApp, UPI payment and more.',
    'Fill in the details. The code updates as you type.',
    'Optional: pick “With logo” and upload your logo, and change colours or shapes.',
    'Check that the scan check passed, choose a size, and download PNG, JPG, SVG or PDF.',
  ],
  sections: [
    {
      h2: 'What is a QR code?',
      body: [
        'A QR code (Quick Response code) is a square barcode that a phone camera can read in a second. Instead of typing a long web address, a WiFi password or a phone number, people point their camera at the code and tap. The information is stored in the pattern of black and white squares; the three larger squares in the corners tell the camera where the code is and which way up it is.',
        'Any modern Android phone or iPhone reads QR codes with the built-in camera app, and Google Lens, Paytm, PhonePe and Google Pay read them too. No special scanner app is needed.',
      ],
    },
    {
      h2: 'How to create a QR code with a logo',
      list: [
        'Choose “With logo” at the top of the generator.',
        'Upload your logo: PNG, JPG, SVG or WebP. A PNG with a transparent background looks cleanest.',
        'Set the size: around 20% of the code is a safe size. Up to about 30% works with error correction H, which the tool selects for you.',
        'Pick a background for the logo: a white rounded or circular plate makes it stand out and keeps the squares around it clear.',
        'Wait for “Scan check passed”, then download. See [QR Code Generator with Logo](/qr-code-generator-with-logo) for design tips.',
      ],
    },
    {
      h2: 'How to create a QR code without a logo',
      body: [
        'Leave the generator on “Without logo”, choose the type of code and fill in the details. Black on white with square dots is the most reliable code there is: it scans from further away, at smaller sizes and on older phones. It is the right choice for invoices, product labels, documents and anywhere the code will be printed small. More in [QR Code Generator without Logo](/qr-code-generator-without-logo).',
      ],
    },
    {
      h2: 'Every kind of QR code you can make here',
      list: [
        'Website link: [URL QR code](/url-qr-code-generator) for any web page, form or online menu.',
        'WiFi: [WiFi QR code](/wifi-qr-code-generator) lets guests join without typing the password.',
        'Payments: [UPI QR code](/upi-qr-code-generator) for GPay, PhonePe, Paytm and BHIM, with or without a fixed amount.',
        'Chat: [WhatsApp QR code](/whatsapp-qr-code-generator) opens a chat with your number and a ready message.',
        'Contact card: [vCard QR code](/vcard-qr-code-generator) saves your name, number and email in one scan; [Business QR code](/business-qr-code-generator) does the same for a shop or company.',
        'Places: [Google Maps QR code](/google-maps-qr-code-generator) opens directions to your address.',
        'Social: [Instagram](/instagram-qr-code-generator), [YouTube](/youtube-qr-code-generator), Facebook and LinkedIn profiles.',
        'Reviews: [Google Review QR code](/google-review-qr-code-generator) takes customers straight to the review box.',
        'Documents: [PDF QR code](/pdf-qr-code-generator) and [menu QR code](/menu-qr-code-generator) open a file you have shared online.',
        'Also: plain [text](/text-qr-code-generator), email, phone call, SMS, calendar event and app download.',
      ],
    },
    {
      h2: 'Which download format to choose',
      table: {
        head: ['Format', 'Best for', 'Notes'],
        rows: [
          ['PNG', 'Websites, WhatsApp, Word and PowerPoint', 'Sharp, and keeps a transparent background'],
          ['JPG', 'Apps and forms that only accept JPG', 'Always has a solid background'],
          ['SVG', 'Printing and designers (Canva, Illustrator, CorelDRAW)', 'Vector: stays sharp at any size, even on a banner'],
          ['PDF', 'Printing at a shop or at home', 'A4 page with the code centred, ready to print'],
        ],
      },
    },
    {
      h2: 'Where you can use QR codes',
      list: [
        'Restaurants and cafés: a code on each table for the menu, WiFi and Google reviews.',
        'Shops: a UPI code at the counter, and a code on the shelf or packaging linking to the product page.',
        'Business cards and letterheads: a vCard code so people save your number without typing.',
        'Marketing: posters, flyers, banners and newspaper ads that lead straight to an offer or a form.',
        'Events and weddings: a code for the venue location, the schedule or the photo album.',
        'Schools and coaching: codes for timetables, admission forms, study material and Google Forms.',
        'Hotels and offices: WiFi codes in rooms and meeting rooms, and contact codes at reception.',
        'Invoices: a UPI code on the bill so customers pay the exact amount.',
      ],
    },
    {
      h2: 'Does the QR code expire?',
      body: [
        'No. These are static QR codes: what you typed is stored inside the pattern itself, not on our servers, so the code keeps working even if Toolyverse disappeared. There is no subscription, no scan limit and no expiry date.',
        'What can stop working is the thing the code points to. If a web page is deleted, a WiFi password is changed or a phone number is given up, the code still scans but leads nowhere useful. A static code cannot be edited after printing, so if you expect the destination to change, point the code at a page you control and update that page instead.',
      ],
    },
    {
      h2: 'Making sure your QR code scans',
      list: [
        'Size: print it at least 2 × 2 cm. For posters, make it about one tenth of the scanning distance (1 metre away needs a 10 cm code).',
        'Contrast: dark dots on a light background. Light dots on a dark background fail on many phones.',
        'Quiet zone: keep the blank margin around the code; do not crop it or print text right up to it.',
        'Less is more: short links make simpler codes that scan faster. Long text makes dense codes that need to be printed bigger.',
        'Test before printing: scan the downloaded code with two different phones. The scan check here catches most problems, but a real phone is the final word.',
      ],
    },
  ],
  faqs: [
    { q: 'Is this QR code generator really free?', a: 'Yes. Every type of code, logos, colours and all download formats are free, with no sign-up, no watermark and no limit on how many codes you make.' },
    { q: 'Do the QR codes expire?', a: 'No. They are static codes with the information stored in the code itself, so they work for as long as the link, number or WiFi details inside them are still valid.' },
    { q: 'Can I use these QR codes for my business?', a: 'Yes, including on products, packaging, menus, invoices and adverts. There is no licence fee and no attribution needed.' },
    { q: 'Can I edit a QR code after printing it?', a: 'No, a static code cannot be changed. Make a new one if the details change, or point the code at a web page you can update.' },
    { q: 'Will a logo stop my QR code from working?', a: 'Not if it is a sensible size. The tool switches to high error correction and reads the code back to check it; if the logo is too big you get a warning before you download.' },
    { q: 'How do I scan a QR code?', a: 'Open the camera on your phone and point it at the code, then tap the link that appears. Google Lens and UPI apps also scan codes.' },
    { q: 'Can I track how many people scanned my code?', a: 'Not with a static code, because scans do not pass through any server. To count visits, add tracking (such as UTM tags) to the link inside the code and check your website analytics.' },
    { q: 'Is my information uploaded?', a: 'No. Codes are made in your browser. Your WiFi passwords, UPI ID, contacts and logo never leave your device.' },
  ],
  featureList: [
    'QR codes for websites, text, WiFi, vCard, business, email, phone, SMS, WhatsApp, location, events, UPI, Google reviews, social media, PDF links and apps',
    'With or without a centre logo (PNG, JPG, SVG, WebP)',
    'Custom colours, gradients and transparent background',
    'Square, rounded and dot patterns with custom corner styles',
    'Error correction L, M, Q and H, and adjustable margin',
    'Download PNG, JPG, SVG and PDF up to 2048 px',
    'Built-in scan check before download',
    'Make up to 100 QR codes at once',
    'Recent codes remembered in your browser',
  ],
  features: [
    { key: 'logo', label: 'Logo in the centre', hint: 'The “With logo” mode and logo upload', default: true },
    { key: 'batch', label: 'Many codes at once', hint: 'Make up to 100 codes from a list and download them as a PDF or PNGs', default: true },
    { key: 'history', label: 'Recent codes', hint: 'Remembers the last 12 codes in the visitor’s browser', default: true },
  ],
  limits: { publicMb: 5, memberMb: 10 },
  related: ['qr-code-generator-with-logo', 'wifi-qr-code-generator', 'upi-qr-code-generator', 'whatsapp-qr-code-generator', 'vcard-qr-code-generator', 'google-review-qr-code-generator'],
  keywords: [
    'qr code generator',
    'free qr code generator',
    'qr code maker',
    'qr code generator with logo',
    'create qr code online',
    'qr code generator online free',
    'custom qr code generator',
    'qr code generator png',
    'qr code generator svg',
    'qr code generator no sign up',
    'high resolution qr code',
    'qr code creator',
  ],
};

export const QR_PAGES: Tool[] = [
  // ---- With / without a logo / free ------------------------------------------------------------------
  {
    ...qr,
    slug: 'qr-code-generator-with-logo',
    no: 47,
    preset: { logo: 'on' },
    name: 'QR Code Generator with Logo',
    short: 'Put your brand logo in the centre of a QR code',
    title: 'QR Code Generator with Logo – Free, Custom Colours',
    description: 'Create a QR code with your logo in the centre. Upload PNG, JPG or SVG, pick colours and shapes, and download a scannable code in PNG, SVG or PDF. Free.',
    h1: 'QR code generator with logo',
    intro:
      'A QR code with your logo in the middle looks like part of your brand instead of a random barcode, and people trust it more. Upload your logo, choose how big it should be and what sits behind it, and match the colours to your brand. Every code is read back automatically, so you see straight away whether the logo is getting in the way.',
    steps: ['Choose what the code opens and fill in the details.', 'Upload your logo (PNG, JPG, SVG or WebP).', 'Adjust the logo size, its background and the code colours.', 'When the scan check passes, download PNG, SVG or PDF.'],
    sections: [
      {
        h2: 'Why a QR code still works with a logo on it',
        body: [
          'QR codes are built to survive damage. Error correction stores part of the information more than once, so a scanner can rebuild what is missing. At level H, up to 30% of the code can be covered and it still reads. When you add a logo, the generator switches to H and removes the squares behind the logo completely, rather than painting over them, which keeps the edge around the logo clean for the camera.',
        ],
      },
      {
        h2: 'Design tips for a logo QR code',
        list: [
          'Logo size: 18–24% of the code is the sweet spot. Bigger logos look bolder but leave less room for error.',
          'Background plate: a white rounded or circular plate separates a busy or dark logo from the squares around it.',
          'Brand colours: use your darkest brand colour for the dots. Keep the background white or very light.',
          'Corner style: rounded or circular corner frames in your accent colour make the code look designed without hurting scanning.',
          'Transparent logo: a PNG or SVG with no background sits neatly on the plate. Square photos and JPG logos work too.',
          'Logo file: if your logo is wide, a square icon or monogram version usually looks better than the full wordmark.',
        ],
      },
      {
        h2: 'Logo QR codes in print',
        body: [
          'For visiting cards and packaging, download SVG and give it to your printer or designer: it stays perfectly sharp at any size and can be placed in Canva, CorelDRAW or Illustrator. For a shop counter or table stand, the PDF download is an A4 page ready to print. Print a test copy and scan it from the distance people will actually stand at.',
        ],
      },
    ],
    faqs: [
      { q: 'Is the QR code with logo free?', a: 'Yes. Logo upload, colours and every download format are free, with no watermark and no account.' },
      { q: 'What logo file should I use?', a: 'A square PNG or SVG with a transparent background gives the cleanest result. JPG and WebP work too; the logo is shrunk on your device, not uploaded.' },
      { q: 'How big can the logo be?', a: 'Up to about 30% of the width with error correction H. The tool warns you if the logo covers so much that some phones may not read it.' },
      { q: 'Can I use a QR code with logo on my business card?', a: 'Yes. Download the SVG for the sharpest print and keep the code at least 2 cm wide.' },
    ],
    related: ['qr-code-generator', 'business-qr-code-generator', 'vcard-qr-code-generator', 'qr-code-generator-without-logo'],
    keywords: ['qr code generator with logo', 'qr code with logo free', 'qr code with image in center', 'qr code with brand logo', 'qr code with company logo', 'qr code with picture', 'custom qr code with logo'],
  },
  {
    ...qr,
    slug: 'qr-code-generator-without-logo',
    no: 48,
    preset: { logo: 'off' },
    name: 'QR Code Generator without Logo',
    short: 'Plain, high-contrast QR codes that scan anywhere',
    title: 'QR Code Generator without Logo – Plain, Fast to Scan',
    description: 'Make a plain QR code without a logo: black on white or your own colours, scannable at small sizes. Download PNG, JPG, SVG or PDF. Free, instant, no sign-up.',
    h1: 'QR code generator without logo',
    intro:
      'Sometimes the best QR code is the simplest one. A plain code with no logo has nothing covering it, so it scans faster, from further away and at smaller sizes, even on old phones and in poor light. Type your link or text and download it in any format.',
    steps: ['Choose the type of code and fill in the details.', 'Keep the default black on white, or pick your own colours.', 'Choose a size and download PNG, JPG, SVG or PDF.'],
    sections: [
      {
        h2: 'When a plain QR code is the better choice',
        list: [
          'Small prints: product labels, stickers, receipts and invoices where the code is under 2.5 cm.',
          'Long content: a vCard or long text makes a dense code; covering part of it with a logo makes it harder to read.',
          'Documents and forms: official papers, certificates and admit cards where a plain look is expected.',
          'Poor printing: thermal printers, photocopies and newsprint blur the squares; a plain code tolerates that best.',
        ],
      },
      {
        h2: 'Getting the most reliable code',
        body: [
          'Keep dark squares on a light background, leave the quiet zone (the white border) at 4 squares, and choose error correction M for a good balance between density and toughness. If the code will be stuck on something that may get scratched or dirty, such as a delivery box or a machine, use Q or H instead. Square dots scan best of all patterns.',
        ],
      },
    ],
    faqs: [
      { q: 'Is a QR code without a logo more reliable?', a: 'Yes. Nothing covers the code, so it can use a lower error correction level, which makes it less dense and easier to read at small sizes.' },
      { q: 'Can I still change the colours?', a: 'Yes. Any dark colour on a light background works. Avoid light dots on a dark background.' },
      { q: 'What is the smallest size I can print?', a: 'About 2 × 2 cm for a short link. Codes holding more text need to be printed larger.' },
    ],
    related: ['qr-code-generator', 'qr-code-generator-with-logo', 'text-qr-code-generator', 'url-qr-code-generator'],
    keywords: ['qr code generator without logo', 'simple qr code generator', 'plain qr code', 'black and white qr code', 'qr code generator for printing'],
  },
  {
    ...qr,
    slug: 'free-qr-code-generator',
    no: 49,
    preset: { type: 'url' },
    name: 'Free QR Code Generator',
    short: 'Free forever: no sign-up, no expiry, no watermark',
    title: 'Free QR Code Generator – No Sign-up, No Expiry',
    description: 'A genuinely free QR code generator: no registration, no trial, no watermark, and codes that never expire. Logos, colours and HD downloads included.',
    h1: 'Free QR code generator: no sign-up, no expiry',
    intro:
      'Many “free” QR code sites let you make a code, then switch it off after 14 days unless you pay, because the code secretly points to their server. Codes made here contain your link or details directly, so they keep working for ever and there is nothing to pay, now or later.',
    steps: ['Type your link, or choose another type of code.', 'Customise it if you like.', 'Download it. That is all: no email, no account.'],
    sections: [
      {
        h2: 'Static vs dynamic QR codes',
        table: {
          head: ['', 'Static (this tool)', 'Dynamic (subscription sites)'],
          rows: [
            ['Where the information is', 'Inside the code', 'On the company’s server'],
            ['Expiry', 'Never', 'Stops when you stop paying'],
            ['Change the link after printing', 'No: make a new code', 'Yes'],
            ['Scan statistics', 'Use your website analytics', 'Built in'],
            ['Cost', 'Free', 'Monthly fee'],
            ['Privacy', 'No one sees your scans', 'Every scan goes through their server'],
          ],
        },
      },
      {
        h2: 'What is free here',
        list: [
          'All types: websites, WiFi, UPI, WhatsApp, contacts, maps, events, social media and more.',
          'All designs: logo upload, colours, gradients, rounded and dot patterns.',
          'All downloads: PNG, JPG, SVG and print-ready PDF, up to 2048 pixels.',
          'Many at once: up to 100 codes from a list, in one PDF.',
          'No catch: no watermark, no account, no adverts inside the code, no limit.',
        ],
      },
      {
        h2: 'Can a free QR code be trusted for business?',
        body: [
          'Yes. A static code is just a standard barcode; once printed it does not depend on this website at all. Thousands of shops print their UPI and menu codes this way. The only thing to plan for is change: if your link might change, point the code at your own website address and update the page behind it, rather than at a link you do not control.',
        ],
      },
    ],
    faqs: [
      { q: 'Why do other free QR codes stop working?', a: 'They are dynamic codes that point to the provider’s server, which stops redirecting when a trial ends. Codes made here hold your link directly and never stop.' },
      { q: 'Do I need to register?', a: 'No. There is no sign-up and no email needed to make or download codes.' },
      { q: 'Is there a limit on how many codes I can make?', a: 'No. Make as many as you need, and up to 100 at a time from a list.' },
    ],
    related: ['qr-code-generator', 'qr-code-generator-with-logo', 'url-qr-code-generator', 'upi-qr-code-generator'],
    keywords: ['free qr code generator', 'qr code generator free', 'free qr code generator no sign up', 'free qr code generator without registration', 'qr code that never expires', 'free qr maker', 'best free qr code maker online'],
  },

  // ---- Types -----------------------------------------------------------------------------------------
  {
    ...qr,
    slug: 'url-qr-code-generator',
    no: 50,
    preset: { type: 'url' },
    name: 'URL QR Code Generator',
    short: 'Turn any link into a QR code',
    title: 'URL QR Code Generator – Convert a Link to a QR Code',
    description: 'Convert any website link to a QR code: web pages, Google Forms, online menus, product pages. Paste the URL and download PNG, SVG or PDF. Free and permanent.',
    h1: 'Convert a link to a QR code',
    intro:
      'Paste any web address and get a QR code that opens it. It works for websites, product pages, Google Forms, Google Drive files, online menus, YouTube videos, payment links and anything else with a link. If you type the address without https://, it is added for you.',
    steps: ['Paste or type the link.', 'Customise the colours or add a logo if you like.', 'Download and test it with your phone.'],
    sections: [
      {
        h2: 'Links that work well in a QR code',
        list: [
          'Your website or a specific page on it, such as an offer or a booking page.',
          'Google Forms: for registrations, feedback and attendance. Copy the link from the Send button.',
          'Product pages: on packaging, so customers find the manual, warranty or reorder page.',
          'Payment and booking links: Razorpay, Instamojo, Calendly and similar.',
          'Videos: use the [YouTube QR code](/youtube-qr-code-generator) page for channels and videos.',
        ],
      },
      {
        h2: 'Keep the link short and lasting',
        body: [
          'Shorter links make simpler codes that scan faster and can be printed smaller, so remove tracking clutter you do not need. If you want to count scans, add UTM tags (for example ?utm_source=poster) and look them up in Google Analytics. And because the link is fixed once printed, use an address that will not change: your own domain is safer than a temporary link.',
        ],
      },
    ],
    faqs: [
      { q: 'Do I need to type https://?', a: 'No. If the address has no https:// or http://, the generator adds https:// for you.' },
      { q: 'Can I make a QR code for a Google Form?', a: 'Yes. Click Send in your form, copy the link and paste it here.' },
      { q: 'Will the QR code still work if I change my website?', a: 'Yes, as long as the same address still opens a page. If you delete or rename that page, the code will lead to an error.' },
    ],
    related: ['qr-code-generator', 'pdf-qr-code-generator', 'youtube-qr-code-generator', 'free-qr-code-generator'],
    keywords: ['url qr code generator', 'website qr code generator', 'convert link to qr code', 'create qr code from url', 'qr code for website link', 'qr code for google form', 'convert website to qr code'],
  },
  {
    ...qr,
    slug: 'text-qr-code-generator',
    no: 51,
    preset: { type: 'text' },
    name: 'Text QR Code Generator',
    short: 'Put a message, code or note in a QR code',
    title: 'Text QR Code Generator – Create a QR Code from Text',
    description: 'Create a QR code from plain text: a message, serial number, instructions or a note, in English, Hindi or any language. Works offline when scanned. Free.',
    h1: 'Create a QR code from text',
    intro:
      'A text QR code holds words instead of a link. When someone scans it, the text simply appears on their phone, with no internet needed. Use it for instructions, serial numbers, short messages, quiz answers or labels, in any language including Hindi.',
    steps: ['Type or paste the text.', 'Choose colours if you like.', 'Download the code and print it.'],
    sections: [
      {
        h2: 'Good uses for a text QR code',
        list: [
          'Stock and asset labels: model, serial number and purchase date on equipment.',
          'Instructions: how to use a machine, a room or a product, readable without internet.',
          'Treasure hunts and classrooms: clues, answers and puzzles.',
          'Messages: a note inside a gift or an invitation.',
        ],
      },
      {
        h2: 'How much text fits?',
        body: [
          'A QR code can hold roughly 2,900 letters of English at the lowest error correction level, and about half that at H. Hindi and other scripts take about three times as much room per letter. But the more text, the denser the code: for anything longer than a few lines, put the text on a web page and make a [URL QR code](/url-qr-code-generator) for it instead.',
        ],
      },
    ],
    faqs: [
      { q: 'Does a text QR code need internet to scan?', a: 'No. The text is inside the code, so it shows even with no connection.' },
      { q: 'Can I write in Hindi?', a: 'Yes. Any language works; the text is stored as Unicode and shows correctly on modern phones.' },
      { q: 'Why is my text QR code so dense?', a: 'Every letter adds squares. Shorten the text, choose a lower error correction level, or link to a page instead.' },
    ],
    related: ['qr-code-generator', 'url-qr-code-generator', 'qr-code-generator-without-logo', 'word-counter'],
    keywords: ['text qr code generator', 'create qr code from text', 'text to qr code', 'qr code for message', 'hindi text qr code'],
  },
  {
    ...qr,
    slug: 'wifi-qr-code-generator',
    no: 52,
    preset: { type: 'wifi' },
    name: 'WiFi QR Code Generator',
    short: 'Let guests join your WiFi by scanning',
    title: 'WiFi QR Code Generator – Share WiFi Password by QR',
    description: 'Make a WiFi QR code so guests join your network by scanning, without typing the password. Works on Android and iPhone. Free, private, nothing uploaded.',
    h1: 'WiFi QR code: share your WiFi without the password',
    intro:
      'Spelling out a long WiFi password to every guest gets old fast. A WiFi QR code holds the network name and password; guests point their camera at it and tap “Join”. It works with the built-in camera on iPhone and Android. Your password stays on your device: nothing is sent anywhere.',
    steps: ['Type the WiFi name (SSID) exactly as it appears, including capitals.', 'Type the password and choose the security type (WPA for almost all routers).', 'Download, print and stick it where guests can see it.'],
    sections: [
      {
        h2: 'Where to find your WiFi name and password',
        list: [
          'On the router: most have a sticker underneath with the default network name and key.',
          'On a phone already connected: Android shows a share button with the password in WiFi settings; iPhone can show it under Settings › Wi-Fi › the network.',
          'In the router settings page or the provider’s app (Airtel, JioFiber, ACT and others).',
        ],
      },
      {
        h2: 'Ideas for a WiFi QR code',
        list: [
          'Home: on the fridge or near the door for visitors.',
          'Cafés and restaurants: on the table tent, together with a [menu QR code](/menu-qr-code-generator).',
          'Hotels, PGs and homestays: in each room, so guests never have to call reception.',
          'Offices: a guest network code in meeting rooms; keep the staff network private.',
        ],
      },
      {
        h2: 'Keeping it safe',
        body: [
          'Anyone who can scan the code can join, so put it only where you would tell people the password anyway. For shops and offices, make a separate guest network on your router and use that in the code. If you change the password, print a new code: the old one will stop connecting.',
        ],
      },
    ],
    faqs: [
      { q: 'Does a WiFi QR code work on iPhone?', a: 'Yes. iPhones (iOS 11 and later) and Android phones read WiFi codes with the normal camera app and offer to join.' },
      { q: 'Is my WiFi password uploaded?', a: 'No. The code is made in your browser and the password never leaves your device.' },
      { q: 'Which security type should I choose?', a: 'WPA covers WPA, WPA2 and WPA3, used by almost every router. Choose WEP only for very old routers, and “No password” for open networks.' },
      { q: 'Does it work for hidden networks?', a: 'Yes. Tick “Hidden network” so phones know to look for it.' },
    ],
    related: ['qr-code-generator', 'menu-qr-code-generator', 'google-review-qr-code-generator', 'business-qr-code-generator'],
    keywords: ['wifi qr code generator', 'wifi qr code', 'qr code for wifi password', 'generate qr code for wifi', 'share wifi with qr code', 'qr code for wifi sharing'],
  },
  {
    ...qr,
    slug: 'upi-qr-code-generator',
    no: 53,
    preset: { type: 'upi' },
    name: 'UPI QR Code Generator',
    short: 'Payment QR for GPay, PhonePe, Paytm and BHIM',
    title: 'UPI QR Code Generator – Payment QR for Any UPI ID',
    description: 'Create a UPI payment QR code from your UPI ID, with or without a fixed amount. Works with GPay, PhonePe, Paytm and BHIM. Print it for your shop or invoice. Free.',
    h1: 'UPI QR code generator for payments',
    intro:
      'Make a payment QR code from any UPI ID. Customers scan it with GPay, PhonePe, Paytm, BHIM or their bank app and the payment screen opens with your name already filled in, plus the amount if you set one. Print it for your shop counter, put it on invoices, or share it on WhatsApp.',
    steps: ['Enter your UPI ID (for example shopname@okaxis) and your name as registered with the bank.', 'Optional: set an amount and a note, such as an invoice number.', 'Download, then scan it once with your own UPI app to check before printing.'],
    sections: [
      {
        h2: 'Fixed amount or open amount?',
        list: [
          'Open amount (leave it empty): one code for the counter; the customer types what they owe. Best for shops.',
          'Fixed amount: the customer just confirms. Best for invoices, fees, subscriptions and donations of a set value.',
          'Note: shows in the payment, so you can tell payments apart, such as “Invoice 1042” or “Room 12”.',
        ],
      },
      {
        h2: 'Using the code on invoices',
        body: [
          'Put a fixed-amount UPI code on each bill and customers pay the exact figure without typing your UPI ID. The [GST Invoice Generator](/gst-invoice-generator) makes the invoice; add the code you download here to it. Use the invoice number as the note so you can match each payment.',
        ],
      },
      {
        h2: 'Before you print',
        list: [
          'Scan it with your own phone: your name should appear as the payee. Do not send money to yourself; just check the screen and go back.',
          'Personal or business: a personal UPI ID works for receiving payments, but banks may limit how many payments a personal account receives. A merchant or business UPI ID is better for regular sales.',
          'Display safely: laminate the counter code, and check from time to time that no one has pasted a different code over it.',
        ],
      },
    ],
    faqs: [
      { q: 'Which apps can scan this UPI QR code?', a: 'Any UPI app: Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, WhatsApp Pay and bank apps.' },
      { q: 'Is there any fee?', a: 'No. Making the code is free, and the UPI payments themselves go directly from the customer’s bank to yours; Toolyverse never touches them.' },
      { q: 'Is my UPI ID safe to share in a QR code?', a: 'Yes. A UPI ID only lets people send you money. Never share your UPI PIN; no genuine payment ever needs it to receive money.' },
      { q: 'What is the maximum amount?', a: 'You can set up to ₹1,00,000, the usual UPI limit for a payment like this. Leave the amount empty to let the payer type it.' },
    ],
    related: ['qr-code-generator', 'gst-invoice-generator', 'business-qr-code-generator', 'whatsapp-qr-code-generator'],
    keywords: ['upi qr code generator', 'upi qr code', 'payment qr code generator', 'create qr code for upi payment', 'gpay qr code generator', 'phonepe qr code', 'qr code for payment'],
  },
  {
    ...qr,
    slug: 'whatsapp-qr-code-generator',
    no: 54,
    preset: { type: 'whatsapp' },
    name: 'WhatsApp QR Code Generator',
    short: 'Start a WhatsApp chat with one scan',
    title: 'WhatsApp QR Code Generator – Chat Link with Message',
    description: 'Create a WhatsApp QR code that opens a chat with your number and a ready-typed message. For shops, orders and support. Download free in PNG, SVG or PDF.',
    h1: 'WhatsApp QR code generator',
    intro:
      'A WhatsApp QR code opens a chat with your number in one scan, with a message already typed in for the customer, such as “Hi, I want to place an order”. They do not need to save your number first. It works with WhatsApp and WhatsApp Business.',
    steps: ['Enter your WhatsApp number with the country code (91 for India).', 'Optional: type the message customers will start with.', 'Download the code and put it on your shop board, packaging or ads.'],
    sections: [
      {
        h2: 'Messages that get customers talking',
        list: [
          'Orders: “Hi, I would like to order from your menu.”',
          'Enquiries: “Hi, I saw your poster. Please send details and prices.”',
          'Support: “Hi, I need help with my order number:” so they add the number themselves.',
          'Bookings: “Hi, I want to book an appointment for” for salons, clinics and tutors.',
        ],
      },
      {
        h2: 'Number format',
        body: [
          'WhatsApp needs the full international number without the plus sign, zeros or dashes: for an Indian mobile 98765 43210 that is 919876543210. You can type it with spaces and + and the tool tidies it for you; it also stops you if you forget the country code. The code uses WhatsApp’s official wa.me link, so it opens the app on phones and WhatsApp Web on computers.',
        ],
      },
    ],
    faqs: [
      { q: 'Does it work with WhatsApp Business?', a: 'Yes. The link opens a chat with whichever account uses that number, personal or Business.' },
      { q: 'Do customers need to save my number?', a: 'No. Scanning opens the chat directly; they can save you later.' },
      { q: 'Can I change the message later?', a: 'Not on a printed code. Make a new code if you want a different starting message.' },
    ],
    related: ['qr-code-generator', 'business-qr-code-generator', 'upi-qr-code-generator', 'instagram-qr-code-generator'],
    keywords: ['whatsapp qr code generator', 'whatsapp qr code', 'create qr code for whatsapp link', 'whatsapp chat qr code', 'wa.me qr code', 'whatsapp business qr code'],
  },
  {
    ...qr,
    slug: 'vcard-qr-code-generator',
    no: 55,
    preset: { type: 'vcard' },
    name: 'vCard QR Code Generator',
    short: 'Save your contact details in one scan',
    title: 'vCard QR Code Generator – Contact QR for Business Cards',
    description: 'Create a vCard QR code with your name, phone, email, company and address. One scan saves you to the phone’s contacts. Ideal for business cards. Free download.',
    h1: 'vCard QR code: save your contact in one scan',
    intro:
      'A vCard QR code holds your contact card. When someone scans it, their phone offers to save your name, number, email, company, job title, website and address in one tap, with no typing and no spelling mistakes. Put it on your visiting card, email signature, ID badge or stall.',
    steps: ['Fill in the details you want to share; only a name is required.', 'Optional: add your logo and brand colours.', 'Download SVG for printing on visiting cards, or PNG for screens.'],
    sections: [
      {
        h2: 'Adding a QR code to your visiting card',
        list: [
          'Size: at least 2 × 2 cm on a standard 9 × 5.5 cm card. A full contact card makes a dense code, so do not go smaller.',
          'Less is better: every field adds squares. Phone, email and name are usually enough; leave the address out if space is tight.',
          'Format: give your printer the SVG so the squares stay sharp.',
          'Logo: a small logo looks smart, but keep it to about 18% on a vCard because the code is already dense.',
        ],
      },
      {
        h2: 'vCard or link?',
        body: [
          'A vCard works without internet and saves straight to contacts, which is what most people want from a visiting card. If you have lots to share (several numbers, social profiles, a portfolio), a web page with all of it and a [URL QR code](/url-qr-code-generator) to it keeps the code simple. For a shop or company card, use the [Business QR code](/business-qr-code-generator) page.',
        ],
      },
    ],
    faqs: [
      { q: 'Does a vCard QR code work on iPhone and Android?', a: 'Yes. Both read the standard vCard 3.0 format with the camera app and offer to create a new contact.' },
      { q: 'Do people need internet to save my contact?', a: 'No. All the details are inside the code.' },
      { q: 'Can I update my details later?', a: 'Not on a printed code. Make a new one when your details change.' },
    ],
    related: ['qr-code-generator', 'business-qr-code-generator', 'qr-code-generator-with-logo', 'whatsapp-qr-code-generator'],
    keywords: ['vcard qr code generator', 'contact qr code generator', 'qr code for business card', 'qr code for visiting card', 'create qr code for contact details', 'digital business card qr code'],
  },
  {
    ...qr,
    slug: 'business-qr-code-generator',
    no: 56,
    preset: { type: 'business' },
    name: 'Business QR Code Generator',
    short: 'QR codes for shops, restaurants and small businesses',
    title: 'Business QR Code Generator – Shops & Small Business',
    description: 'QR codes for your business: contact card, UPI payments, WhatsApp orders, Google reviews, WiFi and menus. Add your logo and brand colours. Free for commercial use.',
    h1: 'QR codes for your business',
    intro:
      'One shop counter can do a lot with a few QR codes: take payments, get WhatsApp orders, collect Google reviews and share the WiFi. This page starts with a business contact card, which saves your shop name, phone, email, website, address and opening hours in one scan; switch the type to make the others.',
    steps: ['Fill in your business name and at least one way to reach you.', 'Add your logo and brand colours.', 'Download as PDF to print, or SVG for your designer.'],
    sections: [
      {
        h2: 'The QR codes every small business can use',
        table: {
          head: ['Code', 'What it does', 'Where to put it'],
          rows: [
            ['Business contact', 'Saves your shop to the customer’s contacts', 'Visiting cards, bills, delivery bags'],
            ['[UPI payment](/upi-qr-code-generator)', 'Customer pays you directly', 'Counter, invoices'],
            ['[WhatsApp](/whatsapp-qr-code-generator)', 'Opens a chat for orders', 'Posters, packaging, shop board'],
            ['[Google review](/google-review-qr-code-generator)', 'Opens your review box', 'Counter, table, receipt'],
            ['[WiFi](/wifi-qr-code-generator)', 'Joins your guest WiFi', 'Waiting area, tables'],
            ['[Location](/google-maps-qr-code-generator)', 'Directions to your shop', 'Flyers, ads, invitations'],
            ['[Menu or catalogue](/menu-qr-code-generator)', 'Opens your menu or price list', 'Tables, window, flyers'],
          ],
        },
      },
      {
        h2: 'Making codes look like your brand',
        body: [
          'Use the same logo and colours on all your codes so customers recognise them, and label each one: “Scan to pay”, “Scan for menu”, “Review us on Google”. A code with no label gets far fewer scans. The batch maker at the bottom of the generator creates many codes in one go, for example a code per product or per table, in one printable PDF.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I use these QR codes commercially?', a: 'Yes. There is no fee, licence or attribution needed for business use.' },
      { q: 'What is the best QR code for a shop?', a: 'Most shops need three: a UPI code for payments, a WhatsApp code for orders and a Google review code. Make all three with the same design.' },
      { q: 'Can I print them in bulk?', a: 'Yes. Download a PDF or SVG and any printer can produce stickers, standees or table tents.' },
    ],
    related: ['qr-code-generator', 'upi-qr-code-generator', 'google-review-qr-code-generator', 'qr-code-generator-with-logo'],
    keywords: ['business qr code generator', 'qr code generator for business', 'qr code for small business', 'qr code generator for shop', 'qr code for restaurant', 'qr code for marketing', 'professional qr code maker'],
  },
  {
    ...qr,
    slug: 'google-maps-qr-code-generator',
    no: 57,
    preset: { type: 'location' },
    name: 'Google Maps QR Code Generator',
    short: 'A QR code that opens directions to your place',
    title: 'Google Maps QR Code Generator – Location QR Code',
    description: 'Create a location QR code that opens Google Maps with directions to your shop, office, venue or home. Use an address, a Maps link or coordinates. Free.',
    h1: 'Location QR code for Google Maps',
    intro:
      'Help people find you. A location QR code opens Google Maps (or Apple Maps on an iPhone without Google Maps) pointing at your place, ready for directions. Enter an address, paste a Google Maps share link, or give exact coordinates.',
    steps: ['Type the address or place name, paste a Maps link, or enter latitude and longitude.', 'Download the code.', 'Scan it once to check it lands on the right spot.'],
    sections: [
      {
        h2: 'Which way to enter the location',
        list: [
          'Business listed on Google: paste your Google Maps share link (Share › Copy link). It opens your listing with photos, reviews and opening hours.',
          'Exact spot: for a gate, a building entrance or a place without an address, long-press it in Google Maps to see its coordinates and enter them.',
          'Address or landmark: quick and fine for well-known places; check that the search lands on the right result.',
        ],
      },
      {
        h2: 'Great for',
        list: [
          'Wedding and event invitations: guests get directions to the venue without calling.',
          'Flyers and ads: “Scan for directions” next to your shop address.',
          'Delivery and visitors: on the gate or in your WhatsApp profile, for hard-to-find addresses.',
          'Real estate: on a site board to the exact plot or sample flat.',
        ],
      },
    ],
    faqs: [
      { q: 'Does the location QR code work on iPhone?', a: 'Yes. It opens Google Maps if installed, otherwise the location opens in the browser with a button for Apple Maps.' },
      { q: 'How do I get coordinates?', a: 'In Google Maps, long-press the spot; the latitude and longitude appear at the top. Copy them into the two boxes.' },
      { q: 'Can I add an event with the location?', a: 'Yes: choose the Event type to make a calendar entry with the venue, date and time.' },
    ],
    related: ['qr-code-generator', 'business-qr-code-generator', 'google-review-qr-code-generator', 'url-qr-code-generator'],
    keywords: ['google maps qr code generator', 'location qr code generator', 'create qr code for google maps location', 'qr code for location sharing', 'qr code for address', 'qr code for directions'],
  },
  {
    ...qr,
    slug: 'instagram-qr-code-generator',
    no: 58,
    preset: { type: 'instagram' },
    name: 'Instagram QR Code Generator',
    short: 'Get followers from posters, packaging and shop windows',
    title: 'Instagram QR Code Generator – Profile QR with Logo',
    description: 'Make an Instagram QR code that opens your profile, ready to follow. Add your logo and brand colours, and download in HD for print or stories. Free, no login.',
    h1: 'Instagram QR code for your profile',
    intro:
      'Turn people who see your shop, product or poster into followers. Type your Instagram username and get a QR code that opens your profile in the Instagram app. Unlike Instagram’s own QR, you can add your logo, use any colours and download it in high resolution for print.',
    steps: ['Type your username (with or without @), or paste a profile or post link.', 'Add your logo and colours.', 'Download PNG for stories and posts, or SVG or PDF to print.'],
    sections: [
      {
        h2: 'Where Instagram QR codes bring followers',
        list: [
          'Packaging and thank-you cards: “Follow us for new designs”.',
          'Shop windows and counters: customers follow while they wait.',
          'Events and stalls: on the banner, much easier than spelling out a handle.',
          'Business cards: next to your vCard code or instead of it, for creators.',
        ],
      },
      {
        h2: 'Profile, post or reel',
        body: [
          'A username opens your profile. To send people to a particular post, reel or highlight, open it in Instagram, tap Share › Copy link and paste the link instead. For other networks, choose Social media in the generator for Facebook, LinkedIn, X and Telegram, or see the [YouTube QR code](/youtube-qr-code-generator) page.',
        ],
      },
    ],
    faqs: [
      { q: 'Do people need to be logged in to Instagram?', a: 'If the Instagram app is installed, the profile opens in it. Otherwise it opens in the browser, where Instagram may ask them to log in to see more.' },
      { q: 'Does it work for business and creator accounts?', a: 'Yes, any public or private account. For a private account people can send a follow request.' },
      { q: 'What if I change my username?', a: 'The old code will stop finding you. Make a new code after changing your username.' },
    ],
    related: ['qr-code-generator', 'youtube-qr-code-generator', 'qr-code-generator-with-logo', 'whatsapp-qr-code-generator'],
    keywords: ['instagram qr code generator', 'qr code for instagram profile', 'instagram qr code', 'social media qr code generator', 'facebook qr code generator', 'linkedin qr code generator'],
  },
  {
    ...qr,
    slug: 'youtube-qr-code-generator',
    no: 59,
    preset: { type: 'youtube' },
    name: 'YouTube QR Code Generator',
    short: 'Open a channel or video with one scan',
    title: 'YouTube QR Code Generator – Channel or Video QR',
    description: 'Create a YouTube QR code for your channel or a specific video. Use it on books, packaging, classrooms and posters. Add a logo and download HD PNG, SVG or PDF.',
    h1: 'YouTube QR code for a channel or video',
    intro:
      'Link paper to video. A YouTube QR code opens your channel or one particular video in the YouTube app. Teachers put them in notes, brands on packaging for how-to videos, and creators on merchandise. Type your channel handle or paste any video link.',
    steps: ['Type your channel handle (like @yourchannel) or paste a video or Shorts link.', 'Optional: add a logo and colours.', 'Download and test the scan.'],
    sections: [
      {
        h2: 'Ideas',
        list: [
          'Product packaging: a code to the setup or recipe video.',
          'Study material: a code next to each topic that opens the explanation video.',
          'Restaurant and shop: a code to your brand film or reviews.',
          'Events: a code to the live stream or the highlights afterwards.',
        ],
      },
      {
        h2: 'Start a video at the right moment',
        body: [
          'To skip an intro, open the video on YouTube, click Share, tick “Start at” and copy that link. The QR code then opens the video at that time. Playlist links work too, which is handy for a course or a series.',
        ],
      },
    ],
    faqs: [
      { q: 'Does the code open the YouTube app?', a: 'Yes, on phones with YouTube installed. Otherwise it plays in the browser.' },
      { q: 'Can I link a Shorts video?', a: 'Yes, paste the Shorts link.' },
      { q: 'Can I link a playlist?', a: 'Yes, paste the playlist link from the Share button.' },
    ],
    related: ['qr-code-generator', 'instagram-qr-code-generator', 'url-qr-code-generator', 'qr-code-generator-with-logo'],
    keywords: ['youtube qr code generator', 'qr code for youtube video', 'youtube channel qr code', 'video qr code', 'qr code for youtube link'],
  },
  {
    ...qr,
    slug: 'google-review-qr-code-generator',
    no: 60,
    preset: { type: 'review' },
    name: 'Google Review QR Code Generator',
    short: 'Collect more Google reviews from happy customers',
    title: 'Google Review QR Code Generator – Get More Reviews',
    description: 'Make a QR code that opens your Google review box, so happy customers leave a review in seconds. Use your review link or Place ID. Free, with your logo.',
    h1: 'Google review QR code',
    intro:
      'Customers are happy to review you, but few will search for your business, find the listing and look for the review button. A Google review QR code takes them straight to the star rating box. Put it on the counter, the bill or the table and watch your reviews grow.',
    steps: ['Copy your review link from Google Business Profile (“Ask for reviews” or “Get more reviews”).', 'Paste it here, or paste your Place ID.', 'Download, print with a line like “Loved it? Review us on Google”.'],
    sections: [
      {
        h2: 'How to find your Google review link',
        list: [
          'On a phone: search your business name on Google, tap your profile, then “Ask for reviews” and copy the link.',
          'On a computer: open business.google.com, choose your business and click “Ask for reviews” (or “Get more reviews”).',
          'Place ID: if you know it (it starts with ChIJ), paste it and the review link is built for you.',
        ],
      },
      {
        h2: 'Asking for reviews the right way',
        body: [
          'Show the code at the moment people are happiest: when the food arrives, at checkout, or with the delivery. Ask everyone, not only people you expect to be happy: Google’s rules do not allow offering discounts or gifts in exchange for reviews, or asking only satisfied customers. Reply to reviews, good and bad; it shows the next customer that you care.',
        ],
      },
    ],
    faqs: [
      { q: 'Does the customer need a Google account?', a: 'Yes, Google requires one to post a review; most Android users are already signed in.' },
      { q: 'Can I see how many people scanned?', a: 'Not directly with a static code, but Google Business Profile shows your new reviews and profile views.' },
      { q: 'Is it allowed to put a review QR code in my shop?', a: 'Yes. Inviting reviews is fine; offering rewards for reviews is not.' },
    ],
    related: ['qr-code-generator', 'business-qr-code-generator', 'google-maps-qr-code-generator', 'menu-qr-code-generator'],
    keywords: ['google review qr code generator', 'qr code for google review', 'google review qr code', 'review qr code', 'google business review link qr'],
  },
  {
    ...qr,
    slug: 'pdf-qr-code-generator',
    no: 61,
    preset: { type: 'pdf' },
    name: 'PDF QR Code Generator',
    short: 'Share a PDF, brochure or document through a QR code',
    title: 'PDF QR Code Generator – QR Code for a PDF File',
    description: 'Make a QR code that opens a PDF: brochure, catalogue, price list, certificate or notes. Share the PDF from Google Drive or your website and paste the link. Free.',
    h1: 'QR code for a PDF file',
    intro:
      'A QR code cannot contain a whole PDF (it holds a few kilobytes at most), but it can open one in a scan. Put your PDF online, for example in Google Drive, Dropbox or on your website, paste its share link here, and anyone who scans the code can view or download it.',
    steps: ['Upload your PDF to Google Drive, Dropbox or your website.', 'Copy the share link (in Drive, set access to “Anyone with the link”).', 'Paste it here and download the QR code.'],
    sections: [
      {
        h2: 'Sharing a PDF from Google Drive',
        list: [
          'Upload: drag the PDF into drive.google.com.',
          'Share: right-click › Share › General access › “Anyone with the link” › Viewer.',
          'Copy link and paste it into the generator.',
          'Update later: in Drive, right-click › Manage versions › Upload new version. The link, and so the QR code, stays the same while the PDF changes.',
        ],
      },
      {
        h2: 'Make the PDF phone-friendly first',
        body: [
          'People will open it on a phone, often on mobile data, so keep it light: [Compress PDF](/compress-pdf) shrinks big brochures, and [Edit PDF](/pdf-editor) fixes a price or a phone number before you share. For a restaurant menu, see the [menu QR code](/menu-qr-code-generator) page.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I put the PDF itself inside the QR code?', a: 'No. A QR code holds at most about 3 KB, far less than a PDF. It links to the PDF instead.' },
      { q: 'Where do I host the PDF for free?', a: 'Google Drive, Dropbox and OneDrive all give free share links. Make sure the link is set so anyone can view it.' },
      { q: 'Can I change the PDF after printing the code?', a: 'Yes, if you replace the file behind the same link, for example with Google Drive’s “Manage versions”.' },
    ],
    related: ['qr-code-generator', 'menu-qr-code-generator', 'compress-pdf', 'url-qr-code-generator'],
    keywords: ['pdf qr code generator', 'qr code for pdf file', 'pdf to qr code', 'qr code for document', 'qr code for brochure', 'google drive qr code'],
  },
  {
    ...qr,
    slug: 'menu-qr-code-generator',
    no: 62,
    preset: { type: 'url' },
    name: 'Menu QR Code Generator',
    short: 'A digital menu QR code for restaurants and cafés',
    title: 'Menu QR Code Generator – Digital Menu for Restaurants',
    description: 'Make a QR code for your restaurant or café menu: link a PDF, Google Drive file or online menu. Add your logo and print table tents. Free, no subscription.',
    h1: 'QR code for your restaurant menu',
    intro:
      'A menu QR code on each table lets guests open your menu on their phone. You can link to a PDF of the menu, a Google Drive file, your website or a Zomato or Swiggy page. Unlike paid menu apps, there is no subscription and the code never expires.',
    steps: ['Put your menu online: a PDF in Google Drive, or a page on your website.', 'Paste its link, add your logo and colours.', 'Download the PDF and print table tents or stickers.'],
    sections: [
      {
        h2: 'Keep prices up to date without reprinting',
        body: [
          'Link the code to something you can update. With Google Drive, replace the menu PDF using “Manage versions” and the same link keeps working; with your own website, simply edit the menu page. Then the printed codes on your tables never need to change, even when prices do. Use [Edit PDF](/pdf-editor) to change a price in the menu PDF.',
        ],
      },
      {
        h2: 'Table setup that works',
        list: [
          'Label it: “Scan for menu” beside the code, in large letters.',
          'Size: at least 3 × 3 cm on table tents, bigger on walls.',
          'Several codes: next to the menu code, add [WiFi](/wifi-qr-code-generator), [UPI payment](/upi-qr-code-generator) and [Google review](/google-review-qr-code-generator) codes in the same design.',
          'Table numbers: make one code per table with the batch maker at the bottom of the generator if your ordering link includes the table number.',
          'Keep a few paper menus for guests without smartphones.',
        ],
      },
    ],
    faqs: [
      { q: 'Do I need a menu app?', a: 'No. A PDF in Google Drive or a page on your website is enough; the QR code just opens it.' },
      { q: 'Is there a monthly fee?', a: 'No. The code is static and free, and it never stops working.' },
      { q: 'Can I change the menu after printing the QR code?', a: 'Yes, as long as the link stays the same: replace the PDF behind it or edit the page.' },
    ],
    related: ['qr-code-generator', 'pdf-qr-code-generator', 'wifi-qr-code-generator', 'google-review-qr-code-generator'],
    keywords: ['menu qr code generator', 'qr code for restaurant menu', 'qr code generator for menu', 'digital menu qr code', 'qr code for cafe', 'qr code generator for restaurant', 'qr code for hotel'],
  },
];
