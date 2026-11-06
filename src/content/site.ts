/**
 * Editorial content for the public site. Photography is hotlinked from Unsplash under the Unsplash licence
 * (credit is rendered where the photo appears). Replace with the operator's own licensed or consented
 * photography before launch; the `photo()` helper keeps every reference in one place.
 */

export type Photo = { src: string; alt: string; credit: string };

function photo(id: string, alt: string, credit = "Unsplash"): Photo {
  return { src: `https://images.unsplash.com/${id}?auto=format&fit=crop&q=85&w=2400`, alt, credit };
}

export const PHOTOS = {
  hero: photo("photo-1464207687429-7505649dae38", "A small group sitting on a rocky peak at sunset, a lake and hills glowing below them"),
  hikers: photo("photo-1766852254215-ec02eeec50fa", "Five travellers who met that morning, grinning on a rocky trail"),
  mountains: photo("photo-1673011873163-04e76ea3b01d", "Walkers on a golden ridge with snow peaks and a deep blue sky behind"),
  evening: photo("photo-1552727882-97a459159e08", "Silhouettes around a small fire on a ridge under a violet dusk sky"),
  rajasthanGold: photo("photo-1769248784103-6b83a5cda87d", "A lake pavilion and a lone boat under an amber Rajasthan sky full of birds"),
  heroSecondary: photo("photo-1511632765486-a01980e01a18", "Four friends with arms around each other watching the sun go down over the hills"),
  udaipurDock: photo("photo-1715169868134-9ff4871cd13d", "Lake Pichola from the ghats in Udaipur, late afternoon"),
  chai: photo("photo-1680413002471-965cca788f5b", "Two people holding cups of chai, mid-conversation"),
  rooftop: photo("photo-1668342081577-9c568eb1d550", "A rooftop table and chairs overlooking an old city at dusk"),
  walkingStreet: photo("photo-1793280503084-b29136847043", "Women in bright orange, violet and turquoise saris walking down a narrow old-city street"),
  bridge: photo("photo-1761226546430-e44f267fde3d", "Three hikers celebrating on a suspension bridge with mountains behind"),
  bonfire: photo("photo-1784813489506-c1adf9df142f", "People gathered around a campfire at night"),
  stars: photo("photo-1784223042072-69cd9e864860", "Camp under a starry sky with a fire and snow-capped mountains"),
  foodStall: photo("photo-1760263051323-fcd7da7040b0", "A street vendor serving snacks from a large container"),
  foodCart: photo("photo-1788620644598-58fe1354bf2a", "A street food cart with puffed rice, lentils, peanuts and tomatoes"),
  sunrise: photo("photo-1549926506-afba2eb9fb6f", "First light hitting a snow-covered ridge"),
  udaipurPalace: photo("photo-1695956353120-54ce5e91632b", "The City Palace on the banks of Lake Pichola, Udaipur, at golden hour"),
  udaipurBoats: photo("photo-1699949958644-64499c608946", "Boats resting on the lake in Udaipur"),
  tirthanVillage: photo("photo-1701517857774-ce9c3c07bd39", "A village in the middle of the Tirthan valley surrounded by mountains"),
  tirthanRiver: photo("photo-1715236041029-b1ae4aff390d", "The Tirthan river running through a lush green forest"),
  tirthanWaterfall: photo("photo-1652501836325-5610537fbb96", "A waterfall in the forest above the valley"),
  hostAsha: photo("photo-1533128361669-69c065857a13", "Portrait of host Asha, smiling, in the old city"),
  hostRohan: photo("photo-1656938460307-786fcf422103", "Portrait of host Rohan, smiling, with a mountain behind him"),
} as const;

export const TRIP_IMAGES: Record<string, { hero: Photo; gallery: Photo[] }> = {
  "udaipur-lakes-long-weekend": {
    hero: PHOTOS.udaipurPalace,
    gallery: [PHOTOS.udaipurBoats, PHOTOS.udaipurDock, PHOTOS.foodStall, PHOTOS.rooftop],
  },
  "himalayan-village-week": {
    hero: PHOTOS.tirthanVillage,
    gallery: [PHOTOS.tirthanRiver, PHOTOS.bridge, PHOTOS.bonfire, PHOTOS.tirthanWaterfall],
  },
};

export const HOST_PHOTOS: Record<string, Photo> = {
  "Asha Menon": PHOTOS.hostAsha,
  "Rohan Bhatt": PHOTOS.hostRohan,
};

/** Facts we can stand behind today. No invented totals. */
export const PROMISES = [
  { title: "Every traveller is checked by a person", body: "A reviewer confirms identity and age on a short private video call before the balance is due. Nothing is scanned or stored." },
  { title: "Groups of ten to twelve", body: "Small enough that nobody is left standing at the edge. Big enough that you always have a choice of company." },
  { title: "A named host on the ground", body: "Not a tour leader with a flag. Someone who notices when you are quiet at breakfast and knows which café has the good view." },
  { title: "Rooms that make sense", body: "Twin-share, same-gender by default. A private room where the stay allows it. Room plans are on every trip page." },
  { title: "30% now, the rest after approval", body: "The deposit holds one seat. Once a reviewer approves you, you have a clear window to pay the balance. Every deadline in IST." },
  { title: "Refunds in exact rupees", body: "Before you confirm a cancellation you see the amount, dated, with the rule that produced it." },
];

export const MARQUEE = ["Solo travellers only", "Verified by a person", "Named hosts", "Groups of 10–12", "Twin rooms, same-gender", "30% deposit", "Nothing scanned, nothing stored", "Made in India"];

/**
 * Stories wall. These are sample stories written for the pilot preview so the page can be reviewed with real
 * layout; `approved: false` keeps them off production until a traveller has given written permission and the
 * quote is replaced with their words. Do not ship invented testimonials.
 */
export type Story = { quote: string; name: string; detail: string; trip: string; approved: boolean };

export const STORIES: Story[] = [
  { quote: "I booked at 11 pm after a bad week and almost cancelled twice. The call with the reviewer was five minutes and weirdly reassuring. By breakfast on day one I had people to sit with.", name: "Priya", detail: "31 · Bengaluru", trip: "Udaipur lakes long weekend", approved: false },
  { quote: "The sunrise hike was optional. I said that out loud to myself at 5:30 am. Then I went anyway because four others were going and someone had made chai.", name: "Karan", detail: "34 · Pune", trip: "Himalayan village week", approved: false },
  { quote: "What I liked: nobody asked why I was travelling alone. The host just said ‘sit here’ and handed me a plate.", name: "Meera", detail: "28 · Delhi", trip: "Udaipur lakes long weekend", approved: false },
  { quote: "Same-gender twin rooms, said upfront, no surprises. That one line is why I booked.", name: "Ananya", detail: "36 · Mumbai", trip: "Himalayan village week", approved: false },
  { quote: "I passed the aux on the quiz. On the bus they still asked. I picked the song. It was fine. It was more than fine.", name: "Dev", detail: "29 · Hyderabad", trip: "Udaipur lakes long weekend", approved: false },
  { quote: "The refund quote showed the exact amount before I confirmed. I didn’t cancel, but knowing I could without a fight mattered.", name: "Sana", detail: "33 · Ahmedabad", trip: "Himalayan village week", approved: false },
];

export const FAQ = [
  { q: "Is this a dating trip?", a: "No. It is a group trip for single adults who want good company. What you hope for from the trip is private, never shown to hosts or other travellers, and never affects which departures you see." },
  { q: "Who comes on these trips?", a: "Solo travellers within the age range published for each departure, typically late twenties to early forties, from across India. Everyone confirms they are single and accepts the same conduct rules." },
  { q: "What exactly do you verify?", a: "Identity and age, on a short private video call with an authorised reviewer where you show a government photo ID. We record only the outcome, the time and the reviewer’s name. No scans, no document numbers." },
  { q: "What if I don’t want to do an activity?", a: "Then don’t. Sunrise hikes, karaoke and cooking classes are optional. Sleeping in is a perfectly good plan and nobody will ask you to explain." },
  { q: "How do rooms work?", a: "Twin-share, same-gender by default. A private room is an extra cost where the stay allows it. The room plan is on every trip page before you pay." },
  { q: "What happens to my money if verification fails?", a: "The seat is released and everything you paid is refunded in full to the same payment method. You can track the refund on your booking page." },
  { q: "Can I cancel?", a: "Yes. You see a dated refund quote in exact rupees before you confirm. The terms you accepted when reserving are the ones that apply, even if the published terms change later." },
];
