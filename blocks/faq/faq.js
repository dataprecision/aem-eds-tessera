/*
 * FAQ Block
 * Single-open accordion (Block Collection accordion, adapted) with a
 * progressive "view more" control that reveals the rows beyond the first three.
 *
 * Adapted from the Collection accordion's details/summary pattern to
 * <button aria-expanded> + region, because the measured source rows were
 * non-interactive <h2 tabindex="-1"> (a11y gap flagged in the packet as "fix").
 *
 * Conflict resolved: visualSpec calls the heading ~26px semibold, computedStyle
 * measures 24px/500 — computedStyle wins (see faq.css .faq-title).
 */

const ROWS_BEFORE_TOGGLE = 3;
const FALLBACK_LABELS = { more: 'View More', less: 'View Less' };

let blockSeq = 0;

/**
 * @shared-candidate resolveLabels — placeholder lookup with inline fallbacks, tolerant of
 * an aem.js build without fetchPlaceholders; any block needing localisable UI strings wants it.
 */
async function resolveLabels() {
  try {
    const aem = await import('../../scripts/aem.js');
    if (typeof aem.fetchPlaceholders === 'function') {
      const ph = await aem.fetchPlaceholders();
      return {
        more: ph.faqViewMore || ph.viewMore || FALLBACK_LABELS.more,
        less: ph.faqViewLess || ph.viewLess || FALLBACK_LABELS.less,
      };
    }
  } catch (e) {
    // placeholders are optional — fall through to defaults
  }
  return { ...FALLBACK_LABELS };
}

/** Authors wrap text in <p> inconsistently; return the meaningful child nodes either way. */
function cellNodes(cell) {
  if (!cell) return [];
  const kids = [...cell.children];
  if (kids.length === 1 && kids[0].tagName === 'P') return [...kids[0].childNodes];
  return [...cell.childNodes];
}

function setExpanded(item, expanded) {
  item.dataset.expanded = expanded ? 'true' : 'false';
  item.querySelector('.faq-item-toggle').setAttribute('aria-expanded', String(expanded));
}

function buildItem(row, id) {
  const [labelCell, bodyCell] = row.children;
  if (!labelCell) return null;

  const text = document.createElement('span');
  text.className = 'faq-item-text';
  text.append(...cellNodes(labelCell));

  const chevron = document.createElement('span');
  chevron.className = 'faq-item-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'faq-item-toggle';
  toggle.id = `${id}-toggle`;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${id}-body`);
  toggle.append(text, chevron);

  const label = document.createElement('h3');
  label.className = 'faq-item-label';
  label.append(toggle);

  const inner = document.createElement('div');
  inner.className = 'faq-item-body-inner';
  if (bodyCell) inner.append(...bodyCell.childNodes);
  // normalize answers: strip stray dir attributes (source answer 5 carried dir="ltr")
  inner.querySelectorAll('[dir]').forEach((el) => el.removeAttribute('dir'));

  const body = document.createElement('div');
  body.className = 'faq-item-body';
  body.id = `${id}-body`;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-labelledby', `${id}-toggle`);
  body.append(inner);

  const item = document.createElement('div');
  item.className = 'faq-item';
  item.dataset.expanded = 'false';
  item.append(label, body);
  return item;
}

function addMoreControl(panel, items, labels) {
  const extra = items.slice(ROWS_BEFORE_TOGGLE);
  extra.forEach((item) => { item.hidden = true; });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'faq-more-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = labels.more;

  const box = document.createElement('div');
  box.className = 'faq-more';
  box.append(toggle);
  panel.append(box);

  toggle.addEventListener('click', () => {
    const showing = toggle.getAttribute('aria-expanded') === 'true';
    extra.forEach((item) => {
      item.hidden = showing;
      if (showing) setExpanded(item, false);
    });
    toggle.setAttribute('aria-expanded', String(!showing));
    toggle.textContent = showing ? labels.more : labels.less;
    // never strand focus inside a row we just hid
    if (showing && extra.some((item) => item.contains(document.activeElement))) toggle.focus();
  });
}

export default async function decorate(block) {
  blockSeq += 1;
  const idBase = `faq-${blockSeq}`;
  const rows = [...block.children];

  const panel = document.createElement('div');
  panel.className = 'faq-panel';

  // optional first single-cell row is the panel heading
  if (rows.length > 1 && rows[0].children.length === 1) {
    const title = document.createElement('h3');
    title.className = 'faq-title';
    title.append(...cellNodes(rows.shift().firstElementChild));
    panel.append(title);
  }

  const list = document.createElement('div');
  list.className = 'faq-list';
  const items = rows
    .map((row, i) => buildItem(row, `${idBase}-${i}`))
    .filter(Boolean);
  list.append(...items);
  panel.append(list);

  list.addEventListener('click', (event) => {
    const toggle = event.target.closest('.faq-item-toggle');
    if (!toggle) return;
    const item = toggle.closest('.faq-item');
    const wasOpen = item.dataset.expanded === 'true';
    items.forEach((other) => setExpanded(other, false)); // exclusive: one row open at a time
    setExpanded(item, !wasOpen);
  });

  if (block.classList.contains('open-first') && items.length) setExpanded(items[0], true);

  block.replaceChildren(panel);

  if (items.length > ROWS_BEFORE_TOGGLE) {
    addMoreControl(panel, items, await resolveLabels());
  }
}
