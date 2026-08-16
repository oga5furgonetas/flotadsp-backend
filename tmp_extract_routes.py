import re
import sys

filepath = sys.argv[1] if len(sys.argv) > 1 else "backend/server.py"
content = open(filepath, "r", encoding="utf-8").read()
routes = re.findall(r'@(api_router|auth_router)\.(get|post|put|patch|delete)\(\"(.*?)\"', content)
print(f"Total endpoints: {len(routes)}")
for m in routes:
    print(m[2])
