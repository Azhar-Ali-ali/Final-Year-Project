from pathlib import Path
root = Path(r'c:\files\Final-Year-Project')
matches = []
for p in root.rglob('*'):
    if p.is_file() and p.suffix.lower() in {'.html', '.js'}:
        if 'back_end' in p.parts or 'node_modules' in p.parts or '.venv' in p.parts:
            continue
        text = p.read_text(encoding='utf-8', errors='ignore')
        if 'API_BASE_URL' in text or 'API_BASE =' in text or 'window.location.origin' in text or 'API_BASE' in text:
            matches.append(str(p.relative_to(root)))

for m in sorted(set(matches)):
    print(m)
print('\nTotal:', len(set(matches)))
