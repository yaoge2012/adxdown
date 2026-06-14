import sys, json, zipfile

zip_path = sys.argv[1]
try:
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.endswith("maidata.txt") or name == "maidata.txt":
                content = z.read(name).decode("utf-8")
                data = {}
                for line in content.split("\n"):
                    line = line.strip()
                    if line.startswith("&"):
                        eq = line.find("=")
                        if eq > 0:
                            key = line[1:eq]
                            val = line[eq + 1 :]
                            data[key] = val
                print(json.dumps(data, ensure_ascii=False))
                sys.exit(0)
        print(json.dumps({}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
