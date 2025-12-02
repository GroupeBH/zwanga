#!/usr/bin/env python3
"""
Generate Google Play Store Feature Graphic for Zwanga
Requires: pip install Pillow
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Dimensions
WIDTH = 1024
HEIGHT = 500

# Colors (from your app theme)
PRIMARY_COLOR = "#FF6B35"  # Orange
SECONDARY_COLOR = "#F7B801"  # Gold/Yellow
WHITE = "#FFFFFF"
DARK_GRAY = "#1F2937"

def create_feature_graphic():
    # Create image with gradient background
    img = Image.new('RGB', (WIDTH, HEIGHT), color=PRIMARY_COLOR)
    draw = ImageDraw.Draw(img)
    
    # Create gradient background
    for y in range(HEIGHT):
        # Gradient from primary to secondary
        ratio = y / HEIGHT
        r1, g1, b1 = tuple(int(PRIMARY_COLOR[i:i+2], 16) for i in (1, 3, 5))
        r2, g2, b2 = tuple(int(SECONDARY_COLOR[i:i+2], 16) for i in (1, 3, 5))
        r = int(r1 + (r2 - r1) * ratio)
        g = int(g1 + (g2 - g1) * ratio)
        b = int(b1 + (b2 - b1) * ratio)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))
    
    # Try to load a font (fallback to default if not available)
    try:
        # Try to use system fonts
        title_font = ImageFont.truetype("arial.ttf", 80) if os.name == 'nt' else ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 80)
        subtitle_font = ImageFont.truetype("arial.ttf", 40) if os.name == 'nt' else ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
    except:
        try:
            title_font = ImageFont.truetype("arial.ttf", 80)
            subtitle_font = ImageFont.truetype("arial.ttf", 40)
        except:
            # Use default font
            title_font = ImageFont.load_default()
            subtitle_font = ImageFont.load_default()
    
    # Add main title "ZWANGA"
    title_text = "ZWANGA"
    title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    title_height = title_bbox[3] - title_bbox[1]
    title_x = (WIDTH - title_width) // 2
    title_y = 100
    draw.text((title_x, title_y), title_text, fill=WHITE, font=title_font)
    
    # Add subtitle
    subtitle_text = "Ride-Sharing in Kinshasa"
    subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=subtitle_font)
    subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
    subtitle_x = (WIDTH - subtitle_width) // 2
    subtitle_y = title_y + title_height + 20
    draw.text((subtitle_x, subtitle_y), subtitle_text, fill=WHITE, font=subtitle_font)
    
    # Add feature icons/text (using text as placeholders)
    features = [
        ("🚗 Find Rides", 150),
        ("🚙 Share Trips", 350),
        ("⭐ Verified", 550),
        ("💬 Chat", 750)
    ]
    
    feature_font_size = 24
    try:
        feature_font = ImageFont.truetype("arial.ttf", feature_font_size) if os.name == 'nt' else ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", feature_font_size)
    except:
        feature_font = ImageFont.load_default()
    
    feature_y = subtitle_y + 80
    for feature_text, x_pos in features:
        bbox = draw.textbbox((0, 0), feature_text, font=feature_font)
        text_width = bbox[2] - bbox[0]
        draw.text((x_pos, feature_y), feature_text, fill=WHITE, font=feature_font)
    
    # Add decorative elements (circles)
    circle_y = HEIGHT - 100
    for i in range(3):
        x = 200 + (i * 250)
        draw.ellipse([x-30, circle_y-30, x+30, circle_y+30], fill=WHITE, outline=None, width=0)
        draw.ellipse([x-20, circle_y-20, x+20, circle_y+20], fill=PRIMARY_COLOR, outline=None, width=0)
    
    # Save the image
    output_path = "assets/images/feature-graphic.png"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG", optimize=True)
    print(f"✅ Feature graphic created: {output_path}")
    print(f"   Dimensions: {WIDTH}×{HEIGHT}px")
    print(f"   File size: {os.path.getsize(output_path) / 1024:.2f} KB")
    print("\n⚠️  Note: This is a basic template. For best results:")
    print("   1. Replace with your actual Zwanga logo")
    print("   2. Use professional fonts")
    print("   3. Add high-quality icons")
    print("   4. Refine colors and layout")
    print("   5. Consider using Canva or Figma for better design")

if __name__ == "__main__":
    try:
        create_feature_graphic()
    except ImportError:
        print("❌ Error: Pillow is not installed.")
        print("   Install it with: pip install Pillow")
    except Exception as e:
        print(f"❌ Error: {e}")
        print("   This script creates a basic template.")
        print("   For best results, use Canva or Figma as described in FEATURE_GRAPHIC_GUIDE.md")

