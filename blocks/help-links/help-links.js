/**
 * help-links block
 * Authored as a 2-row table:
 *   row 1: [heading text] [GET HELP link]
 *   row 2: [pill link] x5
 *
 * Conflict resolved: visualSpec says pills are "200-220px wide"; computedStyle
 * measured 198.594px — computedStyle wins (180px basis + flex growth).
 * No hover/active states are implemented (measured: zero :hover rules in source);
 * the source's dead `transition: 0.5s` is dropped. Focus-visible affordance comes
 * from the global stylesheet.
 */

/**
 * strips boilerplate button decoration applied by scripts.js/aem.js
 * @param {HTMLAnchorElement} a the anchor to normalize
 */
function normalizeLink(a) {
  a.classList.remove('button', 'primary', 'secondary');
  a.removeAttribute('title');
  a.textContent = a.textContent.trim();
  if (!a.className) a.removeAttribute('class');
}

export default function decorate(block) {
  const rows = [...block.children];
  const [headRow, linksRow] = rows;

  const panel = document.createElement('div');
  panel.className = 'help-links-panel';

  // --- row 1: heading + separate GET HELP call to action ---
  if (headRow) {
    const header = document.createElement('div');
    header.className = 'help-links-header';
    const cells = [...headRow.children];

    const titleText = cells[0] ? cells[0].textContent.trim() : '';
    if (titleText) {
      const heading = cells[0].querySelector('h1, h2, h3, h4, h5, h6') || document.createElement('h2');
      heading.textContent = titleText;
      heading.classList.add('help-links-headline');
      header.append(heading);
    }

    const cta = cells[1] ? cells[1].querySelector('a') : null;
    if (cta) {
      normalizeLink(cta);
      cta.classList.add('help-links-cta');
      header.append(cta);
    }

    if (header.children.length) panel.append(header);
  }

  // --- row 2: uniform pill links (authors may add or omit cells) ---
  if (linksRow) {
    const list = document.createElement('div');
    list.className = 'help-links-row';

    [...linksRow.children].forEach((cell) => {
      const link = cell.querySelector('a');
      if (!link) return;
      normalizeLink(link);
      link.classList.add('help-links-pill');
      list.append(link);
    });

    if (list.children.length) panel.append(list);
  }

  block.textContent = '';
  block.append(panel);
}
