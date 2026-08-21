/*
 * FAQ block
 * Single-open accordion with progressive "view more" disclosure.
 *
 * Adapted from the Block Collection accordion. The reference uses <details>/<summary>;
 * this rebuild uses <button aria-expanded> so rows stay keyboard operable AND can be
 * height-animated + driven exclusively (buildNotes: fix, do not replicate the source's
 * non-interactive <h2 tabindex="-1">).
 *
 * Content model (per row): cell 1 = question, cell 2 = answer.
 *   - a single-cell row containing a heading  -> panel heading
 *   - a single-cell row of plain text         -> toggle labels ("more" then "less")
 * Labels are authored (or come from placeholders) — never hardcoded here.
 */

const VISIBLE_ROWS = 3;
let instances = 0;

/** Unwrap a single wrapping <p> so question text is not a block-level paragraph. */
function contentsOf(cell) {
  const onlyPara = cell.children.length === 1 && cell.firstElementChild.tagName === 'P';
  return onlyPara ? [...cell.firstElementChild.childNodes] : [...cell.childNodes];
}

/** Read "more"/"less" labels from an authored cell: two paragraphs, or one "a | b" line. */
function readLabels(cell) {
  const paras = [...cell.querySelectorAll('p')].map((p) => p.textContent.trim()).filter(Boolean);
  const parts = paras.length >= 2
    ? paras
    : cell.textContent.split('|').map((s) => s.trim()).filter(Boolean);
  return { more: parts[0] || '', less: parts[1] || parts[0] || '' };
}

/**
 * @shared-candidate placeholderLabels — resolves UI microcopy from the placeholders sheet
 * with a safe fallback; every locale-aware block that needs a toggle label wants this.
 */
async function placeholderLabels() {
  try {
    const { fetchPlaceholders } = await import('../../scripts/aem.js');
    const ph = await fetchPlaceholders();
    const more = ph.viewMore || '';
    return { more, less: ph.viewLess || more };
  } catch (e) {
    return { more: '', less: '' };
  }
}

function setOpen(item, open) {
  item.querySelector('.faq-question').setAttribute('aria-expanded', open ? 'true' : 'false');
  item.classList.toggle('faq-item-open', open);
}

function buildItem(questionCell, answerCell, id) {
  const item = document.createElement('div');
  item.className = 'faq-item';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'faq-question';
  button.id = `${id}-q`;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `${id}-a`);

  const text = document.createElement('span');
  text.className = 'faq-question-text';
  text.append(...contentsOf(questionCell));

  // CSS-drawn chevron (buildNotes: do not port black-arrow/white-arrow rasters).
  const chevron = document.createElement('span');
  chevron.className = 'faq-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  button.append(text, chevron);

  const answer = document.createElement('div');
  answer.className = 'faq-answer';
  answer.id = `${id}-a`;
  answer.setAttribute('role', 'region');
  answer.setAttribute('aria-labelledby', button.id);

  const inner = document.createElement('div');
  inner.className = 'faq-answer-inner';
  if (answerCell) {
    // Normalize authored answers: strip stray dir attributes so all rows match (buildNotes fix).
    answerCell.querySelectorAll('[dir]').forEach((el) => el.removeAttribute('dir'));
    inner.append(...answerCell.childNodes);
  }
  answer.append(inner);

  item.append(button, answer);
  return item;
}

export default async function decorate(block) {
  instances += 1;
  const id = `faq-${instances}`;
  const pairs = [];
  let heading = null;
  let labels = null;

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (cells.length >= 2) {
      pairs.push([cells[0], cells[1]]);
      return;
    }
    if (!cells.length) return;
    const head = cells[0].querySelector('h1, h2, h3, h4, h5, h6');
    if (head) heading = head;
    else labels = readLabels(cells[0]);
  });

  const panel = document.createElement('div');
  panel.className = 'faq-panel';
  if (heading) {
    heading.classList.add('faq-heading');
    panel.append(heading);
  }

  const list = document.createElement('div');
  list.className = 'faq-list';
  list.id = `${id}-list`;
  pairs.forEach(([question, answer], i) => {
    const item = buildItem(question, answer, `${id}-${i}`);
    if (i >= VISIBLE_ROWS) item.dataset.extra = 'true';
    list.append(item);
  });
  panel.append(list);

  // Exclusive (single-open) accordion: opening a row closes any other open row.
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.faq-question');
    if (!button) return;
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    list.querySelectorAll('.faq-item-open').forEach((open) => setOpen(open, false));
    if (!wasOpen) setOpen(button.parentElement, true);
  });

  block.textContent = '';
  block.append(panel);

  const gated = pairs.length > VISIBLE_ROWS && !block.classList.contains('show-all');
  if (!gated) {
    block.dataset.expanded = 'true';
    return;
  }

  block.dataset.expanded = 'false';
  if (!labels) labels = await placeholderLabels();
  if (!labels.more) {
    // No authored label and no placeholder: never hide content behind a nameless control.
    block.dataset.expanded = 'true';
    return;
  }

  const more = document.createElement('div');
  more.className = 'faq-more';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'faq-more-toggle';
  toggle.setAttribute('aria-controls', list.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = labels.more;
  toggle.addEventListener('click', () => {
    const shown = block.dataset.expanded === 'true';
    block.dataset.expanded = shown ? 'false' : 'true';
    toggle.setAttribute('aria-expanded', shown ? 'false' : 'true');
    toggle.textContent = shown ? labels.more : labels.less;
    if (shown) {
      list.querySelectorAll('[data-extra].faq-item-open').forEach((item) => setOpen(item, false));
    }
  });
  more.append(toggle);
  panel.append(more);
}
