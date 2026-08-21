import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/**
 * Social destinations keyed by a URL token (host label OR path segment), because
 * authors link through a shortener (`bobcard.io/Instagram`) as often as the real host.
 * Keys are network identifiers, never UI copy — safe on a multi-locale site.
 */
const SOCIAL_ICONS = {
  x: 'x',
  twitter: 'x',
  twitterx: 'x',
  facebook: 'facebook',
  fb: 'facebook',
  youtube: 'youtube',
  youtu: 'youtube',
  instagram: 'instagram',
  linkedin: 'linkedin',
  threads: 'threads',
  whatsapp: 'whatsapp',
  wame: 'whatsapp',
  telegram: 'telegram',
  pinterest: 'pinterest',
};

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
 * @shared-candidate socialIconName(a) — resolves a link to a social-network icon name
 * from its URL (host labels + path segments), so shortened links still classify and no
 * locale string is ever matched. Header/share blocks need the same mapping.
 * @param {HTMLAnchorElement} a candidate link
 * @returns {string} icon name (`/icons/<name>.svg`) or '' when not a social link
 */
function socialIconName(a) {
  const href = a.getAttribute('href') || '';
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch (e) {
    return '';
  }
  // same-site relative links are navigation, never social profiles
  if (!/^https?:/i.test(href) && url.origin === window.location.origin) return '';
  const tokens = [...url.hostname.toLowerCase().split('.'), ...url.pathname.toLowerCase().split('/')]
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  const hit = tokens.find((token) => SOCIAL_ICONS[token]);
  return hit ? SOCIAL_ICONS[hit] : '';
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
 * Turns a text-labelled social link into an icon link: the authored label becomes the
 * accessible name and moves into a span the CSS collapses once a real icon paints.
 * The icon itself stays `/icons/<name>.svg` (decorateIcons), never inline SVG data.
 * @param {HTMLAnchorElement} a social link
 * @param {string} name icon name
 */
function upgradeSocialLink(a, name) {
  a.dataset.social = name;
  const label = a.textContent.trim() || a.title || '';
  if (label && !a.getAttribute('aria-label')) a.setAttribute('aria-label', label);
  if (a.textContent.trim()) {
    const text = document.createElement('span');
    text.className = 'footer-social-label';
    text.append(...a.childNodes);
    a.append(text);
  }
  const icon = document.createElement('span');
  icon.className = `icon icon-${name}`;
  a.prepend(icon);
}

/**
 * Marks icon-only lists — and text lists that resolve to social networks — as the social
 * row. Icons stay /icons/<name>.svg so a content editor can swap them; the measured
 * .follow_us hover rules were dead CSS and are dropped.
 * @param {Element} content wrapper holding the fragment sections
 */
function decorateSocialLists(content) {
  content.querySelectorAll('ul').forEach((ul) => {
    const links = [...ul.querySelectorAll('a')];
    if (!links.length) return;
    const authoredIcons = links.every((a) => a.querySelector('.icon'));
    const names = links.map((a) => socialIconName(a));
    const allSocial = names.every(Boolean);
    if (!authoredIcons && !allSocial) return;

    ul.classList.add('footer-social');
    links.forEach((a, i) => {
      a.target = '_blank';
      if (!a.querySelector('.icon') && names[i]) upgradeSocialLink(a, names[i]);
      if (!a.getAttribute('aria-label')) {
        const icon = a.querySelector('[class*="icon-"]');
        const iconName = icon && [...icon.classList].find((c) => c.startsWith('icon-'));
        const label = a.title || (iconName ? iconName.slice(5) : '');
        if (label) a.setAttribute('aria-label', label);
      }
      if (!a.textContent.trim()) a.title = a.getAttribute('aria-label') || a.title;
    });
  });
}

/**
 * Synthesised icons are optimistic: the repo may not ship `/icons/<name>.svg` yet
 * (measured 404 for all five networks). Collapse the text label only once the glyph
 * really paints, and drop the placeholder if it 404s so the link never turns into a
 * broken image. Authored icons are left untouched.
 * @param {Element} scope container holding the social rows
 */
function settleSocialIcons(scope) {
  scope.querySelectorAll('a[data-social]').forEach((a) => {
    const icon = a.querySelector('.icon');
    const img = icon && icon.querySelector('img');
    if (!img) return;
    const settle = (ok) => {
      if (ok) a.classList.add('footer-social-iconic');
      else icon.remove();
    };
    if (img.complete) {
      settle(img.naturalWidth > 0);
      return;
    }
    img.addEventListener('load', () => settle(true), { once: true });
    img.addEventListener('error', () => settle(false), { once: true });
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
  settleSocialIcons(content);
}
