import { createOptimizedPicture, fetchPlaceholders } from '../../scripts/aem.js';

/*
 * Read-more marker contract (authored content, no hardcoded UI strings):
 *   …visible copy…
 *   <p><a href="#read-more">Read more</a> <a href="#read-less">Read less</a></p>
 *   …collapsible copy…
 * The marker paragraph is replaced by a real <button aria-expanded>, and every
 * node after it is moved into a hidden container. An <hr> works as an alternate
 * split marker; labels then come from placeholders.json (readMore / readLess).
 * Without an authored or placeholder label the copy simply stays fully visible.
 */
const MORE_HREF = 'a[href$="#read-more"]';
const LESS_HREF = 'a[href$="#read-less"]';

let expanderId = 0;

function findMarker(body) {
  const link = body.querySelector(MORE_HREF);
  if (link) return link.closest('p') || link;
  return body.querySelector('hr');
}

/**
 * @shared-candidate toggleExpandable() — content-marked in-place read more/less
 * expander (button + aria-expanded + hidden remainder); the same pattern recurs
 * in any block whose authored copy is truncated behind an author-written label.
 */
function toggleExpandable(body, placeholders) {
  const marker = findMarker(body);
  if (!marker) return;

  const moreText = marker.querySelector?.(MORE_HREF)?.textContent.trim();
  const lessText = marker.querySelector?.(LESS_HREF)?.textContent.trim();
  const labelMore = moreText || placeholders.readMore;
  const labelLess = lessText || placeholders.readLess || labelMore;
  if (!labelMore) return;

  const more = document.createElement('div');
  more.className = 'cards-card-more';
  more.id = `cards-more-${(expanderId += 1)}`;
  more.hidden = true;
  let node = marker.nextSibling;
  while (node) {
    const next = node.nextSibling;
    more.append(node);
    node = next;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cards-read-more';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', more.id);
  button.textContent = labelMore;
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    more.hidden = open;
    button.textContent = open ? labelMore : labelLess;
  });

  marker.replaceWith(more, button);
}

export default async function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.replaceChildren(ul);

  // inconsistent link targets are preserved as authored (measured evidence);
  // only the security rel is hardened on the ones that do open a new tab.
  block.querySelectorAll('a[target="_blank"]').forEach((a) => a.setAttribute('rel', 'noopener noreferrer'));

  const expandable = [...block.querySelectorAll('.cards-card-body')].filter((b) => findMarker(b));
  if (expandable.length) {
    const placeholders = await fetchPlaceholders();
    expandable.forEach((body) => toggleExpandable(body, placeholders));
  }
}
