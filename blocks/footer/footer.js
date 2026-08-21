import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/**
 * @shared-candidate isAuthored(block) — fragment-autoblock guard: buildBlock() hands
 * decorate() a block containing one EMPTY row, so children.length lies. Test for real
 * content instead. Generalizes to header/footer/any fragment-backed block.
 * @param {Element} block block element
 * @returns {boolean} true when an author placed content directly in the block
 */
function isAuthored(block) {
  return !!(block.textContent.trim() || block.querySelector('img, picture'));
}

/**
 * Source markup nested every column link as <a href><a>Label</a></a> (21 occurrences).
 * Browsers flatten these at parse time; this is the safety net for pasted markup.
 * @param {Element} root container to normalize
 */
function flattenNestedAnchors(root) {
  root.querySelectorAll('a a').forEach((inner) => inner.replaceWith(...inner.childNodes));
}

/**
 * FIX (not replicate): source new-tab links carried no rel.
 * @param {Element} root container to harden
 */
function hardenNewTabLinks(root) {
  root.querySelectorAll('a[target="_blank"]').forEach((a) => {
    a.rel = 'noopener noreferrer';
  });
}

/**
 * Classifies an authored zone by shape, never by hardcoded labels (multi-locale safe).
 * @param {Element} zone one top-level fragment section
 * @returns {string} brand | copyright | column | policy | legal
 */
function classifyZone(zone) {
  const anchors = [...zone.querySelectorAll('a')];
  const hasLogo = [...zone.querySelectorAll('img, picture')].some((el) => !el.closest('.icon'));
  const hasIconLink = anchors.some((a) => a.querySelector('.icon'));
  if (hasLogo || hasIconLink) return 'brand';
  if (zone.textContent.includes('©')) return 'copyright';
  if (zone.querySelector(HEADINGS) && zone.querySelector('ul')) return 'column';
  if (anchors.length >= 8) return 'policy';
  return 'legal';
}

/**
 * Tags each zone and lifts the brand + link columns into one flex row.
 * @param {Element} content wrapper holding the fragment sections
 */
function decorateZones(content) {
  const top = document.createElement('div');
  top.className = 'footer-top';
  let brandGroup = null;

  [...content.children].forEach((zone) => {
    const kind = classifyZone(zone);
    zone.classList.add('footer-zone', `footer-${kind}`);
    if (kind === 'brand') {
      if (!brandGroup) {
        brandGroup = document.createElement('div');
        brandGroup.className = 'footer-brand-group';
        top.append(brandGroup);
      }
      brandGroup.append(zone);
    } else if (kind === 'column') {
      top.append(zone);
    }
  });

  if (top.children.length) content.prepend(top);
}

/**
 * Marks icon-only lists as the social row. Icons stay /icons/<name>.svg so a content
 * editor can swap them; the measured .follow_us hover rules were dead CSS and are dropped.
 * @param {Element} content wrapper holding the fragment sections
 */
function decorateSocialLists(content) {
  content.querySelectorAll('ul').forEach((ul) => {
    const links = [...ul.querySelectorAll('a')];
    if (!links.length || !links.every((a) => a.querySelector('.icon'))) return;
    ul.classList.add('footer-social');
    links.forEach((a) => {
      a.target = '_blank';
      if (!a.getAttribute('aria-label')) {
        const icon = a.querySelector('[class*="icon-"]');
        const name = icon && [...icon.classList].find((c) => c.startsWith('icon-'));
        const label = a.title || (name ? name.slice(5) : '');
        if (label) a.setAttribute('aria-label', label);
      }
      if (!a.textContent.trim()) a.title = a.getAttribute('aria-label') || a.title;
    });
  });
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  let content;

  if (isAuthored(block)) {
    content = document.createElement('div');
    while (block.firstElementChild) content.append(block.firstElementChild);
    block.append(content);
  } else {
    const footerMeta = getMetadata('footer');
    const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
    const fragment = await loadFragment(footerPath);
    block.textContent = '';
    content = document.createElement('div');
    while (fragment && fragment.firstElementChild) content.append(fragment.firstElementChild);
    block.append(content);
  }

  flattenNestedAnchors(content);
  decorateZones(content);
  decorateSocialLists(content);
  // policy row: per-link target mix is authored and preserved; rel is added, target is not.
  hardenNewTabLinks(content);
  await decorateIcons(block);
}
