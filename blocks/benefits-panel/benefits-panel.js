/*
 * Benefits panel — dark composite panel:
 * title row, 3-up icon-LEFT benefit row, divider, 5-item feature list, T&C link row.
 *
 * Authored contract (one row per logical unit, branched by shape — not a single repeating loop):
 *  - 1 cell, one line, no link                -> panel title
 *  - 2 cells, first cell holds an image       -> benefit item (icon + caption)
 *  - 1 cell, multiple lines, no link          -> feature list (rendered as real <ul><li>)
 *  - 1 cell containing a link                 -> terms & conditions line
 *
 * Conflict resolved: visualSpec described icons "stacked above a centered caption"; measured
 * behaviour/computedStyle show icon-left of a left-aligned caption (flex row) — measurement wins.
 * Benefit items and feature labels are intentionally static: no anchors, buttons, roles,
 * tabindex or hover state (measured: 0 links, cursor auto, click is a no-op).
 */

const cleanText = (el) => el.textContent.replace(/\u00a0/g, ' ').trim();

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const benefits = document.createElement('ul');
  benefits.className = 'benefits-panel-benefits';
  let title;
  let features;
  let terms;

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (!cells.length) return;
    const [first, second] = cells;

    // benefit row: icon cell + caption cell
    if (second && first.querySelector('img')) {
      const item = document.createElement('li');
      item.className = 'benefits-panel-benefit';

      const icon = document.createElement('div');
      icon.className = 'benefits-panel-icon';
      const media = first.querySelector('picture') || first.querySelector('img');
      if (media) icon.append(media);

      const label = document.createElement('div');
      label.className = 'benefits-panel-label';
      label.append(...second.childNodes);

      item.append(icon, label);
      benefits.append(item);
      return;
    }

    // drop AEM authoring artifacts: empty cells and &nbsp;-only paragraphs
    const paragraphs = [...first.querySelectorAll('p')].filter((p) => cleanText(p) !== '');
    if (!paragraphs.length && cleanText(first) === '') return;

    if (first.querySelector('a')) {
      terms = document.createElement('p');
      terms.className = 'benefits-panel-terms';
      terms.append(...(paragraphs[0] || first).childNodes);
      return;
    }

    if (paragraphs.length > 1) {
      features = document.createElement('ul');
      features.className = 'benefits-panel-features';
      paragraphs.forEach((p) => {
        const item = document.createElement('li');
        item.append(...p.childNodes);
        features.append(item);
      });
      return;
    }

    if (!title) {
      title = document.createElement('p');
      title.className = 'benefits-panel-title';
      title.append(...(paragraphs[0] || first).childNodes);
    }
  });

  block.textContent = '';
  if (title) block.append(title);
  if (benefits.children.length) block.append(benefits);
  if (features) block.append(features);
  if (terms) block.append(terms);
}
