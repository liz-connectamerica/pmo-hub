(function () {
  var content = document.getElementById('doc-content');
  var tocList = document.getElementById('doc-toc-list');

  // Build "On this page" from the real h2/h3 elements kramdown rendered --
  // reading the DOM's own ids beats hand-maintaining a parallel list that
  // silently drifts every time a heading changes.
  if (content && tocList) {
    var headings = content.querySelectorAll('h2, h3');
    headings.forEach(function (h) {
      if (!h.id) return;
      var li = document.createElement('li');
      li.className = 'doc-toc-item doc-toc-' + h.tagName.toLowerCase();
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }

  // Highlight whichever section is currently in view.
  var tocLinks = tocList ? Array.prototype.slice.call(tocList.querySelectorAll('a')) : [];
  var headingEls = tocLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  function updateActive() {
    var activeIdx = -1;
    for (var i = 0; i < headingEls.length; i++) {
      if (headingEls[i] && headingEls[i].getBoundingClientRect().top <= 90) activeIdx = i;
    }
    tocLinks.forEach(function (a, i) { a.classList.toggle('active', i === activeIdx); });
  }
  if (tocLinks.length) {
    document.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  // Mobile: the sidebar is a collapsible drawer instead of always-visible.
  var toggle = document.getElementById('doc-toc-toggle');
  var toc = document.getElementById('doc-toc');
  if (toggle && toc) {
    toggle.addEventListener('click', function () {
      var open = toc.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (tocList) {
      tocList.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          toc.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  // Search over a hand-curated per-section index (docs/_data/search_index.yml),
  // embedded at build time -- no server, no separate fetch.
  var indexEl = document.getElementById('doc-search-index');
  var searchInput = document.getElementById('doc-search-input');
  var resultsEl = document.getElementById('doc-search-results');
  if (indexEl && searchInput && resultsEl) {
    var entries = [];
    try { entries = JSON.parse(indexEl.textContent) || []; } catch (e) { entries = []; }
    var baseurl = window.DOC_BASEURL || '';

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function render(query) {
      var q = query.trim().toLowerCase();
      if (!q) { resultsEl.hidden = true; resultsEl.innerHTML = ''; return; }
      var matches = entries.filter(function (e) {
        return ((e.title || '') + ' ' + (e.blurb || '')).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      resultsEl.innerHTML = matches.length
        ? matches.map(function (m) {
            return '<a class="doc-search-result" href="' + baseurl + m.page + '#' + m.anchor + '">' +
              '<span class="doc-search-result-title">' + escapeHtml(m.title) + '</span>' +
              '<span class="doc-search-result-guide">' + escapeHtml(m.guide) + '</span>' +
              (m.blurb ? '<span class="doc-search-result-blurb">' + escapeHtml(m.blurb) + '</span>' : '') +
              '</a>';
          }).join('')
        : '<div class="doc-search-empty">No matches</div>';
      resultsEl.hidden = false;
    }

    searchInput.addEventListener('input', function () { render(searchInput.value); });
    searchInput.addEventListener('focus', function () { if (searchInput.value) render(searchInput.value); });
    document.addEventListener('click', function (e) {
      if (e.target !== searchInput && !resultsEl.contains(e.target)) resultsEl.hidden = true;
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { resultsEl.hidden = true; searchInput.blur(); }
    });
  }
})();
