# Third-party 3D assets

Every model in this folder that was not made for this project is listed here. Textures are embedded in the `.glb` files; `public/textures/` holds none. Everything else in the living-room set (platform, floor tiles, lanterns, couplets, blossom, whole watermelon on its plate and dish of red melon seeds, rice cakes, sweets box) is generated in code under `web/src/scene/environment/`.

| File | Asset | Authors | Source | Licence | Size |
| --- | --- | --- | --- | --- | --- |
| `tea-set.glb` | Tea Set 01 | Rico Cilliers (modelling), James Ray Cock (texturing), Jurita Burger (graphic design) | https://polyhaven.com/a/tea_set_01 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 140,728 bytes |
| `ceramic-vase.glb` | Antique Ceramic Vase 01 | James Ray Cock | https://polyhaven.com/a/antique_ceramic_vase_01 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 80,348 bytes |

Total: 221,076 bytes (0.21 MB).

## How the files were made

Both come from the 1k glTF download of Poly Haven and were compressed with [glTF-Transform](https://gltf-transform.dev) 4.5.1: meshes joined, simplified and meshopt-compressed, textures resized to 512 px and stored as WebP.

```sh
gltf-transform optimize tea_set_01.gltf tea-set.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify-ratio 0.3 --simplify-error 0.001
gltf-transform optimize antique_ceramic_vase_01.gltf ceramic-vase.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify-ratio 0.5 --simplify-error 0.001
```

The files need a loader with `EXT_meshopt_compression`, `KHR_mesh_quantization` and `EXT_texture_webp`.
