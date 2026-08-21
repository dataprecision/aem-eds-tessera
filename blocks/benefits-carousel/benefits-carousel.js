/*
 * benefits-carousel
 * ADOPTED from the AEM Block Collection `carousel` block: slide paging, the arrow
 * disabled/active bookkeeping and the aria-hidden + tabindex handling on off-screen
 * slides all come from that reference implementation.
 *
 * Adapted per packet:
 *  - fixed multi-item window instead of one-slide-per-view (measured: 264px item +
 *    20px gap = 284px step, 4 visible on desktop), track moved with translate3d
 *  - non-infinite: prev is disabled at index 0, next at the last page
 *  - no dots/pager, no autoplay (measured: track stays translate3d(0px, 0px, 0px) when idle)
 *  - trailing disclaimer row with an inline read-more/read-less toggle
 *
 * FIXes applied (buildNotes):
 *  - read-more rebuilt as a real <button aria-expanded> (source shipped an href-less <a>)
 *  - the dead .disclaimer_popup overlay is NOT ported
 *  - every target=_blank link gets rel="noopener noreferrer"
 *  - MITIGATION (migrated content): the imported document ships `src="about:error"` for
 *    every icon, which renders a broken-image glyph in flow (measured 105.28x28.80px
 *    where a 60x60 icon belongs). Unresolvable / failed icons are pruned so the item
 *    degrades to a text-only benefit instead of a broken image. This guard is inert
 *    once the assets are re-imported with real URLs — the real cure is content-side.
 * Replicate-as-is: benefit items stay non-interactive (no hover state, no click handler).
 *
 * Authored content model (rows, top to bottom):
 *  1. heading   : one cell — panel heading text
 *  2. item x N  : icon image | item title | item copy (copy may contain inline links)
 *  3. disclaimer: truncated copy | full copy | [more label] | [less label]
 * Item rows are the rows that carry an image; the first image-less row is the heading,
 * a later image-less row is the disclaimer. Authors may omit heading or disclaimer.
 */

import { decorateIcons } from '../../scripts/aem.js';

const FALLBACK_STEP = 284; // measured slide width 264px + 20px gap

/** @shared-candidate loadPlaceholders — optional-dependency wrapper around fetchPlaceholders so a block keeps working on projects that have no placeholders.js. */
async function loadPlaceholders() {
  try {
    const mod = await import('../../scripts/placeholders.js');
    return (await mod.fetchPlaceholders()) || {};
  } catch (e) {
    return {};
  }
}

/** @shared-candidate toggleExpandable — aria-expanded button driving a collapsed/expanded pair of regions with authored labels; any truncated-copy block needs the same mechanics. */
function toggleExpandable(button, collapsed, expanded, labels) {
  const isOpen = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!isOpen));
  button.textContent = isOpen ? labels.more : labels.less;
  if (collapsed) collapsed.hidden = !isOpen;
  if (expanded) expanded.hidden = isOpen;
}

/** @shared-candidate isUnresolvableSrc — migrated documents carry placeholder srcs (about:error, empty, javascript:) that can never paint; any block rendering authored media needs the same test. */
function isUnresolvableSrc(src) {
  if (!src) return true;
  return /^\s*(about:|javascript:)/i.test(src);
}

/**
 * @shared-candidate pruneBrokenMedia — drops images that cannot paint (placeholder scheme
 * now, load failure later) so authored media degrades to a text-only layout instead of a
 * broken-image glyph. Generic to any block that renders imported media.
 */
function pruneBrokenMedia(scope) {
  scope.querySelectorAll('img').forEach((img) => {
    const drop = () => {
      const item = img.closest('.benefits-carousel-item');
      const holder = img.closest('.benefits-carousel-item-icon');
      const media = img.closest('picture') || img;
      media.remove();
      if (holder && !holder.querySelector('img, picture') && !holder.textContent.trim()) {
        holder.remove();
      }
      if (item && !item.querySelector('img, picture')) {
        item.classList.add('benefits-carousel-item-no-icon');
      }
    };
    if (isUnresolvableSrc(img.getAttribute('src'))) {
      drop();
      return;
    }
    if (img.complete && img.naturalWidth === 0) {
      drop();
      return;
    }
    img.addEventListener('error', drop, { once: true });
  });
}

/** External links open in a new tab and always carry rel="noopener noreferrer" (buildNotes fix). */
function decorateExternalLinks(scope) {
  scope.querySelectorAll('a[href]').forEach((link) => {
    let external = false;
    try {
      external = new URL(link.href, window.location.href).host !== window.location.host;
    } catch (e) {
      external = false;
    }
    if (external || link.target === '_blank') {
      link.target = '_blank';
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/** Measured geometry of the current layout: one step = item width + gap. */
function getMetrics(block) {
  const items = [...block.querySelectorAll('.benefits-carousel-item')];
  const viewport = block.querySelector('.benefits-carousel-viewport');
  if (!items.length || !viewport) return { step: FALLBACK_STEP, visible: 1, total: 0 };
  const measured = items.length > 1
    ? items[1].offsetLeft - items[0].offsetLeft
    : items[0].offsetWidth;
  const step = measured > 0 ? measured : FALLBACK_STEP;
  const visible = Math.min(items.length, Math.max(1, Math.round(viewport.clientWidth / step)));
  return { step, visible, total: items.length };
}

function updateVisibility(block, index, visible) {
  const items = block.querySelectorAll('.benefits-carousel-item');
  items.forEach((item, idx) => {
    const inWindow = idx >= index && idx < index + visible;
    item.setAttribute('aria-hidden', String(!inWindow));
    item.querySelectorAll('a').forEach((link) => {
      if (inWindow) link.removeAttribute('tabindex');
      else link.setAttribute('tabindex', '-1');
    });
  });
}

function showPage(block, requested) {
  const track = block.querySelector('.benefits-carousel-track');
  if (!track) return;
  const { step, visible, total } = getMetrics(block);
  const maxIndex = Math.max(0, total - visible);
  const index = Math.min(Math.max(requested, 0), maxIndex);
  block.dataset.activeSlide = index;
  // -0 stringifies to "0", so the resting state is exactly translate3d(0px, 0px, 0px).
  track.style.transform = `translate3d(${-(index * step)}px, 0px, 0px)`;
  updateVisibility(block, index, visible);

  const nav = block.querySelector('.benefits-carousel-nav');
  const prev = block.querySelector('.benefits-carousel-prev');
  const next = block.querySelector('.benefits-carousel-next');
  if (nav) nav.hidden = maxIndex === 0;
  if (prev) prev.disabled = index === 0;
  if (next) next.disabled = index >= maxIndex;
}

function buildHeading(row) {
  const heading = document.createElement('div');
  heading.className = 'benefits-carousel-heading';
  const authored = row.querySelector('h1, h2, h3, h4, h5, h6');
  if (authored) {
    heading.append(authored);
  } else {
    const h2 = document.createElement('h2');
    h2.textContent = row.textContent.trim();
    heading.append(h2);
  }
  return heading;
}

function buildItem(row, index) {
  const item = document.createElement('li');
  item.className = 'benefits-carousel-item';
  item.dataset.slideIndex = index;

  let titleDone = false;
  [...row.children].forEach((cell) => {
    if (cell.querySelector('picture, img')) {
      cell.className = 'benefits-carousel-item-icon';
      item.append(cell);
      return;
    }
    if (!titleDone) {
      titleDone = true;
      const title = document.createElement('div');
      title.className = 'benefits-carousel-item-title';
      const authored = cell.querySelector('h1, h2, h3, h4, h5, h6');
      if (authored) {
        title.append(authored);
      } else {
        const h3 = document.createElement('h3');
        h3.textContent = cell.textContent.trim();
        title.append(h3);
      }
      item.append(title);
      return;
    }
    cell.className = 'benefits-carousel-item-copy';
    item.append(cell);
  });

  return item;
}

function buildNav(placeholders) {
  const nav = document.createElement('div');
  nav.className = 'benefits-carousel-nav';
  // Arrow glyphs are drawn in CSS — no inline SVG, nothing an author would need to swap.
  nav.innerHTML = `
    <button type="button" class="benefits-carousel-prev" aria-label="${placeholders.previousSlide || 'Previous'}"></button>
    <button type="button" class="benefits-carousel-next" aria-label="${placeholders.nextSlide || 'Next'}"></button>`;
  return nav;
}

function buildDisclaimer(row, placeholders, id) {
  const cells = [...row.children];
  const short = cells[0];
  const full = cells[1];
  const disclaimer = document.createElement('div');
  disclaimer.className = 'benefits-carousel-disclaimer';

  if (short) {
    short.className = 'benefits-carousel-disclaimer-short';
    disclaimer.append(short);
  }
  if (full) {
    full.className = 'benefits-carousel-disclaimer-full';
    full.id = `${id}-disclaimer`;
    full.hidden = true;
    disclaimer.append(full);
  }
  if (short && full) {
    const labels = {
      more: (cells[2] && cells[2].textContent.trim()) || placeholders.readMore || 'Read more',
      less: (cells[3] && cells[3].textContent.trim()) || placeholders.readLess || 'Read less',
    };
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'benefits-carousel-read-more';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', full.id);
    toggle.textContent = labels.more;
    toggle.addEventListener('click', () => toggleExpandable(toggle, short, full, labels));
    disclaimer.append(toggle);
  }
  [...cells.slice(2)].forEach((cell) => cell.remove());
  return disclaimer;
}

let carouselId = 0;

export default async function decorate(block) {
  carouselId += 1;
  const id = `benefits-carousel-${carouselId}`;
  if (!block.id) block.id = id;

  const placeholders = await loadPlaceholders();

  const itemRows = [];
  let headingRow = null;
  let disclaimerRow = null;
  [...block.children].forEach((row) => {
    if (row.querySelector('picture, img')) itemRows.push(row);
    else if (!itemRows.length && !headingRow) headingRow = row;
    else disclaimerRow = row;
  });

  const stage = document.createElement('div');
  stage.className = 'benefits-carousel-stage';
  const viewport = document.createElement('div');
  viewport.className = 'benefits-carousel-viewport';
  const track = document.createElement('ul');
  track.className = 'benefits-carousel-track';
  itemRows.forEach((row, idx) => track.append(buildItem(row, idx)));
  viewport.append(track);
  stage.append(viewport, buildNav(placeholders));

  const parts = [];
  if (headingRow) parts.push(buildHeading(headingRow));
  parts.push(stage);
  if (disclaimerRow) parts.push(buildDisclaimer(disclaimerRow, placeholders, block.id));
  block.replaceChildren(...parts);

  // rows are classified by the presence of media, so pruning happens only after the
  // item / heading / disclaimer split is settled
  pruneBrokenMedia(block);
  decorateExternalLinks(block);
  decorateIcons(block);

  block.querySelector('.benefits-carousel-prev').addEventListener('click', () => {
    showPage(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.benefits-carousel-next').addEventListener('click', () => {
    showPage(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  showPage(block, 0);

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => {
      showPage(block, parseInt(block.dataset.activeSlide, 10) || 0);
    });
    observer.observe(block);
  }
}
