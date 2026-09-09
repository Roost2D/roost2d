export type ChiknSecondaryMotion = 'rigid' | 'soft' | 'dangling' | 'cloth' | 'feather' | 'bulky' | 'elastic';
export type ChiknPunchPreset = 'katana' | 'sword' | 'snips' | 'thrust' | 'golf' | 'pickaxe' | 'heavy-swing' | 'light-swing' | 'gun' | 'wand';
export type ChiknKickPreset = 'natural' | 'fast' | 'heavy' | 'roller' | 'stiletto' | 'spur' | 'pendulum' | 'ironclaw';
export type ChiknSpecialPreset = 'egg' | 'laser' | 'flame' | 'sonic' | 'disk' | 'pan' | 'wand' | 'energy' | 'liquid' | 'exhaust' | 'tail-stab' | 'tail-sweep' | 'tail-snap' | 'tail-slam';

export interface CuratedTraitProfile {
  species: 'chikn' | 'roostr';
  traitGroupId: string;
  secondaryMotion: ChiknSecondaryMotion;
  motionFamily: 'accent' | 'footwear' | 'blade' | 'blunt' | 'ranged' | 'casting' | 'tail';
  punchPreset?: ChiknPunchPreset;
  kickPreset?: ChiknKickPreset;
  specialPreset?: ChiknSpecialPreset;
}

// Every released logical group is deliberately present once. The compact rows keep the reviewable
// catalog readable while avoiding runtime name matching or accidental substring capabilities.
const EXPLICIT_TRAIT_ROWS = `
chikn|head/daft-punk|rigid
chikn|head/tungsten-cube|rigid
chikn|head/golden-bone-daddy|rigid
chikn|head/boxhead|rigid
chikn|head/murica|rigid
chikn|head/hamlet|rigid
chikn|head/inherited-royalty|rigid
chikn|head/pineapple|rigid
chikn|head/icey-stare|rigid
chikn|head/golden-crusader|rigid
chikn|head/super-saiyan|elastic
chikn|head/luckiest-red-cap|soft
chikn|head/laser-eye|rigid
chikn|head/goose|elastic
chikn|head/cheeky-redhead|soft
chikn|head/charcoal-brunette|soft
chikn|head/smoking-lounge|soft
chikn|head/saint|rigid
chikn|head/mysterious-fez|soft
chikn|head/all-seeing-eye|elastic
chikn|head/hothead|elastic
chikn|head/gentlechikn|soft
chikn|head/mfd|rigid
chikn|head/avax-safety-officer|rigid
chikn|head/frothy-crown|soft
chikn|head/golden-blonde|soft
chikn|head/low-vision-admiral|rigid
chikn|head/crusader|rigid
chikn|head/lucky-blue-cap|soft
chikn|head/construction-helmet|rigid
chikn|head/red-mage|soft
chikn|head/pixel-cigarette|rigid
chikn|head/gentleman-s-pipe|rigid
chikn|head/hubba-bubba|elastic
chikn|head/sucker|elastic
chikn|head/maverick|rigid
chikn|head/top-of-the-morning|soft
chikn|head/nerdlinger|rigid
chikn|head/cool-dude-69|rigid
chikn|head/blue-mage|soft
chikn|head/black-sweatband|soft
chikn|head/savage-beast|soft
chikn|head/moustache|soft
chikn|head/uniquehorn|elastic
chikn|head/deal-with-it|rigid
chikn|head/purple-sweatband|soft
chikn|head/covid-safe|cloth
chikn|head/pillager|rigid
chikn|head/admiral|rigid
chikn|neck/avax-degen|dangling
chikn|neck/mim-og|dangling
chikn|neck/bitcoin-maxi|dangling
chikn|neck/second-head|elastic
chikn|neck/ethereum-gwei-guzzler|dangling
chikn|neck/blue-bandana|cloth
chikn|neck/red-bandana|cloth
chikn|neck/black-bandana|cloth
chikn|neck/mim-bling|dangling
chikn|neck/bitcoin-bling|dangling
chikn|neck/chains-for-days|dangling
chikn|neck/dollar-chain|dangling
chikn|neck/ethereum-bling|dangling
chikn|neck/chicken-choker|dangling
chikn|neck/avax-bling|dangling
chikn|neck/wage-slave|dangling
chikn|neck/red-bowtie|cloth
chikn|neck/purple-bowtie|cloth
chikn|neck/polygon-bling|dangling
chikn|neck/polygon-degen|dangling
chikn|neck/hairy-old-man|soft
chikn|torso/business-boy|cloth
chikn|torso/karate-kid|cloth
chikn|torso/action-shorts|cloth
chikn|torso/nugget-wand|rigid
chikn|torso/midas-muscles|elastic
chikn|torso/captain-chimerica|rigid
chikn|torso/spell-wand|rigid
chikn|torso/big-bag-of-cash|bulky
chikn|torso/hentai|cloth
chikn|torso/popsicle|rigid
chikn|torso/cutlass|rigid
chikn|torso/fresh-fish|soft
chikn|torso/mighty-broadsword|rigid
chikn|torso/human-growth-hormones|elastic
chikn|torso/peacemaker|rigid
chikn|torso/big-ol-corn-cob|bulky
chikn|torso/summer-days|cloth
chikn|torso/a-fresh-baguette|soft
chikn|torso/old-fashioned-romance|soft
chikn|torso/blue-bag|bulky
chikn|feet/real-feet|elastic
chikn|feet/red-leather-boots|rigid
chikn|feet/swashbucklers|rigid
chikn|feet/purple-leather-boots|rigid
chikn|feet/comfortable-uggs|soft
chikn|feet/rollerderby|rigid
chikn|feet/green-kicks|rigid
chikn|feet/red-vans|rigid
chikn|feet/black-vans|rigid
chikn|feet/blue-kicks|rigid
chikn|feet/purple-feet|elastic
chikn|feet/red-feet|elastic
chikn|feet/green-feet|elastic
chikn|feet/blue-feet|elastic
chikn|tail/big-mama-fat-pipes|rigid
chikn|tail/golden-plumage|feather
chikn|tail/golden-egg|elastic
chikn|tail/gas-guzzler|rigid
chikn|tail/orange-plumage|feather
chikn|tail/led|rigid
chikn|tail/red-plumage|feather
chikn|tail/nyan|elastic
chikn|tail/very-fresh-egg|elastic
chikn|tail/liarliar|elastic
roostr|head/boxhead|rigid
roostr|head/hole-in-one|rigid
roostr|head/panic-buy|bulky
roostr|head/smol-brain-in-jar|elastic
roostr|head/robocoq|rigid
roostr|head/green-party-hat|soft
roostr|head/bucket|rigid
roostr|head/quarter-pounder|soft
roostr|head/feed-bag|cloth
roostr|head/crt|rigid
roostr|head/conspiracy-theorist|rigid
roostr|head/golden-templar|rigid
roostr|head/beaker|elastic
roostr|head/quarterback|rigid
roostr|head/plague-doctor|rigid
roostr|head/jell-o|elastic
roostr|head/golden-bone-daddy|rigid
roostr|head/gas-mask|rigid
roostr|head/oasis|soft
roostr|head/hipster|soft
roostr|head/batter-up|soft
roostr|head/templar|rigid
roostr|head/mfd|rigid
roostr|head/daffy|soft
roostr|head/inherited-royalty|rigid
roostr|head/sombrero|soft
roostr|head/rosebud|soft
roostr|head/samurai|rigid
roostr|head/construction-helmet|rigid
roostr|head/grandpa|soft
roostr|head/beard|soft
roostr|head/chef|soft
roostr|head/sunnies|rigid
roostr|head/supervillain|rigid
roostr|head/chrome-dome|rigid
roostr|head/permabull|rigid
roostr|head/gentlechikn|soft
roostr|head/mullet|soft
roostr|head/woody|rigid
roostr|head/roodboi-rootie|soft
roostr|head/coqpit-commander|rigid
roostr|head/snorkel|rigid
roostr|head/sesh-hat|soft
roostr|head/beret|soft
roostr|head/framez|rigid
roostr|head/coachella|soft
roostr|head/fez|soft
roostr|head/laser-eye|rigid
roostr|head/happy-birthday|soft
roostr|head/dirty-bird|soft
roostr|head/beanie|soft
roostr|head/winterproof|soft
roostr|head/gentleman-s-pipe|rigid
roostr|head/3d-specs|rigid
roostr|head/cap|soft
roostr|head/golden-comb|soft
roostr|head/celestial-comb|soft
roostr|head/green-comb|soft
roostr|head/purple-comb|soft
roostr|neck/floatie-boi|elastic
roostr|neck/avax-degen|dangling
roostr|neck/coq-maxi|dangling
roostr|neck/golden-pauldrons|rigid
roostr|neck/gwei-guzzler|dangling
roostr|neck/bitcoin-maxi|dangling
roostr|neck/chick-magnet|dangling
roostr|neck/clockchain|dangling
roostr|neck/make-a-wish|dangling
roostr|neck/shoulder-armour|rigid
roostr|neck/stop-loss|dangling
roostr|neck/bone-necklace|dangling
roostr|neck/joseph-drip|cloth
roostr|neck/bandolier|rigid
roostr|neck/coq-tags|dangling
roostr|neck/a-little-rag|cloth
roostr|neck/lei|dangling
roostr|neck/red-bowtie|cloth
roostr|neck/sash|cloth
roostr|neck/purple-bowtie|cloth
roostr|neck/prized-coq|dangling
roostr|neck/stethoscope|dangling
roostr|torso/snip-snips|elastic
roostr|torso/golden-breastplate|rigid
roostr|torso/midas-muscles|elastic
roostr|torso/doctor-coq|cloth
roostr|torso/dad-shirt|cloth
roostr|torso/snib-snibs|elastic
roostr|torso/grande-lecoq|cloth
roostr|torso/kevlar|rigid
roostr|torso/lord-quas|cloth
roostr|torso/tweed|cloth
roostr|torso/gameboi|rigid
roostr|torso/human-growth-hormones|elastic
roostr|torso/black-t-shirt|cloth
roostr|torso/goldfish|soft
roostr|torso/white-t-shirt|cloth
roostr|torso/red-t-shirt|cloth
roostr|torso/breastplate|rigid
roostr|torso/hendrix|rigid
roostr|torso/floppy-disk|rigid
roostr|torso/saddle|rigid
roostr|torso/boombox|rigid
roostr|torso/mcfly|cloth
roostr|torso/banjo|rigid
roostr|torso/not-football|rigid
roostr|torso/bone|rigid
roostr|torso/zippo|elastic
roostr|torso/fancy-sword|rigid
roostr|torso/rubber-chikn|elastic
roostr|torso/fresh-fish|soft
roostr|torso/katana|rigid
roostr|torso/omelette|rigid
roostr|torso/play-boy|cloth
roostr|torso/shield|rigid
roostr|torso/love-balloon|elastic
roostr|torso/home-run|rigid
roostr|torso/hoops|rigid
roostr|torso/avax-banger|rigid
roostr|torso/gainz|elastic
roostr|torso/banger|rigid
roostr|torso/cd-rw|rigid
roostr|torso/sword|rigid
roostr|torso/big-stick|rigid
roostr|torso/starfish|soft
roostr|torso/big-ol-corn-cob|bulky
roostr|torso/shovel|rigid
roostr|torso/spork|rigid
roostr|torso/spelunker|rigid
roostr|torso/9-iron|rigid
roostr|torso/the-key|rigid
roostr|torso/a-fresh-baguette|soft
roostr|torso/toot-toot|rigid
roostr|feet/golden-greaves|rigid
roostr|feet/red-stilettos|rigid
roostr|feet/black-stilettos|rigid
roostr|feet/greaves|rigid
roostr|feet/blue-timbs|rigid
roostr|feet/spurs|rigid
roostr|feet/ball-n-chain|rigid
roostr|feet/all-stars|rigid
roostr|feet/sneaker-head|rigid
roostr|feet/buckaroo|rigid
roostr|feet/croqs|soft
roostr|feet/golden-feet|elastic
roostr|feet/ironclaw|rigid
roostr|feet/celestial-feet|elastic
roostr|feet/green-feet|elastic
roostr|feet/red-feet|elastic
roostr|tail/concorde|rigid
roostr|tail/scorpion-king|rigid
roostr|tail/prawn-coqtail|elastic
roostr|tail/hydra|elastic
roostr|tail/whalegod|soft
roostr|tail/peacoq|feather
roostr|tail/off-grid|rigid
roostr|tail/sword-tail|rigid
roostr|tail/big-mama-fat-pipes|rigid
roostr|tail/royal-flush|feather
roostr|tail/foliage|feather
roostr|tail/smokestack|rigid
roostr|tail/gas-guzzler|rigid
roostr|tail/chikn-jockey|elastic
`;

const catalog = new Map<string, CuratedTraitProfile>();
for (const row of EXPLICIT_TRAIT_ROWS.trim().split('\n')) {
  const [species, traitGroupId, secondaryMotion] = row.trim().split('|') as ['chikn' | 'roostr', string, ChiknSecondaryMotion];
  const key = `${species}:${traitGroupId}`;
  if (catalog.has(key)) throw new Error(`Duplicate curated trait profile: ${key}`);
  catalog.set(key, { species, traitGroupId, secondaryMotion, motionFamily: 'accent' });
}

function apply(species: 'chikn' | 'roostr', ids: readonly string[], values: Partial<CuratedTraitProfile>): void {
  for (const id of ids) {
    const key = `${species}:${id}`;
    const current = catalog.get(key);
    if (!current) throw new Error(`Curated override references unknown trait: ${key}`);
    catalog.set(key, { ...current, ...values, species, traitGroupId: id });
  }
}

apply('chikn', ['feet/real-feet', 'feet/purple-feet', 'feet/red-feet', 'feet/green-feet', 'feet/blue-feet'], { motionFamily: 'footwear', kickPreset: 'natural' });
apply('chikn', ['feet/green-kicks', 'feet/red-vans', 'feet/black-vans', 'feet/blue-kicks', 'feet/swashbucklers'], { motionFamily: 'footwear', kickPreset: 'fast' });
apply('chikn', ['feet/red-leather-boots', 'feet/purple-leather-boots', 'feet/comfortable-uggs'], { motionFamily: 'footwear', kickPreset: 'heavy' });
apply('chikn', ['feet/rollerderby'], { motionFamily: 'footwear', kickPreset: 'roller' });

apply('roostr', ['feet/golden-feet', 'feet/celestial-feet', 'feet/green-feet', 'feet/red-feet'], { motionFamily: 'footwear', kickPreset: 'natural' });
apply('roostr', ['feet/all-stars', 'feet/sneaker-head', 'feet/croqs'], { motionFamily: 'footwear', kickPreset: 'fast' });
apply('roostr', ['feet/golden-greaves', 'feet/greaves', 'feet/blue-timbs'], { motionFamily: 'footwear', kickPreset: 'heavy' });
apply('roostr', ['feet/red-stilettos', 'feet/black-stilettos'], { motionFamily: 'footwear', kickPreset: 'stiletto' });
apply('roostr', ['feet/spurs', 'feet/buckaroo'], { motionFamily: 'footwear', kickPreset: 'spur' });
apply('roostr', ['feet/ball-n-chain'], { motionFamily: 'footwear', kickPreset: 'pendulum' });
apply('roostr', ['feet/ironclaw'], { motionFamily: 'footwear', kickPreset: 'ironclaw' });

apply('chikn', ['torso/cutlass'], { motionFamily: 'blade', punchPreset: 'sword' });
apply('chikn', ['torso/mighty-broadsword'], { motionFamily: 'blade', punchPreset: 'sword' });
apply('chikn', ['torso/popsicle', 'torso/big-ol-corn-cob', 'torso/big-bag-of-cash'], { motionFamily: 'blunt', punchPreset: 'heavy-swing' });
apply('chikn', ['torso/fresh-fish', 'torso/a-fresh-baguette'], { motionFamily: 'blunt', punchPreset: 'light-swing' });
apply('chikn', ['torso/peacemaker'], { motionFamily: 'ranged', punchPreset: 'gun' });
apply('chikn', ['torso/nugget-wand', 'torso/spell-wand'], { motionFamily: 'casting', punchPreset: 'wand', specialPreset: 'wand' });

apply('roostr', ['torso/katana'], { motionFamily: 'blade', punchPreset: 'katana' });
apply('roostr', ['torso/fancy-sword', 'torso/sword'], { motionFamily: 'blade', punchPreset: 'sword' });
apply('roostr', ['torso/snip-snips', 'torso/snib-snibs'], { motionFamily: 'blade', punchPreset: 'snips' });
apply('roostr', ['torso/shovel', 'torso/spork', 'torso/the-key'], { motionFamily: 'blade', punchPreset: 'thrust' });
apply('roostr', ['torso/9-iron'], { motionFamily: 'blunt', punchPreset: 'golf' });
apply('roostr', ['torso/avax-banger', 'torso/banger'], { motionFamily: 'blunt', punchPreset: 'pickaxe' });
apply('roostr', ['torso/home-run', 'torso/big-stick', 'torso/bone', 'torso/big-ol-corn-cob'], { motionFamily: 'blunt', punchPreset: 'heavy-swing' });
apply('roostr', ['torso/banjo', 'torso/goldfish', 'torso/fresh-fish', 'torso/rubber-chikn', 'torso/starfish', 'torso/a-fresh-baguette'], { motionFamily: 'blunt', punchPreset: 'light-swing' });

apply('chikn', ['head/laser-eye'], { specialPreset: 'laser' });
apply('chikn', ['head/hothead'], { specialPreset: 'flame' });
apply('chikn', ['head/super-saiyan', 'head/saint', 'head/all-seeing-eye', 'head/red-mage', 'head/blue-mage'], { motionFamily: 'casting', specialPreset: 'energy' });
apply('chikn', ['tail/golden-egg', 'tail/very-fresh-egg'], { specialPreset: 'egg' });
apply('chikn', ['tail/big-mama-fat-pipes', 'tail/gas-guzzler'], { specialPreset: 'exhaust' });

apply('roostr', ['head/laser-eye'], { specialPreset: 'laser' });
apply('roostr', ['head/beaker'], { motionFamily: 'casting', specialPreset: 'liquid' });
apply('roostr', ['head/jell-o'], { motionFamily: 'casting', specialPreset: 'energy' });
apply('roostr', ['torso/floppy-disk'], { specialPreset: 'disk' });
apply('roostr', ['torso/omelette'], { specialPreset: 'pan' });
apply('roostr', ['torso/boombox', 'torso/toot-toot'], { specialPreset: 'sonic' });
apply('roostr', ['torso/zippo'], { specialPreset: 'flame' });
apply('roostr', ['tail/big-mama-fat-pipes', 'tail/smokestack', 'tail/gas-guzzler'], { specialPreset: 'exhaust' });
apply('roostr', ['tail/scorpion-king'], { motionFamily: 'tail', specialPreset: 'tail-stab' });
apply('roostr', ['tail/sword-tail'], { motionFamily: 'tail', specialPreset: 'tail-sweep' });
apply('roostr', ['tail/hydra'], { motionFamily: 'tail', specialPreset: 'tail-snap' });
apply('roostr', ['tail/whalegod'], { motionFamily: 'tail', specialPreset: 'tail-slam' });

export const CURATED_TRAIT_PROFILES: ReadonlyMap<string, CuratedTraitProfile> = catalog;

export function curatedTraitProfile(species: 'chikn' | 'roostr', traitGroupId: string): CuratedTraitProfile | undefined {
  return catalog.get(`${species}:${traitGroupId}`);
}
