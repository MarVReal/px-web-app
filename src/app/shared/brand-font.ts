const FONT_URL = 'https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700;800&display=swap';

/** Loads Figtree for the public pages (landing and sign-in). The signed-in app keeps its system font. */
export function loadBrandFont(doc: Document) {
  if (doc.getElementById('px-brand-font')) return;
  const link = doc.createElement('link');
  link.id = 'px-brand-font';
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  doc.head.appendChild(link);
}
