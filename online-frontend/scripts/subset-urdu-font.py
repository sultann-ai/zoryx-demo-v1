"""One-off: shrink the Noto Nastaliq Urdu regular face to just the Urdu alphabet (159 KB -> ~100 KB).

Needs fonttools + brotli (NOT a project dependency):  pip install fonttools brotli
Source: the @fontsource/noto-nastaliq-urdu package (kept as a devDependency for this script).
Run from online-frontend/:  python scripts/subset-urdu-font.py
The output is committed, so builds never need Python.
"""
from fontTools import subset

SRC = "node_modules/@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-400-normal.woff2"
OUT = "src/assets/fonts/noto-nastaliq-urdu-400.woff2"
# Urdu letters (all contextual forms are kept by the font's own GSUB rules), diacritics, Urdu punctuation, ZWNJ/ZWJ.
UNICODES = (
    "U+0020,U+00A0,U+060C,U+061B,U+061F,U+0621-063A,U+0641-0642,U+0644-0646,U+0648,U+064B-0652,"
    "U+0654-0655,U+0670,U+0679,U+067E,U+0686,U+0688,U+0691,U+0698,U+06A9,U+06AF,U+06BA,U+06BE,"
    "U+06C1-06C3,U+06CC,U+06D2,U+06D3,U+06D4,U+200C-200F"
)
subset.main([SRC, f"--unicodes={UNICODES}", "--layout-features=*", "--flavor=woff2", f"--output-file={OUT}"])
print("wrote", OUT)
