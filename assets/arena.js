/* ═══════════════════════════════════════════════════════════════
   ARENA BACKDROP — "The Moonlit Colosseum".

   Split out of game.html. Loaded as a CLASSIC script (no ES module) so the
   page still works when opened directly from disk over file://, and so every
   top-level const/let stays in the one shared script scope it was written in.
   Load order is fixed by the <script> tags in game.html: skill → arena →
   codex → the main block. Code below is unchanged from the single-file build.
   ═══════════════════════════════════════════════════════════════ */

"use strict";

/* ═══════════════════════════════════════════════════════════════
   ARENA BACKDROP — "The Moonlit Colosseum"

   Composition, back to front:
     sky wash → nebula → stars → mountain ridge → moon + corona →
     moon-gate → tiered stands + arcade → flanking pillars →
     barrier wall → floor plane → inlaid rune ring → framing columns

   Everything listed above is STATIC. It is rasterised once into an
   offscreen canvas at 2x supersample and blitted each frame, so the
   per-frame cost is one drawImage plus the handful of layers that
   genuinely move: star twinkle, the crowd, torch flame and its light
   pool on the sand, the rotating rune ring, and drifting mist.

   Coordinate notes that constrain the design:
     · fighters roam x∈[120,880], y∈[130,380] (see Fighter.step clamps),
       so the floor must reach y≈130 even at the far corners and no
       scenery may intrude on that box.
     · the framing columns therefore live outside x∈[100,900].
     · the whole architecture band is squeezed into y∈[-40,120]. It
       reads as grand by cropping — pillars and arcade run off the top
       of the frame rather than being drawn small enough to fit.
   ═══════════════════════════════════════════════════════════════ */

/* --- geometry, all in arena space --- */
const AR = {
  pad: 60,                                    /* bleed around the blit   */
  rimCx: 500, rimCy: 345, rimRx: 1500, rimRy: 225,  /* barrier rim arc   */
  vpX: 500, vpY: 46,                          /* floor vanishing point   */
  moonX: 500, moonY: 62, moonR: 64,
  ringCx: 500, ringCy: 296, ringRx: 358, ringRy: 126,
  portal: 130                                 /* half-width of the gate  */
};
const BG_TOP = -AR.pad;
const BG_W   = ARENA_W + AR.pad*2;
const BG_H   = ARENA_H + 400 + AR.pad;
const BG_SS  = 2;

/* Barrier rim: a very shallow arc. It has to stay above y≈128 across the
   whole fighter box, which forces it nearly straight — the oval sweep of
   the arena is carried by the floor markings instead. */
const rimY = x => AR.rimCy - AR.rimRy*Math.sqrt(Math.max(0, 1 - ((x-AR.rimCx)/AR.rimRx)**2));
const wallTop = x => rimY(x) - 32;

/* Top of the seating. Dips away at the centre to open the moon-gate,
   climbs toward the frame edges where the stands are nearest camera. */
function standTop(x){
  const d = Math.abs(x - AR.rimCx);
  const k = clamp((d - AR.portal)/370, 0, 1);
  return lerp(80, 20, Math.pow(k, 0.65));
}

/* deterministic hashes — never Math.random in a draw call */
const aH  = n     => { const s = Math.sin(n*127.1 + 311.7)*43758.5453123; return s - Math.floor(s); };
const aH2 = (n,m) => { const s = Math.sin(n*269.5 + m*183.3)*43758.5453123; return s - Math.floor(s); };

/* torch anchors — shared so the static sconce and the live flame agree */
const TORCHES = [
  {x:  52, y: 214, s: 1.20},   /* framing column, left   */
  {x: 948, y: 214, s: 1.20},   /* framing column, right  */
  {x: 372, y: 104, s: 0.80},   /* gate pillar, left      */
  {x: 628, y: 104, s: 0.80},   /* gate pillar, right     */
  {x: 196, y:  96, s: 0.62},   /* stands, left           */
  {x: 804, y:  96, s: 0.62}    /* stands, right          */
];

function gGlow(g, x, y, r, col, a){
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, col); rg.addColorStop(0.35, col+'88'); rg.addColorStop(1, col+'00');
  g.globalAlpha = a; g.fillStyle = rg;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
}

/* ───────────────────────── STATIC LAYERS ───────────────────────── */

function bgSky(g){
  const sky = g.createLinearGradient(0, BG_TOP, 0, 210);
  sky.addColorStop(0.00, '#0a0725');
  sky.addColorStop(0.28, '#1b1049');
  sky.addColorStop(0.55, '#331a72');
  sky.addColorStop(0.80, '#4d2490');
  sky.addColorStop(1.00, '#5c2f9c');
  g.fillStyle = sky;
  g.fillRect(BG_TOP, BG_TOP, BG_W, 210 - BG_TOP);

  /* nebula: a few soft additive blooms so the sky isn't a flat ramp */
  g.save(); g.globalCompositeOperation = 'lighter';
  const neb = [
    [190,  10, 210, '#6a3fc8', 0.38],
    [820,  26, 240, '#5433b4', 0.34],
    [500, -30, 300, '#3a4fd0', 0.26],
    [660,  86, 160, '#a044c8', 0.22],
    [300, 100, 150, '#3f78e0', 0.20]
  ];
  for(const [x,y,r,c,a] of neb) gGlow(g, x, y, r, c, a);
  g.restore();

  /* one lazy aurora ribbon drawn as a stack of thin quadratic bands */
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i=0;i<7;i++){
    const yo = 18 + i*7, a = 0.05*(1 - i/7);
    g.globalAlpha = a; g.strokeStyle = i%2 ? '#6fe0c8' : '#7aa8ff';
    g.lineWidth = 10 - i*0.8;
    g.beginPath();
    g.moveTo(-60, yo + 40);
    g.quadraticCurveTo(240, yo - 26, 520, yo + 16);
    g.quadraticCurveTo(800, yo + 52, 1060, yo - 4);
    g.stroke();
  }
  g.restore();
}

function bgStars(g){
  g.save();
  for(let i=0;i<260;i++){
    const x = aH(i*1.7)*BG_W + BG_TOP;
    const y = BG_TOP + aH2(i, 4.3)*205;
    if(y > 150 && Math.abs(x-500) > AR.portal) continue;  /* hidden by stands anyway */
    const b = aH2(i, 9.1);
    g.globalAlpha = 0.20 + b*0.62;
    g.fillStyle = b > 0.86 ? '#ffe9c4' : (b > 0.6 ? '#ffffff' : '#b9cdff');
    const r = 0.5 + b*1.25;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  /* a dozen bright four-point sparkles */
  g.globalCompositeOperation = 'lighter';
  for(let i=0;i<14;i++){
    const x = aH(i*5.1+2)*BG_W + BG_TOP;
    const y = BG_TOP + aH2(i, 7.7)*150;
    if(Math.abs(x-500) < 40 && y < 140) continue;         /* keep off the moon */
    const L = 4 + aH2(i,3.3)*7;
    g.globalAlpha = 0.5; g.strokeStyle = '#dbe9ff'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x-L, y); g.lineTo(x+L, y); g.moveTo(x, y-L); g.lineTo(x, y+L);
    g.stroke();
    gGlow(g, x, y, L*1.6, '#cfe0ff', 0.22);
  }
  g.restore();
}

function bgMoon(g){
  const {moonX:mx, moonY:my, moonR:mr} = AR;
  g.save();

  /* corona — wide, then a tighter hot core */
  g.globalCompositeOperation = 'lighter';
  gGlow(g, mx, my, mr*3.6, '#3f6ac4', 0.42);
  gGlow(g, mx, my, mr*2.0, '#7ea6ee', 0.34);
  gGlow(g, mx, my, mr*1.28,'#cfe2ff', 0.30);

  /* a pair of thin halo rings, the sort of thing that sells "celestial" */
  g.globalAlpha = 0.16; g.strokeStyle = '#a9c8ff'; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(mx, my, mr*1.85, mr*1.85, 0, 0, TAU); g.stroke();
  g.globalAlpha = 0.09; g.lineWidth = 3;
  g.beginPath(); g.ellipse(mx, my, mr*2.45, mr*2.45, 0, 0, TAU); g.stroke();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  /* disc. Peak value is held a little off pure white so the surface
     markings below still have somewhere to sit. */
  const d = g.createRadialGradient(mx - mr*0.30, my - mr*0.34, mr*0.10, mx, my, mr);
  d.addColorStop(0.00, '#f4f8ff');
  d.addColorStop(0.42, '#dfeafc');
  d.addColorStop(0.78, '#bdd1f1');
  d.addColorStop(1.00, '#8fa9d3');
  g.fillStyle = d;
  g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();

  /* surface, clipped to the disc. Deliberately low contrast — crisp rims at
     this size read as soap bubbles rather than as craters. */
  g.save();
  g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();

  /* maria: broad soft plains, stacked to fake a gradient falloff. These,
     not the craters, are what make the disc read as a moon at this size. */
  const maria = [
    [ 0.22,  0.30, 0.48, 0.34,  0.6],
    [-0.34,  0.10, 0.30, 0.23, -0.4],
    [ 0.30, -0.34, 0.22, 0.16,  0.9],
    [-0.06,  0.54, 0.36, 0.20,  0.2]
  ];
  for(const m of maria){
    for(let k=0;k<3;k++){
      g.globalAlpha = 0.055;
      g.fillStyle = '#8399c4';
      g.beginPath();
      g.ellipse(mx + m[0]*mr, my + m[1]*mr,
                m[2]*mr*(1 - k*0.24), m[3]*mr*(1 - k*0.24), m[4], 0, TAU);
      g.fill();
    }
  }

  /* craters: small, soft, and only the larger ones get a hint of a rim */
  for(let i=0;i<16;i++){
    const a   = aH(i*3.1)*TAU;
    const rr  = Math.sqrt(aH2(i,1.9))*mr*0.88;
    const cx0 = mx + Math.cos(a)*rr, cy0 = my + Math.sin(a)*rr;
    const cr  = 2.2 + aH2(i,6.2)*5.5;
    g.globalAlpha = 0.10 + aH2(i,2.4)*0.09;
    g.fillStyle = '#8ca3cc';
    g.beginPath(); g.ellipse(cx0, cy0, cr, cr*0.9, a, 0, TAU); g.fill();
    if(cr > 5){
      g.globalAlpha = 0.11; g.strokeStyle = '#e8f1ff'; g.lineWidth = 0.9;
      g.beginPath();
      g.ellipse(cx0-0.6, cy0-0.6, cr, cr*0.9, a, Math.PI*1.05, Math.PI*1.65);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  g.restore();

  /* limb darkening — a sphere, not a disc */
  const limb = g.createRadialGradient(mx, my, mr*0.55, mx, my, mr);
  limb.addColorStop(0.0, '#1b254700');
  limb.addColorStop(1.0, '#1b2547');
  g.globalAlpha = 0.26;
  g.fillStyle = limb;
  g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
  g.globalAlpha = 1;
  g.restore();
}

function bgMountains(g){
  /* two ridges; the far one is barely a value shift off the sky */
  const ridges = [
    {base: 116, hi: 74, col: '#1a1540', a: 0.95, seed: 3.2, n: 11},
    {base: 126, hi: 50, col: '#100c2c', a: 1.00, seed: 8.6, n: 9}
  ];
  g.save();
  for(const R of ridges){
    g.globalAlpha = R.a; g.fillStyle = R.col;
    g.beginPath();
    g.moveTo(BG_TOP, R.base);
    for(let i=0;i<=R.n;i++){
      const x  = BG_TOP + (i/R.n)*BG_W;
      const pk = R.base - (0.35 + aH2(i, R.seed)*0.65)*R.hi;
      const xm = BG_TOP + ((i-0.5)/R.n)*BG_W;
      g.lineTo(xm, R.base - (0.2 + aH2(i+40, R.seed)*0.35)*R.hi);
      g.lineTo(x, pk);
    }
    g.lineTo(BG_TOP + BG_W, R.base);
    g.closePath(); g.fill();
  }
  g.restore();
}

/* the raised gate the moon sits behind: steps, balustrade, a dais */
function bgMoonGate(g){
  const cx = AR.rimCx;
  /* Everything below the wall head is buried by bgBarrier, so the whole
     structure has to live above wallTop — it reads as silhouette against
     the disc, which is also the cheapest way to get depth here. */
  const head = wallTop(cx);
  g.save();

  /* cold light leaking out from behind the dais, so it separates from the moon */
  g.globalCompositeOperation = 'lighter';
  gGlow(g, cx, head - 8, 150, '#6f95e0', 0.16);
  g.globalCompositeOperation = 'source-over';

  /* three tiers stepping up out of the wall head. Kept low on purpose — the
     dais is a plinth the moon rises from, not a wall across it. The widest
     tucks behind the gate pillars at 372/628, which sells the recession. */
  const tiers = [
    {hw: 140, h: 6, fill: '#20244180', lip: '#4c5590'},
    {hw: 114, h: 5, fill: '#1c2039',   lip: '#434b7f'},
    {hw:  92, h: 5, fill: '#181c33',   lip: '#3b4372'}
  ];
  let y = head + 3;
  for(const t of tiers){
    y -= t.h;
    g.fillStyle = t.fill;
    g.fillRect(cx - t.hw, y, t.hw*2, t.h + 3);
    g.fillStyle = t.lip;                        /* moonlit tread edge */
    g.fillRect(cx - t.hw, y, t.hw*2, 1.3);
  }

  /* Balustrade. Posts are wider than the slots between them — the other way
     round and the run reads as teeth against a disc this bright. */
  const by = y;
  g.fillStyle = '#161a30';
  for(let x = cx - 60; x <= cx + 60; x += 6.2){
    g.fillRect(x - 1.7, by - 7, 3.4, 7);
  }
  g.fillRect(cx - 62, by - 9.4, 124, 2.4);
  g.fillStyle = '#454d84'; g.fillRect(cx - 62, by - 9.4, 124, 1.0);

  /* two slim braziers bracketing the rail, standing on the top tier */
  for(const s of [-1, 1]){
    const bx = cx + s*80;
    g.fillStyle = '#161a30';
    g.fillRect(bx - 1.6, by - 13, 3.2, 13);       /* stem */
    g.beginPath();                                 /* basin: narrow foot, wide mouth */
    g.moveTo(bx - 2.8, by - 13); g.lineTo(bx + 2.8, by - 13);
    g.lineTo(bx + 6.5, by - 19.5); g.lineTo(bx - 6.5, by - 19.5);
    g.closePath(); g.fill();
    g.fillStyle = '#4c5590'; g.fillRect(bx - 7.2, by - 20.6, 14.4, 1.5);
    /* cold flame — votive, distinct from the warm torches on the barrier */
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.85; g.fillStyle = '#a8dcff';
    g.beginPath();
    g.moveTo(bx, by - 30); g.lineTo(bx + 3.0, by - 24.5);
    g.lineTo(bx, by - 20); g.lineTo(bx - 3.0, by - 24.5);
    g.closePath(); g.fill();
    g.restore();
    gGlow(g, bx, by - 24, 20, '#6fc4ef', 0.40);
  }
  g.restore();
}

/* one ornate column. Used for the gate pillars and the framing columns. */
function bgPillar(g, cx, topY, botY, w, opt){
  const o = opt || {};
  const dim = o.dim || 1;                 /* 1 = moonlit, <1 = foreground */
  const mix = (a, b) => {                 /* darken a hex toward #0d0a18 */
    const n = parseInt(a.slice(1), 16);
    const r = Math.round(((n>>16)&255)*b + 13*(1-b));
    const gg= Math.round(((n>>8)&255)*b + 10*(1-b));
    const bb= Math.round((n&255)*b + 24*(1-b));
    return '#' + ((1<<24) + (r<<16) + (gg<<8) + bb).toString(16).slice(1);
  };
  g.save();

  const shaftT = topY + (o.capH || 26);
  /* shaft with a lateral gradient: moonlight from the upper left */
  const lg = g.createLinearGradient(cx-w/2, 0, cx+w/2, 0);
  lg.addColorStop(0.00, mix('#2a2e55', dim));
  lg.addColorStop(0.24, mix('#7d86bd', dim));
  lg.addColorStop(0.46, mix('#5b6398', dim));
  lg.addColorStop(0.80, mix('#272b52', dim));
  lg.addColorStop(1.00, mix('#181b38', dim));
  g.fillStyle = lg;
  g.fillRect(cx-w/2, shaftT, w, botY-shaftT);

  /* fluting */
  g.globalAlpha = 0.5;
  for(let i=1;i<6;i++){
    const fx = cx - w/2 + (i/6)*w;
    g.strokeStyle = i < 3 ? mix('#8f98cf', dim) : mix('#1d2141', dim);
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(fx, shaftT+4); g.lineTo(fx, botY-2); g.stroke();
  }
  g.globalAlpha = 1;

  /* capital */
  const cw = w*1.42;
  g.fillStyle = mix('#4d5490', dim);
  g.beginPath();
  g.moveTo(cx-w/2-2, shaftT); g.lineTo(cx+w/2+2, shaftT);
  g.lineTo(cx+cw/2, shaftT-13); g.lineTo(cx-cw/2, shaftT-13);
  g.closePath(); g.fill();
  g.fillStyle = mix('#646cab', dim); g.fillRect(cx-cw/2, shaftT-19, cw, 6);
  g.fillStyle = mix('#8188c4', dim); g.fillRect(cx-cw/2, shaftT-19, cw, 1.8);
  /* volute curls */
  g.strokeStyle = mix('#7d86bd', dim); g.lineWidth = 2; g.globalAlpha = 0.8;
  for(const s of [-1,1]){
    g.beginPath();
    g.arc(cx + s*(cw/2-5), shaftT-9, 4.5, 0, Math.PI*1.4, s<0);
    g.stroke();
  }
  g.globalAlpha = 1;

  /* a lit rune band partway down the shaft */
  if(o.rune !== false){
    const ry = shaftT + (botY-shaftT)*0.34;
    g.fillStyle = mix('#1a1d3a', dim); g.fillRect(cx-w/2, ry, w, 12);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.85*dim; g.fillStyle = '#79d6ff';
    for(let i=0;i<3;i++){
      const gx = cx - w/2 + w*(0.24 + i*0.26);
      g.fillRect(gx-1, ry+3, 2, 6);
      g.fillRect(gx-3, ry+(i%2?3:8), 6, 1.6);
    }
    g.restore();
    gGlow(g, cx, ry+6, w*1.5, '#4fb8e8', 0.26*dim);
  }

  /* base */
  g.fillStyle = mix('#3a4070', dim); g.fillRect(cx-w/2-5, botY-14, w+10, 14);
  g.fillStyle = mix('#4e5590', dim); g.fillRect(cx-w/2-8, botY-6,  w+16, 6);
  g.fillStyle = mix('#6a72ac', dim); g.fillRect(cx-w/2-8, botY-6,  w+16, 1.5);
  g.restore();
}

/* the tiered seating, the arcade above it, and the vomitoria below */
function bgStands(g){
  const ROWS = 9;
  const cols = ['#332a63', '#3e3477'];

  for(const side of [-1, 1]){
    const x0 = side < 0 ? BG_TOP : AR.rimCx + AR.portal;
    const x1 = side < 0 ? AR.rimCx - AR.portal : BG_TOP + BG_W;

    /* seating rows, far (top) to near (bottom) so nearer rows overlap */
    for(let r = ROWS-1; r >= 0; r--){
      const kTop = Math.pow((r+1)/ROWS, 1.35);   /* rows bunch toward the top */
      const kBot = Math.pow(r/ROWS, 1.35);
      g.fillStyle = cols[r%2];
      g.beginPath();
      for(let x = x0; x <= x1; x += 8){
        const y = lerp(wallTop(x), standTop(x), kTop);
        x === x0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      for(let x = x1; x >= x0; x -= 8){
        g.lineTo(x, lerp(wallTop(x), standTop(x), kBot));
      }
      g.closePath(); g.fill();

      /* riser highlight along the row's top edge */
      g.strokeStyle = '#584d9c'; g.lineWidth = 1; g.globalAlpha = 0.9;
      g.beginPath();
      for(let x = x0; x <= x1; x += 8){
        const y = lerp(wallTop(x), standTop(x), kTop);
        x === x0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke(); g.globalAlpha = 1;
    }

    /* radial aisles cutting up through the seating */
    g.save(); g.globalAlpha = 0.55; g.fillStyle = '#1c1636';
    for(let i=0;i<4;i++){
      const ax = lerp(x0, x1, side<0 ? 0.14+i*0.24 : 0.10+i*0.24);
      const yb = wallTop(ax), yt = standTop(ax);
      const spread = 5 + (yb-yt)*0.06;
      g.beginPath();
      g.moveTo(ax-spread, yb); g.lineTo(ax+spread, yb);
      g.lineTo(ax+2.2, yt);    g.lineTo(ax-2.2, yt);
      g.closePath(); g.fill();
    }
    g.restore();

    /* arcade: a run of arches crowning the stands, cropped by the frame */
    const aStep = 46;
    for(let x = (side<0 ? x0+16 : x1-16); side<0 ? x < x1-10 : x > x0+10; x += side<0 ? aStep : -aStep){
      const top = standTop(x);
      const h = 30, w = 17;
      /* pier */
      g.fillStyle = '#2b305a';
      g.fillRect(x-w-3, top-h, 6, h);
      g.fillRect(x+w-3, top-h, 6, h);
      /* dark opening with a rounded head */
      g.fillStyle = '#0e1026';
      g.beginPath();
      g.moveTo(x-w+3, top);
      g.lineTo(x-w+3, top-h+w-3);
      g.arc(x, top-h+w-3, w-3, Math.PI, 0);
      g.lineTo(x+w-3, top);
      g.closePath(); g.fill();
      /* lit inner edge */
      g.strokeStyle = '#454c85'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x-w+3, top); g.lineTo(x-w+3, top-h+w-3);
      g.arc(x, top-h+w-3, w-3, Math.PI, 0);
      g.lineTo(x+w-3, top);
      g.stroke();
      /* cornice over the arch */
      g.fillStyle = '#3a4171'; g.fillRect(x-w-5, top-h-6, (w+5)*2, 6);
      g.fillStyle = '#565d99'; g.fillRect(x-w-5, top-h-6, (w+5)*2, 1.5);
    }

    /* vomitoria — dark entrance tunnels at the foot of the stands */
    for(let i=0;i<2;i++){
      const vx = lerp(x0, x1, side<0 ? 0.26+i*0.40 : 0.34+i*0.40);
      const vy = wallTop(vx), vw = 20, vh = 22;
      g.fillStyle = '#0b0d20';
      g.beginPath();
      g.moveTo(vx-vw, vy); g.lineTo(vx-vw, vy-vh+vw);
      g.arc(vx, vy-vh+vw, vw, Math.PI, 0);
      g.lineTo(vx+vw, vy); g.closePath(); g.fill();
      g.strokeStyle = '#3c4275'; g.lineWidth = 1.5; g.stroke();
      /* a warm ember spilling out of the tunnel mouth */
      g.save(); g.globalCompositeOperation = 'lighter';
      gGlow(g, vx, vy-4, 22, '#c06a2a', 0.30);
      g.restore();
    }
  }
}

/* A hooded stone guardian on a plinth. Read at ~60px tall, so it is built
   from silhouette masses rather than anatomy — the hood and the shoulders
   are what make it legible; the lit edge does the rest. */
function bgStatue(g, cx, footY, h, faceIn){
  g.save();
  const w = h*0.30;
  const s = faceIn;                       /* +1 looks right, -1 looks left */

  /* plinth */
  const pw = w*1.5;
  g.fillStyle = '#2b2350'; g.fillRect(cx-pw/2, footY-h*0.20, pw, h*0.20);
  g.fillStyle = '#3b3168'; g.fillRect(cx-pw/2-3, footY-h*0.20, pw+6, 5);
  g.fillStyle = '#564a8c'; g.fillRect(cx-pw/2-3, footY-h*0.20, pw+6, 1.6);
  g.fillStyle = '#1d1838'; g.fillRect(cx-pw/2, footY-4, pw, 4);

  const topY = footY - h;
  const shY  = topY + h*0.26;             /* shoulder line */
  const hipY = footY - h*0.20;

  /* robe: a tapering mass, slightly wider at the hem */
  const rg = g.createLinearGradient(cx-w, 0, cx+w, 0);
  rg.addColorStop(0.00, '#241e44');
  rg.addColorStop(0.28, '#6a5f9e');
  rg.addColorStop(0.55, '#463c73');
  rg.addColorStop(1.00, '#1b1636');
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(cx - w*0.52, shY);
  g.lineTo(cx + w*0.52, shY);
  g.lineTo(cx + w*0.80, hipY);
  g.lineTo(cx - w*0.80, hipY);
  g.closePath(); g.fill();

  /* fold lines in the robe */
  g.strokeStyle = '#2a2350'; g.lineWidth = 1; g.globalAlpha = 0.7;
  for(let i=-1;i<=1;i++){
    g.beginPath();
    g.moveTo(cx + i*w*0.24, shY + h*0.04);
    g.lineTo(cx + i*w*0.34, hipY);
    g.stroke();
  }
  g.globalAlpha = 1;

  /* shoulders + hood as one silhouette */
  g.fillStyle = '#584c8e';
  g.beginPath();
  g.moveTo(cx - w*0.58, shY + 2);
  g.quadraticCurveTo(cx - w*0.52, topY + h*0.12, cx - w*0.20, topY + h*0.06);
  g.quadraticCurveTo(cx, topY - h*0.02, cx + w*0.20, topY + h*0.06);
  g.quadraticCurveTo(cx + w*0.52, topY + h*0.12, cx + w*0.58, shY + 2);
  g.closePath(); g.fill();
  /* lit edge, moonlight from upper-left */
  g.strokeStyle = '#9d92d4'; g.lineWidth = 1.4; g.globalAlpha = 0.75;
  g.beginPath();
  g.moveTo(cx - w*0.58, shY + 2);
  g.quadraticCurveTo(cx - w*0.52, topY + h*0.12, cx - w*0.20, topY + h*0.06);
  g.quadraticCurveTo(cx, topY - h*0.02, cx + w*0.10, topY + h*0.03);
  g.stroke(); g.globalAlpha = 1;

  /* the hood's shadowed opening, turned slightly toward the arena */
  g.fillStyle = '#100c22';
  g.beginPath();
  g.ellipse(cx + s*w*0.06, topY + h*0.12, w*0.20, h*0.075, 0, 0, TAU);
  g.fill();
  /* two ember eyes — the one detail that gives the statue presence */
  g.save(); g.globalCompositeOperation = 'lighter';
  for(const e of [-1, 1]){
    const ex = cx + s*w*0.06 + e*w*0.085, ey = topY + h*0.12;
    g.globalAlpha = 0.9; g.fillStyle = '#ffd08a';
    g.beginPath(); g.arc(ex, ey, 1.1, 0, TAU); g.fill();
    gGlow(g, ex, ey, 5, '#ff9a40', 0.35);
  }
  g.restore();

  /* a greatsword planted point-down in front of the robe */
  const bx = cx - s*w*0.42, byTop = shY + h*0.06, byBot = hipY + h*0.02;
  g.fillStyle = '#3d3568'; g.fillRect(bx-1.6, byTop, 3.2, byBot-byTop);
  g.fillStyle = '#7b71b4'; g.fillRect(bx-1.6, byTop, 1.2, byBot-byTop);
  g.fillStyle = '#4a4177'; g.fillRect(bx-w*0.20, byTop, w*0.40, 3);   /* crossguard */
  g.fillStyle = '#6d63a6';
  g.beginPath(); g.arc(bx, byTop-3, 2.2, 0, TAU); g.fill();           /* pommel */

  g.restore();
}

/* hanging banners — cloth with a gold trim and a sigil */
function bgBanner(g, x, y, w, h, col, trim){
  g.save();
  const lg = g.createLinearGradient(x-w/2, 0, x+w/2, 0);
  lg.addColorStop(0, '#00000055'); lg.addColorStop(0.35, col); lg.addColorStop(1, '#00000077');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(x-w/2, y); g.lineTo(x+w/2, y); g.lineTo(x+w/2, y+h);
  g.lineTo(x, y+h-7); g.lineTo(x-w/2, y+h);
  g.closePath(); g.fill();
  g.fillStyle = trim; g.fillRect(x-w/2, y, w, 3);
  /* sigil: a simple diamond, reads at this size where a crest would not */
  g.globalAlpha = 0.85; g.fillStyle = trim;
  g.beginPath();
  const sy = y + h*0.42, s = w*0.20;
  g.moveTo(x, sy-s); g.lineTo(x+s*0.72, sy); g.lineTo(x, sy+s); g.lineTo(x-s*0.72, sy);
  g.closePath(); g.fill();
  g.globalAlpha = 1;
  g.restore();
}

/* the barrier wall between the sand and the front row */
function bgBarrier(g){
  g.save();
  /* wall face */
  g.beginPath();
  for(let x = BG_TOP; x <= BG_TOP+BG_W; x += 8){
    const y = wallTop(x);
    x === BG_TOP ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  for(let x = BG_TOP+BG_W; x >= BG_TOP; x -= 8) g.lineTo(x, rimY(x));
  g.closePath();
  const wg = g.createLinearGradient(0, 80, 0, 140);
  wg.addColorStop(0, '#3b4173'); wg.addColorStop(0.55, '#2a2e56'); wg.addColorStop(1, '#1c1f3d');
  g.fillStyle = wg; g.fill();

  /* recessed panels */
  for(let x = BG_TOP+14; x < BG_TOP+BG_W; x += 54){
    const y = wallTop(x);
    g.fillStyle = '#23264a'; g.fillRect(x, y+8, 38, 16);
    g.strokeStyle = '#454c85'; g.lineWidth = 1; g.globalAlpha = 0.6;
    g.strokeRect(x+0.5, y+8.5, 37, 15); g.globalAlpha = 1;
    /* a small boss in the middle of each panel */
    g.fillStyle = '#525a95';
    g.beginPath(); g.arc(x+19, y+16, 2.6, 0, TAU); g.fill();
  }

  /* Capping moulding. Drawn with a horizontal gradient so it burns brightest
     behind the gate and dies away at the frame edges — a single even line all
     the way across reads as a fence and cuts the picture in half. */
  const mg1 = g.createLinearGradient(0, 0, ARENA_W, 0);
  mg1.addColorStop(0.00, '#1d1934');
  mg1.addColorStop(0.30, '#4a4074');
  mg1.addColorStop(0.50, '#6a5c9c');
  mg1.addColorStop(0.70, '#4a4074');
  mg1.addColorStop(1.00, '#1d1934');
  g.lineWidth = 3.4; g.strokeStyle = mg1;
  g.beginPath();
  for(let x = BG_TOP; x <= BG_TOP+BG_W; x += 8){
    const y = wallTop(x);
    x === BG_TOP ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  const mg2 = g.createLinearGradient(0, 0, ARENA_W, 0);
  mg2.addColorStop(0.00, '#2a2447');
  mg2.addColorStop(0.50, '#9d92d4');
  mg2.addColorStop(1.00, '#2a2447');
  g.lineWidth = 1.2; g.strokeStyle = mg2; g.globalAlpha = 0.8;
  g.beginPath();
  for(let x = BG_TOP; x <= BG_TOP+BG_W; x += 8){
    const y = wallTop(x) - 1.6;
    x === BG_TOP ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke(); g.globalAlpha = 1;
  g.restore();
}

/* the sand: a true ground plane radiating from the vanishing point */
function bgFloor(g){
  const {vpX:vx, vpY:vy} = AR;
  g.save();

  /* clip to everything below the rim so nothing bleeds onto the wall */
  g.beginPath();
  g.moveTo(BG_TOP, BG_TOP+BG_H);
  for(let x = BG_TOP; x <= BG_TOP+BG_W; x += 8) g.lineTo(x, rimY(x));
  g.lineTo(BG_TOP+BG_W, BG_TOP+BG_H);
  g.closePath();
  g.clip();

  /* Base. The sand is kept a good deal darker than instinct suggests: it
     fills most of the frame, and the fighters (saturated blue / red) have
     to sit on top of it. Brightest just behind the fighters where the moon
     rakes in, falling away hard toward the camera. */
  const fg = g.createLinearGradient(0, 110, 0, 470);
  fg.addColorStop(0.00, '#514369');
  fg.addColorStop(0.14, '#413353');
  fg.addColorStop(0.40, '#2f2540');
  fg.addColorStop(0.70, '#221a30');
  fg.addColorStop(1.00, '#140f1f');
  g.fillStyle = fg;
  g.fillRect(BG_TOP, 100, BG_W, BG_H);

  /* a broad sheen where the moon's light lands */
  g.save(); g.globalCompositeOperation = 'lighter';
  const sh = g.createRadialGradient(500, 150, 10, 500, 205, 430);
  sh.addColorStop(0, '#7f92d04a'); sh.addColorStop(1, '#7f92d000');
  g.fillStyle = sh; g.fillRect(BG_TOP, 100, BG_W, 420);
  g.restore();

  /* Stone mottling. Soft-edged radial falloffs, not flat ellipses — hard
     edged patches at low alpha read as stains rather than as weathering. */
  g.save();
  for(let i=0;i<44;i++){
    const px = aH(i*1.9+3)*BG_W + BG_TOP;
    const py = 120 + aH2(i, 4.4)*360;
    const pr = 50 + aH2(i, 8.8)*110;
    const up = aH2(i, 5.2) > 0.5;
    const mg = g.createRadialGradient(px, py, 0, px, py, pr);
    const a  = (0.07 + aH2(i, 2.7)*0.07).toFixed(3);
    mg.addColorStop(0, (up ? '#9a88ba' : '#1a1428') + Math.round(a*255).toString(16).padStart(2,'0'));
    mg.addColorStop(1, (up ? '#9a88ba' : '#1a1428') + '00');
    g.fillStyle = mg;
    g.save();
    g.translate(px, py); g.scale(1, 0.42); g.translate(-px, -py);
    g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    g.restore();
  }
  g.restore();

  /* Concentric paving joints — ellipses about the vanishing point, so the
     spacing opens up naturally toward the viewer. Deliberately faint: at
     full strength the regular grid reads as graph paper, not stone. */
  g.strokeStyle = '#160f22'; g.lineWidth = 1.4; g.globalAlpha = 0.34;
  let R = 190;
  for(let i=0;i<16 && R < 1500; i++){
    g.beginPath(); g.ellipse(vx, vy, R, R*0.40, 0, 0, TAU); g.stroke();
    R *= 1.16;
  }
  /* radial joints, fainter still — they converge behind the gate and get
     busy fast */
  g.globalAlpha = 0.20;
  for(let i=0;i<=44;i++){
    const a = Math.PI*(0.04 + (i/44)*0.92);
    g.beginPath();
    g.moveTo(vx + Math.cos(a)*180, vy + Math.sin(a)*180*0.40);
    g.lineTo(vx + Math.cos(a)*1500, vy + Math.sin(a)*1500*0.40);
    g.stroke();
  }
  g.globalAlpha = 1;

  /* highlight on the upper edge of each concentric course, as though the
     slabs are very slightly proud of one another */
  g.strokeStyle = '#8f80ad'; g.lineWidth = 0.9; g.globalAlpha = 0.10;
  R = 190;
  for(let i=0;i<16 && R < 1500; i++){
    g.beginPath(); g.ellipse(vx, vy-1.4, R, R*0.40, 0, 0, TAU); g.stroke();
    R *= 1.16;
  }
  g.globalAlpha = 1;

  /* the inlaid duelling ring: a band of paler stone cut into the floor,
     with a bevelled edge. Kept low-contrast — the live glow does the work. */
  const {ringCx:rx0, ringCy:ry0, ringRx:rrx, ringRy:rry} = AR;
  g.strokeStyle = '#4a3f63'; g.lineWidth = 13;
  g.beginPath(); g.ellipse(rx0, ry0, rrx, rry, 0, 0, TAU); g.stroke();
  g.strokeStyle = '#6b5f8a'; g.lineWidth = 1.6; g.globalAlpha = 0.6;
  g.beginPath(); g.ellipse(rx0, ry0, rrx-6.5, rry-2.3, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(rx0, ry0, rrx+6.5, rry+2.3, 0, 0, TAU); g.stroke();
  g.globalAlpha = 1;
  /* inner marks */
  g.strokeStyle = '#2c2340'; g.lineWidth = 1.5; g.globalAlpha = 0.6;
  g.beginPath(); g.ellipse(rx0, ry0, rrx*0.60, rry*0.60, 0, 0, TAU); g.stroke();
  g.globalAlpha = 0.42;
  g.beginPath(); g.ellipse(rx0, ry0, rrx*0.28, rry*0.28, 0, 0, TAU); g.stroke();
  g.globalAlpha = 1;
  /* studs around the band */
  g.fillStyle = '#7a6d99'; g.globalAlpha = 0.75;
  for(let i=0;i<32;i++){
    const a = (i/32)*TAU;
    g.beginPath();
    g.arc(rx0 + Math.cos(a)*rrx, ry0 + Math.sin(a)*rry, 1.9, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  /* cracks and scattered debris so the sand isn't a clean vector plane */
  g.strokeStyle = '#1c1529'; g.globalAlpha = 0.55;
  for(let i=0;i<26;i++){
    let px = aH(i*2.3)*BG_W + BG_TOP;
    let py = 140 + aH2(i,5.5)*330;
    g.lineWidth = 0.8 + aH2(i,1.1)*1.4;
    g.beginPath(); g.moveTo(px, py);
    for(let s=0;s<5;s++){
      px += (aH2(i*7+s, 2.2)-0.5)*46;
      py += (aH2(i*7+s, 9.4)-0.5)*22;
      g.lineTo(px, py);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  for(let i=0;i<80;i++){
    const px = aH(i*4.7+9)*BG_W + BG_TOP;
    const py = 132 + aH2(i,3.8)*350;
    const r  = 0.8 + aH2(i,6.6)*2.4;
    g.globalAlpha = 0.25 + aH2(i,2.9)*0.4;
    g.fillStyle = aH2(i,8.1) > 0.65 ? '#a596c2' : '#15101f';
    g.beginPath(); g.ellipse(px, py, r, r*0.6, 0, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;

  /* darken the extreme foreground and the left/right margins — this is what
     keeps the eye on the fighters rather than on the scenery */
  const vg = g.createLinearGradient(0, 360, 0, 560);
  vg.addColorStop(0, '#0a061800');
  vg.addColorStop(1, '#0a0618dd');
  g.fillStyle = vg; g.fillRect(BG_TOP, 360, BG_W, 200);
  const hgL = g.createLinearGradient(BG_TOP, 0, 240, 0);
  hgL.addColorStop(0, '#0a0618bb'); hgL.addColorStop(1, '#0a061800');
  g.fillStyle = hgL; g.fillRect(BG_TOP, 100, 300, 460);
  const hgR = g.createLinearGradient(760, 0, BG_TOP+BG_W, 0);
  hgR.addColorStop(0, '#0a061800'); hgR.addColorStop(1, '#0a0618bb');
  g.fillStyle = hgR; g.fillRect(760, 100, 300, 460);
  g.restore();
}

/* torch sconce hardware (the flame itself is drawn live) */
function bgSconces(g){
  for(const T of TORCHES){
    const s = T.s;
    g.save();
    g.fillStyle = '#2b2f55';
    g.beginPath();
    g.moveTo(T.x-9*s, T.y); g.lineTo(T.x+9*s, T.y);
    g.lineTo(T.x+5*s, T.y+12*s); g.lineTo(T.x-5*s, T.y+12*s);
    g.closePath(); g.fill();
    g.fillStyle = '#464d84'; g.fillRect(T.x-11*s, T.y-2.5*s, 22*s, 3*s);
    g.fillStyle = '#1a1d38'; g.fillRect(T.x-2*s, T.y+12*s, 4*s, 10*s);
    g.restore();
  }
}

/* The two colossal columns that frame the shot. They are nearest camera and
   backlit by the moon, so they play as near-silhouette with a rim light —
   dark repoussoir that keeps the moon the brightest thing on screen. */
function bgFraming(g){
  for(const s of [-1, 1]){
    const cx = s < 0 ? 46 : 954;
    /* a slab of wall behind the column, to seal the frame edge */
    g.fillStyle = '#0d0a1c';
    g.fillRect(s < 0 ? BG_TOP : 900, BG_TOP, 100 - BG_TOP, BG_H);
    g.fillStyle = '#131029';
    g.fillRect(s < 0 ? BG_TOP : 908, BG_TOP, 92 - BG_TOP, BG_H);

    bgPillar(g, cx, BG_TOP, 470, 56, {capH: 30, rune: true, dim: 0.46});

    /* rim light down the inner edge, where the arena's glow catches it */
    const rx = cx + s*28;
    const rg = g.createLinearGradient(rx - s*7, 0, rx + s*2, 0);
    rg.addColorStop(0, '#6d78b800'); rg.addColorStop(1, '#8b96d8aa');
    g.fillStyle = rg;
    g.fillRect(Math.min(rx - s*7, rx + s*2), BG_TOP, 9, BG_H);

    bgBanner(g, cx, 250, 44, 108, '#5e1a2c', '#a8823a');
  }
}

/* ───────────────────────── ASSEMBLY ───────────────────────── */

let _bg = null;
function arenaBg(){
  if(_bg) return _bg;
  const c = document.createElement('canvas');
  c.width  = Math.round(BG_W*BG_SS);
  c.height = Math.round(BG_H*BG_SS);
  const g = c.getContext('2d');
  g.scale(BG_SS, BG_SS);
  g.translate(-BG_TOP, -BG_TOP);
  buildArenaStatic(g);
  _bg = c;
  return c;
}

function buildArenaStatic(g){
  bgSky(g);
  bgStars(g);
  bgMountains(g);
  bgMoon(g);
  bgMoonGate(g);
  bgStands(g);
  /* gate pillars flank the moon; they run off the top of the frame */
  bgPillar(g, 372, BG_TOP, rimY(372), 40, {capH: 26});
  bgPillar(g, 628, BG_TOP, rimY(628), 40, {capH: 26});
  bgBanner(g, 372, 150, 30, 74, '#3d2470', '#c9a24a');
  bgBanner(g, 628, 150, 30, 74, '#3d2470', '#c9a24a');
  bgBarrier(g);
  /* guardians stand on the wall head, flanking the gate */
  bgStatue(g, 300, wallTop(300)+4, 66,  1);
  bgStatue(g, 700, wallTop(700)+4, 66, -1);
  bgFloor(g);
  bgSconces(g);
  bgFraming(g);
}

/* ───────────────────────── LIVE LAYERS ─────────────────────────
   Everything below runs every frame. Kept to a few hundred ops: the
   expensive structure is already baked into the blit above.        */

function liveStars(t){
  const g = ctx;
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i=0;i<260;i+=5){                       /* same generator as bgStars */
    const x = aH(i*1.7)*BG_W + BG_TOP;
    const y = BG_TOP + aH2(i, 4.3)*205;
    if(y > 150 && Math.abs(x-500) > AR.portal) continue;
    const tw = 0.5 + 0.5*Math.sin(t*1.7 + i*2.3);
    g.globalAlpha = 0.30*tw*tw;
    g.fillStyle = '#e8f1ff';
    g.beginPath(); g.arc(x, y, 1.5 + tw*1.4, 0, TAU); g.fill();
  }
  g.restore();
}

function liveCrowd(t){
  const g = ctx;
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i=0;i<150;i++){
    const x = aH(i*3.9 + 1.3)*ARENA_W;
    if(Math.abs(x - AR.rimCx) < AR.portal + 6) continue;
    const k  = 0.06 + aH2(i, 5.7)*0.88;
    const y  = lerp(wallTop(x), standTop(x), k) + 2;
    /* each spectator bobs on their own phase; a slow wave crosses the bowl */
    const wave = Math.sin(t*1.6 - x*0.012 + i*0.9);
    const bob  = wave*1.3;
    const fl   = 0.42 + 0.58*(0.5 + 0.5*Math.sin(t*2.6 + i*1.7));
    g.globalAlpha = 0.30*fl*(0.45 + k*0.55);     /* nearer rows read brighter */
    g.fillStyle = i%7 === 0 ? '#ffd2a0' : (i%3 === 0 ? '#cfd8ff' : '#8ea6e8');
    g.beginPath(); g.arc(x, y + bob, 1.5, 0, TAU); g.fill();
  }
  g.restore();
}

function liveTorches(t){
  const g = ctx;
  g.save();
  for(let ti=0; ti<TORCHES.length; ti++){
    const T = TORCHES[ti], s = T.s;
    const ph = ti*2.7;
    /* two detuned sines beat against each other — cheap, non-periodic flicker */
    const fk = 0.72 + 0.28*Math.sin(t*11 + ph) * Math.sin(t*6.3 + ph*1.7);
    const bx = T.x, by = T.y - 2*s;

    g.globalCompositeOperation = 'lighter';
    /* light thrown onto the surrounding stone */
    gGlow(g, bx, by, 46*s*fk, '#ff9a40', 0.34*fk);
    gGlow(g, bx, by, 18*s*fk, '#ffd89a', 0.42*fk);

    /* flame body: a teardrop built from two quadratics, three shrinking layers */
    const layers = [[1.00, '#ff6a1e', 0.55], [0.66, '#ffab3c', 0.70], [0.34, '#ffe9b0', 0.85]];
    for(const [sc, col, a] of layers){
      const h = (26*s)*fk*sc, w = (7.5*s)*sc;
      const sway = Math.sin(t*4.2 + ph)*2.2*s*sc;
      g.globalAlpha = a;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(bx - w, by);
      g.quadraticCurveTo(bx - w*1.15 + sway*0.4, by - h*0.55, bx + sway, by - h);
      g.quadraticCurveTo(bx + w*1.15 + sway*0.4, by - h*0.55, bx + w, by);
      g.quadraticCurveTo(bx, by + 3.5*s*sc, bx - w, by);
      g.closePath(); g.fill();
    }

    /* embers peeling off the top */
    for(let e=0;e<3;e++){
      const life = ((t*0.55 + aH2(ti*4+e, 2.1)) % 1);
      const ex = bx + Math.sin(t*2.4 + e*2.1 + ph)*8*s;
      const ey = by - 24*s - life*40*s;
      g.globalAlpha = 0.5*(1-life)*fk;
      g.fillStyle = '#ffb257';
      g.beginPath(); g.arc(ex, ey, 1.5*s*(1-life*0.6), 0, TAU); g.fill();
    }

    /* pool of light on the sand below, only for the low torches */
    if(T.y > 150){
      const py = 300 + (T.y-214)*0.4;
      g.globalAlpha = 0.16*fk;
      const pg = g.createRadialGradient(bx, py, 4, bx, py, 190);
      pg.addColorStop(0, '#ff9a40'); pg.addColorStop(1, '#ff9a4000');
      g.fillStyle = pg;
      g.beginPath(); g.ellipse(bx, py, 190, 76, 0, 0, TAU); g.fill();
    }
  }
  g.restore();
}

/* The inlaid ring wakes up. Deliberately restrained: this sits directly
   under the fighters, so it glows just enough to read as enchanted stone
   and never competes with the skill VFX drawn on top of it. */
function liveRing(t){
  const g = ctx;
  const {ringCx:cx, ringCy:cy, ringRx:rx, ringRy:ry} = AR;
  g.save();
  g.globalCompositeOperation = 'lighter';

  /* slow breathing wash over the band */
  const breathe = 0.5 + 0.5*Math.sin(t*0.8);
  g.globalAlpha = 0.05 + breathe*0.035;
  g.strokeStyle = '#5aa8ff'; g.lineWidth = 13;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke();

  /* 16 runes riding the band, each pulsing on its own phase */
  for(let i=0;i<16;i++){
    const a = (i/16)*TAU + t*0.06;
    const px = cx + Math.cos(a)*rx, py = cy + Math.sin(a)*ry;
    const pulse = 0.35 + 0.65*(0.5 + 0.5*Math.sin(t*2.1 + i*1.3));
    g.globalAlpha = 0.20*pulse;
    g.fillStyle = i%3 === 0 ? '#b98cff' : '#7fd8ff';
    /* a tiny glyph: stem plus crossbar, enough to read as writing */
    g.fillRect(px-0.8, py-3.6, 1.6, 7.2);
    g.fillRect(px-2.8, py + (i%2 ? -2.8 : 1.2), 5.6, 1.3);
    g.globalAlpha = 0.09*pulse;
    g.beginPath(); g.arc(px, py, 6, 0, TAU); g.fill();
  }

  /* a light sweep chasing round the ring */
  const sa = (t*0.5) % TAU;
  g.globalAlpha = 0.13;
  g.strokeStyle = '#cfe8ff'; g.lineWidth = 3.5;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, sa, sa + 0.5); g.stroke();
  g.globalAlpha = 0.06; g.lineWidth = 10;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, sa, sa + 0.5); g.stroke();

  g.restore();
}

/* low mist crawling over the sand, plus a few motes drifting up the shot */
function liveMist(t){
  const g = ctx;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for(let i=0;i<7;i++){
    const sp = 12 + aH(i*2.2)*16;
    const x  = ((t*sp + aH(i*5.5)*1400) % 1320) - 160;
    const y  = 150 + aH2(i, 3.1)*230;
    const w  = 150 + aH2(i, 7.4)*200;
    const h  = 20 + aH2(i, 1.6)*26;
    g.globalAlpha = 0.045 + 0.03*Math.sin(t*0.7 + i*1.9);
    const mg = g.createRadialGradient(x, y, 2, x, y, w);
    mg.addColorStop(0, '#9fb6e8'); mg.addColorStop(1, '#9fb6e800');
    g.fillStyle = mg;
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, TAU); g.fill();
  }
  /* drifting dust caught in the moonlight */
  for(let i=0;i<26;i++){
    const life = ((t*0.14 + aH(i*3.3)) % 1);
    const x = aH(i*6.1)*ARENA_W + Math.sin(t*0.6 + i)*14;
    const y = lerp(430, 90, life);
    g.globalAlpha = 0.30*Math.sin(life*Math.PI);
    g.fillStyle = i%4 === 0 ? '#ffd9a8' : '#cfe0ff';
    g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill();
  }
  g.restore();
}

/* ───────────────────────── ENTRY POINT ───────────────────────── */

function drawArena(t){
  ctx.drawImage(arenaBg(), BG_TOP, BG_TOP, BG_W, BG_H);
  liveStars(t);
  liveCrowd(t);
  liveMist(t);
  liveRing(t);
  liveTorches(t);
}