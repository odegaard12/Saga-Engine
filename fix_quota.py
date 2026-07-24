import os, re

def fix_setitem(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = []
    lines = content.split('\n')
    modified = False
    
    for i, line in enumerate(lines):
        if ('setItem' in line) and ('Storage' in line or 'storage' in line):
            # check if previous line has try
            prev_line = lines[i-1] if i > 0 else ""
            if "try {" not in prev_line and "try" not in prev_line:
                indent = re.match(r'^\s*', line).group(0)
                new_content.append(f"{indent}try {{")
                new_content.append(line)
                new_content.append(f"{indent}}} catch (e) {{ console.warn('Storage quota exceeded', e); }}")
                modified = True
                continue
        new_content.append(line)

    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_content))
        print(f"Fixed {path}")

for root, dirs, files in os.walk(r"c:\Users\oscar\.gemini\antigravity-ide\scratch\saga_engine\frontend\src"):
    for file in files:
        if file.endswith(('.ts', '.tsx')):
            fix_setitem(os.path.join(root, file))
