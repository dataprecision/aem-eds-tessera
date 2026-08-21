/*
 * application-guidelines
 * Numeral-anchored 4-up step list with a reversible inline "read more / read less" toggle.
 *
 * Content model (rows):
 *   1) single-cell row  -> section heading
 *   2) single-cell row  -> intro copy (kept verbatim: the "3-step" wording against 4 items is
 *                          authored source copy, not a migration defect)
 *   3+) step rows       -> [ numeral | label | visible copy | expanded-only copy (opt) | toggle labels (opt) ]
 *
 * Authored shape on this page (measured from the .plain.html rows): cell counts 1,1,5,3,5,5 —
 * step 2 omits both the expanded cell and the toggle labels, so every cell read below is optional.
 *
 * Conflicts resolved against the migration source:
 * - source `a.read-more` ships with no href and cursor:auto (dead control) -> built as a real
 *   <button aria-expanded> wired through the shared toggleExpandable(). Fix, not replication.
 * - dead .slick-prev/.slick-next CSS in the source is NOT ported; no carousel is initialised at
 *   any width. The source is a plain flex row at >=768 and a stack below it (measured).
 */

import { toggleExpandable, secureLinks } from '../../scripts/utils.js';

let uid = 0;

function moveChildren(from, to) {
  if (from) while (from.firstChild) to.append(from.firstChild);
  return to;
}

function hasContent(cell) {
  return !!cell && (cell.textContent.trim() !== '' || !!cell.querySelector('img, picture, a, iframe'));
}

/**
 * @shared-candidate newTabForDocuments() — same-origin document links (PDF statements, T&C
 * sheets) should open in a new tab everywhere on this site, which secureLinks() deliberately
 * does not do because it only reasons about origin. Kept local until a second block needs it.
 * @param {Element} scope container to normalize
 */
function newTabForDocuments(scope) {
  scope.querySelectorAll('a[href]').forEach((a) => {
    if (/\.pdf(?:[?#]|$)/i.test(a.getAttribute('href') || '')) {
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
  numeral.setAttribute('aria-hidden', 'true'); // the <ol> already conveys the ordering
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
    const more = document.createElement('div');
    more.className = 'application-guidelines-more';
    more.id = `application-guidelines-${instance}-more-${index}`;
    moveChildren(extraCell, more);
    body.append(more);

    const labels = readToggleLabels(toggleCell);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'application-guidelines-toggle';
    if (!labels.length) {
      /* No authored label: caret-only affordance named by the step label — locale safe. */
      button.classList.add('application-guidelines-toggle-icon');
      button.setAttribute('aria-labelledby', labelId);
    }
    body.append(button);

    /* shared helper handles aria-expanded/aria-controls, the label swap and the initial
       collapsed state (it hides `more` for us) */
    toggleExpandable(button, { expanded: more }, {
      more: labels[0] || '',
      less: labels[1] || labels[0] || '',
    });
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

  secureLinks(block);
  newTabForDocuments(block);
}
