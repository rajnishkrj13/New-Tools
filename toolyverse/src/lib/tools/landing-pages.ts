import type { Tool } from './registry';

/**
 * Pages for the exact things people type into a search box ("compress image to 20 kb",
 * "png to jpg", "passport size photo"). Each opens an existing tool already set up for that
 * job (Tool.preset) and carries help written for that job, so it answers the search on its
 * own instead of repeating the general tool page. The admin can switch each one off.
 */

const UPDATED = '2026-11-17';
const imageLimits = { publicMb: 15, memberMb: 50 };
const compress = { category: 'image', opens: 'compress-image', limits: imageLimits, updated: UPDATED } as const;
const convert = { category: 'image', opens: 'convert-image', limits: imageLimits, updated: UPDATED } as const;

export const LANDING_PAGES: Tool[] = [
  // ---- Compress to a size ------------------------------------------------------------------------
  {
    ...compress,
    slug: 'compress-image-to-20kb',
    no: 33,
    preset: { kb: '20' },
    name: 'Compress Image to 20 KB',
    short: 'Shrink a photo or signature to under 20 KB',
    title: 'Compress Image to 20 KB Online – Photo & Signature',
    description: 'Reduce a JPG photo or signature to 20 KB or less for online application forms. Set the size, preview it and download. Free, no upload.',
    h1: 'Compress an image to 20 KB',
    intro:
      'Many online application forms accept a signature, and sometimes a photo, only when it is under 20 KB. Choose your image and the tool finds the best quality that still fits in 20 KB, making the picture smaller in pixels only if it has to.',
    steps: ['Choose the photo or the scanned signature.', 'The target is already set to 20 KB; change it if your form asks for a different limit.', 'Check the preview and the final size, then download.'],
    sections: [
      {
        h2: 'Getting a clear 20 KB signature',
        list: [
          'Start from a sharp image: sign on plain white paper with a dark pen and photograph it in daylight, without a shadow across it.',
          'Crop tightly: an empty margin costs bytes. Use [Crop Image](/crop-image) so the signature fills the picture.',
          'Pixel size: if the form gives dimensions (for example 140 × 60 pixels), set them first in [Resize Image](/resize-image), then compress.',
          'JPG, not PNG: almost every form wants JPG, and a JPG signature fits in 20 KB easily.',
        ],
      },
      {
        h2: 'What 20 KB is enough for',
        body: [
          'At 20 KB a signature stays crisp and a passport-style photo of about 200 × 230 pixels keeps faces clear. A full-size phone photo cannot be squeezed that far without becoming blurry, so the tool reduces its pixels too, the same way the form would otherwise reject it. If your form allows up to 50 KB for the photo, use [Compress Image to 50 KB](/compress-image-to-50kb) for a sharper result.',
        ],
      },
    ],
    faqs: [
      { q: 'Will the image be exactly 20 KB?', a: 'It will be 20 KB or a little under: forms reject files that are even one byte too big, so the tool always stays below the limit.' },
      { q: 'My form says 10 to 20 KB. What if it comes out smaller than 10 KB?', a: 'That happens with very simple images such as a signature on white. Raise the quality in the "By quality" mode until the size is between the two limits.' },
      { q: 'Is my signature uploaded anywhere?', a: 'No. The image is compressed inside your browser and saved straight to your device.' },
    ],
    related: ['compress-image-to-50kb', 'crop-image', 'resize-image', 'passport-size-photo'],
    keywords: ['compress image to 20kb', 'reduce photo size to 20kb', 'signature 20kb', 'image 20 kb online', 'resize signature to 20kb'],
  },
  {
    ...compress,
    slug: 'compress-image-to-50kb',
    no: 34,
    preset: { kb: '50' },
    name: 'Compress Image to 50 KB',
    short: 'Shrink a photo to under 50 KB for online forms',
    title: 'Compress Image to 50 KB Online – JPG Photo for Forms',
    description: 'Reduce a JPG or PNG photo to 50 KB or less for exam, job and scholarship forms. Best quality that fits, with a preview. Free and private.',
    h1: 'Compress an image to 50 KB',
    intro:
      '50 KB is the most common limit for the photograph on Indian recruitment, admission and scholarship portals. Choose your photo and the tool finds the highest quality that still fits under 50 KB, so your face stays sharp.',
    steps: ['Choose your photo (JPG, PNG or WebP).', 'The target is already 50 KB; change it if your form says otherwise.', 'Check the preview, then download the JPG.'],
    sections: [
      {
        h2: 'Before you compress: what forms usually check',
        list: [
          'File type: nearly always JPG or JPEG. A PNG is converted to JPG here automatically.',
          'Size range: often a minimum as well as a maximum, such as 20 to 50 KB. Stay inside both.',
          'Dimensions: some forms also give pixels (for example 200 × 230). Set those in [Resize Image](/resize-image) first.',
          'Background and framing: a plain light background and the face filling most of the frame; [Crop Image](/crop-image) helps.',
        ],
        body: ['Every portal sets its own numbers, so read the notification and use the values it gives.'],
      },
      {
        h2: 'Why your photo is too big in the first place',
        body: [
          'A phone camera saves photos of 2 to 6 MB, which is 40 to 120 times the 50 KB limit. Most of that is detail a form photo does not need: the tool lowers the JPG quality step by step and, if that is not enough, reduces the pixel size until the file fits. Because it searches for the best quality that fits, the result is usually much sharper than saving at a fixed low quality.',
        ],
      },
    ],
    faqs: [
      { q: 'Will the photo look blurry at 50 KB?', a: 'Not for a form photo. 50 KB is enough for a clear passport-style picture several hundred pixels wide; check the preview before downloading.' },
      { q: 'Can I compress several photos to 50 KB at once?', a: 'One at a time, so you can check each preview. It takes a few seconds per photo.' },
      { q: 'Does it work on my phone?', a: 'Yes. Pick the photo from your gallery or camera; the compressed copy is saved to your downloads.' },
    ],
    related: ['compress-image-to-20kb', 'compress-image-to-100kb', 'resize-image', 'passport-size-photo'],
    keywords: ['compress image to 50kb', 'reduce photo size to 50kb', 'photo 50kb', 'jpg to 50kb', 'image size reduce 50kb'],
  },
  {
    ...compress,
    slug: 'compress-image-to-100kb',
    no: 35,
    preset: { kb: '100' },
    name: 'Compress Image to 100 KB',
    short: 'Shrink a JPG or PNG to under 100 KB',
    title: 'Compress Image to 100 KB Online – Reduce JPG Size',
    description: 'Make a photo or scanned document 100 KB or smaller for uploads, email and websites. Keeps the best quality that fits. Free, nothing uploaded.',
    h1: 'Compress an image to 100 KB',
    intro:
      'A 100 KB limit is common for scanned certificates, ID cards and caste or income certificates on application portals, and it is a good size for pictures on a website. Choose the image and the tool finds the best quality that fits in 100 KB.',
    steps: ['Choose the photo or the scanned page.', 'The target is set to 100 KB; change it if you need another limit.', 'Check that the text is still readable in the preview, then download.'],
    sections: [
      {
        h2: 'Scanned documents under 100 KB that stay readable',
        list: [
          'Crop the edges: the table or bed around the paper wastes bytes. [Crop Image](/crop-image) first.',
          'Keep it upright: turn a sideways photo with Rotate in [Crop Image](/crop-image), and retake a page shot at an angle; slanted text blurs first when compressed.',
          'A4 page: about 1,000 pixels wide is enough to read printed text and fits 100 KB easily.',
          'Several pages: if the portal wants one file, combine them with [JPG to PDF](/jpg-to-pdf) instead.',
        ],
      },
      {
        h2: '100 KB for websites and email',
        body: [
          'Large photos slow web pages down, which visitors and search engines both notice. Around 100 KB per picture is a sensible budget for a blog or product photo. For even smaller files with the same look, choose WebP as the format, or use [Convert Image](/convert-image) to make WebP versions of several images at once.',
        ],
      },
    ],
    faqs: [
      { q: 'Can it compress a PDF to 100 KB?', a: 'This page is for images. For PDFs use [Compress PDF](/compress-pdf), which reduces the photos inside the PDF.' },
      { q: 'Why is my 80 KB image not made smaller?', a: 'It already fits. The tool only compresses until the file is under the target, so the quality stays as high as possible.' },
      { q: 'Is the picture uploaded?', a: 'No. It is compressed in your browser and never sent to our server.' },
    ],
    related: ['compress-image-to-50kb', 'compress-image-to-200kb', 'jpg-to-pdf', 'compress-pdf'],
    keywords: ['compress image to 100kb', 'reduce image size to 100kb', 'jpg to 100kb', 'photo size 100kb', 'compress jpeg to 100kb'],
  },
  {
    ...compress,
    slug: 'compress-image-to-200kb',
    no: 36,
    preset: { kb: '200' },
    name: 'Compress Image to 200 KB',
    short: 'Shrink a large photo to under 200 KB',
    title: 'Compress Image to 200 KB Online – Free Photo Compressor',
    description: 'Reduce a large JPG, PNG or WebP photo to 200 KB or less while keeping it sharp. For uploads, email and websites. Free and private.',
    h1: 'Compress an image to 200 KB',
    intro:
      'A 200 KB limit leaves room for a detailed photo: good for portals that accept larger scans, for listings on shopping and property sites, and for sending pictures quickly. Choose the image and the tool finds the best quality that fits.',
    steps: ['Choose the image.', 'The target is set to 200 KB; change it if you need another limit.', 'Compare before and after in the preview, then download.'],
    sections: [
      {
        h2: 'When 200 KB is the right size',
        list: [
          'Document scans with small print: more pixels keep fine text such as marks lists and stamps readable.',
          'Product and property photos: enough detail to zoom in, small enough to load fast on mobile data.',
          'Email and chat: a set of 200 KB photos sends in seconds where originals would stall.',
        ],
      },
      {
        h2: 'Keeping the most detail',
        body: [
          'The compressor lowers JPG quality in small steps and checks the size each time, so it stops at the highest quality that fits. Only if quality alone cannot reach 200 KB does it reduce the pixel size, and it tells you the final dimensions. Leave "Also reduce dimensions" on for photos straight from a phone camera.',
        ],
      },
    ],
    faqs: [
      { q: 'What is the difference from the 100 KB and 50 KB pages?', a: 'Only the starting target. You can type any size on any of these pages; they are set up for the most common limits.' },
      { q: 'Should I choose JPG or WebP?', a: 'JPG for forms and anything you send to other people. WebP for your own website: it is smaller at the same quality.' },
    ],
    related: ['compress-image-to-100kb', 'compress-image', 'resize-image', 'convert-image'],
    keywords: ['compress image to 200kb', 'reduce image size to 200kb', 'photo compressor 200kb', 'jpg 200kb'],
  },

  // ---- Photos for forms ---------------------------------------------------------------------------
  {
    category: 'image',
    opens: 'crop-image',
    limits: imageLimits,
    updated: UPDATED,
    slug: 'passport-size-photo',
    no: 37,
    preset: { ratio: 'passport' },
    name: 'Passport Size Photo',
    short: 'Crop any photo to passport shape (35 × 45 mm)',
    title: 'Passport Size Photo Maker Online – 35×45 mm Crop',
    description: 'Crop a photo to the Indian passport-size shape, 35 × 45 mm, then resize and compress it for online forms. Free, and the photo stays on your device.',
    h1: 'Make a passport size photo',
    intro:
      'The frame opens already locked to the 35 × 45 mm shape used for Indian passport-size photos. Drag it so your face and the top of your shoulders fill it, then download. For online forms, resize and compress the result to the pixels and KB the form asks for.',
    steps: ['Choose a photo taken against a plain, light wall.', 'Move and resize the frame (it keeps the 35 × 45 shape) so the face is centred.', 'Download, then resize or compress it if your form gives pixels or a KB limit.'],
    sections: [
      {
        h2: 'Taking a photo that passes',
        list: [
          'Background: plain white or off-white, without shadows. Stand a little away from the wall.',
          'Light: face the window or a soft light; avoid a bright light behind you.',
          'Framing: look straight at the camera, face fully visible, eyes open, no cap or dark glasses.',
          'Camera height: hold the phone at eye level, about an arm’s length away, so the face is not distorted.',
        ],
      },
      {
        h2: 'From cropped photo to form upload',
        body: [
          'The crop keeps the shape; the form decides the size. If it asks for pixels such as 200 × 230 or 413 × 531, set them in [Resize Image](/resize-image). If it gives a KB limit, finish with [Compress Image to 50 KB](/compress-image-to-50kb) or [to 20 KB](/compress-image-to-20kb). For printing at a studio or at home, 35 × 45 mm at 300 dpi is 413 × 531 pixels; you can type the size in centimetres (3.5 × 4.5) in Resize Image.',
        ],
      },
    ],
    faqs: [
      { q: 'What size is a passport-size photo in India?', a: '35 × 45 mm (3.5 × 4.5 cm). Online forms often ask for a different pixel size and a KB limit, so always check the form.' },
      { q: 'Can I change the background colour to white?', a: 'Not with this tool. Take the photo in front of a plain light wall; that works better than editing the background afterwards.' },
      { q: 'Does cropping lower the quality?', a: 'No. The part you keep is saved at its full resolution.' },
    ],
    related: ['resize-image', 'compress-image-to-50kb', 'compress-image-to-20kb', 'crop-image'],
    keywords: ['passport size photo', 'passport size photo maker', 'passport photo online', 'crop photo to passport size', '35x45 photo'],
  },

  // ---- Change the format --------------------------------------------------------------------------
  {
    ...convert,
    slug: 'png-to-jpg',
    no: 38,
    preset: { to: 'jpg' },
    name: 'PNG to JPG',
    short: 'Convert PNG images to JPG, several at once',
    title: 'PNG to JPG Converter Online – Free, Batch, No Upload',
    description: 'Convert PNG images and screenshots to JPG, one or many at once. Transparent areas become white or a colour you pick. Free, nothing uploaded.',
    h1: 'Convert PNG to JPG',
    intro:
      'Forms and many websites accept only JPG, and a PNG photo can be five times larger than the same picture as JPG. Add your PNG files, keep JPG selected and download; several files come back together in one ZIP.',
    steps: ['Add one or more PNG images.', 'JPG is already selected; set the quality and the background colour for transparent areas.', 'Download the JPG, or the ZIP for several.'],
    sections: [
      {
        h2: 'What changes when a PNG becomes a JPG',
        list: [
          'Transparency: JPG cannot be see-through, so transparent parts are filled with the background colour (white unless you choose another).',
          'File size: photos get much smaller. Screenshots with flat colours shrink less, and text in them can show faint marks at low quality; keep quality at 90 or above.',
          'Dimensions: unchanged. To change the pixels too, use [Resize Image](/resize-image).',
        ],
      },
      {
        h2: 'Need it under a size limit?',
        body: ['After converting, use [Compress Image](/compress-image) to bring the JPG under a limit such as [50 KB](/compress-image-to-50kb). Compress Image also accepts PNG directly and saves the result as JPG, so for a single photo you can go straight there.'],
      },
    ],
    faqs: [
      { q: 'Can I convert many PNGs at once?', a: 'Yes. Add as many as you like; they are converted in your browser and downloaded together as a ZIP.' },
      { q: 'Will my logo keep its transparent background?', a: 'Not as JPG. Keep logos as PNG, or convert to WebP, which supports transparency.' },
    ],
    related: ['jpg-to-png', 'webp-to-jpg', 'compress-image', 'png-to-pdf'],
    keywords: ['png to jpg', 'convert png to jpg', 'png to jpeg', 'png to jpg converter', 'screenshot to jpg'],
  },
  {
    ...convert,
    slug: 'jpg-to-png',
    no: 39,
    preset: { to: 'png' },
    name: 'JPG to PNG',
    short: 'Convert JPG photos to PNG, several at once',
    title: 'JPG to PNG Converter Online – Free, Batch, No Upload',
    description: 'Convert JPG or JPEG images to PNG, one or many at once, without losing any more quality. Free online converter; images stay on your device.',
    h1: 'Convert JPG to PNG',
    intro:
      'PNG keeps every pixel exactly as it is, so further edits do not add more blur, and some apps and print shops ask for PNG. Add your JPG files, keep PNG selected and download.',
    steps: ['Add one or more JPG or JPEG images.', 'PNG is already selected.', 'Download the PNG, or the ZIP for several.'],
    sections: [
      {
        h2: 'When to use PNG, and when not to',
        list: [
          'Use PNG: for images you will edit again, for screenshots and diagrams, and when an app or printer asks for PNG.',
          'Keep JPG: for photos you send or upload. A photo saved as PNG is several times larger and looks the same.',
          'Transparency: converting does not remove the background of a photo; the PNG has the same picture, now in a lossless format.',
        ],
      },
      {
        h2: 'Does converting improve the quality?',
        body: ['No converter can bring back detail that JPG compression already removed. What PNG does is stop any further loss: every later save keeps the picture exactly as it is now.'],
      },
    ],
    faqs: [
      { q: 'Why is the PNG so much bigger than the JPG?', a: 'PNG stores every pixel without loss, while JPG throws away detail you hardly notice. For photos that makes PNG files 3 to 10 times larger.' },
      { q: 'Can I convert HEIC iPhone photos?', a: 'Share them from the iPhone as JPG first (Settings → Camera → Formats → Most Compatible), then convert.' },
    ],
    related: ['png-to-jpg', 'convert-image', 'resize-image', 'crop-image'],
    keywords: ['jpg to png', 'convert jpg to png', 'jpeg to png', 'jpg to png converter'],
  },
  {
    ...convert,
    slug: 'webp-to-jpg',
    no: 40,
    preset: { to: 'jpg' },
    name: 'WebP to JPG',
    short: 'Turn WebP downloads into JPG you can use anywhere',
    title: 'WebP to JPG Converter Online – Free, No Upload',
    description: 'Convert WebP images saved from websites into JPG that opens everywhere and uploads to any form. One or many at once. Free and private.',
    h1: 'Convert WebP to JPG',
    intro:
      'Images saved from many websites arrive as WebP, which some apps, older phones and upload forms do not accept. Add the WebP files, keep JPG selected and download pictures that open everywhere.',
    steps: ['Add one or more WebP images.', 'JPG is already selected; adjust the quality if you like.', 'Download the JPG, or the ZIP for several.'],
    sections: [
      {
        h2: 'Why so many images are WebP now',
        body: [
          'WebP files are about a quarter smaller than JPG at the same quality, so websites use them to load faster. Browsers show them without trouble, but Windows Photo Viewer, some editors and many government and job portals still expect JPG or PNG. Converting gives you a copy those can open.',
        ],
      },
      {
        h2: 'Other formats it reads',
        list: ['GIF: the first frame is converted.', 'BMP and AVIF: converted like WebP.', 'Transparent WebP: transparent parts are filled with white or a colour you pick, since JPG has no transparency; choose PNG to keep it.'],
      },
    ],
    faqs: [
      { q: 'Is a WebP to JPG conversion lossless?', a: 'Not exactly, since JPG is a lossy format, but at quality 90 the difference cannot be seen.' },
      { q: 'Can I convert JPG to WebP for my website?', a: 'Yes, on the [Convert Image](/convert-image) page choose WebP as the format.' },
    ],
    related: ['png-to-jpg', 'convert-image', 'compress-image', 'jpg-to-png'],
    keywords: ['webp to jpg', 'convert webp to jpg', 'webp to jpeg', 'webp converter'],
  },

  // ---- PDF and images --------------------------------------------------------------------------
  {
    category: 'pdf',
    opens: 'pdf-to-jpg',
    limits: { publicMb: 25, memberMb: 100 },
    updated: UPDATED,
    slug: 'pdf-to-png',
    no: 41,
    preset: { format: 'png' },
    name: 'PDF to PNG',
    short: 'Save each PDF page as a sharp PNG image',
    title: 'PDF to PNG Converter Online – Free, High Quality',
    description: 'Convert every page of a PDF into a PNG image at 96, 150 or 300 dpi. Sharp text and lines, several pages in one ZIP. Free; the PDF stays on your device.',
    h1: 'Convert PDF to PNG',
    intro:
      'PNG keeps text, tables and diagrams perfectly crisp, which makes it the better choice than JPG for pages you will put in slides, documents or a website. Open the PDF, keep PNG selected, choose the resolution and download.',
    steps: ['Open the PDF.', 'PNG is already selected; choose 96, 150 or 300 dpi.', 'Download the image, or a ZIP with one PNG per page.'],
    sections: [
      {
        h2: 'PNG or JPG for PDF pages?',
        list: [
          'PNG: text, forms, charts and line drawings. Edges stay sharp with no blur around the letters.',
          'JPG: scanned pages and photos, where a much smaller file matters more. Use [PDF to JPG](/pdf-to-jpg).',
          'Resolution: 150 dpi for screens and sharing, 300 dpi for printing or zooming in.',
        ],
      },
      {
        h2: 'Only some pages?',
        body: ['Take the pages you need out first with [Split PDF](/split-pdf), then convert that smaller PDF. To turn images back into a PDF later, use [PNG to PDF](/png-to-pdf).'],
      },
    ],
    faqs: [
      { q: 'Are password-protected PDFs supported?', a: 'If the PDF needs a password to open, unlock it in the [PDF Editor](/pdf-editor) first.' },
      { q: 'Is the PDF uploaded?', a: 'No. Pages are drawn as images inside your browser.' },
    ],
    related: ['pdf-to-jpg', 'png-to-pdf', 'split-pdf', 'compress-image'],
    keywords: ['pdf to png', 'convert pdf to png', 'pdf to png converter', 'pdf to png high quality'],
  },
  {
    category: 'pdf',
    opens: 'jpg-to-pdf',
    limits: { publicMb: 20, memberMb: 60 },
    updated: UPDATED,
    slug: 'png-to-pdf',
    no: 42,
    name: 'PNG to PDF',
    short: 'Turn PNG images and screenshots into one PDF',
    title: 'PNG to PDF Converter Online – Combine Images, Free',
    description: 'Convert PNG screenshots and images into one PDF, a page per image, in the order you choose. Also JPG and WebP. Free, no watermark, no upload.',
    h1: 'Convert PNG to PDF',
    intro:
      'Screenshots of a payment, chat or web page, scanned forms saved as PNG, or diagrams: add them, put them in order and get one PDF that is easy to send and print.',
    steps: ['Add your PNG images (JPG and WebP work too).', 'Drag them into the right order.', 'Create the PDF and download it.'],
    sections: [
      {
        h2: 'Good uses',
        list: [
          'Proof of payment: put several UPI or bank screenshots into one PDF for an expense claim.',
          'Forms filled on paper: photos or scans of each page become one document for upload.',
          'Notes and diagrams: keep a set of screenshots together, in order, as one file.',
        ],
      },
      {
        h2: 'Page size and quality',
        body: ['Each image gets its own page, at most A4 in size, and fills it without being stretched. Screenshots keep their sharp text because PNG pictures go into the PDF without any loss of quality. If the PDF is too big for an upload limit, run it through [Compress PDF](/compress-pdf).'],
      },
    ],
    faqs: [
      { q: 'Can I mix PNG and JPG in one PDF?', a: 'Yes. Add PNG, JPG and WebP images together in any order.' },
      { q: 'Is there a watermark?', a: 'No. The PDF contains only your images.' },
    ],
    related: ['jpg-to-pdf', 'merge-pdf', 'pdf-to-png', 'compress-pdf'],
    keywords: ['png to pdf', 'convert png to pdf', 'screenshot to pdf', 'image to pdf', 'png to pdf converter'],
  },
  // ---- Image to text -----------------------------------------------------------------------------
  {
    category: 'image',
    opens: 'image-to-text',
    limits: imageLimits,
    updated: '2026-11-18',
    slug: 'screenshot-to-text',
    no: 44,
    preset: { lang: 'eng' },
    name: 'Screenshot to Text',
    short: 'Copy the text out of any screenshot',
    title: 'Screenshot to Text – Copy Text from a Screenshot, Free',
    description: 'Paste a screenshot with Ctrl+V and copy the text in it: app messages, error codes, chats and web pages. Free OCR in your browser, no upload.',
    h1: 'Get the text out of a screenshot',
    intro:
      'Some text cannot be selected: an error message, a chat, a video frame, a page in an app. Take a screenshot, press Ctrl+V on this page, and the text appears ready to copy. Screenshots are sharp, so they are read almost perfectly, and nothing is uploaded.',
    steps: [
      'Take a screenshot: Windows key + Shift + S on Windows, Cmd + Shift + 4 on a Mac, or the usual buttons on a phone.',
      'Press Ctrl+V (Cmd+V on a Mac) on this page, or choose the screenshot file.',
      'Copy the text, or download it as a .txt file.',
    ],
    sections: [
      {
        h2: 'Why screenshots are read so accurately',
        body: [
          'A screenshot has perfectly straight, evenly lit text drawn by the computer itself, which is the easiest kind of picture for a text reader. Small screenshots are enlarged before reading, so even tiny interface text comes out right. If a screenshot has coloured text on a coloured background, keep “Improve faint text” on.',
        ],
      },
      {
        h2: 'Handy for',
        list: [
          'Error messages: copy the exact error to search for a fix or send to support.',
          'Chats and posts: keep a message as text instead of an image.',
          'Video frames and slides: copy the text from a paused video or a shared slide.',
          'Codes and numbers: tracking IDs, account numbers and references shown in apps. Check digits carefully before using them.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I paste several screenshots?', a: 'Yes. Paste them one after another; each is read in turn and all the text is collected in one box.' },
      { q: 'Does it work on a phone?', a: 'Yes. Choose the screenshot from your gallery with the button; pasting depends on your phone’s browser.' },
      { q: 'Is my screenshot uploaded?', a: 'No. It is read in your browser and never leaves your device.' },
    ],
    related: ['image-to-text', 'hindi-image-to-text', 'crop-image', 'compress-image'],
    keywords: ['screenshot to text', 'copy text from screenshot', 'extract text from screenshot', 'screenshot ocr', 'text from screenshot online'],
  },
  {
    category: 'image',
    opens: 'image-to-text',
    limits: imageLimits,
    updated: '2026-11-18',
    slug: 'hindi-image-to-text',
    no: 45,
    preset: { lang: 'hin' },
    lang: 'hi',
    name: 'Hindi Image to Text',
    short: 'फोटो या स्कैन से हिंदी टेक्स्ट निकालें',
    title: 'Hindi Image to Text – फोटो से हिंदी टेक्स्ट निकालें, Free',
    description: 'हिंदी फोटो, स्कैन या स्क्रीनशॉट से टेक्स्ट निकालें और कॉपी करें। हिंदी और अंग्रेज़ी दोनों पढ़े जाते हैं। मुफ़्त, बिना अपलोड, आपके ब्राउज़र में।',
    h1: 'फोटो से हिंदी टेक्स्ट निकालें',
    intro:
      'किसी किताब के पेज, नोटिस, अख़बार या स्कैन किए दस्तावेज़ की फोटो डालें और उसमें लिखा हिंदी टेक्स्ट तुरंत कॉपी करने लायक बन जाता है। मात्राएँ और संयुक्त अक्षर सही पढ़े जाते हैं, और जिन शब्दों पर शक हो वे फोटो पर चिन्हित दिखते हैं। आपकी फोटो कहीं अपलोड नहीं होती।',
    steps: [
      'भाषा में “Hindi” चुना हुआ है; अगर पेज पर अंग्रेज़ी भी है तो “English + Hindi” चुनें।',
      'फोटो चुनें, यहाँ छोड़ें, या स्क्रीनशॉट को Ctrl+V से पेस्ट करें।',
      'चिन्हित शब्दों को जाँचें, ज़रूरत हो तो सुधारें, फिर टेक्स्ट कॉपी करें या .txt फ़ाइल डाउनलोड करें।',
    ],
    sections: [
      {
        h2: 'सही टेक्स्ट पाने के लिए',
        list: [
          'सीधी फोटो: फ़ोन को पेज के बिल्कुल ऊपर रखें, अच्छी रोशनी में, बिना परछाईं के।',
          'सिर्फ़ टेक्स्ट वाला हिस्सा: फालतू किनारे काट दें; इसके लिए [Crop Image](/crop-image) इस्तेमाल करें।',
          'छपा हुआ टेक्स्ट: छपे या टाइप किए अक्षर सबसे अच्छे पढ़े जाते हैं; हाथ की लिखावट में गलतियाँ हो सकती हैं।',
          'नाम और अंक: नाम, तारीख और रकम ज़रूर जाँच लें।',
        ],
      },
      {
        h2: 'किन कामों में मदद करता है',
        body: [
          'किताब या नोट्स से टाइप किए बिना हिंदी टेक्स्ट निकालना, सरकारी नोटिस या आदेश की कॉपी को एडिट करने लायक बनाना, और व्हाट्सऐप पर आई हिंदी फोटो से संदेश कॉपी करना। स्कैन किए PDF के लिए [Edit Scanned PDF](/edit-scanned-pdf) देखें, और English में पूरी जानकारी के लिए [Image to Text](/image-to-text)।',
        ],
      },
    ],
    faqs: [
      { q: 'क्या यह मुफ़्त है?', a: 'हाँ, पूरी तरह मुफ़्त, बिना साइन-अप के और जितनी चाहें उतनी फोटो के लिए।' },
      { q: 'क्या हिंदी और अंग्रेज़ी एक साथ पढ़ सकते हैं?', a: 'हाँ, भाषा में “English + Hindi” चुनें। एक ही पेज पर दोनों भाषाएँ पढ़ी जाती हैं।' },
      { q: 'क्या मेरी फोटो अपलोड होती है?', a: 'नहीं। टेक्स्ट आपके ब्राउज़र में ही पढ़ा जाता है, फोटो आपके डिवाइस से बाहर नहीं जाती।' },
      { q: 'निकाला गया टेक्स्ट कहाँ इस्तेमाल कर सकते हैं?', a: 'Word, Google Docs, WhatsApp या कहीं भी पेस्ट करें। यह सामान्य यूनिकोड हिंदी टेक्स्ट है।' },
    ],
    related: ['image-to-text', 'hindi-pdf-editor', 'edit-scanned-pdf', 'screenshot-to-text'],
    keywords: ['hindi image to text', 'hindi ocr', 'photo se hindi text', 'हिंदी इमेज से टेक्स्ट', 'image to text hindi', 'hindi photo to text'],
    alternates: { 'en-IN': '/image-to-text' },
  },
];
