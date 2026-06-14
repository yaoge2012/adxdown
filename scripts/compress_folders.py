#!/usr/bin/env python3
import json, os, zipfile, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES_DIR = os.path.join(ROOT, "files")
DATA_DIR = os.path.join(ROOT, "data")

versions_path = os.path.join(DATA_DIR, "versions.json")
with open(versions_path, "r", encoding="utf-8") as f:
    versions = json.load(f)


def zip_dir(dir_path, zip_path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(dir_path):
            for fn in files:
                fp = os.path.join(root, fn)
                arcname = os.path.relpath(fp, dir_path)
                zf.write(fp, arcname)


def remove_empty_parents(start_path):
    removed = 0
    for root, dirs, files in os.walk(start_path, topdown=False):
        if root == start_path:
            continue
        if not os.path.isdir(root):
            continue
        try:
            remaining = list(os.scandir(root))
            if len(remaining) == 0:
                os.rmdir(root)
                removed += 1
        except (PermissionError, OSError):
            pass
    return removed


total_zipped = 0
total_skipped = 0
exit_code = 0

for v in versions:
    folder_name = v.get("folder", v.get("id"))
    folder_path = os.path.join(FILES_DIR, folder_name)
    if not os.path.isdir(folder_path):
        continue

    chart_dirs = []
    for entry in os.scandir(folder_path):
        if not entry.is_dir():
            continue
        try:
            for sub in os.scandir(entry.path):
                if sub.is_dir():
                    chart_dirs.append(sub.path)
        except PermissionError:
            print("  [错误] 无法扫描 " + entry.path)
            exit_code = 1
            continue

    if not chart_dirs:
        continue

    print("[" + folder_name + "] 发现 " + str(len(chart_dirs)) + " 个谱面文件夹")

    for src_dir in sorted(chart_dirs):
        dir_name = os.path.basename(src_dir)
        zip_name = dir_name + ".zip"
        zip_path = os.path.join(folder_path, zip_name)

        if os.path.exists(zip_path):
            print("  [跳过] " + dir_name + " (zip 已存在)")
            total_skipped += 1
            continue

        try:
            zip_dir(src_dir, zip_path)
            shutil.rmtree(src_dir)
            print("  [压缩] " + dir_name)
            total_zipped += 1
        except Exception as e:
            print("  [失败] " + dir_name + ": " + str(e))
            if os.path.exists(zip_path):
                os.remove(zip_path)
            total_skipped += 1
            exit_code = 1

    cleaned = remove_empty_parents(folder_path)
    if cleaned:
        print("  [清理] 删除了 " + str(cleaned) + " 个空目录")

print("")
print("完成: " + str(total_zipped) + " 个已压缩, " + str(total_skipped) + " 个跳过")
sys.exit(exit_code)