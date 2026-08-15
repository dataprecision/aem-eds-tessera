import { createOptimizedPicture } from '../../scripts/aem.js';

/*
 * hero-banner
 * Content model (single authored row):
 *   [ desktop image | mobile image | optional overlay copy ]
 * Variants: `overlay-right` (anchored copy box), `shell-light` (muted shell).
 * The desktop/mobile pair is swapped by CSS media query at 650px only —
 * no DOM mutation, no resize listener (source behaviour is CSS-only too).
 */

const DESKTOP_BREAKPOINTS = [
  { media: '(min-width: 1200px)', width: '2000' },
  { media: '(min-width: 900px)', width: '1600' },
  { width: '1200' },
];

const MOBILE_BREAKPOINTS = [{ width: '750' }];

/**
 * builds an optimized <picture> from an authored image cell
 * @param {Element} cell authored cell containing an <img>
 * @param {string} className role class applied to the picture
 * @param {boolean} eager load eagerly (desktop artwork is the LCP candidate)
 * @param {Array} breakpoints srcset descriptors
 * @returns {Element|null} the decorated picture
 */
function buildPicture(cell, className, eager, breakpoints) {
  const img = cell?.querySelector('img');
  if (!img) return null;
  const alt = (img.getAttribute('alt') || '').trim();
  const picture = createOptimizedPicture(img.src, alt, eager, breakpoints);
  picture.classList.add(className);
  const optimized = picture.querySelector('img');
  if (optimized) {
    optimized.classList.add('hero-banner-image');
    if (eager) optimized.setAttribute('fetchpriority', 'high');
    const title = img.getAttribute('title');
    if (title) optimized.setAttribute('title', title);
  }
  return picture;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const cells = [...block.children].flatMap((row) => [...row.children]);
  const imageCells = cells.filter((cell) => cell.querySelector('img'));
  const copyCell = cells.find((cell) => !cell.querySelector('img') && cell.textContent.trim());

  const [desktopCell, mobileCell] = imageCells;
  const media = document.createElement('div');
  media.className = 'hero-banner-media';

  const desktop = buildPicture(desktopCell, 'hero-banner-desktop', true, DESKTOP_BREAKPOINTS);
  const mobile = buildPicture(mobileCell, 'hero-banner-mobile', false, MOBILE_BREAKPOINTS);
  if (desktop) media.append(desktop);
  if (mobile) media.append(mobile);

  // single-image authoring degrades gracefully: the one picture serves both breakpoints
  if (desktop && !mobile) desktop.classList.add('hero-banner-single');
  if (mobile && !desktop) mobile.classList.add('hero-banner-single');

  const content = [media];

  if (copyCell) {
    const copy = document.createElement('div');
    copy.className = 'hero-banner-copy';
    copy.append(...copyCell.childNodes);
    content.push(copy);
  }

  block.textContent = '';
  block.append(...content);
}
