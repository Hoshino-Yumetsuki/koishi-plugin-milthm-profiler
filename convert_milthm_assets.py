#!/usr/bin/env python3
"""
转换 MilResource 的插图资源文件
将 PNG 插图转换为 AVIF 格式并复制到 assets 目录
同时生成 cover-map.json（歌名 → avif 文件名的映射）
"""

import json
import re
import shutil
import sys

# 强制 stdout/stderr 使用 UTF-8，避免 Windows GBK 编码问题
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')  # type: ignore
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote
from PIL import Image

# 项目根目录
PROJECT_ROOT = Path(__file__).parent
MIL_RESOURCE_ROOT = PROJECT_ROOT / "third_party" / "MilResource" / "resource"
FONT_SOURCE_ROOT = PROJECT_ROOT / "third_party" / "milthm-calculator-web"
TARGET_ASSETS = PROJECT_ROOT / "assets"

# 线程安全锁（用于 print）
_print_lock = threading.Lock()


def safe_print(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs)


def sanitize_filename(name: str) -> str:
    """将歌名转换为合法的文件名（与 image.ts normalizeCoverFileName 保持一致）"""
    # NFC 规范化
    name = unicodedata.normalize("NFC", name)
    # 替换非法字符
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    # 过滤控制字符
    name = "".join(c for c in name if ord(c) >= 0x20)
    # 合并空白
    name = re.sub(r"[\u3000\s]+", " ", name)
    # 去除末尾点和空格
    name = re.sub(r"[. ]+$", "", name)
    return name.strip()


def parse_out_json(out_json_path: Path) -> dict[str, str]:
    """
    解析 out.json，返回 { song_title: png_filename } 映射。
    同时收录 SharingMetaData.Title 和所有 Level.MetaData.Title，
    确保 constant.js 里的任何歌名变体都能找到对应封面。
    """
    with open(out_json_path, encoding="utf-8") as f:
        chapters = json.load(f)

    title_to_png: dict[str, str] = {}

    for chapter in (chapters if isinstance(chapters, list) else chapters.values()):
        for song in chapter.get("Songs", []):
            sharing = song.get("SharingMetaData", {})
            uri: str = sharing.get("IllustrationUri", "")
            if not uri:
                continue

            raw_filename = uri.split("/")[-1]
            decoded = unquote(raw_filename)
            png_filename = re.sub(r"\.milimg$", ".png", decoded, flags=re.IGNORECASE)

            # 收录 SharingMetaData.Title
            sharing_title: str = sharing.get("Title", "")
            if sharing_title and sharing_title not in title_to_png:
                title_to_png[sharing_title] = png_filename

            # 收录所有 Level.MetaData.Title（可能与 SharingMetaData.Title 不同）
            for level in song.get("Levels", []):
                level_title: str = level.get("MetaData", {}).get("Title", "")
                if level_title and level_title not in title_to_png:
                    title_to_png[level_title] = png_filename

    return title_to_png


def convert_image(source_path: Path, target_path: Path, quality: int = 85, fmt: str = "AVIF"):
    """
    转换图片文件到目标格式（AVIF 或 WebP）
    PNG 文件保留 alpha 通道，JPG 文件转为 RGB
    """
    try:
        with Image.open(source_path) as img:
            target_path.parent.mkdir(parents=True, exist_ok=True)

            is_png = source_path.suffix.lower() == ".png"

            if fmt == "WEBP":
                # WebP: 保留 alpha（RGBA）或转 RGB
                if is_png:
                    if img.mode not in ("RGBA",):
                        img = img.convert("RGBA")
                else:
                    if img.mode in ("RGBA", "LA"):
                        background = Image.new("RGB", img.size, (255, 255, 255))
                        mask = img.split()[3] if img.mode == "RGBA" else img.split()[1]
                        background.paste(img, mask=mask)
                        img = background
                    elif img.mode != "RGB":
                        img = img.convert("RGB")
                img.save(target_path, "WEBP", quality=quality, method=6)
            else:
                # AVIF: 用于 icons/backgrounds（小文件，vips 能正常解码）
                if is_png:
                    if img.mode not in ("RGBA",):
                        img = img.convert("RGBA")
                else:
                    if img.mode in ("RGBA", "LA"):
                        background = Image.new("RGB", img.size, (255, 255, 255))
                        mask = img.split()[3] if img.mode == "RGBA" else img.split()[1]
                        background.paste(img, mask=mask)
                        img = background
                    elif img.mode != "RGB":
                        img = img.convert("RGB")
                img.save(target_path, "AVIF", quality=quality, autotiling=False)

            source_size = source_path.stat().st_size / 1024
            target_size = target_path.stat().st_size / 1024
            reduction = (1 - target_size / source_size) * 100 if source_size > 0 else 0
            alpha_info = " (with alpha)" if is_png else ""
            safe_print(f"[OK] {source_path.name} -> {target_path.name}{alpha_info}")
            safe_print(f"  {source_size:.1f}KB -> {target_size:.1f}KB (减少 {reduction:.1f}%)")

    except Exception as e:
        safe_print(f"[FAIL] 转换失败 {source_path.name}: {e}")


def copy_file(source_path: Path, target_path: Path):
    """复制文件"""
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        safe_print(f"[C] 复制: {source_path.name}")
    except Exception as e:
        safe_print(f"[FAIL] 复制失败 {source_path.name}: {e}")


def main():
    import os

    max_workers = min(32, (os.cpu_count() or 4) * 2)

    print("=" * 60)
    print("Milthm 资产转换脚本（多线程模式）")
    print(f"[*] 并发线程数: {max_workers}")
    print("=" * 60)

    # 检查源目录
    illustration_dir = MIL_RESOURCE_ROOT / "illustration"
    out_json_path = MIL_RESOURCE_ROOT / "out.json"

    if not illustration_dir.exists():
        print(f"[E] 错误: 插图目录不存在: {illustration_dir}")
        print("请确保已初始化子模块: git submodule update --init --recursive")
        return

    if not out_json_path.exists():
        print(f"[E] 错误: out.json 不存在: {out_json_path}")
        return

    if not FONT_SOURCE_ROOT.exists():
        print(f"[E] 错误: 字体源目录不存在: {FONT_SOURCE_ROOT}")
        return

    # 清空目标目录（保留 backgrounds 和 icons，因为它们需要被提交）
    PRESERVE_DIRS = {'backgrounds', 'icons'}
    if TARGET_ASSETS.exists():
        print(f"[D]  清空目标目录: {TARGET_ASSETS}（保留 {', '.join(PRESERVE_DIRS)}）")
        for item in TARGET_ASSETS.iterdir():
            if item.name in PRESERVE_DIRS:
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    TARGET_ASSETS.mkdir(parents=True, exist_ok=True)

    # 解析 out.json 建立映射
    print("\n[R] 解析 out.json 建立歌名映射...")
    title_to_png = parse_out_json(out_json_path)
    print(f"  找到 {len(title_to_png)} 首歌曲")

    # 收集任务
    image_tasks: list[tuple] = []   # (source, target, quality, fmt)
    copy_tasks: list[tuple] = []    # (source, target)

    # cover-map.json: { title → webp_filename }
    cover_map: dict[str, str] = {}

    covers_target = TARGET_ASSETS / "covers"
    covers_target.mkdir(parents=True, exist_ok=True)

    for title, png_filename in title_to_png.items():
        source_path = illustration_dir / png_filename
        if not source_path.exists():
            safe_print(f"[W]  找不到插图: {png_filename} (歌曲: {title})")
            continue

        # 用原始 PNG 文件名 stem 作为 WebP 文件名，保持与 MilResource 的映射一致
        webp_filename = Path(png_filename).stem + ".webp"

        target_path = covers_target / webp_filename
        image_tasks.append((source_path, target_path, 85, "WEBP"))
        cover_map[title] = webp_filename

    # 收集字体文件
    fonts_source = FONT_SOURCE_ROOT / "fonts"
    if fonts_source.exists():
        for font_file in fonts_source.rglob("*"):
            if font_file.is_file() and font_file.suffix.lower() in [
                ".ttf", ".otf", ".woff", ".woff2",
            ]:
                relative_path = font_file.relative_to(fonts_source)
                target_path = TARGET_ASSETS / "fonts" / relative_path
                copy_tasks.append((font_file, target_path))

    total_images = len(image_tasks)
    total_copies = len(copy_tasks)

    print(f"\n[S] 待处理: {total_images} 张图片, {total_copies} 个文件")
    print("-" * 60)

    # 并行执行
    counter = {"done": 0}
    counter_lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        img_futures = {
            executor.submit(convert_image, src, dst, q, fmt): src
            for src, dst, q, fmt in image_tasks
        }
        copy_futures = {
            executor.submit(copy_file, src, dst): src
            for src, dst in copy_tasks
        }

        all_futures = {**img_futures, **copy_futures}
        total = len(all_futures)

        for future in as_completed(all_futures):
            with counter_lock:
                counter["done"] += 1
                done = counter["done"]
            if done % 20 == 0 or done == total:
                safe_print(f"  [..] 进度: {done}/{total}")

    # 写入 cover-map.json
    cover_map_path = covers_target / "cover-map.json"
    with open(cover_map_path, "w", encoding="utf-8") as f:
        json.dump(cover_map, f, ensure_ascii=False, indent=2)
    print(f"\n[J] cover-map.json 已生成: {len(cover_map)} 条映射")

    print("\n" + "=" * 60)
    print("转换完成!")
    print("=" * 60)
    print("[S] 统计:")
    print(f"  图片: {total_images} 个")
    print(f"  文件: {total_copies} 个")
    print(f"  封面映射: {len(cover_map)} 条")
    print(f"[DONE] 资产已保存到: {TARGET_ASSETS}")


if __name__ == "__main__":
    main()

