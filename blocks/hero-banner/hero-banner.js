import { createOptimizedPicture } from '../../scripts/aem.js';

/*
 * hero-banner
 * Content model (one authored row, union of all three placements):
 *   [ desktop image | mobile image | optional overlay copy ]
 * Variants: `overlay-right` (anchored copy box), `swap-767` (art-direction cutoff
 * moves from 650px to 767px), `shell-light` (muted shell), `eager` / `lazy`
 * (explicit override of the automatic first-instance-is-eager rule).
 *
 * The desktop/mobile pair is swapped by CSS media query only — no DOM mutation,
 * no resize listener — so the DOM is byte-identical at every breakpoint
 * (source behaviour is CSS-only too, measured on all three instances).
 */

/* default art-direction cutoff; `swap-767` instances (product showcase) use 767px.
 * Conflict resolved: the shared spec's @media block says max-width:650px, but the
 * b5-product-showcase measurement swaps between 768px and 390px — computedStyle wins
 * per instance, so the cutoff is class-selected rather than hardcoded. */
const DEFAULT_SWAP_WIDTH = 650;
const WIDE_SWAP_WIDTH = 767;

const MOBILE_BREAKPOINTS = [{ width: '750' }];

/**
 * resolves the art-direction cutoff for this instance
 * @param {Element} block The block element
 * @returns {number} cutoff width in px, matching the CSS media query
 */
function getSwapWidth(block) {
  return block.classList.contains('swap-767') ? WIDE_SWAP_WIDTH : DEFAULT_SWAP_WIDTH;
}

/**
 * desktop srcset descriptors; the trailing max-width entry keeps the (hidden)
 * desktop artwork cheap below the cutoff instead of shipping the 1200w fallback
 * @param {number} swapWidth art-direction cutoff in px
 * @returns {Array} breakpoint descriptors for createOptimizedPicture
 */
function desktopBreakpoints(swapWidth) {
  return [
    { media: '(min-width: 1200px)', width: '2000' },
    { media: '(min-width: 900px)', width: '1600' },
    { media: `(max-width: ${swapWidth}px)`, width: '750' },
    { width: '1200' },
  ];
}

/**
 * decides whether this instance is the LCP candidate
 * only the first hero-banner in document order loads eagerly; mid-page
 * placements stay natively lazy with no fetchpriority hint
 * @param {Element} block The block element
 * @returns {boolean} true when the desktop artwork should load eagerly
 */
function isEagerInstance(block) {
  if (block.classList.contains('lazy')) return false;
  if (block.classList.contains('eager')) return true;
  return document.querySelector('.hero-banner') === block;
}

/**
 * builds an optimized <picture> from an authored image cell
 * @param {Element} cell authored cell containing an <img>
 * @param {string} className role class applied to the picture
 * @param {boolean} eager load eagerly (only the first instance's desktop artwork)
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
  const eager = isEagerInstance(block);
  const swapWidth = getSwapWidth(block);

  const cells = [...block.children].flatMap((row) => [...row.children]);
  const imageCells = cells.filter((cell) => cell.querySelector('img'));
  const copyCell = cells.find((cell) => !cell.querySelector('img') && cell.textContent.trim());

  const [desktopCell, mobileCell] = imageCells;
  const media = document.createElement('div');
  media.className = 'hero-banner-media';

  const desktop = buildPicture(
    desktopCell,
    'hero-banner-desktop',
    eager,
    desktopBreakpoints(swapWidth),
  );
  // the alternate crop is never the LCP candidate on the viewport that loads it first,
  // so it always stays lazy — keeps the eager instance from double-downloading
  const mobile = buildPicture(mobileCell, 'hero-banner-mobile', false, MOBILE_BREAKPOINTS);
  if (desktop) media.append(desktop);
  if (mobile) media.append(mobile);

  // single-image authoring degrades gracefully: the one picture serves both breakpoints
  if (desktop && !mobile) desktop.classList.add('hero-banner-single');
  if (mobile && !desktop) mobile.classList.add('hero-banner-single');

  const content = [media];

  // copy is optional: only the promo placement authors a third cell; the hero and
  // showcase placements omit it and must not render an empty copy box
  if (copyCell) {
    const copy = document.createElement('div');
    copy.className = 'hero-banner-copy';
    copy.append(...copyCell.childNodes);
    content.push(copy);
  }

  block.textContent = '';
  block.append(...content);
}
