import { createOptimizedPicture } from '../../scripts/aem.js';
import { createReadMoreFromMarker, resolveLabels } from '../../scripts/utils.js';

/*
 * Read-more marker contract (authored content, no hardcoded UI strings):
 *   …visible copy…
 *   <p><a href="#read-more">Read more</a> <a href="#read-less">Read less</a></p>
 *   …collapsible copy…
 * The marker paragraph is replaced by a real <button aria-expanded>, and every node
 * after it is moved into a hidden region — implemented once in scripts/utils.js as
 * createReadMoreFromMarker(). An <hr> works as an alternate split marker; labels then
 * come from placeholders.json (readMore / readLess). Without an authored or placeholder
 * label the copy simply stays fully visible.
 *
 * NOTE: labels resolve through utils' resolveLabels() rather than importing
 * fetchPlaceholders from scripts/aem.js — the vendored aem.js on this project exports
 * no fetchPlaceholders, and a named import of a missing export is a link-time
 * SyntaxError that kills the whole module (measured: block never decorated).
 */
const MORE_SELECTOR = 'a[href$="#read-more"]';

function isImageCell(cell) {
  return !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
}

function hasReadMoreMarker(body) {
  return !!(body.querySelector(MORE_SELECTOR) || body.querySelector('hr'));
}

/* Only http(s) / site-relative sources can be run through the optimizer; anything else
   (an unmigrated asset placeholder, a data: URI) is left exactly as authored so the
   content defect stays visible instead of being reshaped into a different bad URL. */
function isOptimizable(src) {
  return /^https?:\/\//.test(src) || src.startsWith('//') || src.startsWith('/');
}

export default async function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      /* authors ship both <picture><img> and a bare <img> inside a <p>;
         both are image cells, everything else is body copy */
      div.className = isImageCell(div) ? 'cards-card-image' : 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('img').forEach((img) => {
    if (!isOptimizable(img.getAttribute('src') || '')) return;
    const target = img.closest('picture') || img;
    target.replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
  });
  block.replaceChildren(ul);

  // inconsistent link targets are preserved as authored (measured evidence);
  // only the security rel is hardened on the ones that do open a new tab.
  block.querySelectorAll('a[target="_blank"]').forEach((a) => a.setAttribute('rel', 'noopener noreferrer'));

  const expandable = [...block.querySelectorAll('.cards-card-body')].filter(hasReadMoreMarker);
  if (expandable.length) {
    const labels = await resolveLabels({ more: 'readMore', less: 'readLess' });
    expandable.forEach((body) => createReadMoreFromMarker(body, {
      labelCollapsed: labels.more,
      labelExpanded: labels.less,
      regionClass: 'cards-card-more',
      buttonClass: 'cards-read-more',
      idPrefix: 'cards-more',
    }));
  }
}
