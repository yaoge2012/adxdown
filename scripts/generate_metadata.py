#!/usr/bin/env python3
import json, os, sys, zipfile

# 解决 Windows 终端 GBK 无法打印中文的问题
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
elif hasattr(sys.stdout, 'encoding') and sys.stdout.encoding and sys.stdout.encoding.upper() != 'UTF-8':
    os.environ['PYTHONIOENCODING'] = 'utf-8'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES_DIR = os.path.join(ROOT, "files")
DATA_DIR = os.path.join(ROOT, "data")

DIFFICULTY_MAP = {
    "2": "Basic", "3": "Advanced", "4": "Expert", "5": "Master", "6": "ReMaster",
}
CHART_EXTENSIONS = (".zip", ".adx", ".rar", ".7z", ".ma2", ".txt")


def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))


def parse_maidata_text(content):
    data = {}
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("&"):
            eq = line.find("=")
            if eq > 0:
                data[line[1:eq]] = line[eq + 1:]
    return data


def extract_maidata_from_zip(zip_path):
    try:
        with zipfile.ZipFile(zip_path) as z:
            for name in z.namelist():
                if name.endswith("maidata.txt") or name == "maidata.txt":
                    return parse_maidata_text(z.read(name).decode("utf-8"))
    except Exception:
        pass
    return None


def build_chart_entries(maidata):
    charts = []
    for i in range(2, 7):
        lv = maidata.get(f"lv_{i}")
        if lv is not None and lv != "":
            charts.append({
                "difficulty": DIFFICULTY_MAP.get(str(i), ""),
                "level": lv,
                "charter": maidata.get(f"des_{i}", "") or maidata.get("des", ""),
            })
    return charts


def process_version_folder(folder_name):
    folder_path = os.path.join(FILES_DIR, folder_name)
    if not os.path.isdir(folder_path):
        safe_print(f"  [跳过] 文件夹不存在: {folder_name}")
        return {}

    cache = {}
    success_count = 0
    skip_count = 0

    for entry in os.scandir(folder_path):
        if not entry.is_file() or entry.name.startswith("."):
            continue
        ext = os.path.splitext(entry.name)[1].lower()
        if ext not in CHART_EXTENSIONS or entry.name in ("manifest.json", "maidata.json"):
            continue

        maidata = extract_maidata_from_zip(entry.path)
        if maidata is None or not maidata.get("title"):
            skip_count += 1
            safe_print(f"  [跳过] {entry.name}")
            continue

        charts = build_chart_entries(maidata)
        cache[entry.name] = {
            "title": maidata.get("title", ""),
            "artist": maidata.get("artist", ""),
            "charts": charts,
        }
        safe_print(f"  [成功] {entry.name} -> {maidata['title']} ({len(charts)} 个难度)")
        success_count += 1

    safe_print(f"  [{folder_name}] 完成: {success_count} 成功, {skip_count} 跳过")
    return cache


def main():
    safe_print("=" * 60)
    safe_print("  ADX Download - 谱面元数据一键生成")
    safe_print("=" * 60)

    versions_path = os.path.join(DATA_DIR, "versions.json")
    if not os.path.exists(versions_path):
        safe_print(f"[错误] 找不到 {versions_path}")
        return

    with open(versions_path, "r", encoding="utf-8") as f:
        versions = json.load(f)

    total_ok = 0
    total_skip = 0

    for v in versions:
        folder_name = v.get("folder", v.get("id", "?"))
        version_name = v.get("name", folder_name)

        safe_print(f"\n[{version_name}] ({folder_name})")
        cache = process_version_folder(folder_name)

        for fn, data in cache.items():
            total_ok += len(data.get("charts", []))

        if os.path.isdir(os.path.join(FILES_DIR, folder_name)):
            for entry in os.scandir(os.path.join(FILES_DIR, folder_name)):
                if entry.is_file() and entry.name not in (".", "..", "manifest.json", "maidata.json") and not entry.name.startswith("."):
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in CHART_EXTENSIONS and entry.name not in cache:
                        total_skip += 1

        cache_path = os.path.join(FILES_DIR, folder_name, "maidata.json")
        if cache:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
        elif os.path.exists(cache_path):
            os.remove(cache_path)

    safe_print(f"\n{'=' * 60}")
    safe_print(f"  任务完成！共处理 {total_ok} 个谱面条目，跳过 {total_skip} 个文件")
    safe_print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
