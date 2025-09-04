import re
import sys
import subprocess
from os import listdir

# files = listdir('./wartime-1943/originals')
# for f in files:
#     print(f)

result = subprocess.run(["ls", "wartime-1944/originals"], stdout=subprocess.PIPE)
text = result.stdout.decode("utf-8")
files = text.split("\n")
# print(files)

pattern = "\d{6}-\d+"
matches = 0

for f in files:
    match = re.search(pattern, f)
    if not match:
        print(f)
    else:
        matches += 1

print(matches)