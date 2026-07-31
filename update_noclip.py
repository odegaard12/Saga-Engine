import re

path = 'frontend/src/admin/AdminMissionMap.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure we don't duplicate noClip if it's already there
# First remove noClip: true, just in case
content = re.sub(r'noClip:\s*true,?', '', content)

# Then add noClip: true to all L.polyline calls
content = re.sub(r'L\.polyline\(([^,]+),\s*\{', r'L.polyline(\1, { noClip: true, ', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added noClip to all polylines!")
