#!/usr/bin/env python3
"""
转换 milthm-calculator-web 的资源文件
将图片转换为 AVIF 格式并复制到 assets 目录
"""

import shutil
from pathlib import Path
from PIL import Image

# 项目根目录
PROJECT_ROOT = Path(__file__).parent
SOURCE_ROOT = PROJECT_ROOT / "milthm-calculator-web"
TARGET_ASSETS = PROJECT_ROOT / "assets"

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
            print(f"✓ {source_path.name} -> {target_path.name}{alpha_info}")
            print(f"  {source_size:.1f}KB -> {target_size:.1f}KB (减少 {reduction:.1f}%)")

    except Exception as e:
        print(f"✗ 转换失败 {source_path.name}: {e}")

def copy_file(source_path: Path, target_path: Path):
    """复制文件"""
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        print(f"📄 复制: {source_path.name}")
    except Exception as e:
        print(f"✗ 复制失败 {source_path.name}: {e}")

def main():
    print("=" * 60)
    print("Milthm 资产转换脚本")
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

    # 统计信息
    total_images = 0
    total_fonts = 0

    # 处理背景图
    print("\n📂 处理背景图...")
    print("-" * 60)
    bg_folder = SOURCE_ROOT / "jpgs" / "background"
    if bg_folder.exists():
        bg_target = TARGET_ASSETS / "backgrounds"
        bg_target.mkdir(parents=True, exist_ok=True)

        for bg_file in bg_folder.glob("*"):
            if bg_file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.avif']:
                if bg_file.suffix.lower() == '.avif':
                    # 直接复制 AVIF
                    copy_file(bg_file, bg_target / bg_file.name)
                else:
                    # 转换其他格式到 AVIF
                    target_path = bg_target / bg_file.with_suffix('.avif').name
                    convert_image_to_avif(bg_file, target_path)
                total_images += 1

    # 处理歌曲封面和图标（包括 JPG 封面和 PNG 图标/等级标志）
    print("\n📂 处理歌曲封面和图标...")
    print("-" * 60)
    jpgs_folder = SOURCE_ROOT / "jpgs"
    covers_target = TARGET_ASSETS / "covers"
    covers_target.mkdir(parents=True, exist_ok=True)

    # 只处理主目录的图片文件，排除子目录
    for cover_file in jpgs_folder.glob("*"):
        if cover_file.is_file() and cover_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
            target_path = covers_target / cover_file.with_suffix('.avif').name
            # PNG 图标使用更高质量以保留 alpha 通道细节
            q = 90 if cover_file.suffix.lower() == '.png' else 75
            convert_image_to_avif(cover_file, target_path, quality=q)
            total_images += 1
            if total_images % 20 == 0:
                print(f"  已处理 {total_images} 个文件...")

    # 复制字体文件
    print("\n📂 复制字体文件...")
    print("-" * 60)
    fonts_source = SOURCE_ROOT / "fonts"
    if fonts_source.exists():
        for font_file in fonts_source.rglob("*"):
            if font_file.is_file() and font_file.suffix.lower() in ['.ttf', '.otf', '.woff', '.woff2']:
                relative_path = font_file.relative_to(fonts_source)
                target_path = TARGET_ASSETS / "fonts" / relative_path
                copy_file(font_file, target_path)
                total_fonts += 1

    print("\n" + "=" * 60)
    print("转换完成!")
    print("=" * 60)
    print("📊 统计:")
    print(f"  图片: {total_images} 个")
    print(f"  字体: {total_fonts} 个")
    print(f"✅ 资产已保存到: {TARGET_ASSETS}")

if __name__ == "__main__":
    main()
