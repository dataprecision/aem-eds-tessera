/*
 * benefits-carousel
 *
 * Adopted from the AEM Block Collection `carousel` block: slide paging,
 * arrow disabled-state handling and the aria/tabindex bookkeeping come from
 * the reference implementation. Added on top: a fixed multi-visible window
 * (4 items on desktop, one-item step) and a trailing disclaimer row with an
 * inline read-more/read-less toggle.
 *
 * Conflicts resolved (packet):
 * - computedStyle nav circle rgb(224,224,224) -> foundation token --surface-muted
 *   (block CSS must not mint palette values).
 * - computedStyle .disclaimer_descrip color rgb(227,227,227) is unreadable on the
 *   rgb(243,243,243) panel -> --text-color.
 * - domSlice ships a permanently display:none .disclaimer_popup modal; buildNotes
 *   say drop it, so no overlay is created here.
 * - domSlice arrows are hrefless/label-less <button data-role="none">; rebuilt as
 *   real buttons with disabled state + accessible names.
 */

/* Optional foundation placeholders; absent in this repo, so degrade silently. */
async function loadLabels() {
  const sources = ['../../scripts/placeholders.js', '../../scripts/aem.js'];
  for (let i = 0; i < sources.length; i += 1) {
    try {
      /* eslint-disable no-await-in-loop */
      const mod = await import(sources[i]);
      if (typeof mod.fetchPlaceholders === 'function') {
        return (await mod.fetchPlaceholders()) || {};
      }
      /* eslint-enable no-await-in-loop */
    } catch (e) {
      /* placeholders are optional */
    }
  }
  return {};
}

/* Fix (page-wide policy): every new-tab link gets a full rel. */
function hardenExternalLinks(scope) {
  scope.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer');
  });
}

function isItemRow(row) {
  return !!row.querySelector('picture, img');
}

function buildItem(row) {
  const item = document.createElement('li');
  item.className = 'benefits-carousel-item';

  const cells = [...row.children];
  const iconCell = cells.find((cell) => cell.querySelector('picture, img'));
  const rest = cells.filter((cell) => cell !== iconCell);

  if (iconCell) {
    iconCell.className = 'benefits-carousel-item-icon';
    item.append(iconCell);
  }

  let headingCell = null;
  let copyCells = rest;
  if (rest.length > 1) {
    [headingCell] = rest;
    copyCells = rest.slice(1);
  }

  if (headingCell) {
    const authored = headingCell.querySelector('h1, h2, h3, h4, h5, h6');
    const heading = authored || document.createElement('h3');
    if (!authored) heading.textContent = headingCell.textContent.trim();
    heading.classList.add('benefits-carousel-item-title');
    item.append(heading);
  }

  copyCells.forEach((cell) => {
    cell.className = 'benefits-carousel-item-copy';
    item.append(cell);
  });

  return item;
}

/**
 * @shared-candidate paged carousel engine — steps a flex track one item at a
 * time inside a fixed multi-visible window, clamps to a non-infinite range and
 * drives arrow disabled state; any "N visible, step by 1" block needs this.
 */
function createPager(block, viewport, track, prev, next) {
  const slides = [...track.children];

  const step = () => {
    if (slides.length > 1) {
      const delta = slides[1].offsetLeft - slides[0].offsetLeft;
      if (delta > 0) return delta;
    }
    return slides[0] ? slides[0].offsetWidth || viewport.clientWidth : viewport.clientWidth;
  };
  const perView = () => Math.max(1, Math.round(viewport.clientWidth / step()));
  const maxIndex = () => Math.max(0, slides.length - perView());
  const current = () => parseInt(block.dataset.activeSlide, 10) || 0;

  function render(index) {
    const first = Math.min(Math.max(index, 0), maxIndex());
    const last = first + perView() - 1;
    block.dataset.activeSlide = first;

    const offset = slides[first] ? slides[first].offsetLeft - slides[0].offsetLeft : 0;
    track.style.transform = `translate3d(-${offset}px, 0px, 0px)`;

    slides.forEach((slide, idx) => {
      const visible = idx >= first && idx <= last;
      slide.classList.toggle('benefits-carousel-item-active', visible);
      slide.setAttribute('aria-hidden', String(!visible));
      slide.querySelectorAll('a').forEach((link) => {
        if (visible) link.removeAttribute('tabindex');
        else link.setAttribute('tabindex', '-1');
      });
    });

    if (prev) prev.disabled = first <= 0;
    if (next) next.disabled = first >= maxIndex();
  }

  if (prev) prev.addEventListener('click', () => render(current() - 1));
  if (next) next.addEventListener('click', () => render(current() + 1));

  /* touch/pen paging only; no autoplay (measured: track never moves on its own) */
  let startX = null;
  viewport.addEventListener('pointerdown', (e) => {
    startX = e.pointerType === 'mouse' ? null : e.clientX;
  });
  viewport.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) render(current() + (dx < 0 ? 1 : -1));
  });

  if (window.ResizeObserver) {
    let width = 0;
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth === width) return;
      width = viewport.clientWidth;
      render(current());
    });
    observer.observe(viewport);
  }

  render(0);
}

/**
 * @shared-candidate inline expandable — swaps a truncated node for its full
 * copy behind a real <button aria-expanded>; reusable for any read-more row.
 */
function toggleExpandable(button, short, full, moreLabel, lessLabel) {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  button.textContent = expanded ? moreLabel : lessLabel;
  short.hidden = !expanded;
  full.hidden = expanded;
}

function buildDisclaimer(row, labels, id) {
  const cells = [...row.children];
  if (!cells.length) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'benefits-carousel-disclaimer';

  const [short, full, moreCell, lessCell] = cells;
  const text = document.createElement('div');
  text.className = 'benefits-carousel-disclaimer-text';
  text.id = `benefits-carousel-${id}-disclaimer`;

  short.className = 'benefits-carousel-disclaimer-short';
  text.append(short);
  wrapper.append(text);

  const hasFull = full && full.textContent.trim();
  if (!hasFull) return wrapper;

  full.className = 'benefits-carousel-disclaimer-full';
  full.hidden = true;
  text.append(full);

  const moreLabel = (moreCell && moreCell.textContent.trim()) || labels.readMore || 'Read more';
  const lessLabel = (lessCell && lessCell.textContent.trim()) || labels.readLess || 'Read less';
  if (moreCell) moreCell.remove();
  if (lessCell) lessCell.remove();

  const actions = document.createElement('p');
  actions.className = 'benefits-carousel-disclaimer-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'benefits-carousel-toggle';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', text.id);
  button.textContent = moreLabel;
  button.addEventListener('click', () => {
    toggleExpandable(button, short, full, moreLabel, lessLabel);
  });
  actions.append(button);
  wrapper.append(actions);

  return wrapper;
}

let blockId = 0;

export default async function decorate(block) {
  blockId += 1;
  const labels = await loadLabels();
  const rows = [...block.children];
  const itemRows = rows.filter(isItemRow);
  if (!itemRows.length) return;

  const firstItem = rows.indexOf(itemRows[0]);
  const lastItem = rows.indexOf(itemRows[itemRows.length - 1]);
  const headRows = rows.slice(0, firstItem);
  const tailRows = rows.slice(lastItem + 1);

  const panel = document.createElement('div');
  panel.className = 'benefits-carousel-panel';

  /* leading row(s): panel heading — authors may omit the heading element */
  headRows.forEach((row) => {
    const authored = row.querySelector('h1, h2, h3, h4, h5, h6');
    const heading = authored || document.createElement('h2');
    if (!authored) heading.textContent = row.textContent.trim();
    heading.classList.add('benefits-carousel-heading');
    panel.append(heading);
    row.remove();
  });

  const stage = document.createElement('div');
  stage.className = 'benefits-carousel-stage';

  const viewport = document.createElement('div');
  viewport.className = 'benefits-carousel-viewport';

  const track = document.createElement('ul');
  track.className = 'benefits-carousel-track';
  itemRows.forEach((row) => {
    track.append(buildItem(row));
    row.remove();
  });
  viewport.append(track);
  stage.append(viewport);

  const singlePage = track.children.length < 2;
  let prev = null;
  let next = null;
  if (!singlePage) {
    const nav = document.createElement('div');
    nav.className = 'benefits-carousel-nav';
    prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'benefits-carousel-prev';
    prev.setAttribute('aria-label', labels.previousSlide || 'Previous Slide');
    next = document.createElement('button');
    next.type = 'button';
    next.className = 'benefits-carousel-next';
    next.setAttribute('aria-label', labels.nextSlide || 'Next Slide');
    nav.append(prev, next);
    stage.append(nav);
  }

  panel.append(stage);

  /* trailing row(s): disclaimer, never a 10th slide */
  tailRows.forEach((row) => {
    const disclaimer = buildDisclaimer(row, labels, blockId);
    if (disclaimer) panel.append(disclaimer);
    row.remove();
  });

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', labels.carousel || 'Carousel');
  block.append(panel);
  hardenExternalLinks(block);

  if (!singlePage) createPager(block, viewport, track, prev, next);
}
