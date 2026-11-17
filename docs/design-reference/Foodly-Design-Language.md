# "Foodly" food-ordering template — design language

Extracted from two desktop screenshots (about 400 px wide each, so roughly a quarter of real size).
- **Colours** were sampled from the pixels, so they are close but affected by image compression.
- **Fonts, sizes and spacing** are estimates from shapes and proportions.
- **Not visible:** mobile layout, hover states, menu page, cart, checkout.

---

## 1. Personality in one line
Warm, appetising and premium-casual: a cream canvas, a dark serif headline with a red italic accent, white rounded cards holding cut-out food photos, and one burnt-orange colour for every action.

## 2. Colour
| Role | Sampled | Use |
|---|---|---|
| Canvas (main) | `#F2EEE9` | Page background, hero, alternating bands |
| Canvas (light band) | `#F7F6F3` | Every second section, to separate sections without lines |
| Surface | `#FFFFFF` | All cards and tiles |
| Primary action | `#C64818` (burnt orange) | Every button, "+" add button, badges, star icons, feature-icon circles, cart counter |
| Accent headline | `#A0141A` (crimson) | The italic second line of the hero headline only |
| Promo accent | `#E4A23C` (golden orange) | The hand-drawn "30% Off" circle |
| Ink | near-black, about `#1A1A1A` | Headlines, product names, prices |
| Muted text | mid-grey, about `#8A8580` | Subtitles, ingredient lines, counts |
| Decoration | fresh greens | Lettuce and basil leaves at banner edges |

**Rule:** one action colour. Nothing else on the page is saturated except food photos and the single crimson accent.

## 3. Typography
| Role | Look | Estimate (desktop) |
|---|---|---|
| Display / H1 | High-contrast bold serif (Playfair Display, DM Serif Display or similar) | about 64-72 px, tight leading |
| H1 accent | Same serif, **italic**, crimson | Same size, second line |
| Section titles | Same serif, regular-bold | about 32-36 px |
| Section subtitle | Small sans, muted grey | about 13-14 px |
| Body and UI | Clean geometric sans (Poppins, DM Sans or Inter) | 14-16 px |
| Product name | Sans, semibold, ink | about 15 px |
| Product meta | Sans, small, muted | about 11-12 px |
| Price | Sans, bold, ink (not coloured) | about 16-18 px |
| Promo script | Hand-drawn marker lettering in a hand-drawn circle | Decorative only |

**Pairing rule:** serif for emotion (headlines), sans for everything you read or tap.

## 4. Shape, depth, spacing
- **Corners:** cards and tiles about 12-16 px; buttons and badges are fully round pills; add buttons, avatars and category thumbnails are circles.
- **Shadows:** very soft and wide, barely visible. Cards separate from the canvas mostly by being white on cream.
- **No borders**, except on the outline buttons ("View Menu", "See All"), which have a thin dark 1 px border.
- **Container:** about 1200 px, centred. Section padding about 80-100 px top and bottom. Generous gaps: about 24 px between cards, about 40 px between title and grid.
- **Grids:** 6 tiles for categories, 4 for product cards, 4 for craving tiles and features, 3 for testimonials, 6 for the Instagram strip.

## 5. Components
**Header:** logo left; centred text nav (Home bold, the rest grey); right side has round icon buttons (search, account, cart with an orange count dot) and an orange pill "Order Now".

**Buttons**
- Primary: filled orange pill, white text, about 44 px tall.
- Secondary: outline pill, dark border and text, same height.
- "See All": small outline pill, aligned right of section titles.
- Add to cart: a 28-32 px orange circle with a white "+", bottom-right of each card.

**Eyebrow chip:** white pill with a small yellow dot and tiny text ("delivering happiness daily") above the H1.

**Social proof row:** four overlapping round avatars, five orange stars, "4.9", and "75.5k+ Happy Customers".

**Category tile:** white card; a food thumbnail on a light circular plate; name in semibold; item count in muted text.

**Product card** (the core component), top to bottom:
1. A badge pill top-left (NEW / BESTSELLER / TRENDING, orange, white uppercase text) and a heart icon top-right.
2. A cut-out food photo centred on white, large, no background.
3. Name, semibold.
4. Ingredient line, muted, one line.
5. Meta row: orange star, rating and review count on the left; a clock icon with "12-15 min" on the right.
6. Price, bold, bottom-left; round "+" button bottom-right.

**Promo banner:** a big serif title ("Special Offer!"), a subtitle and an orange pill. A large cut-out burger with a hand-drawn gold circle around "30% Off". Fresh leaves bleed off the edges, and a soft wave curve forms the band's bottom edge.

**Craving tile:** a circular photo, a label, and a small "Order now →" link.

**Feature card:** an orange circle icon (white line icon), a bold title and one muted line.

**Testimonial card:** five orange stars, a two-line quote, then a round avatar with the name and "Verified Customer".

**Social strip:** the Instagram handle as a serif title, a subtitle, then six square photos with rounded corners, each from a different behind-the-scenes angle.

## 6. Page anatomy (top to bottom)
1. Header
2. Hero: 2 columns, copy left and cut-out lifestyle photo right (a delivery rider holding a pizza, bleeding off the bottom edge)
3. Featured categories (centred title)
4. New arrivals (left title and See All)
5. Best sellers (alternate band)
6. Special offer banner
7. Trending products
8. Order by craving (combos, family packs, solo bites, healthy picks)
9. Why choose us (4 features)
10. Testimonials (alternate band)
11. Instagram strip

**Rhythm:** centred "browse" sections alternate with left-aligned "shop" sections, and background bands alternate between the two creams.

## 7. Imagery
- **Product photos** are all studio cut-outs (background removed), shot from the same angle and light, sitting on pure white. This consistency does most of the work in making the page look premium.
- **Hero:** an expressive human (a smiling rider) holding the product, which adds energy and trust.
- **Decoration:** real ingredients such as leaves and fresh herbs, not drawn illustrations.

## 8. Voice
Short, punchy English with urgency and proof: "Cravings, delivered fast." "In under 30 minutes." "Loved by thousands of customers." Uses numbers for credibility (4.9, 75.5k+, 12-15 min).

---

## 9. Adapting it for Matka Chay

| Foodly pattern | For Matka Chay | Verdict |
|---|---|---|
| Cream canvas, white cards, soft shadows | Same idea with `--cream #FBF5E4` and white cards | **Adopt.** Already matches the brief. |
| Serif headline with an italic coloured accent line | Playfair-style headline in forest green, accent line in maroon italic (Urdu: Nastaliq heading with the maroon accent) | **Adopt.** |
| One action colour (burnt orange) | Your action colour is forest green (gold on dark backgrounds); prices stay maroon | **Adopt the rule, not the colour.** |
| Product card anatomy | Photo, name, one-line description, price, big "+" | **Adopt, simplified.** Drop the stars, review counts and heart: no review system or accounts at launch, and fake numbers would be dishonest. Keep the "+" at 48 px, not 30 px. |
| Badge pills (NEW / BESTSELLER) | "Popular" / "مقبول" and "Deal" pills from the isFeatured flag | **Adopt.** |
| Prep-time pill ("12-15 min") | Only if the kitchen can keep the promise | **Optional.** |
| Category tiles with round thumbnails | Your category chips on the menu page, with a photo | **Adopt** on the home page. |
| Promo banner with a hand-drawn circle | An announcement or deal banner using the gold hand-drawn circle | **Adopt.** Gold suits it. |
| "Order by craving" tiles | Deals / family packs / chai / snacks | **Adopt.** Good for low-literacy browsing by picture. |
| Social proof ("75.5k+ customers", "4.9") | Real counts only, or leave it out | **Skip until real.** Never invent numbers. |
| Testimonials with "Verified Customer" | Real reviews only, with permission | **Adopt carefully.** |
| Instagram strip | Only if the cafe posts regularly | **Optional.** |
| Rider hero photo | Your drone video hero, or a real photo of your rider or the matka chai | **Adapt.** A real local photo beats stock. |
| Studio cut-out food photos | Phone photos with backgrounds removed, then placed on white | **Adopt if you can.** It is the single biggest quality jump. |
| 4-column grid, tiny 11-12 px meta text | 2 columns on phones, text at 14 px or more | **Adapt.** Tiny grey text fails your audience. |
| English-only, `$` prices | Urdu first, "Rs" prices | **Adapt.** |

**Caution:** "Foodly" looks like a commercial template. Use it as a pattern reference only. Don't copy its logo, wording or stock photos.
