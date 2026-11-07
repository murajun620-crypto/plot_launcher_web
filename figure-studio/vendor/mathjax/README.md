# MathJax 3.2.2

Vendored `es5/tex-svg.js` from the published `mathjax@3.2.2` package:
https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js

SHA-256: `d4295dc33744836935c1399feece5159577b34c5c8ffb9f1c6324cd82e03a882`.

Copyright The MathJax Consortium. Apache License 2.0; see LICENSE.

The combined SVG component includes TeX fonts as paths. Figure Studio loads it
locally and lazily; exported SVG contains glyph geometry and has no MathJax,
font server, or CDN dependency. Dynamic TeX packages are disabled.
