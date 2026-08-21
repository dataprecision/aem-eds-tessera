import { createOptimizedPicture, fetchPlaceholders } from '../../scripts/aem.js';
import { isImageOnly, contentsOf } from '../../scripts/utils.js';

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

/**
 * True when a bare <img> is worth handing to createOptimizedPicture(). The helper
 * derives its srcset from the URL pathname, so a cross-origin or non-http src
 * (measured on this page: every authored src is `about:error`, protocol `about:`)
 * would be rewritten into nonsense sources. Leave those exactly as authored so the
 * failure stays a plain broken image the QA pass can still see and attribute.
 * @param {string} src candidate src attribute
 * @returns {boolean} true when the src is a same-origin http(s) asset
 */
function isOptimizable(src) {
  if (!src) return false;
  try {
    const url = new URL(src, window.location.href);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin === window.location.origin;
  } catch (e) {
    return false;
  }
}

/**
 * @shared-candidate normalizeMediaCell() — authors (and importers) produce the media
 * cell three ways: `<picture>`, a bare `<img>`, or either wrapped in a lone `<p>`.
 * Classify on "carries media and no copy" rather than on an exact child shape, and
 * drop the paragraph wrapper so the media is a direct flex/grid child of the cell.
 */
function normalizeMediaCell(cell) {
  cell.className = 'cards-card-image';
  const onlyChild = cell.children.length === 1 && cell.firstElementChild;
  if (onlyChild && onlyChild.tagName === 'P') cell.replaceChildren(...contentsOf(cell));
}

export default async function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      // measured: the benefits rows author the icon as `<p><img></p>` (no <picture>),
      // so the legacy `children.length === 1 && querySelector('picture')` test scored
      // 0 of 4 image cells and every icon fell through to .cards-card-body.
      if (isImageOnly(div)) normalizeMediaCell(div);
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (!isOptimizable(src)) return;
    const target = img.closest('picture') || img;
    target.replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
  });
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
