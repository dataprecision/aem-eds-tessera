import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { isAuthored, flattenNestedAnchors, secureLinks } from '../../scripts/utils.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/**
 * @shared-candidate socialIconName(link) — resolves a link to an /icons/<name>.svg asset
 * name from its host/path, never from its label. Lets a text-labelled social link be
 * upgraded to the icon row on any locale. Generalizes to header/share blocks; kept local
 * until a second block needs it.
 */
const SOCIAL_NETWORKS = [
  [/facebook|(^|\.)fb\.(com|me)/, 'facebook'],
  [/twitter|(^|\.)x\.com|\/x$/, 'x'],
  [/youtube|youtu\.be/, 'youtube'],
  [/instagram/, 'instagram'],
  [/linkedin/, 'linkedin'],
  [/whatsapp|wa\.me/, 'whatsapp'],
  [/telegram|t\.me/, 'telegram'],
];

/**
 * @param {HTMLAnchorElement} link candidate link
 * @returns {string} icon asset name, or '' when the link is not a social profile
 */
function socialIconName(link) {
  const href = link.getAttribute('href') || '';
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch (e) {
    return '';
  }
  const probe = `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, '');
  const hit = SOCIAL_NETWORKS.find(([pattern]) => pattern.test(probe));
  return hit ? hit[1] : '';
}

/**
 * FIX (not replicate): source new-tab links carried no rel. Authored targets in the policy
 * row are preserved — only rel is added there.
 * @param {Element} root container to harden
 */
function hardenNewTabLinks(root) {
  secureLinks(root, { openExternalInNewTab: false });
}

/**
 * Classifies an authored zone by shape, never by hardcoded labels (multi-locale safe).
 * A brand zone is the one carrying the logo or the social profile links.
 * @param {Element} zone one top-level fragment section
 * @returns {string} brand | copyright | column | policy | legal
 */
function classifyZone(zone) {
  const anchors = [...zone.querySelectorAll('a')];
  const hasLogo = [...zone.querySelectorAll('img, picture')].some((el) => !el.closest('.icon'));
  const hasIconLink = anchors.some((a) => a.querySelector('.icon'));
  const hasSocialLink = anchors.some((a) => socialIconName(a));
  if (hasLogo || hasIconLink || hasSocialLink) return 'brand';
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
 * Upgrades one text-labelled social link to icon markup. The authored label is kept as the
 * accessible name and stashed so it can be restored when the asset is missing — no UI
 * string is invented here.
 * @param {HTMLAnchorElement} link social profile link
 * @param {string} name icon asset name
 */
function upgradeToIcon(link, name) {
  const label = link.textContent.trim() || link.title || name;
  link.dataset.socialLabel = label;
  if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', label);
  link.textContent = '';
  const icon = document.createElement('span');
  icon.className = `icon icon-${name}`;
  link.append(icon);
}

/**
 * Marks icon-only lists as the social row. Links authored as `:icon-name:` keep their span;
 * links authored as plain labels are matched to an /icons/<name>.svg by href, so the row
 * renders as icons instead of a stacked word list.
 * @param {Element} content wrapper holding the fragment sections
 */
function decorateSocialLists(content) {
  content.querySelectorAll('ul').forEach((ul) => {
    const links = [...ul.querySelectorAll('a')];
    if (!links.length) return;
    const names = links.map((a) => (a.querySelector('.icon') ? 'authored' : socialIconName(a)));
    if (names.some((name) => !name)) return;
    ul.classList.add('footer-social');
    links.forEach((a, i) => {
      if (names[i] !== 'authored') upgradeToIcon(a, names[i]);
      a.target = '_blank';
      if (!a.getAttribute('aria-label')) {
        const icon = a.querySelector('[class*="icon-"]');
        const cls = icon && [...icon.classList].find((c) => c.startsWith('icon-'));
        const label = a.title || (cls ? cls.slice(5) : '');
        if (label) a.setAttribute('aria-label', label);
      }
      if (!a.textContent.trim()) a.title = a.getAttribute('aria-label') || a.title;
    });
  });
}

/**
 * Graceful degradation for the social row: the icon <img> injected by decorateIcons() is
 * loaded eagerly (the footer sits below the fold, so a lazy image would never report a
 * failure) and, if the /icons/<name>.svg asset is absent, the authored label is put back
 * rather than leaving an empty anchor. When the assets land, the icons appear with no code
 * change.
 * @param {Element} scope decorated footer block
 */
function keepLabelsWhenIconsMissing(scope) {
  scope.querySelectorAll('.footer-social a[data-social-label]').forEach((link) => {
    const icon = link.querySelector('span.icon');
    const img = icon && icon.querySelector('img');
    if (!img) return;
    img.loading = 'eager';
    const revert = () => {
      icon.remove();
      link.textContent = link.dataset.socialLabel;
      const list = link.closest('ul');
      if (list) list.classList.add('footer-social-labels');
    };
    if (img.complete && img.naturalWidth === 0) revert();
    else img.addEventListener('error', revert, { once: true });
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
  keepLabelsWhenIconsMissing(block);
}
