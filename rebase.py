import subprocess

def run(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

try:
    run("git branch -D clean-history")
except:
    pass

run("git checkout b7c75de")
run("git checkout -b clean-history")

run("git read-tree -um HEAD 69b4bb4")
run("git commit -m \"release: SAGA Engine v0.1.0 guided Mission Control\"")

run("git cherry-pick 435f61b")
run("git cherry-pick 25f3caa")
run("git cherry-pick 57086c2")

run("git read-tree -um HEAD 8918ecc")
run("git commit -m \"release: SAGA Engine v0.4.0 Place Mosaic\"")

run("git cherry-pick 9dd6ea8")

run("git read-tree -um HEAD 90ca89b")
run("git commit -m \"release: SAGA Engine v0.5.3\"")

run("git read-tree -um HEAD cd4e736")
run("git commit -m \"release: SAGA Engine v0.5.4\"")

run("git cherry-pick 238e148")
run("git cherry-pick 743bdb3")
run("git cherry-pick 58e8e65")
run("git cherry-pick fb259cd")
run("git cherry-pick 9461a81")
run("git cherry-pick 98f751b")

run("git checkout main")
run("git reset --hard clean-history")
run("git push --force")

print("All done!")
