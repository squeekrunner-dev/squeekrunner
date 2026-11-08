/**
 * SqueekRunner Hamsters — Generative Trait Layer Definitions
 * Pure SVG procedural components matching SqueekRunner warm vector aesthetic.
 * All layers are rendered inside a unified 1000x1000 viewBox.
 */

export const PALETTES = {
  ink: '#131b27',
  cardBg: '#1d2b39',
  white: '#ffffff',
  gold: '#ffcf75',
  amber: '#ffaa2b',
  lime: '#c4ef6e',
  blue: '#81cce4',
  danger: '#ec8a79',
  pinkSoft: '#f5a6b3',
  pinkDeep: '#e88295',
  woodDark: '#2a1a10',
  woodMid: '#4d3220',
  woodLight: '#7c5335',
};

// -------------------------------------------------------------
// 1. FUR COLOR PALETTES (>= 8 variants)
// -------------------------------------------------------------
export const FUR_COLORS = {
  'Classic Golden Brown': {
    main: '#d9833b',
    light: '#f0aa65',
    shadow: '#a8561d',
    belly: '#ffeed9',
    pink: '#f5a6b3',
    nose: '#533728',
    whiskers: '#7a421b',
  },
  'Caramel Cream': {
    main: '#c4793d',
    light: '#e09d67',
    shadow: '#8c4e20',
    belly: '#fff5ea',
    pink: '#f8b4bf',
    nose: '#4d2a13',
    whiskers: '#6f3915',
  },
  'Snow Fluff': {
    main: '#eceae2',
    light: '#ffffff',
    shadow: '#c9c7be',
    belly: '#ffffff',
    pink: '#ffaec0',
    nose: '#d47285',
    whiskers: '#a8a59b',
  },
  'Midnight Shadow': {
    main: '#344256',
    light: '#4d5e78',
    shadow: '#1e2838',
    belly: '#cbd5e1',
    pink: '#d88b9e',
    nose: '#1a1f2c',
    whiskers: '#1e2838',
  },
  'Chocolate Truffle': {
    main: '#533728',
    light: '#784e38',
    shadow: '#362116',
    belly: '#edd8c9',
    pink: '#e595a4',
    nose: '#22130b',
    whiskers: '#362116',
  },
  'Honey Peach': {
    main: '#e8926a',
    light: '#f7b494',
    shadow: '#ba6743',
    belly: '#fff0e6',
    pink: '#fca5b5',
    nose: '#5a3328',
    whiskers: '#87442f',
  },
  'Silver Ash': {
    main: '#8b9ba6',
    light: '#b2c0cb',
    shadow: '#5e6d78',
    belly: '#f0f4f8',
    pink: '#e89eb0',
    nose: '#3d474e',
    whiskers: '#5e6d78',
  },
  'Toasted Biscuit': {
    main: '#b57954',
    light: '#d49b77',
    shadow: '#854e2f',
    belly: '#faede2',
    pink: '#f7acbb',
    nose: '#482a1b',
    whiskers: '#6c3d23',
  },
  'Wild Sable': {
    main: '#8a5a3c',
    light: '#ab7652',
    shadow: '#59341d',
    belly: '#f6ebd9',
    pink: '#ea99a9',
    nose: '#331d0e',
    whiskers: '#522f18',
  },
};

// -------------------------------------------------------------
// 2. BACKGROUNDS (>= 8 variants)
// -------------------------------------------------------------
export const BACKGROUNDS = {
  'Sawdust Track': () => `
    <rect width="1000" height="1000" fill="#f4ebd9" />
    <circle cx="500" cy="500" r="440" fill="none" stroke="#e5d4bc" stroke-width="6" stroke-dasharray="24 16" />
    <path d="M120 780 Q500 830 880 780" stroke="#d8c2a3" stroke-width="12" fill="none" stroke-linecap="round" />
    <g fill="#dfcbaf" opacity="0.6">
      <ellipse cx="200" cy="220" rx="14" ry="7" transform="rotate(25 200 220)" />
      <ellipse cx="800" cy="260" rx="18" ry="9" transform="rotate(-30 800 260)" />
      <ellipse cx="160" cy="680" rx="12" ry="6" transform="rotate(45 160 680)" />
      <ellipse cx="840" cy="720" rx="16" ry="8" transform="rotate(-15 840 720)" />
      <ellipse cx="320" cy="140" rx="10" ry="5" transform="rotate(60 320 140)" />
      <ellipse cx="680" cy="150" rx="15" ry="7" transform="rotate(-40 680 150)" />
    </g>
  `,
  'Wheel Night Blue': () => `
    <rect width="1000" height="1000" fill="#131b27" />
    <defs>
      <pattern id="runnerGrid" width="60" height="60" patternUnits="userSpaceOnUse">
        <circle cx="30" cy="30" r="2" fill="#293c4d" />
        <path d="M30 0v60M0 30h60" stroke="#1c2738" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="1000" height="1000" fill="url(#runnerGrid)" />
    <circle cx="500" cy="500" r="420" fill="none" stroke="#293c4d" stroke-width="2" stroke-dasharray="8 12" />
    <circle cx="500" cy="500" r="460" fill="none" stroke="#1d2b3a" stroke-width="4" />
  `,
  'Sunny Meadow': () => `
    <defs>
      <radialGradient id="sunGrad" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#fff8db" />
        <stop offset="60%" stop-color="#f0f7cc" />
        <stop offset="100%" stop-color="#ddefb0" />
      </radialGradient>
    </defs>
    <rect width="1000" height="1000" fill="url(#sunGrad)" />
    <g stroke="#d0e599" stroke-width="3" opacity="0.4" stroke-dasharray="16 20">
      <line x1="500" y1="500" x2="100" y2="100" />
      <line x1="500" y1="500" x2="900" y2="100" />
      <line x1="500" y1="500" x2="500" y2="50" />
      <line x1="500" y1="500" x2="100" y2="500" />
      <line x1="500" y1="500" x2="900" y2="500" />
    </g>
    <circle cx="500" cy="500" r="410" fill="none" stroke="#c8e285" stroke-width="4" />
  `,
  'Sepolia Violet': () => `
    <rect width="1000" height="1000" fill="#1e152d" />
    <circle cx="500" cy="500" r="390" fill="#291c3d" />
    <polygon points="500,140 780,300 780,660 500,820 220,660 220,300" fill="none" stroke="#523977" stroke-width="4" stroke-dasharray="14 10" />
    <circle cx="500" cy="500" r="440" fill="none" stroke="#3d2a59" stroke-width="2" />
    <g fill="#9362db" opacity="0.3">
      <circle cx="220" cy="300" r="8" /><circle cx="780" cy="300" r="8" />
      <circle cx="780" cy="660" r="8" /><circle cx="220" cy="660" r="8" />
      <circle cx="500" cy="140" r="8" /><circle cx="500" cy="820" r="8" />
    </g>
  `,
  'Sunset Sprint': () => `
    <defs>
      <linearGradient id="sunsetGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ee7663" />
        <stop offset="45%" stop-color="#f89e6d" />
        <stop offset="100%" stop-color="#fed685" />
      </linearGradient>
    </defs>
    <rect width="1000" height="1000" fill="url(#sunsetGrad)" />
    <circle cx="500" cy="520" r="380" fill="#fff" opacity="0.18" />
    <line x1="80" y1="840" x2="920" y2="840" stroke="#d95d49" stroke-width="8" stroke-linecap="round" />
    <line x1="160" y1="865" x2="840" y2="865" stroke="#d95d49" stroke-width="4" stroke-linecap="round" opacity="0.7" />
  `,
  'Minty Run': () => `
    <rect width="1000" height="1000" fill="#dcf3eb" />
    <g stroke="#bce4d6" stroke-width="12" stroke-linecap="round" opacity="0.7">
      <line x1="80" y1="180" x2="280" y2="60" />
      <line x1="40" y1="360" x2="340" y2="180" />
      <line x1="720" y1="940" x2="960" y2="780" />
      <line x1="660" y1="820" x2="920" y2="660" />
    </g>
    <circle cx="500" cy="500" r="420" fill="none" stroke="#9ed4c0" stroke-width="4" stroke-dasharray="16 12" />
  `,
  'Crimson Rush': () => `
    <rect width="1000" height="1000" fill="#32141a" />
    <circle cx="500" cy="500" r="430" fill="#421a22" />
    <g stroke="#7b2838" stroke-width="6" fill="none" stroke-linecap="round">
      <path d="M200 480 L280 500 L200 520" />
      <path d="M260 480 L340 500 L260 520" />
      <path d="M800 480 L720 500 L800 520" />
      <path d="M740 480 L660 500 L740 520" />
    </g>
    <circle cx="500" cy="500" r="400" fill="none" stroke="#9e3247" stroke-width="3" stroke-dasharray="12 16" />
  `,
  'Golden Glow': () => `
    <defs>
      <radialGradient id="goldGlowGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#4a3512" />
        <stop offset="60%" stop-color="#2c1f0b" />
        <stop offset="100%" stop-color="#191106" />
      </radialGradient>
    </defs>
    <rect width="1000" height="1000" fill="url(#goldGlowGrad)" />
    <circle cx="500" cy="500" r="420" fill="none" stroke="#cfa043" stroke-width="2" stroke-dasharray="6 8" opacity="0.4" />
    <circle cx="500" cy="500" r="450" fill="none" stroke="#8a6723" stroke-width="4" opacity="0.5" />
    <g fill="#ffcf75" opacity="0.25">
      <polygon points="500,80 508,120 548,128 508,136 500,176 492,136 452,128 492,120" />
      <polygon points="180,240 185,265 210,270 185,275 180,300 175,275 150,270 175,265" />
      <polygon points="820,240 825,265 850,270 825,275 820,300 815,275 790,270 815,265" />
    </g>
  `,
  'Cyber Grid': () => `
    <rect width="1000" height="1000" fill="#0d141e" />
    <line x1="0" y1="620" x2="1000" y2="620" stroke="#00f2fe" stroke-width="3" opacity="0.7" />
    <g stroke="#1c354d" stroke-width="2">
      <line x1="500" y1="620" x2="500" y2="1000" />
      <line x1="500" y1="620" x2="300" y2="1000" />
      <line x1="500" y1="620" x2="700" y2="1000" />
      <line x1="500" y1="620" x2="100" y2="1000" />
      <line x1="500" y1="620" x2="900" y2="1000" />
      <line x1="0" y1="660" x2="1000" y2="660" />
      <line x1="0" y1="720" x2="1000" y2="720" />
      <line x1="0" y1="810" x2="1000" y2="810" />
      <line x1="0" y1="920" x2="1000" y2="920" />
    </g>
    <circle cx="500" cy="500" r="360" fill="none" stroke="#00f2fe" stroke-width="2" opacity="0.3" stroke-dasharray="12 12" />
  `,
};

// -------------------------------------------------------------
// 3. SPECIAL / WHEEL AURA (Rare layers behind the hamster)
// -------------------------------------------------------------
export const SPECIAL_AURAS = {
  'None': () => '',
  'WHEELY9000 Wheel': () => `
    <!-- The physical WHEELY9000 hamster wheel behind runner -->
    <g id="aura-wheely9000">
      <circle cx="500" cy="540" r="410" fill="none" stroke="#4a5d70" stroke-width="18" opacity="0.7" />
      <circle cx="500" cy="540" r="390" fill="none" stroke="#253545" stroke-width="4" />
      <circle cx="500" cy="540" r="425" fill="none" stroke="#688099" stroke-width="3" />
      <g stroke="#3a4c5e" stroke-width="6" opacity="0.6">
        <line x1="500" y1="130" x2="500" y2="950" />
        <line x1="90" y1="540" x2="910" y2="540" />
        <line x1="210" y1="250" x2="790" y2="830" />
        <line x1="210" y1="830" x2="790" y2="250" />
      </g>
      <circle cx="500" cy="540" r="36" fill="#1b2633" stroke="#5b728a" stroke-width="6" />
      <circle cx="500" cy="540" r="14" fill="#ffcf75" />
    </g>
  `,
  'Speed Lightning': () => `
    <g id="aura-lightning" stroke="#ffea79" stroke-linecap="round" stroke-linejoin="round">
      <path d="M160 380 L230 430 L200 480 L270 540" fill="none" stroke-width="12" />
      <path d="M160 380 L230 430 L200 480 L270 540" fill="none" stroke="#ffffff" stroke-width="5" />
      <path d="M840 380 L770 430 L800 480 L730 540" fill="none" stroke-width="12" />
      <path d="M840 380 L770 430 L800 480 L730 540" fill="none" stroke="#ffffff" stroke-width="5" />
      <path d="M220 200 L270 260 L240 290 L310 340" fill="none" stroke-width="9" />
      <path d="M780 200 L730 260 L760 290 L690 340" fill="none" stroke-width="9" />
    </g>
  `,
  'Golden Stardust': () => `
    <g id="aura-stardust" fill="#ffcf75">
      <path d="M500 120 Q500 150 530 150 Q500 150 500 180 Q500 150 470 150 Q500 150 500 120 Z" />
      <path d="M200 320 Q200 340 220 340 Q200 340 200 360 Q200 340 180 340 Q200 340 200 320 Z" />
      <path d="M800 320 Q800 340 820 340 Q800 340 800 360 Q800 340 780 340 Q800 340 800 320 Z" />
      <path d="M160 560 Q160 580 180 580 Q160 580 160 600 Q160 580 140 580 Q160 580 160 560 Z" />
      <path d="M840 560 Q840 580 860 580 Q840 580 840 600 Q840 580 820 580 Q840 580 840 560 Z" />
      <circle cx="300" cy="220" r="7" /><circle cx="700" cy="220" r="7" />
      <circle cx="170" cy="440" r="6" /><circle cx="830" cy="440" r="6" />
      <circle cx="260" cy="720" r="8" opacity="0.6" /><circle cx="740" cy="720" r="8" opacity="0.6" />
    </g>
  `,
  'PoW Matrix': () => `
    <g id="aura-matrix" fill="#c4ef6e" opacity="0.75" font-family="monospace" font-size="16" font-weight="bold">
      <rect x="140" y="220" width="70" height="70" rx="8" fill="#132717" stroke="#c4ef6e" stroke-width="3" />
      <text x="175" y="262" text-anchor="middle" fill="#c4ef6e">RUN</text>
      <rect x="790" y="220" width="70" height="70" rx="8" fill="#132717" stroke="#c4ef6e" stroke-width="3" />
      <text x="825" y="262" text-anchor="middle" fill="#c4ef6e">#1999</text>
      <rect x="110" y="480" width="60" height="60" rx="8" fill="#132717" stroke="#c4ef6e" stroke-width="2.5" />
      <text x="140" y="516" text-anchor="middle" fill="#c4ef6e">98.3</text>
      <rect x="830" y="480" width="60" height="60" rx="8" fill="#132717" stroke="#c4ef6e" stroke-width="2.5" />
      <text x="860" y="516" text-anchor="middle" fill="#c4ef6e">RPM</text>
      <!-- connecting matrix traces -->
      <path d="M175 290 v190 h-35" fill="none" stroke="#7bbd38" stroke-width="2" stroke-dasharray="6 6" />
      <path d="M825 290 v190 h35" fill="none" stroke="#7bbd38" stroke-width="2" stroke-dasharray="6 6" />
    </g>
  `,
  'Sawdust Cyclone': () => `
    <g id="aura-cyclone" stroke="#d49b57" stroke-linecap="round" fill="none" opacity="0.7">
      <path d="M180 620 C120 480 200 300 360 200 C520 100 740 160 840 280 C920 380 900 560 820 680" stroke-width="14" />
      <path d="M240 680 C180 540 260 380 400 280 C540 180 720 240 780 340 C840 440 820 600 740 720" stroke-width="7" stroke-dasharray="30 20" />
      <g fill="#bf833b" stroke="none">
        <ellipse cx="260" cy="240" rx="16" ry="8" transform="rotate(25 260 240)" />
        <ellipse cx="760" cy="220" rx="18" ry="9" transform="rotate(-35 760 220)" />
        <ellipse cx="150" cy="500" rx="14" ry="7" transform="rotate(70 150 500)" />
        <ellipse cx="860" cy="460" rx="17" ry="8" transform="rotate(-65 860 460)" />
      </g>
    </g>
  `,
};

// -------------------------------------------------------------
// 4. HAMSTER BASE BODY & HEAD (Parameterized by fur palette)
// -------------------------------------------------------------
export function renderHamsterBase(fur) {
  return `
    <g id="hamster-body-group">
      <!-- Ground shadow -->
      <ellipse cx="500" cy="860" rx="270" ry="32" fill="#000000" opacity="0.22" />

      <!-- Fluffy Tail (on left hip) -->
      <circle cx="280" cy="730" r="38" fill="${fur.shadow}" />
      <circle cx="275" cy="725" r="32" fill="${fur.main}" />
      <circle cx="268" cy="718" r="18" fill="${fur.light}" />

      <!-- Back Feet (paws on ground) -->
      <ellipse cx="360" cy="835" rx="55" ry="34" fill="${fur.shadow}" />
      <ellipse cx="360" cy="830" rx="50" ry="30" fill="${fur.main}" />
      <circle cx="330" cy="835" r="10" fill="${fur.pink}" />
      <circle cx="355" cy="840" r="10" fill="${fur.pink}" />
      <circle cx="380" cy="835" r="10" fill="${fur.pink}" />

      <ellipse cx="640" cy="835" rx="55" ry="34" fill="${fur.shadow}" />
      <ellipse cx="640" cy="830" rx="50" ry="30" fill="${fur.main}" />
      <circle cx="620" cy="835" r="10" fill="${fur.pink}" />
      <circle cx="645" cy="840" r="10" fill="${fur.pink}" />
      <circle cx="670" cy="835" r="10" fill="${fur.pink}" />

      <!-- Main Torso (plump round body) -->
      <ellipse cx="500" cy="650" rx="255" ry="215" fill="${fur.shadow}" />
      <ellipse cx="500" cy="645" rx="250" ry="210" fill="${fur.main}" />

      <!-- Belly / Chest Patch -->
      <ellipse cx="500" cy="670" rx="165" ry="155" fill="${fur.belly}" />

      <!-- Ears (outer fur + soft pink inner) -->
      <g id="ears">
        <!-- Left Ear -->
        <ellipse cx="310" cy="270" rx="68" ry="78" transform="rotate(-15 310 270)" fill="${fur.shadow}" />
        <ellipse cx="310" cy="268" rx="64" ry="74" transform="rotate(-15 310 268)" fill="${fur.main}" />
        <ellipse cx="316" cy="272" rx="44" ry="52" transform="rotate(-15 316 272)" fill="${fur.pink}" />

        <!-- Right Ear -->
        <ellipse cx="690" cy="270" rx="68" ry="78" transform="rotate(15 690 270)" fill="${fur.shadow}" />
        <ellipse cx="690" cy="268" rx="64" ry="74" transform="rotate(15 690 268)" fill="${fur.main}" />
        <ellipse cx="684" cy="272" rx="44" ry="52" transform="rotate(15 684 272)" fill="${fur.pink}" />
      </g>

      <!-- Head (chubby hamster face) -->
      <ellipse cx="500" cy="460" rx="235" ry="195" fill="${fur.shadow}" />
      <ellipse cx="500" cy="455" rx="230" ry="190" fill="${fur.main}" />

      <!-- Forehead highlight tuft -->
      <ellipse cx="500" cy="340" rx="55" ry="35" fill="${fur.light}" opacity="0.6" />

      <!-- Chubby Cheeks (signature hamster feature!) -->
      <ellipse cx="320" cy="505" rx="95" ry="80" transform="rotate(10 320 505)" fill="${fur.shadow}" opacity="0.3" />
      <ellipse cx="320" cy="500" rx="95" ry="80" transform="rotate(10 320 500)" fill="${fur.light}" />
      <ellipse cx="680" cy="505" rx="95" ry="80" transform="rotate(-10 680 505)" fill="${fur.shadow}" opacity="0.3" />
      <ellipse cx="680" cy="500" rx="95" ry="80" transform="rotate(-10 680 500)" fill="${fur.light}" />

      <!-- Rosy Cheek Blush -->
      <ellipse cx="350" cy="515" rx="36" ry="22" fill="${fur.pink}" opacity="0.6" />
      <ellipse cx="650" cy="515" rx="36" ry="22" fill="${fur.pink}" opacity="0.6" />

      <!-- Cheerful Hamster Whiskers -->
      <g stroke="${fur.whiskers}" stroke-width="3.5" stroke-linecap="round" opacity="0.85">
        <path d="M280 490 Q210 470 140 460" />
        <path d="M275 510 Q200 515 130 520" />
        <path d="M285 530 Q215 550 150 575" />
        <path d="M720 490 Q790 470 860 460" />
        <path d="M725 510 Q800 515 870 520" />
        <path d="M715 530 Q785 550 850 575" />
      </g>

      <!-- Tiny Hamster Nose -->
      <ellipse cx="500" cy="480" rx="15" ry="11" fill="${fur.nose}" />
      <path d="M500 491 v12" stroke="${fur.nose}" stroke-width="3" stroke-linecap="round" />
    </g>
  `;
}

// -------------------------------------------------------------
// 5. EYES (>= 6 variants)
// -------------------------------------------------------------
export const EYES = {
  'Big Sparkle': () => `
    <g id="eyes-big-sparkle">
      <!-- Left Eye -->
      <ellipse cx="410" cy="425" rx="36" ry="40" fill="#131b27" />
      <circle cx="398" cy="412" r="14" fill="#ffffff" />
      <circle cx="424" cy="436" r="6" fill="#ffffff" />
      <!-- Right Eye -->
      <ellipse cx="590" cy="425" rx="36" ry="40" fill="#131b27" />
      <circle cx="578" cy="412" r="14" fill="#ffffff" />
      <circle cx="604" cy="436" r="6" fill="#ffffff" />
      <!-- Cute eye shines -->
      <path d="M375 385 Q410 375 445 385" stroke="#4a3124" stroke-width="5" stroke-linecap="round" fill="none" />
      <path d="M555 385 Q590 375 625 385" stroke="#4a3124" stroke-width="5" stroke-linecap="round" fill="none" />
    </g>
  `,
  'Focused Runner': () => `
    <g id="eyes-focused-runner">
      <!-- Determined angled brows -->
      <path d="M370 380 L445 398" stroke="#131b27" stroke-width="8" stroke-linecap="round" />
      <path d="M630 380 L555 398" stroke="#131b27" stroke-width="8" stroke-linecap="round" />
      <!-- Sharp eyes -->
      <ellipse cx="412" cy="430" rx="32" ry="32" fill="#131b27" />
      <circle cx="412" cy="430" r="16" fill="#4d7298" />
      <circle cx="412" cy="430" r="8" fill="#131b27" />
      <circle cx="406" cy="424" r="5" fill="#ffffff" />
      <ellipse cx="588" cy="430" rx="32" ry="32" fill="#131b27" />
      <circle cx="588" cy="430" r="16" fill="#4d7298" />
      <circle cx="588" cy="430" r="8" fill="#131b27" />
      <circle cx="582" cy="424" r="5" fill="#ffffff" />
    </g>
  `,
  'Starry Eyed': () => `
    <g id="eyes-starry-eyed">
      <ellipse cx="410" cy="425" rx="36" ry="40" fill="#131b27" />
      <polygon points="410,395 415,415 435,425 415,435 410,455 405,435 385,425 405,415" fill="#ffcf75" />
      <circle cx="396" cy="408" r="6" fill="#ffffff" />
      <ellipse cx="590" cy="425" rx="36" ry="40" fill="#131b27" />
      <polygon points="590,395 595,415 615,425 595,435 590,455 585,435 565,425 585,415" fill="#ffcf75" />
      <circle cx="576" cy="408" r="6" fill="#ffffff" />
    </g>
  `,
  'Happy Wink': () => `
    <g id="eyes-happy-wink">
      <!-- Left Eye Winking Arc -->
      <path d="M380 430 Q410 405 440 430" stroke="#131b27" stroke-width="8" stroke-linecap="round" fill="none" />
      <path d="M390 436 L375 444" stroke="#131b27" stroke-width="5" stroke-linecap="round" />
      <!-- Right Eye Wide & Happy -->
      <ellipse cx="590" cy="425" rx="36" ry="40" fill="#131b27" />
      <circle cx="578" cy="412" r="14" fill="#ffffff" />
      <circle cx="604" cy="436" r="6" fill="#ffffff" />
      <path d="M555 385 Q590 375 625 385" stroke="#4a3124" stroke-width="5" stroke-linecap="round" fill="none" />
    </g>
  `,
  'Chill Sleepy': () => `
    <g id="eyes-chill-sleepy">
      <!-- Relaxed half-lidded eyes -->
      <ellipse cx="410" cy="430" rx="34" ry="24" fill="#131b27" />
      <circle cx="410" cy="434" r="14" fill="#5c3d2e" />
      <circle cx="406" cy="430" r="5" fill="#ffffff" />
      <path d="M374 420 Q410 410 446 420" stroke="#a8561d" stroke-width="12" fill="none" stroke-linecap="round" />
      <ellipse cx="590" cy="430" rx="34" ry="24" fill="#131b27" />
      <circle cx="590" cy="434" r="14" fill="#5c3d2e" />
      <circle cx="586" cy="430" r="5" fill="#ffffff" />
      <path d="M554 420 Q590 410 626 420" stroke="#a8561d" stroke-width="12" fill="none" stroke-linecap="round" />
    </g>
  `,
  'Speed Gaze': () => `
    <g id="eyes-speed-gaze">
      <!-- Amber glowing irises with speed lines -->
      <ellipse cx="410" cy="425" rx="36" ry="34" fill="#131b27" />
      <ellipse cx="410" cy="425" rx="28" ry="26" fill="#ffaa2b" />
      <circle cx="410" cy="425" r="14" fill="#3a1b05" />
      <circle cx="404" cy="418" r="6" fill="#ffffff" />
      <line x1="330" y1="425" x2="370" y2="425" stroke="#ffaa2b" stroke-width="4" stroke-linecap="round" />
      <ellipse cx="590" cy="425" rx="36" ry="34" fill="#131b27" />
      <ellipse cx="590" cy="425" rx="28" ry="26" fill="#ffaa2b" />
      <circle cx="590" cy="425" r="14" fill="#3a1b05" />
      <circle cx="584" cy="418" r="6" fill="#ffffff" />
      <line x1="630" y1="425" x2="670" y2="425" stroke="#ffaa2b" stroke-width="4" stroke-linecap="round" />
    </g>
  `,
};

// -------------------------------------------------------------
// 6. MOUTH / EXPRESSION (>= 5 variants)
// -------------------------------------------------------------
export const MOUTHS = {
  'Buck Teeth Grin': () => `
    <g id="mouth-buck-teeth">
      <!-- W-shaped hamster lips -->
      <path d="M465 503 Q485 515 500 503 Q515 515 535 503" fill="none" stroke="#4a2a1b" stroke-width="4" stroke-linecap="round" />
      <!-- Signature cute dual hamster teeth! -->
      <rect x="488" y="506" width="11" height="15" rx="2" fill="#ffffff" stroke="#c9c7be" stroke-width="1.5" />
      <rect x="501" y="506" width="11" height="15" rx="2" fill="#ffffff" stroke="#c9c7be" stroke-width="1.5" />
    </g>
  `,
  'Joyful Open Smile': () => `
    <g id="mouth-joyful-open">
      <!-- Wide open happy mouth -->
      <path d="M465 502 Q500 545 535 502 Z" fill="#6d1b24" stroke="#4a2a1b" stroke-width="3" />
      <!-- Pink tongue -->
      <path d="M480 522 Q500 514 520 522 Q500 542 480 522 Z" fill="#f5a6b3" />
      <!-- Top tiny teeth -->
      <rect x="492" y="502" width="8" height="6" rx="1" fill="#ffffff" />
      <rect x="500" y="502" width="8" height="6" rx="1" fill="#ffffff" />
    </g>
  `,
  'Stuffed Cheeks': () => `
    <g id="mouth-stuffed-cheeks">
      <!-- Puffed little hamster mouth with acorn crumb -->
      <path d="M475 508 Q500 518 525 508" fill="none" stroke="#4a2a1b" stroke-width="4" stroke-linecap="round" />
      <circle cx="500" cy="515" r="4" fill="#a86d36" />
      <circle cx="512" cy="520" r="2.5" fill="#a86d36" />
    </g>
  `,
  'Determined Grit': () => `
    <g id="mouth-determined-grit">
      <!-- Confident runner toothy bar -->
      <path d="M468 506 L532 506" stroke="#4a2a1b" stroke-width="4" stroke-linecap="round" />
      <rect x="474" y="508" width="52" height="11" rx="4" fill="#ffffff" stroke="#4a2a1b" stroke-width="2" />
      <line x1="491" y1="508" x2="491" y2="519" stroke="#c9c7be" stroke-width="1.5" />
      <line x1="500" y1="508" x2="500" y2="519" stroke="#c9c7be" stroke-width="1.5" />
      <line x1="509" y1="508" x2="509" y2="519" stroke="#c9c7be" stroke-width="1.5" />
    </g>
  `,
  'Whistling Ooh': () => `
    <g id="mouth-whistling-ooh">
      <circle cx="500" cy="512" r="10" fill="#6d1b24" stroke="#4a2a1b" stroke-width="3" />
      <ellipse cx="500" cy="510" rx="5" ry="3" fill="#f5a6b3" />
    </g>
  `,
};

// -------------------------------------------------------------
// 7. HEADWEAR (>= 10 variants, including None)
// -------------------------------------------------------------
export const HEADWEAR = {
  'None': () => `
    <!-- Natural fluffy head tuft -->
    <path d="M485 305 Q500 280 515 305 Q505 295 485 305 Z" fill="#d9833b" opacity="0.6" />
  `,
  'Retro Sweatband': () => `
    <g id="headwear-sweatband">
      <!-- Striped runner sweatband across forehead -->
      <path d="M330 335 Q500 315 670 335 L668 365 Q500 345 332 365 Z" fill="#ffffff" stroke="#131b27" stroke-width="3" />
      <path d="M331 345 Q500 325 669 345 L668 355 Q500 335 332 355 Z" fill="#ee5253" />
      <circle cx="500" cy="340" r="8" fill="#10ac84" />
    </g>
  `,
  'Backward Running Cap': () => `
    <g id="headwear-running-cap">
      <!-- Sporty backward cap in navy and neon lime -->
      <path d="M340 330 Q500 270 660 330 Q500 350 340 330 Z" fill="#1b2a47" stroke="#131b27" stroke-width="3" />
      <ellipse cx="500" cy="295" rx="140" ry="45" fill="#24385e" />
      <!-- Backward visor pointing left -->
      <path d="M340 325 Q260 330 240 350 Q310 355 350 335 Z" fill="#c4ef6e" stroke="#131b27" stroke-width="2.5" />
      <!-- Button on top -->
      <circle cx="500" cy="275" r="9" fill="#c4ef6e" />
    </g>
  `,
  'Pilot Goggles': () => `
    <g id="headwear-pilot-goggles">
      <!-- Brass flying goggles resting on forehead -->
      <path d="M340 330 Q500 315 660 330" stroke="#5a3d28" stroke-width="14" fill="none" stroke-linecap="round" />
      <!-- Left brass eyepiece -->
      <circle cx="420" cy="325" r="38" fill="#3a2518" stroke="#d4af37" stroke-width="7" />
      <circle cx="420" cy="325" r="28" fill="#ffcf75" opacity="0.85" />
      <ellipse cx="412" cy="318" rx="14" ry="7" fill="#ffffff" opacity="0.8" transform="rotate(-25 412 318)" />
      <!-- Bridge -->
      <rect x="456" y="320" width="18" height="10" rx="3" fill="#d4af37" />
      <!-- Right brass eyepiece -->
      <circle cx="510" cy="325" r="38" fill="#3a2518" stroke="#d4af37" stroke-width="7" />
      <circle cx="510" cy="325" r="28" fill="#ffcf75" opacity="0.85" />
      <ellipse cx="502" cy="318" rx="14" ry="7" fill="#ffffff" opacity="0.8" transform="rotate(-25 502 318)" />
    </g>
  `,
  'Tiny Acorn Beret': () => `
    <g id="headwear-acorn-beret">
      <!-- Adorable acorn cap beret tilted over right ear -->
      <ellipse cx="610" cy="290" rx="75" ry="40" transform="rotate(22 610 290)" fill="#784e2d" stroke="#422814" stroke-width="3" />
      <!-- Crosshatch acorn texture -->
      <g stroke="#56351d" stroke-width="2.5">
        <line x1="570" y1="280" x2="650" y2="295" />
        <line x1="580" y1="295" x2="640" y2="310" />
      </g>
      <!-- Little acorn stem on top -->
      <path d="M625 268 Q640 245 650 250" stroke="#422814" stroke-width="7" fill="none" stroke-linecap="round" />
    </g>
  `,
  'Golden Crown': () => `
    <g id="headwear-golden-crown">
      <!-- 3-pointed royal crown with gems -->
      <polygon points="410,295 440,230 470,275 500,210 530,275 560,230 590,295" fill="#ffcf75" stroke="#b8860b" stroke-width="4" />
      <rect x="410" y="295" width="180" height="24" rx="4" fill="#ffd982" stroke="#b8860b" stroke-width="3" />
      <!-- Jewels -->
      <circle cx="500" cy="307" r="7" fill="#ee5253" />
      <circle cx="445" cy="307" r="5" fill="#10ac84" />
      <circle cx="555" cy="307" r="5" fill="#0984e3" />
    </g>
  `,
  'Miner Helmet': () => `
    <g id="headwear-miner-helmet">
      <!-- Hard-hat with glowing LED lamp -->
      <path d="M360 320 Q500 220 640 320 Z" fill="#f1c40f" stroke="#b7950b" stroke-width="4" />
      <rect x="345" y="315" width="310" height="18" rx="6" fill="#d4ac0d" stroke="#7d6608" stroke-width="2.5" />
      <!-- Center lamp fixture -->
      <rect x="475" y="270" width="50" height="40" rx="6" fill="#34495e" stroke="#1a252f" stroke-width="2" />
      <ellipse cx="500" cy="290" rx="18" ry="14" fill="#ffffff" stroke="#bdc3c7" stroke-width="2" />
      <!-- Soft light beam glow -->
      <polygon points="500,290 350,140 650,140" fill="#ffffff" opacity="0.15" />
    </g>
  `,
  'Sunflower Bloom': () => `
    <g id="headwear-sunflower" transform="translate(680, 270)">
      <!-- Cheerful sunflower behind ear -->
      <g fill="#f1c40f" stroke="#d4ac0d" stroke-width="2">
        <ellipse cx="0" cy="-35" rx="12" ry="24" />
        <ellipse cx="25" cy="-25" rx="12" ry="24" transform="rotate(45 25 -25)" />
        <ellipse cx="35" cy="0" rx="12" ry="24" transform="rotate(90 35 0)" />
        <ellipse cx="25" cy="25" rx="12" ry="24" transform="rotate(135 25 25)" />
        <ellipse cx="0" cy="35" rx="12" ry="24" transform="rotate(180 0 35)" />
        <ellipse cx="-25" cy="25" rx="12" ry="24" transform="rotate(225 -25 25)" />
        <ellipse cx="-35" cy="0" rx="12" ry="24" transform="rotate(270 -35 0)" />
        <ellipse cx="-25" cy="-25" rx="12" ry="24" transform="rotate(315 -25 -25)" />
      </g>
      <circle cx="0" cy="0" r="22" fill="#5c3818" stroke="#3d230d" stroke-width="3" />
      <circle cx="0" cy="0" r="14" fill="#784b22" />
    </g>
  `,
  'Warm Winter Beanie': () => `
    <g id="headwear-winter-beanie">
      <!-- Knitted cozy beanie with pom-pom -->
      <path d="M370 325 Q500 200 630 325 Z" fill="#2e86de" stroke="#1b4f85" stroke-width="4" />
      <rect x="360" y="315" width="280" height="28" rx="8" fill="#54a0ff" stroke="#1b4f85" stroke-width="3" />
      <line x1="410" y1="315" x2="410" y2="343" stroke="#2e86de" stroke-width="2" />
      <line x1="460" y1="315" x2="460" y2="343" stroke="#2e86de" stroke-width="2" />
      <line x1="500" y1="315" x2="500" y2="343" stroke="#2e86de" stroke-width="2" />
      <line x1="540" y1="315" x2="540" y2="343" stroke="#2e86de" stroke-width="2" />
      <line x1="590" y1="315" x2="590" y2="343" stroke="#2e86de" stroke-width="2" />
      <!-- Fluffy pom-pom on top -->
      <circle cx="500" cy="205" r="26" fill="#ffffff" stroke="#c8d6e5" stroke-width="3" />
    </g>
  `,
  'Squeek Ninja Headband': () => `
    <g id="headwear-ninja-bandana">
      <!-- Red ninja runner headband with metallic runner plate -->
      <path d="M320 335 Q500 310 680 335 L678 370 Q500 345 322 370 Z" fill="#c0392b" stroke="#781e14" stroke-width="3" />
      <!-- Trailing ribbon tails on right side -->
      <path d="M680 350 Q750 370 810 360 Q750 390 680 365 Z" fill="#c0392b" stroke="#781e14" stroke-width="2" />
      <!-- Metal plate -->
      <rect x="450" y="325" width="100" height="30" rx="4" fill="#bdc3c7" stroke="#7f8c8d" stroke-width="2.5" />
      <circle cx="460" cy="340" r="2.5" fill="#34495e" />
      <circle cx="540" cy="340" r="2.5" fill="#34495e" />
      <!-- Speed runner emblem -->
      <path d="M488 343 L498 333 L502 347 L512 337" stroke="#2c3e50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </g>
  `,
};

// -------------------------------------------------------------
// 8. ACCESSORY (>= 8 variants, including None)
// -------------------------------------------------------------
export const ACCESSORIES = {
  'None': () => '',
  'Runner Bib #42': () => `
    <g id="acc-runner-bib">
      <!-- White athletic race number bib pinned to chest -->
      <rect x="420" y="605" width="160" height="110" rx="8" fill="#ffffff" stroke="#131b27" stroke-width="4" />
      <rect x="426" y="611" width="148" height="24" fill="#ee5253" />
      <text x="500" y="628" font-family="system-ui, sans-serif" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle" letter-spacing="2">SQUEEKRUNNER</text>
      <text x="500" y="692" font-family="system-ui, sans-serif" font-weight="900" font-size="52" fill="#131b27" text-anchor="middle">42</text>
      <!-- Safety pins -->
      <circle cx="430" cy="615" r="3.5" fill="#95a5a6" />
      <circle cx="570" cy="615" r="3.5" fill="#95a5a6" />
      <circle cx="430" cy="705" r="3.5" fill="#95a5a6" />
      <circle cx="570" cy="705" r="3.5" fill="#95a5a6" />
    </g>
  `,
  'Golden Chain & Nut Medallion': () => `
    <g id="acc-gold-chain">
      <!-- Thick golden necklace -->
      <path d="M380 570 Q500 680 620 570" fill="none" stroke="#f1c40f" stroke-width="14" stroke-dasharray="14 10" stroke-linecap="round" />
      <path d="M380 570 Q500 680 620 570" fill="none" stroke="#d4ac0d" stroke-width="6" stroke-linecap="round" />
      <!-- Giant Golden Nut Medallion -->
      <circle cx="500" cy="670" r="44" fill="#f39c12" stroke="#b7770d" stroke-width="5" />
      <circle cx="500" cy="670" r="36" fill="#f1c40f" />
      <!-- Embossed Acorn icon -->
      <ellipse cx="500" cy="674" rx="16" ry="19" fill="#8a5325" />
      <path d="M482 663 Q500 651 518 663 L516 669 Q500 658 484 669 Z" fill="#56351d" />
      <circle cx="500" cy="651" r="2.5" fill="#56351d" />
    </g>
  `,
  'Red Running Cape': () => `
    <g id="acc-red-cape">
      <!-- Windblown speed cape behind arms -->
      <path d="M340 560 Q200 640 160 820 Q320 780 400 700 Z" fill="#c0392b" stroke="#781e14" stroke-width="4" />
      <path d="M660 560 Q800 640 840 820 Q680 780 600 700 Z" fill="#962d22" stroke="#781e14" stroke-width="4" />
      <!-- Gold collar clasp -->
      <circle cx="500" cy="570" r="14" fill="#f1c40f" stroke="#b7950b" stroke-width="3" />
      <circle cx="500" cy="570" r="6" fill="#ee5253" />
    </g>
  `,
  'Cozy Knit Scarf': () => `
    <g id="acc-knit-scarf">
      <!-- Striped warm scarf around neck -->
      <path d="M340 545 Q500 585 660 545 Q500 625 340 545 Z" fill="#16a085" stroke="#0e6655" stroke-width="4" />
      <path d="M460 580 L440 730 L500 730 L500 585 Z" fill="#1abc9c" stroke="#0e6655" stroke-width="3" />
      <!-- Stripes -->
      <line x1="445" y1="620" x2="495" y2="620" stroke="#f1c40f" stroke-width="6" />
      <line x1="445" y1="660" x2="495" y2="660" stroke="#f1c40f" stroke-width="6" />
      <line x1="445" y1="700" x2="495" y2="700" stroke="#f1c40f" stroke-width="6" />
      <!-- Fringe -->
      <line x1="445" y1="730" x2="445" y2="745" stroke="#16a085" stroke-width="3" />
      <line x1="460" y1="730" x2="460" y2="745" stroke="#16a085" stroke-width="3" />
      <line x1="475" y1="730" x2="475" y2="745" stroke="#16a085" stroke-width="3" />
      <line x1="495" y1="730" x2="495" y2="745" stroke="#16a085" stroke-width="3" />
    </g>
  `,
  'Mechanic Tool Belt': () => `
    <g id="acc-tool-belt">
      <path d="M320 680 Q500 705 680 680" stroke="#6e4d25" stroke-width="16" fill="none" stroke-linecap="round" />
      <rect x="475" y="680" width="50" height="32" rx="4" fill="#95a5a6" stroke="#566573" stroke-width="3" />
      <!-- Tiny pouches -->
      <rect x="360" y="685" width="40" height="42" rx="6" fill="#8b572a" stroke="#4a2e16" stroke-width="2.5" />
      <rect x="600" y="685" width="40" height="42" rx="6" fill="#8b572a" stroke="#4a2e16" stroke-width="2.5" />
    </g>
  `,
  'Dapper Bowtie': () => `
    <g id="acc-dapper-bowtie" transform="translate(500, 565)">
      <polygon points="0,0 -45,-25 -40,25" fill="#27ae60" stroke="#1e8449" stroke-width="3" />
      <polygon points="0,0 45,-25 40,25" fill="#27ae60" stroke="#1e8449" stroke-width="3" />
      <circle cx="0" cy="0" r="14" fill="#2ecc71" stroke="#1e8449" stroke-width="2.5" />
    </g>
  `,
  'Heart Pin': () => `
    <g id="acc-heart-pin" transform="translate(420, 615)">
      <path d="M0,8 A8,8 0 0,1 16,8 A8,8 0 0,1 32,8 Q32,20 16,30 Q0,20 0,8 Z" fill="#e74c3c" stroke="#c0392b" stroke-width="2" />
      <ellipse cx="8" cy="8" rx="4" ry="2" fill="#ffffff" opacity="0.7" transform="rotate(-30 8 8)" />
    </g>
  `,
};

// -------------------------------------------------------------
// 9. HELD ITEMS & PAWS (>= 6 variants)
// -------------------------------------------------------------
export const HELD_ITEMS = {
  'Golden Squeek Nut': (fur) => `
    <g id="held-golden-nut">
      <!-- The iconic Golden Nut of SqueekRunner -->
      <g transform="translate(580, 610) rotate(-12)">
        <ellipse cx="60" cy="70" rx="48" ry="58" fill="#ffd97d" stroke="#b8860b" stroke-width="4" />
        <!-- Acorn cap -->
        <path d="M10 40 Q60 5 110 40 L108 55 Q60 25 12 55 Z" fill="#8a5325" stroke="#4a280c" stroke-width="3.5" />
        <!-- Little green oak leaf on top -->
        <path d="M60 15 Q75 -10 95 -5 Q85 15 60 15 Z" fill="#78b13f" stroke="#4d7723" stroke-width="2.5" />
        <!-- Sparkle on nut -->
        <polygon points="75,55 80,68 93,73 80,78 75,91 70,78 57,73 70,68" fill="#ffffff" opacity="0.9" />
      </g>
      <!-- Hamster paws clasping the item -->
      ${renderPaws(fur, 580, 660, 680, 675)}
    </g>
  `,
  'Giant Sunflower Seed': (fur) => `
    <g id="held-sunflower-seed">
      <!-- Classic striped hamster treat -->
      <g transform="translate(590, 600) rotate(18)">
        <path d="M50 0 Q95 80 50 140 Q5 80 50 0 Z" fill="#2d3436" stroke="#131b27" stroke-width="4" />
        <path d="M50 8 Q68 75 50 132" stroke="#dfe6e9" stroke-width="7" fill="none" stroke-linecap="round" />
        <path d="M34 25 Q42 75 34 115" stroke="#b2bec3" stroke-width="4" fill="none" stroke-linecap="round" />
      </g>
      ${renderPaws(fur, 580, 660, 670, 670)}
    </g>
  `,
  'Tiny Brass Wrench': (fur) => `
    <g id="held-brass-wrench">
      <!-- Wheel tuning tool -->
      <g transform="translate(600, 590) rotate(35)">
        <rect x="35" y="40" width="22" height="110" rx="6" fill="#d4af37" stroke="#997a15" stroke-width="3.5" />
        <!-- Wrench head -->
        <circle cx="46" cy="35" r="32" fill="#d4af37" stroke="#997a15" stroke-width="3.5" />
        <rect x="32" y="10" width="28" height="34" fill="#f4ebd9" stroke="#997a15" stroke-width="3" />
      </g>
      ${renderPaws(fur, 590, 660, 670, 680)}
    </g>
  `,
  'Stop Watch': (fur) => `
    <g id="held-stopwatch">
      <g transform="translate(600, 610)">
        <circle cx="50" cy="60" r="48" fill="#dfe6e9" stroke="#636e72" stroke-width="4" />
        <circle cx="50" cy="60" r="38" fill="#ffffff" stroke="#b2bec3" stroke-width="2" />
        <!-- Top button -->
        <rect x="42" y="4" width="16" height="12" rx="3" fill="#e17055" />
        <!-- Tick marks & hand -->
        <circle cx="50" cy="60" r="4" fill="#d63031" />
        <line x1="50" y1="60" x2="68" y2="42" stroke="#d63031" stroke-width="3" stroke-linecap="round" />
        <line x1="50" y1="28" x2="50" y2="34" stroke="#2d3436" stroke-width="2.5" />
        <line x1="82" y1="60" x2="76" y2="60" stroke="#2d3436" stroke-width="2.5" />
      </g>
      ${renderPaws(fur, 580, 665, 680, 670)}
    </g>
  `,
  'Fresh Energy Carrot': (fur) => `
    <g id="held-energy-carrot">
      <g transform="translate(590, 595) rotate(-24)">
        <path d="M50 30 Q70 30 70 45 L50 145 L30 45 Q30 30 50 30 Z" fill="#e67e22" stroke="#b95e0c" stroke-width="4" />
        <path d="M40 60 h20 M38 90 h22 M42 120 h12" stroke="#b95e0c" stroke-width="3" stroke-linecap="round" />
        <!-- Green leafy fronds -->
        <path d="M50 30 Q30 5 15 15 M50 30 Q50 -5 50 -10 M50 30 Q70 5 85 15" stroke="#27ae60" stroke-width="6" fill="none" stroke-linecap="round" />
      </g>
      ${renderPaws(fur, 580, 660, 670, 675)}
    </g>
  `,
  'Squeek Block #1999': (fur) => `
    <g id="held-squeek-block">
      <!-- Mini glowing PoW block cube -->
      <g transform="translate(600, 615)">
        <rect x="15" y="15" width="85" height="85" rx="10" fill="#0984e3" stroke="#74b9ff" stroke-width="4" />
        <rect x="25" y="25" width="65" height="65" rx="6" fill="#1b2a47" />
        <text x="58" y="55" font-family="monospace" font-weight="900" font-size="14" fill="#74b9ff" text-anchor="middle">BLOCK</text>
        <text x="58" y="75" font-family="monospace" font-weight="900" font-size="18" fill="#c4ef6e" text-anchor="middle">#1999</text>
      </g>
      ${renderPaws(fur, 580, 665, 690, 680)}
    </g>
  `,
};

function renderPaws(fur, leftX, leftY, rightX, rightY) {
  return `
    <g id="front-paws">
      <!-- Left Paw -->
      <ellipse cx="${leftX}" cy="${leftY}" rx="32" ry="24" transform="rotate(-15 ${leftX} ${leftY})" fill="${fur.shadow}" />
      <ellipse cx="${leftX}" cy="${leftY - 2}" rx="30" ry="22" transform="rotate(-15 ${leftX} ${leftY - 2})" fill="${fur.main}" />
      <circle cx="${leftX - 8}" cy="${leftY}" r="7" fill="${fur.pink}" />
      <circle cx="${leftX + 4}" cy="${leftY + 3}" r="7" fill="${fur.pink}" />
      <circle cx="${leftX + 16}" cy="${leftY + 2}" r="6" fill="${fur.pink}" />

      <!-- Right Paw -->
      <ellipse cx="${rightX}" cy="${rightY}" rx="32" ry="24" transform="rotate(15 ${rightX} ${rightY})" fill="${fur.shadow}" />
      <ellipse cx="${rightX}" cy="${rightY - 2}" rx="30" ry="22" transform="rotate(15 ${rightX} ${rightY - 2})" fill="${fur.main}" />
      <circle cx="${rightX - 16}" cy="${rightY + 2}" r="6" fill="${fur.pink}" />
      <circle cx="${rightX - 4}" cy="${rightY + 3}" r="7" fill="${fur.pink}" />
      <circle cx="${rightX + 8}" cy="${rightY}" r="7" fill="${fur.pink}" />
    </g>
  `;
}

// -------------------------------------------------------------
// 10. LEGENDARY 1/1 HAMSTERS (10 Handcrafted Unique Editions)
// -------------------------------------------------------------
export const LEGENDARY_EDITIONS = [
  {
    name: 'SqueekRunner Prime — The First Runner',
    title: 'SqueekRunner Prime',
    description: 'Legendary 1/1 #001: The founding champion of SqueekRunner. The first paws to step onto the endless track and master the golden nut.',
    render: () => `
      <rect width="1000" height="1000" fill="#0a0f18" />
      <circle cx="500" cy="500" r="440" fill="none" stroke="#ffcf75" stroke-width="4" stroke-dasharray="16 12" />
      <circle cx="500" cy="500" r="390" fill="#141f30" stroke="#f39c12" stroke-width="8" />
      <!-- Golden Runner Halo -->
      <g stroke="#ffd700" stroke-width="8" opacity="0.8">
        <line x1="500" y1="120" x2="500" y2="880" />
        <line x1="120" y1="500" x2="880" y2="500" />
        <line x1="230" y1="230" x2="770" y2="770" />
        <line x1="230" y1="770" x2="770" y2="230" />
      </g>
      ${renderHamsterBase(FUR_COLORS['Classic Golden Brown'])}
      <!-- Glowing golden eyes -->
      <circle cx="410" cy="425" r="28" fill="#ffd700" stroke="#ffffff" stroke-width="5" />
      <circle cx="590" cy="425" r="28" fill="#ffd700" stroke="#ffffff" stroke-width="5" />
      ${MOUTHS['Joyful Open Smile']()}
      <!-- Master Crown -->
      ${HEADWEAR['Golden Crown']()}
      <!-- First Runner Medallion -->
      <circle cx="500" cy="670" r="50" fill="#ffd700" stroke="#b8860b" stroke-width="6" />
      <text x="500" y="680" font-family="system-ui, sans-serif" font-weight="900" font-size="28" fill="#2d1c02" text-anchor="middle">#001</text>
      ${HELD_ITEMS['Golden Squeek Nut'](FUR_COLORS['Classic Golden Brown'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'SqueekRunner Prime' },
      { trait_type: 'Role', value: 'The First Runner' },
      { trait_type: 'Status', value: 'Founding Champion' },
    ],
  },
  {
    name: 'The 98.3 RPM Sprinter',
    title: 'Overclocked Sprinter',
    description: 'Legendary 1/1 #002: Reached the absolute maximum calibrated speed limit of 98.316 RPM. Flames trail in his wake.',
    render: () => `
      <rect width="1000" height="1000" fill="#2b0d06" />
      <!-- Fire speed rings -->
      <circle cx="500" cy="500" r="420" fill="none" stroke="#e74c3c" stroke-width="12" />
      <circle cx="500" cy="500" r="380" fill="none" stroke="#f39c12" stroke-width="8" stroke-dasharray="24 16" />
      <circle cx="500" cy="500" r="340" fill="none" stroke="#f1c40f" stroke-width="4" />
      ${renderHamsterBase(FUR_COLORS['Honey Peach'])}
      ${EYES['Speed Gaze']()}
      ${MOUTHS['Determined Grit']()}
      ${HEADWEAR['Retro Sweatband']()}
      <!-- Race Bib 98.3 -->
      <g id="leg-bib">
        <rect x="420" y="610" width="160" height="100" rx="8" fill="#ffffff" stroke="#e74c3c" stroke-width="4" />
        <text x="500" y="680" font-family="system-ui, sans-serif" font-weight="900" font-size="44" fill="#c0392b" text-anchor="middle">98.3</text>
      </g>
      ${HELD_ITEMS['Stop Watch'](FUR_COLORS['Honey Peach'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'Overclocked Sprinter' },
      { trait_type: 'Speed Record', value: '98.316 RPM' },
      { trait_type: 'Status', value: 'Speed Champion' },
    ],
  },
  {
    name: 'King Squeek XIV',
    title: 'The Sovereign Hamster',
    description: 'Legendary 1/1 #003: Ruler of all sawdust realms and keeper of the Grand Granary.',
    render: () => `
      ${BACKGROUNDS['Golden Glow']()}
      ${SPECIAL_AURAS['Golden Stardust']()}
      ${renderHamsterBase(FUR_COLORS['Caramel Cream'])}
      ${EYES['Big Sparkle']()}
      ${MOUTHS['Buck Teeth Grin']()}
      ${HEADWEAR['Golden Crown']()}
      ${ACCESSORIES['Red Running Cape']()}
      ${HELD_ITEMS['Golden Squeek Nut'](FUR_COLORS['Caramel Cream'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'King Squeek XIV' },
      { trait_type: 'Royalty', value: 'Sovereign of the Wheel' },
      { trait_type: 'Crown', value: 'Imperial Diamond' },
    ],
  },
  {
    name: 'CyberSqueek 2077',
    title: 'Neon Runner',
    description: 'Legendary 1/1 #004: Upgraded with bionic implants and sub-millisecond obstacle reaction hardware.',
    render: () => `
      ${BACKGROUNDS['Cyber Grid']()}
      ${SPECIAL_AURAS['PoW Matrix']()}
      ${renderHamsterBase(FUR_COLORS['Midnight Shadow'])}
      <!-- Cyan cyber visor -->
      <rect x="360" y="405" width="280" height="45" rx="10" fill="#00f2fe" opacity="0.9" stroke="#ffffff" stroke-width="3" />
      <line x1="380" y1="427" x2="620" y2="427" stroke="#ffffff" stroke-width="4" stroke-dasharray="14 10" />
      ${MOUTHS['Determined Grit']()}
      ${HEADWEAR['None']()}
      ${ACCESSORIES['Golden Chain & Nut Medallion']()}
      ${HELD_ITEMS['Squeek Block #1999'](FUR_COLORS['Midnight Shadow'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'CyberSqueek 2077' },
      { trait_type: 'Implants', value: 'Quantum Visor' },
      { trait_type: 'Core', value: 'Bionic Agility' },
    ],
  },
  {
    name: 'AstroHamster Zero-G',
    title: 'Space Wheel Explorer',
    description: 'Legendary 1/1 #005: Running beyond the stratosphere in the first orbital wheel.',
    render: () => `
      <rect width="1000" height="1000" fill="#080c14" />
      <!-- Starry deep space -->
      <g fill="#ffffff">
        <circle cx="150" cy="120" r="3" /><circle cx="850" cy="180" r="4" /><circle cx="280" cy="780" r="3" />
        <circle cx="750" cy="850" r="4" /><circle cx="500" cy="90" r="2" /><circle cx="920" cy="500" r="3" />
      </g>
      <!-- Earth silhouette in background -->
      <circle cx="800" cy="250" r="140" fill="#1e3799" stroke="#4a69bd" stroke-width="6" />
      <path d="M720 230 Q760 180 820 220 Q860 280 800 320 Z" fill="#78e08f" />
      ${renderHamsterBase(FUR_COLORS['Snow Fluff'])}
      <!-- Astronaut Bubble Helmet -->
      <circle cx="500" cy="450" r="260" fill="none" stroke="#74b9ff" stroke-width="12" opacity="0.8" />
      <circle cx="500" cy="450" r="250" fill="#74b9ff" opacity="0.12" />
      <!-- Curved visor reflection -->
      <path d="M340 330 Q460 270 560 300" stroke="#ffffff" stroke-width="14" fill="none" stroke-linecap="round" opacity="0.7" />
      ${EYES['Starry Eyed']()}
      ${MOUTHS['Whistling Ooh']()}
      ${HELD_ITEMS['Giant Sunflower Seed'](FUR_COLORS['Snow Fluff'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'AstroHamster Zero-G' },
      { trait_type: 'Environment', value: 'Orbital Wheel' },
      { trait_type: 'Helmet', value: 'Nano-Glass Bubble' },
    ],
  },
  {
    name: 'Grand Mechanic WHEELY',
    title: 'Master Engineer',
    description: 'Legendary 1/1 #006: The master mechanic keeping the track bearings greased and the wheel spinning smoothly.',
    render: () => `
      ${BACKGROUNDS['Sawdust Track']()}
      ${SPECIAL_AURAS['WHEELY9000 Wheel']()}
      ${renderHamsterBase(FUR_COLORS['Chocolate Truffle'])}
      ${EYES['Focused Runner']()}
      ${MOUTHS['Buck Teeth Grin']()}
      ${HEADWEAR['Miner Helmet']()}
      ${ACCESSORIES['Mechanic Tool Belt']()}
      ${HELD_ITEMS['Tiny Brass Wrench'](FUR_COLORS['Chocolate Truffle'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'Grand Mechanic WHEELY' },
      { trait_type: 'Specialty', value: 'Track Bearing Specialist' },
      { trait_type: 'Tool', value: 'Master Titanium Wrench' },
    ],
  },
  {
    name: 'Shadow Ninja Squeek',
    title: 'Midnight Shinobi',
    description: 'Legendary 1/1 #007: Silent paws crossing the finish line before the sound of the wheel even registers.',
    render: () => `
      <rect width="1000" height="1000" fill="#111116" />
      <circle cx="500" cy="500" r="410" fill="#1c1c24" stroke="#e74c3c" stroke-width="4" stroke-dasharray="8 12" />
      ${SPECIAL_AURAS['Speed Lightning']()}
      ${renderHamsterBase(FUR_COLORS['Midnight Shadow'])}
      <!-- Glowing Ruby Eyes -->
      <circle cx="410" cy="425" r="26" fill="#e74c3c" stroke="#ffffff" stroke-width="4" />
      <circle cx="590" cy="425" r="26" fill="#e74c3c" stroke="#ffffff" stroke-width="4" />
      ${MOUTHS['Determined Grit']()}
      ${HEADWEAR['Squeek Ninja Headband']()}
      ${ACCESSORIES['None']()}
      ${HELD_ITEMS['Golden Squeek Nut'](FUR_COLORS['Midnight Shadow'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'Shadow Ninja Squeek' },
      { trait_type: 'Clan', value: 'Silent Wheel Dojo' },
      { trait_type: 'Technique', value: 'Shadow Sprint' },
    ],
  },
  {
    name: 'The 24K Golden Runner',
    title: 'Solid Gold Athlete',
    description: 'Legendary 1/1 #008: Cast in pure 24K solid gold. Unstoppable momentum on the SqueekRunner track.',
    render: () => `
      <defs>
        <radialGradient id="pureGoldGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff0aa" />
          <stop offset="50%" stop-color="#ffd700" />
          <stop offset="100%" stop-color="#b8860b" />
        </radialGradient>
      </defs>
      <rect width="1000" height="1000" fill="#2b1f07" />
      <circle cx="500" cy="500" r="430" fill="url(#pureGoldGrad)" opacity="0.18" />
      ${SPECIAL_AURAS['Golden Stardust']()}
      ${renderHamsterBase({
        main: '#ffd700',
        light: '#fff5aa',
        shadow: '#b8860b',
        belly: '#fffae0',
        pink: '#ffb3ba',
        nose: '#805d00',
        whiskers: '#997000',
      })}
      ${EYES['Starry Eyed']()}
      ${MOUTHS['Joyful Open Smile']()}
      ${HEADWEAR['Golden Crown']()}
      ${ACCESSORIES['Golden Chain & Nut Medallion']()}
      ${HELD_ITEMS['Golden Squeek Nut']({
        main: '#ffd700',
        shadow: '#b8860b',
        pink: '#ffb3ba',
      })}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'The 24K Golden Runner' },
      { trait_type: 'Material', value: 'Solid 24K Gold' },
      { trait_type: 'Shine', value: 'Maximum Radiance' },
    ],
  },
  {
    name: 'Forest Druid Squeek',
    title: 'Guardian of the Acorn',
    description: 'Legendary 1/1 #009: In tune with ancient trees and wild meadows. Blesses every runner with endless stamina.',
    render: () => `
      ${BACKGROUNDS['Sunny Meadow']()}
      ${renderHamsterBase(FUR_COLORS['Wild Sable'])}
      ${EYES['Big Sparkle']()}
      ${MOUTHS['Joyful Open Smile']()}
      ${HEADWEAR['Sunflower Bloom']()}
      ${ACCESSORIES['Heart Pin']()}
      ${HELD_ITEMS['Fresh Energy Carrot'](FUR_COLORS['Wild Sable'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'Forest Druid Squeek' },
      { trait_type: 'Affinity', value: 'Nature & Growth' },
      { trait_type: 'Blessing', value: 'Endless Stamina' },
    ],
  },
  {
    name: 'Diamond Paws Hodler',
    title: 'Unbreakable Champion',
    description: 'Legendary 1/1 #010: Never paper paws. Running steady and strong through every tricky obstacle.',
    render: () => `
      <rect width="1000" height="1000" fill="#0f1923" />
      <!-- Diamond refraction facets -->
      <polygon points="500,80 750,250 850,550 500,920 150,550 250,250" fill="none" stroke="#00f2fe" stroke-width="4" opacity="0.6" />
      <polygon points="500,80 850,550 150,550" fill="none" stroke="#4facfe" stroke-width="2" opacity="0.4" />
      ${SPECIAL_AURAS['Golden Stardust']()}
      ${renderHamsterBase(FUR_COLORS['Silver Ash'])}
      ${EYES['Speed Gaze']()}
      ${MOUTHS['Determined Grit']()}
      ${HEADWEAR['Backward Running Cap']()}
      ${ACCESSORIES['Runner Bib #42']()}
      ${HELD_ITEMS['Squeek Block #1999'](FUR_COLORS['Silver Ash'])}
    `,
    attributes: [
      { trait_type: 'Edition', value: '1 of 1 Legendary' },
      { trait_type: 'Character', value: 'Diamond Paws Hodler' },
      { trait_type: 'Trait', value: 'Diamond Paws' },
      { trait_type: 'Resilience', value: '100% Unbreakable' },
    ],
  },
];
