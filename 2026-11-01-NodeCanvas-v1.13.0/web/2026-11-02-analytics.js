// Plain-HTML bootstrap: production pageviews only, using the same-origin Vercel endpoint.
(() => {
  if (location.protocol !== 'https:' || location.hostname !== 'nodenanvas.vercel.app') return;
  if (document.querySelector('script[data-nodecanvas-analytics]')) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.vam = 'production';
  window.va('beforeSend', event => {
    try {
      const url = new URL(event.url, location.origin);
      if (url.origin !== location.origin) return null;
      url.search = '';
      url.hash = '';
      return { ...event, url: url.href };
    } catch { return null; }
  });
  const script = document.createElement('script');
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  script.dataset.nodecanvasAnalytics = 'true';
  document.head.appendChild(script);
})();
