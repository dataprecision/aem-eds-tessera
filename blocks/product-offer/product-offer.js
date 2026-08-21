/*
 * product-offer — three-part product row:
 *   [image column] [copy + primary CTA] [offer panel + secondary CTA]
 *
 * Conflict notes (resolved):
 *  - computedStyle gives the offer headline color rgb(13,13,13); the foundation token
 *    --dark-color (#282728) is used instead per the never-mint-palette rule.
 *  - visualSpec calls the offer line an "orange supporting link"; domSlice/behavior win on
 *    facts: it is NOT a link (no href, cursor:auto) — rendered here as plain animated text.
 */

import { createOptimizedPicture } from '../../scripts/aem.js';

const DESKTOP_MQ = '(min-width: 900px)';

const IMAGE_BREAKPOINTS = [
  { media: DESKTOP_MQ, width: '450' },
  { width: '750' },
];

/**
 * @shared-candidate flattenColumns — normalises the two EDS table shapes an author may produce
 * (one row × N cells, or N rows × one cell) into a flat column list; any multi-column block needs it.
 */
function flattenColumns(block) {
  const rows = [...block.children];
  const cells = rows.flatMap((row) => [...row.children]);
  return cells.length >= rows.length && cells.length > 0 ? cells : rows;
}

/**
 * @shared-candidate isExternalHref — origin-aware external-link test; drives the
 * new-tab + rel="noopener noreferrer" policy every link-bearing block repeats.
 */
function isExternalHref(href) {
  if (!href) return false;
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch (e) {
    return false;
  }
}

/* A column that carries an image and no copy is the product-image column. */
function isImageOnly(col) {
  return !!col.querySelector('picture, img') && col.textContent.trim() === '';
}

/* Re-run same-origin images through the EDS image pipeline (buildNote: re-optimize, keep contain sizing). */
function optimizeImage(col) {
  const img = col.querySelector('img');
  if (!img) return;
  if (isExternalHref(img.getAttribute('src'))) return;
  const optimized = createOptimizedPicture(img.src, img.alt || '', false, IMAGE_BREAKPOINTS);
  const current = img.closest('picture') || img;
  current.replaceWith(optimized);
}

/* Both CTAs are the same filled orange pill; the arrow is drawn in CSS, never inline SVG. */
function decorateCta(a) {
  a.classList.remove('button', 'primary', 'secondary');
  a.classList.add('product-offer-cta');
  const wrapper = a.closest('p');
  if (wrapper && wrapper.textContent.trim() === a.textContent.trim()) {
    wrapper.classList.remove('button-wrapper');
    wrapper.classList.add('product-offer-cta-wrapper');
  }
  if (isExternalHref(a.getAttribute('href')) || a.getAttribute('target') === '_blank') {
    // FIX per page-wide policy: external application journey opens in a new tab, safely.
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  } else if (a.getAttribute('target') === '') {
    // measured markup carried an empty target="" — same-tab, so drop the noise
    a.removeAttribute('target');
  }
}

/*
 * The blinking offer line: an author marks it with emphasis; when nothing is marked, the last
 * link-free paragraph of the offer column is used (matches the authored content model
 * headline / offer line / CTA). Never turned into a link — it reveals no terms.
 */
function decorateOfferLine(col) {
  const paragraphs = [...col.querySelectorAll('p')].filter((p) => !p.querySelector('a'));
  if (!paragraphs.length) return;
  const emphasised = paragraphs.filter((p) => {
    const em = p.querySelector('em');
    return em && em.textContent.trim() === p.textContent.trim();
  });
  const lines = emphasised.length ? emphasised : [paragraphs[paragraphs.length - 1]];
  lines.forEach((p) => {
    p.classList.add('product-offer-offer-line');
    const em = p.querySelector('em');
    if (em) em.replaceWith(...em.childNodes);
  });
}

export default function decorate(block) {
  const columns = flattenColumns(block);
  if (!columns.length) return;

  // Normalise to a single flex row whatever table shape the author used.
  const row = document.createElement('div');
  row.className = 'product-offer-row';
  block.textContent = '';
  columns.forEach((col) => {
    col.classList.add('product-offer-col');
    row.append(col);
  });
  block.append(row);

  const imageCol = columns.find(isImageOnly);
  if (imageCol) {
    imageCol.classList.add('product-offer-img-col');
    optimizeImage(imageCol);
  }

  const textCols = columns.filter((col) => col !== imageCol);
  const [contentCol, ...offerCols] = textCols;
  if (contentCol) contentCol.classList.add('product-offer-content-col');
  offerCols.forEach((col) => {
    col.classList.add('product-offer-offer-col');
    decorateOfferLine(col);
  });

  block.querySelectorAll('a[href]').forEach(decorateCta);
}
