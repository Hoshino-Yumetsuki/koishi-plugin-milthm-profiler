#!/usr/bin/env python3
"""
转换 milthm-calculator-web 的资源文件
将图片转换为 AVIF 格式并复制到 assets 目录
"""

import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from PIL import Image

# 项目根目录
PROJECT_ROOT = Path(__file__).parent
SOURCE_ROOT = PROJECT_ROOT / "milthm-calculator-web"
TARGET_ASSETS = PROJECT_ROOT / "assets"

# 线程安全锁（用于 print）
_print_lock = threading.Lock()

def safe_print(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs)

def convert_image_to_avif(source_path: Path, target_path: Path, quality: int = 85):
    """
    转换图片文件到 AVIF 格式
    PNG 文件保留 alpha 通道，JPG 文件转为 RGB

    Args:
        source_path: 源图片文件路径
        target_path: 目标 AVIF 文件路径
        quality: AVIF 质量 (0-100)
    """
    try:
        with Image.open(source_path) as img:
            # 确保目标目录存在
            target_path.parent.mkdir(parents=True, exist_ok=True)

            is_png = source_path.suffix.lower() == '.png'

            if is_png:
                # PNG 文件：保留 alpha 通道
                if img.mode == 'RGBA':
                    pass  # 保持 RGBA
                elif img.mode == 'LA':
                    img = img.convert('RGBA')
                elif img.mode == 'P':
                    # 调色板模式可能包含透明度
                    img = img.convert('RGBA')
                else:
                    img = img.convert('RGBA')
            else:
                # JPG/其他：转为 RGB（无 alpha）
                if img.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'RGBA':
                        background.paste(img, mask=img.split()[3])
                    else:
                        background.paste(img, mask=img.split()[1])
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

            # 转换为 AVIF
            img.save(target_path, "AVIF", quality=quality)

            # 输出文件大小对比
            source_size = source_path.stat().st_size / 1024
            target_size = target_path.stat().st_size / 1024
            reduction = (1 - target_size / source_size) * 100 if source_size > 0 else 0

            alpha_info = " (with alpha)" if is_png else ""
            safe_print(f"✓ {source_path.name} -> {target_path.name}{alpha_info}")
            safe_print(f"  {source_size:.1f}KB -> {target_size:.1f}KB (减少 {reduction:.1f}%)")

    except Exception as e:
        safe_print(f"✗ 转换失败 {source_path.name}: {e}")

def copy_file(source_path: Path, target_path: Path):
    """复制文件"""
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        safe_print(f"📄 复制: {source_path.name}")
    except Exception as e:
        safe_print(f"✗ 复制失败 {source_path.name}: {e}")

def main():
    import os
    max_workers = min(32, (os.cpu_count() or 4) * 2)

    print("=" * 60)
    print("Milthm 资产转换脚本（多线程模式）")
    print(f"🔧 并发线程数: {max_workers}")
    print("=" * 60)

    # 检查源目录是否存在
    if not SOURCE_ROOT.exists():
        print(f"❌ 错误: 源目录不存在: {SOURCE_ROOT}")
        print("请确保已初始化子模块: git submodule update --init")
        return

    # 清空目标目录
    if TARGET_ASSETS.exists():
        print(f"🗑️  清空目标目录: {TARGET_ASSETS}")
        shutil.rmtree(TARGET_ASSETS)

    TARGET_ASSETS.mkdir(parents=True, exist_ok=True)

    # 收集所有任务
    image_tasks: list[tuple] = []  # (source, target, quality)
    copy_tasks:  list[tuple] = []  # (source, target)

    # 处理背景图
    bg_folder = SOURCE_ROOT / "jpgs" / "background"
    if bg_folder.exists():
        bg_target = TARGET_ASSETS / "backgrounds"
        bg_target.mkdir(parents=True, exist_ok=True)
        for bg_file in bg_folder.glob("*"):
            if bg_file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.avif']:
                if bg_file.suffix.lower() == '.avif':
                    copy_tasks.append((bg_file, bg_target / bg_file.name))
                else:
                    target_path = bg_target / bg_file.with_suffix('.avif').name
                    image_tasks.append((bg_file, target_path, 85))

    # 处理歌曲封面和图标
    jpgs_folder = SOURCE_ROOT / "jpgs"
    covers_target = TARGET_ASSETS / "covers"
    covers_target.mkdir(parents=True, exist_ok=True)
    for cover_file in jpgs_folder.glob("*"):
        if cover_file.is_file() and cover_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
            target_path = covers_target / cover_file.with_suffix('.avif').name
            q = 90 if cover_file.suffix.lower() == '.png' else 75
            image_tasks.append((cover_file, target_path, q))

    # 收集字体文件
    fonts_source = SOURCE_ROOT / "fonts"
    if fonts_source.exists():
        for font_file in fonts_source.rglob("*"):
            if font_file.is_file() and font_file.suffix.lower() in ['.ttf', '.otf', '.woff', '.woff2']:
                relative_path = font_file.relative_to(fonts_source)
                target_path = TARGET_ASSETS / "fonts" / relative_path
                copy_tasks.append((font_file, target_path))

    total_images = len(image_tasks)
    total_fonts  = len(copy_tasks)

    print(f"\n📊 待处理: {total_images} 张图片, {total_fonts} 个字体")
    print("-" * 60)

    # 并行执行图片转换
    completed = threading.Event()
    counter = {"done": 0}
    counter_lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交图片转换任务
        img_futures = {
            executor.submit(convert_image_to_avif, src, dst, q): src
            for src, dst, q in image_tasks
        }
        # 提交文件复制任务
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
            # 每完成 20 个输出一次进度
            if done % 20 == 0 or done == total:
                safe_print(f"  ⏳ 进度: {done}/{total}")

    print("\n" + "=" * 60)
    print("转换完成!")
    print("=" * 60)
    print("📊 统计:")
    print(f"  图片: {total_images} 个")
    print(f"  字体: {total_fonts} 个")
    print(f"✅ 资产已保存到: {TARGET_ASSETS}")

if __name__ == "__main__":
    main()
