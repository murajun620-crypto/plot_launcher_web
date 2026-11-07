# MathJax 3.2.2

Vendored `es5/tex-svg.js` from the published `mathjax@3.2.2` package:
https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js

SHA-256: `d4295dc33744836935c1399feece5159577b34c5c8ffb9f1c6324cd82e03a882`.

Copyright The MathJax Consortium. Apache License 2.0; see LICENSE.

The combined SVG component includes TeX fonts as paths. Figure Studio loads it
locally and lazily. Exported SVG uses the selected system font for ordinary
math letters and numbers, and embedded paths for structural math symbols.
It requires no MathJax runtime, font server, or CDN; selected fonts must be
available on the viewing/exporting system as for normal text. Dynamic TeX
packages are disabled.
