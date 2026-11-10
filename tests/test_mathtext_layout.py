"""Regressions for selected-font scripts, including Arial's PCLT metrics."""
import base64
from contextlib import contextmanager
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'python'))
import engine
import matplotlib as mpl
from matplotlib import _mathtext, font_manager as fm, pyplot as plt
from matplotlib.ft2font import LoadFlags
from matplotlib.mathtext import MathTextParser
import pandas as pd


class MathtextLayoutTests(unittest.TestCase):
    def setUp(self):
        self.rc = mpl.rc_context()
        self.rc.__enter__()
        self.frame = pd.DataFrame({'x': [0., 1., 2.], 'y': [0., 2., 1.]})
        for font in (ROOT / 'assets/fonts').glob('LiberationSans-*.ttf'):
            fm.fontManager.addfont(str(font))

    def tearDown(self):
        plt.close('all')
        self.rc.__exit__(None, None, None)

    @contextmanager
    def environment(self, family='Liberation Sans'):
        with engine.plot_environment({'PLOT_FONT_FAMILY': family}, self.frame, 'Sample', 'sample.csv'):
            yield

    def parse(self, text, size=24, dpi=72):
        return MathTextParser('path').parse(text, dpi=dpi, prop=fm.FontProperties(size=size))

    def test_custom_font_uses_real_glyph_height_instead_of_inflated_table(self):
        # This also covers platforms without a licensed Arial installation.
        with patch.object(_mathtext.TruetypeFonts, 'get_xheight', lambda *_args: 1000):
            with self.environment():
                fonts = _mathtext.UnicodeFonts(fm.FontProperties(size=24), LoadFlags.DEFAULT)
                expected = fonts.get_metrics('it', mpl.rcParams['mathtext.default'], 'x', 24, 72).iceberg
                self.assertEqual(fonts.get_xheight('it', 24, 72), expected)
                self.assertLess(expected, 24)
                # Built-in math font sets keep their existing implementation.
                stix = _mathtext.StixSansFonts(fm.FontProperties(size=24), LoadFlags.DEFAULT)
                self.assertEqual(stix.get_xheight('it', 24, 72), 1000)

    def test_arial_superscript_stays_near_previous_stix_position(self):
        try:
            fm.findfont(fm.FontProperties(family='Arial'), fallback_to_default=False)
        except ValueError:
            self.skipTest('Arial is not installed')
        for size in (8, 24, 48):
            for dpi in (72, 150, 300):
                with self.subTest(size=size, dpi=dpi):
                    with mpl.rc_context({'font.family':['Arial'], 'mathtext.fontset':'stixsans'}):
                        before = self.parse(r'cm$^{-1}$', size, dpi).glyphs
                    with self.environment('Arial'):
                        after = self.parse(r'cm$^{-1}$', size, dpi).glyphs
                    old_raise = float(before[-1][4] - before[0][4])
                    new_raise = float(after[-1][4] - after[0][4])
                    self.assertEqual(after[-1][0].family_name, 'Arial')
                    self.assertEqual(after[-1][2], ord('1'))
                    self.assertLess(abs(new_raise-old_raise), size*dpi/72*.12)
                    self.assertLess(new_raise, size*dpi/72*.55)

    def test_subscripts_superscripts_and_explicit_styles_keep_selected_font(self):
        with self.environment():
            cases = [(r'$a_1$', '1'), (r'$a^{12}$', '2'), (r'cm$^{-1}$', '1'),
                     (r'mA/cm$^2$', '2'), (r'$a_1^2$', '2'), (r'$\mathbf{R}_0$', '0')]
            for text, digit in cases:
                with self.subTest(text=text):
                    parsed = self.parse(text)
                    matches = [g for g in parsed.glyphs if g[2] == ord(digit)]
                    self.assertTrue(matches)
                    self.assertTrue(all(g[0].family_name == 'Liberation Sans' for g in matches))
                    self.assertTrue(all(g[1] < 24 for g in matches))
            italic = self.parse(r'$a_1$').glyphs[0][0].style_name.lower()
            self.assertIn('italic', italic)
            bold = self.parse(r'$\mathbf{R}_0$').glyphs[0][0].style_name.lower()
            self.assertIn('bold', bold)
            # Fractions, roots, integrals and missing-glyph fallback still parse.
            self.assertTrue(self.parse(r'$\frac{1}{2}+\sqrt{x}+\int_0^1 x^2 dx+\alpha$').glyphs)

    def test_layout_hook_and_environment_restore_after_nested_failure(self):
        original = _mathtext.TruetypeFonts.get_xheight
        original_fonts = engine.plot_utils.configure_plot_fonts
        previous = os.environ.get('PLOT_FONT_FAMILY')
        with self.environment():
            outer = _mathtext.TruetypeFonts.get_xheight
            with self.assertRaisesRegex(RuntimeError, 'intentional'):
                with self.environment('DejaVu Sans'):
                    self.assertIsNot(_mathtext.TruetypeFonts.get_xheight, outer)
                    raise RuntimeError('intentional')
            self.assertIs(_mathtext.TruetypeFonts.get_xheight, outer)
            self.assertEqual(os.environ['PLOT_FONT_FAMILY'], 'Liberation Sans')
        self.assertIs(_mathtext.TruetypeFonts.get_xheight, original)
        self.assertIs(engine.plot_utils.configure_plot_fonts, original_fonts)
        self.assertEqual(os.environ.get('PLOT_FONT_FAMILY'), previous)

    def test_real_plot_preview_and_vector_raster_exports_keep_math(self):
        families = [('Liberation Sans','LiberationSans-31',None)]
        try:
            families.append(('Arial','ArialMT-31',fm.findfont(fm.FontProperties(family='Arial'),fallback_to_default=False)))
        except ValueError:
            pass
        for family, glyph_id, path in families:
            with self.subTest(family=family):
                plot = engine.PlotEngine(source_dir=ROOT/'python', font_path=ROOT/'assets/fonts/NotoSansJP.ttf')
                if path: plot.add_font(path)
                plot.frame = self.frame.copy()
                plot.filename, plot.sheet_name = 'sample.csv', 'Sample'
                config = {'plotType':'General', 'axes':{'fontFamily':family, 'xLabel':'Raman shift', 'xUnit':r'cm$^{-1}$', 'yLabel':'Current density', 'yUnit':r'mA/cm$^2$'},
                          'series':[{'x':0,'y':1,'name':r'Point $a_1$','mode':'line'}],
                          'annotations':[{'id':'text','type':'text','text':r'$a_1^2$','x':.3,'y':.6,'coordinate_system':'axes_fraction','visible':True}]}
                result = plot.render(config)
                self.assertIn(glyph_id, result['svg'])
                self.assertEqual(plot.figure.axes[0].get_xlabel(), r'Raman shift (cm$^{-1}$)')
                for format, signature in [('svg',b'<?xml'),('png',b'\x89PNG'),('pdf',b'%PDF')]:
                    with self.subTest(format=format):
                        self.assertTrue(base64.b64decode(plot.export(config,format,150)['base64']).startswith(signature))


if __name__ == '__main__':
    unittest.main()
