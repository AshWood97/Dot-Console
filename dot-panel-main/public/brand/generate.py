"""Original Dot Console geometry, 2026. No external artwork or fonts required for the mark."""
from pathlib import Path
import json
P=Path(__file__).parent
DARK='#173E32'; LIGHT='#F4F7F0'; MINT='#9AD6B3'
def svg(body,w=32,h=32):
 return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Dot Console">\n  <title>Dot Console</title>\n{body}\n</svg>\n'
def mark(bg=DARK,ink=LIGHT,dot=MINT):
 return f'''  <rect width="32" height="32" rx="9" fill="{bg}"/>
  <path d="m8 10 6 6-6 6" fill="none" stroke="{ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="23" cy="21" r="3" fill="{dot}"/>'''
for mode,ink in [('light',DARK),('dark',LIGHT)]:
 (P/f'mark-{mode}.svg').write_text(svg(mark()))
 word=svg(mark()+f'\n  <text x="44" y="23" fill="{ink}" font-family="system-ui, sans-serif" font-size="22" font-weight="650" letter-spacing="-.5">Dot Console</text>',180,32)
 for prefix in ['wordmark','wordmark-editable']:(P/f'{prefix}-{mode}.svg').write_text(word)
(P/'favicon.svg').write_text(svg(mark()))
(P/'mark-mono.svg').write_text(svg(mark('currentColor','white','white')))
def lum(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
 return sum(w*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4) for w,v in zip((.2126,.7152,.0722),c))
def contrast(a,b):
 l=sorted([lum(a),lum(b)]);return round((l[1]+.05)/(l[0]+.05),2)
(P/'contrast.json').write_text(json.dumps([{'usage':n,'foreground':a,'background':DARK,'ratio':contrast(a,DARK)} for n,a in [('Command chevron',LIGHT),('Assistant dot',MINT)]],indent=2)+'\n')
