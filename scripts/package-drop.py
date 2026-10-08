"""Package the built public files for the existing Netlify Drop project."""
from pathlib import Path
import hashlib
import json
import sys
import tomllib
import zipfile

root = Path(__file__).resolve().parent.parent
target = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "release/TenderScope_Public_Static.zip"
target.parent.mkdir(parents=True, exist_ok=True)
source = (root / "netlify.toml").read_text()
# Drop runs a build against the upload. These files have already been built.
config = source.replace('command = "npm run build"', 'command = ""').replace('publish = "dist"', 'publish = "."')
original, static = tomllib.loads(source), tomllib.loads(config)
assert static["build"]["command"] == "" and static["build"]["publish"] == "."
assert original["headers"] == static["headers"] and original["redirects"] == static["redirects"]
files = sorted(p for p in (root / "dist").rglob("*") if p.is_file())
required = {"index.html", "app.js", "styles.css", "supabase.js", "sw.js", "manifest.webmanifest"}
names = {p.relative_to(root / "dist").as_posix() for p in files}
assert required <= names
assert all(name in required or name.startswith("assets/") for name in names)
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, file.relative_to(root / "dist").as_posix())
    archive.writestr("netlify.toml", config)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
print(json.dumps({"file": str(target), "bytes": target.stat().st_size,
                  "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}))
