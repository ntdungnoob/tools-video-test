import os
from PIL import Image, ImageDraw, ImageFont

# Canvas size 720x1280 (9:16)
W, H = 720, 1280

# Load background and resize
bg = Image.open("assets/bg.jpg").convert("RGBA")
bg = bg.resize((W, H), Image.LANCZOS)

# Create drawing layer
draw = ImageDraw.Draw(bg)

# Fonts
font_serif = ImageFont.truetype("assets/fonts/serif_bold.ttf", 46)
font_sans_med = ImageFont.truetype("assets/fonts/sans_bold.ttf", 18)
font_sans_small = ImageFont.truetype("assets/fonts/sans_bold.ttf", 15)
font_sans_sub = ImageFont.truetype("assets/fonts/sans_bold.ttf", 13)

def draw_centered_text(draw, y, text, font, fill=(255, 255, 255, 230), line_spacing=8):
    lines = text.split("\n")
    cur_y = y
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        x = (W - text_w) // 2
        # Subtle drop shadow for luxury feel
        draw.text((x + 1, cur_y + 1), line, font=font, fill=(0, 0, 0, 140))
        draw.text((x, cur_y), line, font=font, fill=fill)
        cur_y += text_h + line_spacing

# 1. Invitation text
draw_centered_text(
    draw, 390,
    "KARVE MEILLEUR CORDIALLY INVITES YOU\nTO THE OPENING OF OUR FIRST STORE\nIN HO CHI MINH CITY.",
    font_sans_med, fill=(240, 240, 240, 240), line_spacing=8
)

# 2. Brand Name
draw_centered_text(
    draw, 620,
    "KARVE MEILLEUR",
    font_serif, fill=(245, 245, 245, 240)
)

# 3. Date
draw_centered_text(
    draw, 790,
    "DATE: JANUARY 13, 2026",
    font_sans_small, fill=(235, 235, 235, 230)
)

# 4. Location
draw_centered_text(
    draw, 870,
    "LOCATION: RUE MICHE  L'EDITION,\nUNION SQUARE, LEVEL B3.\n171 DONG KHOI ST, DISTRICT 1. HCMC.",
    font_sans_small, fill=(235, 235, 235, 230), line_spacing=8
)

# 5. Website
draw_centered_text(
    draw, 1080,
    "KARVEMEILLEUR.COM",
    font_sans_sub, fill=(180, 180, 180, 180)
)

bg.convert("RGB").save("assets/template_base.png")
print("Template base image generated: assets/template_base.png")
