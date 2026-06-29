import subprocess

def run(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=False)

try:
    run("git branch -D super-clean")
except:
    pass

run("git checkout --orphan super-clean")
run("git rm -rf .")

run("git checkout ab19857 -- .")
run("git add .")
run("git commit -m \"release: SAGA Engine v1.0.0 - First stable field mission platform [skip ci]\"")

run("git rm -rf .")
run("git checkout e864126 -- .")
run("git add .")
run("git commit -m \"release: v1.0.1 - iOS rendering fixes, edge UI polish, and documentation update [skip ci]\"")

run("git rm -rf .")
run("git checkout 12e952b -- .")
run("git add .")
run("git commit -m \"chore(release): v1.1.0 - Rediseño de interfaz, correcciones GPS y rendimiento de mapa [skip ci]\"")

run("git rm -rf .")
run("git checkout 7a91cdb -- .")
run("git add .")
run("git commit -m \"chore(release): v1.2.0 - Mapbox Premium, UI Redesign and i18n English Translations [skip ci]\"")

run("git rm -rf .")
run("git checkout a7f3824 -- .")
run("git add .")
run("git commit -m \"chore(release): v1.3.0 - Offline GPS & Map Render Fixes\"")

v100 = subprocess.check_output("git log --format=%H -n 1 --skip=4", shell=True).decode().strip()
v101 = subprocess.check_output("git log --format=%H -n 1 --skip=3", shell=True).decode().strip()
v110 = subprocess.check_output("git log --format=%H -n 1 --skip=2", shell=True).decode().strip()
v120 = subprocess.check_output("git log --format=%H -n 1 --skip=1", shell=True).decode().strip()
v130 = subprocess.check_output("git log --format=%H -n 1", shell=True).decode().strip()

# Update tags
run("git tag -d v1.0.0 v1.0.1 v1.1.0 v1.2.0 v1.3.0")
run(f"git tag -f v1.0.0 {v100}")
run(f"git tag -f v1.0.1 {v101}")
run(f"git tag -f v1.1.0 {v110}")
run(f"git tag -f v1.2.0 {v120}")
run(f"git tag -f v1.3.0 {v130}")

run("git checkout main")
run("git reset --hard super-clean")
run("git push origin main --force")

run("git push origin --tags --force")

print("Extreme rewrite completed!")
