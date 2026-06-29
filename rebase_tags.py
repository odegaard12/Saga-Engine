import subprocess

def run(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=False)

tags = [
    ("v0.0.1", "b7c75de"),
    ("v0.1.0", "0a78e0f"),
    ("v0.2.0", "dce9c7d"),
    ("v0.3.0", "1c13442"),
    ("v0.3.1", "6511f7d"),
    ("v0.4.0", "cc86c17"),
    ("v0.5.0", "a939f1d"),
    ("v0.5.3", "594ef8c"),
    ("v0.5.4", "45a3b24"),
    ("v1.0.0", "ab19857"),
    ("v1.0.1", "e864126"),
    ("v1.1.0", "12e952b"),
    ("v1.2.0", "7a91cdb"),
    ("v1.3.0", "a7f3824"),
]

# Delete local tags
for tag, _ in tags:
    run(f"git tag -d {tag}")

# Create new tags
for tag, commit in tags:
    run(f"git tag -f {tag} {commit}")

# Delete remote tags
tag_names = " ".join([tag for tag, _ in tags])
run(f"git push origin --delete {tag_names}")

# Push new tags
run("git push origin --tags")

print("Tags updated!")
