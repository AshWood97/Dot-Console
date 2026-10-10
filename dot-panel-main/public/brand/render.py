"""Render the canonical SVGs using installed Inkscape and Pillow; no network."""
from pathlib import Path
import subprocess
from PIL import Image
p=Path(__file__).parent
def render(name,out,width,height):
 subprocess.run(['inkscape',str(p/name),'--export-type=png',f'--export-filename={p/out}',f'--export-width={width}',f'--export-height={height}'],check=True,stdout=subprocess.DEVNULL)
for mode in ('dark','light'):render(f'wordmark-{mode}.svg',f'preview-{mode}.png',720,128)
for size in (16,32,48,180,192,512):render('favicon.svg',f'favicon-{size}.png',size,size)
Image.open(p/'favicon-512.png').save(p/'favicon.ico',sizes=[(16,16),(32,32),(48,48)])
sheet=Image.new('RGB',(848,360),'#173E32')
for mode,y,bg in [('dark',40,'#173E32'),('light',200,'#F4F7F0')]:
 plate=Image.new('RGB',(720,128),bg);im=Image.open(p/f'preview-{mode}.png').convert('RGBA');plate.paste(im,(0,0),im);sheet.paste(plate,(64,y))
sheet.save(p/'brand-preview.png')
sheet=Image.new('RGB',(360,128),'#EDF3EB')
for x,size in [(16,16),(64,32),(128,16),(240,32)]:
 source=Image.open(p/f'favicon-{size}.png').convert('RGBA')
 if x>=100:source=source.resize((96,96),Image.Resampling.NEAREST)
 sheet.paste(source,(x,16),source)
sheet.save(p/'favicon-preview.png')
