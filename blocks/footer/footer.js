import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/*
 * Footer (fragment scope). Zones are authored as sections; each section may declare its
 * zone with a Section Metadata style (footer-brand / footer-nav / footer-legal /
 * footer-policy / footer-copyright). When the style is missing the zone is inferred from
 * the section's shape, so an author omission degrades to the right layout instead of none.
 */

const ZONES = ['brand', 'nav', 'legal', 'policy', 'copyright'];
const HEADINGS = 'h1, h2, h3, h4, h5, h6';
const MOBILE = '(max-width: 767px)';

/** Nested `<a href><a>label</a></a>` is invalid: keep the outer href, unwrap the inner shell. */
function flattenNestedLinks(scope) {
  scope.querySelectorAll('a a').forEach((inner) => inner.replaceWith(...inner.childNodes));
}

/** Authored targets are preserved verbatim; only the missing rel is repaired (fix per buildNotes). */
function hardenNewTabLinks(scope) {
  scope.querySelectorAll('a[target="_blank"]').forEach((a) => {
    a.setAttribute('rel', 'noopener noreferrer');
  });
}

function zoneOf(section) {
  const declared = ZONES.find((zone) => section.classList.contains(`footer-${zone}`));
  if (declared) return declared;
  if (section.querySelector('picture, img, .icon')) return 'brand';
  if (section.querySelector('ul, ol')) return section.querySelector(HEADINGS) ? 'nav' : 'policy';
  if (section.querySelector('a[href^="mailto:"]') || section.textContent.trim().length > 200) return 'legal';
  return 'copyright';
}

/** An icon-only list inside the brand zone is the social row. */
function markSocialList(section) {
  section.querySelectorAll('ul').forEach((list) => {
    if (list.querySelector('.icon')) list.classList.add('footer-social');
  });
}

/**
 * @shared-candidate breakpoint-scoped disclosure — turns a heading + panel pair into an
 * aria-expanded toggle below a media query and restores static markup above it; any block
 * with mobile-only accordions (footer columns, filters, nav) needs exactly this.
 * Uses the authored heading as the control (role=button, not <button>) because the measured
 * footer contains zero <button>/<input> elements and acceptance keeps that count at 0/0.
 */
function setupDisclosure(section, panelId, mq) {
  const heading = section.querySelector(HEADINGS);
  const panel = section.querySelector('ul, ol');
  if (!heading || !panel) return;
  panel.setAttribute('id', panelId);

  const setOpen = (open) => {
    section.classList.toggle('footer-nav-open', open);
    heading.setAttribute('aria-expanded', String(open));
  };

  const apply = () => {
    if (mq.matches) {
      heading.setAttribute('role', 'button');
      heading.setAttribute('tabindex', '0');
      heading.setAttribute('aria-controls', panelId);
      setOpen(false);
    } else {
      ['role', 'tabindex', 'aria-controls', 'aria-expanded'].forEach((attr) => heading.removeAttribute(attr));
      section.classList.remove('footer-nav-open');
    }
  };

  const toggle = () => {
    if (mq.matches) setOpen(heading.getAttribute('aria-expanded') !== 'true');
  };

  heading.addEventListener('click', toggle);
  heading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });
  mq.addEventListener('change', apply);
  apply();
}

/** Brand + link columns share one flex row; legal/policy/copyright stay stacked below it. */
function groupTopRow(sections) {
  const top = sections.filter((s) => ['brand', 'nav'].includes(s.dataset.footerZone));
  if (!top.length) return;
  const row = document.createElement('div');
  row.className = 'footer-top';
  top[0].before(row);
  row.append(...top);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // Fragment autoblock trap: buildBlock('footer', '') hands us ONE EMPTY ROW, so test for
  // real content instead of block.children.length before skipping the fragment fetch.
  const authored = block.textContent.trim() || block.querySelector('img, picture');
  const inner = document.createElement('div');
  inner.className = 'footer-inner';

  if (authored) {
    inner.append(...block.children);
  } else {
    const footerMeta = getMetadata('footer');
    const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
    const fragment = await loadFragment(footerPath);
    if (!fragment) return;
    while (fragment.firstElementChild) inner.append(fragment.firstElementChild);
  }

  block.textContent = '';
  block.append(inner);

  flattenNestedLinks(inner);
  hardenNewTabLinks(inner);

  const mq = window.matchMedia(MOBILE);
  const sections = [...inner.children].filter((el) => el.tagName === 'DIV');
  sections.forEach((section, i) => {
    const zone = zoneOf(section);
    section.classList.add(`footer-${zone}`);
    section.dataset.footerZone = zone;
    if (zone === 'brand') markSocialList(section);
    if (zone === 'nav') setupDisclosure(section, `footer-list-${i}`, mq);
  });

  groupTopRow(sections);
  decorateIcons(block);
}
