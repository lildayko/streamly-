"""Rebuild the downloadable extension using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / 'public' / 'streamly-youtube-bridge.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for source in sorted((root / 'browser-extension').iterdir()):
        if source.is_file():
            entry = ZipInfo(source.name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, source.read_bytes())
print(output.relative_to(root))
