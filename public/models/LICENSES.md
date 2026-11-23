# Third-party 3D assets

Every model in this folder that was not made for this project is listed here. Textures are embedded in the `.glb` files, except the board's lacquer grain, which is a separate `.webp` here. Everything else in the living-room set (platform, floor tiles, lanterns, couplets, blossom, the lacquer base under the golden horse, rice cakes, sweets box) is generated in code under `web/src/scene/environment/`.

| File | Asset | Authors | Source | Licence | Size |
| --- | --- | --- | --- | --- | --- |
| `tea-set.glb` | Tea Set 01 | Rico Cilliers (modelling), James Ray Cock (texturing), Jurita Burger (graphic design) | https://polyhaven.com/a/tea_set_01 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 140,728 bytes |
| `ceramic-vase.glb` | Antique Ceramic Vase 01 | James Ray Cock | https://polyhaven.com/a/antique_ceramic_vase_01 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 80,348 bytes |
| `horse.glb` | Knight of Chess Set (mesh), Natural Walnut Veneer (grain, diffuse converted to grey and normal map) | Riley Queen (Chess Set); Rico Cilliers and Jenelle van Heerden (walnut veneer) | https://polyhaven.com/a/chess_set, https://polyhaven.com/a/natural_walnut_veneer | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | see below |
| `lacquer-diff.webp` | Lacquered Cherry Wood (diffuse, brightened) | Jenelle van Heerden (scanning), Rico Cilliers (processing) | https://polyhaven.com/a/lacquered_cherry_wood | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | see below |
| `statue.glb` | Horse Statue 01 (mesh only, plinth removed, no textures) | Rico Cilliers | https://polyhaven.com/a/horse_statue_01 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | see below |

Sizes: `tea-set.glb` and `ceramic-vase.glb` 221,076 bytes together; `horse.glb` and `lacquer-diff.webp` are listed by `ls -l`.

## How the files were made

Both come from the 1k glTF download of Poly Haven and were compressed with [glTF-Transform](https://gltf-transform.dev) 4.5.1: meshes joined, simplified and meshopt-compressed, textures resized to 512 px and stored as WebP.

```sh
gltf-transform optimize tea_set_01.gltf tea-set.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify-ratio 0.3 --simplify-error 0.001
gltf-transform optimize antique_ceramic_vase_01.gltf ceramic-vase.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify-ratio 0.5 --simplify-error 0.001
```

The files need a loader with `EXT_meshopt_compression`, `KHR_mesh_quantization` and `EXT_texture_webp`.

`horse.glb` is made by `scripts/blender/prepare-horse.py` (Blender 5, headless) from the 1k glTF of Chess Set, then compressed with glTF-Transform. The grain map is the walnut diffuse converted to grey with `magick ... -colorspace Gray -contrast-stretch 1%x0.5% +level 65%,100%`, so each player colour can tint it:

```sh
Blender -b -P scripts/blender/prepare-horse.py -- chess_set_1k.gltf walnut-diff.png walnut-nor.png horse.glb
gltf-transform optimize horse.glb horse-opt.glb --compress meshopt --texture-compress webp --texture-size 512
```

`lacquer-diff.webp` is the 1k diffuse of Lacquered Cherry Wood, brightened with `magick ... -modulate 320,105,100 -level 0%,92%`, saved as WebP quality 68.

`statue.glb` is the golden horse: `scripts/blender/prepare-statue.py` drops the wooden plinth, thins the mesh to about 8,000 triangles and stands it 3.4 units tall, then `gltf-transform optimize statue.glb statue-opt.glb --compress meshopt`. The room's gilt material is applied in code.
