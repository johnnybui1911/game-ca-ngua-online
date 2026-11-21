# Tết living-room environment — evidence

Code: `web/src/scene/environment/`. Assets and licences: `public/models/` ([LICENSES.md](../../../public/models/LICENSES.md)).

## What is on stage

The board lies on a low lacquer platform (sập) with gold line inlay. Each of the four sides carries the same tableau, laid out for the player sitting opposite it:

- an offering at the centre: fruit tray (mâm ngũ quả), bánh chưng with lì xì, tea service, sweets box (khay mứt);
- two red lanterns on wooden stands behind it;
- a pair of couplets on stands, the folk verse "Thịt mỡ dưa hành câu đối đỏ / Cây nêu tràng pháo bánh chưng xanh" lettered on canvas;
- a blue-and-white vase with a mai (yellow) or đào (pink) branch on each corner.

Under the platform is a cement-tile floor that fades out before the camera's far plane. Dust motes drift over the platform and light up near the lanterns.

## Screenshots

Headless Chromium on the GPU (`--use-angle=metal`), scene harness without HUD, tier pinned with `?quality=`. "Seat blue" and "seat yellow" are the cameras of colours 1 and 2; the overview is the camera of a spectator (colour 0's seat).

| View | High, 1440×900 | High, 390×844 | Low, 1440×900 | Low, 390×844 |
| --- | --- | --- | --- | --- |
| Overview | [jpg](high-overview-1440x900.jpg) | [jpg](high-overview-390x844.jpg) | [jpg](low-overview-1440x900.jpg) | [jpg](low-overview-390x844.jpg) |
| Seat blue | [jpg](high-seat-blue-1440x900.jpg) | [jpg](high-seat-blue-390x844.jpg) | [jpg](low-seat-blue-1440x900.jpg) | [jpg](low-seat-blue-390x844.jpg) |
| Seat yellow | [jpg](high-seat-yellow-1440x900.jpg) | [jpg](high-seat-yellow-390x844.jpg) | [jpg](low-seat-yellow-1440x900.jpg) | [jpg](low-seat-yellow-390x844.jpg) |
| Wide (orbited down, zoomed out) | [jpg](high-wide-1440x900.jpg) | [jpg](high-wide-390x844.jpg) | [jpg](low-wide-1440x900.jpg) | [jpg](low-wide-390x844.jpg) |

Real match page with the HUD (guest against three CPUs, local worker): [1440×900](match-high-1440x900.jpg), [390×844](match-high-390x844.jpg).

## Sizes

| Item | Bytes |
| --- | --- |
| `public/models/tea-set.glb` | 140,728 |
| `public/models/ceramic-vase.glb` | 80,348 |
| **Environment assets, total** | **221,076 (0.21 MB of the 3 MB budget)** |
| `TetSet` code chunk (loaded after the board) | 94,840 raw / 30,290 gzip |

## Tiers

| | Low | Medium | High |
| --- | --- | --- | --- |
| Lantern paper and halo (emissive, additive) | yes | yes | yes |
| Warm point lights | none | 2 | 4 |
| Dust motes | none | 160 | 400 |
| Flowers per spray | 36 | 64 | 96 |
| Shadows from lantern light | none | none | none |
| Software renderer | set not loaded | | |

## Checks made by hand

- Reduced motion (`prefers-reduced-motion: reduce`): three captures of the lantern strip 450 ms apart are byte-identical; with motion they differ.
- Software renderer (default headless Chromium): tier `low (pinned)`, no request for the set chunk or the models.
- High tier in headless Chromium on an M1 Pro: 60 frames a second with the set on screen.
- Sight lines, placement and far-side visibility are unit tested in `web/src/scene/environment/layout.test.ts` for four seats, six aspect ratios and three camera distances.
