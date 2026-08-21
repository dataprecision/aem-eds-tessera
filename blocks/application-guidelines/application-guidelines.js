/*
 * application-guidelines
 * Numeral-anchored 4-up step list with a reversible inline "read more / read less" toggle.
 *
 * Content model (rows):
 *   1) single-cell row  -> section heading
 *   2) single-cell row  -> intro copy (kept verbatim: "3-step" wording vs 4 items is authored source copy)
 *   3+) step rows       -> [ numeral | label | visible copy | expanded-only copy (opt) | toggle labels (opt) ]
 *
 * Conflicts resolved:
 * - spec.behavior: a.read-more ships with no href (dead link) -> built as <button aria-expanded> (fix, not replicate).
 * - spec.computedStyle a.read-more cursor:auto -> replaced with cursor:pointer (affordance defect, fixed in CSS).
 * - Dead .slick-prev/.slick-next CSS in source is NOT ported; no carousel is initialised at any width.
 */

let uid = 0;

/**
 * @shared-candidate toggleExpandable() — generic aria-expanded button ⇄ hidden region switch;
 * every read-more, accordion and "show all" block needs exactly this, so it belongs in scripts/utils.js.
 * (The packet asks for scripts/utils.js, but this run may only write blocks/application-guidelines/.)
 */
export function toggleExpandable(button, region, force) {
  const expanded = typeof force === 'boolean' ? force : button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  if (region) region.hidden = !expanded;
  return expanded;
}

function moveChildren(from, to) {
  if (from) while (from.firstChild) to.append(from.firstChild);
  return to;
}

function hasContent(cell) {
  return !!cell && (cell.textContent.trim() !== '' || !!cell.querySelector('img, picture, a, iframe'));
}

/* PDF / off-origin documents open in a new tab safely — source shipped rel="noopener" only. */
function normalizeLinks(scope) {
  scope.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const offsite = !!a.hostname && a.hostname !== window.location.hostname;
    if (offsite || /\.pdf(?:[?#]|$)/i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

function buildLabel(cell, id) {
  const authored = cell && cell.querySelector('h1, h2, h3, h4, h5, h6');
  const label = authored || document.createElement('h3');
  if (!authored) label.textContent = cell ? cell.textContent.trim() : '';
  label.className = 'application-guidelines-label';
  label.id = id;
  return label;
}

/* Toggle labels are authored content ("Read more" / "Read less") — never hardcoded here. */
function readToggleLabels(cell) {
  if (!cell) return [];
  const lines = [...cell.children].map((n) => n.textContent.trim()).filter(Boolean);
  if (lines.length) return lines;
  const single = cell.textContent.trim();
  return single ? [single] : [];
}

function buildToggle(labels, labelId, regionId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'application-guidelines-toggle';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', regionId);
  if (labels.length) {
    const collapsed = document.createElement('span');
    collapsed.className = 'application-guidelines-toggle-collapsed';
    collapsed.textContent = labels[0];
    const expanded = document.createElement('span');
    expanded.className = 'application-guidelines-toggle-expanded';
    expanded.textContent = labels[1] || labels[0];
    button.append(collapsed, expanded);
  } else {
    /* No authored label: caret-only affordance named by the step label — locale safe. */
    button.classList.add('application-guidelines-toggle-icon');
    button.setAttribute('aria-labelledby', labelId);
  }
  return button;
}

function buildStep(row, index, instance) {
  const cells = [...row.children];
  const item = document.createElement('li');
  item.className = 'application-guidelines-step';

  const numeralCell = cells.length > 1 && /^\d+[.)]?$/.test(cells[0].textContent.trim())
    ? cells.shift() : null;
  const labelCell = cells.shift();
  const copyCell = cells.shift();
  const extraCell = cells.shift();
  const toggleCell = cells.shift();

  const numeral = document.createElement('span');
  numeral.className = 'application-guidelines-numeral';
  numeral.setAttribute('aria-hidden', 'true'); // <ol> already conveys the ordering
  numeral.textContent = numeralCell ? numeralCell.textContent.trim() : `${index + 1}`;

  const body = document.createElement('div');
  body.className = 'application-guidelines-body';

  const labelId = `application-guidelines-${instance}-label-${index}`;
  body.append(buildLabel(labelCell, labelId));

  const copy = document.createElement('div');
  copy.className = 'application-guidelines-copy';
  moveChildren(copyCell, copy);
  body.append(copy);

  if (hasContent(extraCell)) {
    const regionId = `application-guidelines-${instance}-more-${index}`;
    const more = document.createElement('div');
    more.className = 'application-guidelines-more';
    more.id = regionId;
    more.hidden = true;
    moveChildren(extraCell, more);
    body.append(more);

    const button = buildToggle(readToggleLabels(toggleCell), labelId, regionId);
    button.addEventListener('click', () => toggleExpandable(button, more));
    body.append(button);
  }

  item.append(numeral, body);
  return item;
}

export default function decorate(block) {
  const instance = (uid += 1);
  const rows = [...block.children];
  const stepRows = rows.filter((row) => row.children.length > 1);
  const introRows = rows.filter((row) => row.children.length <= 1);

  const header = document.createElement('div');
  header.className = 'application-guidelines-header';
  introRows.forEach((row) => moveChildren(row.firstElementChild || row, header));

  const list = document.createElement('ol');
  list.className = 'application-guidelines-steps';
  stepRows.forEach((row, index) => list.append(buildStep(row, index, instance)));

  block.textContent = '';
  if (header.childNodes.length) block.append(header);
  if (list.children.length) block.append(list);
  normalizeLinks(block);
}
