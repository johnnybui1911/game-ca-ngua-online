"""
Turns Poly Haven's "Horse Statue 01" (CC0) into public/models/statue.glb: the rearing horse
without its wooden plinth, thinned to TRIANGLES, centred on the origin, standing on y = 0 and
HEIGHT game units tall. It carries no material: the room's gilt material is applied in code.

    Blender -b -P scripts/blender/prepare-statue.py -- <horse_statue_01_1k.gltf> <out.glb>

The horse looks towards -x (glTF), long side along x.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector

HEIGHT = 3.4
TRIANGLES = 8000

src, out = sys.argv[sys.argv.index('--') + 1:][:2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
statue = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = statue
statue.select_set(True)
statue.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh = statue.data

# Drop the plinth: the faces that use the "_base" material.
base_slots = [i for i, m in enumerate(mesh.materials) if m and m.name.endswith('_base')]
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in base_slots], context='FACES')
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context='VERTS')
bm.to_mesh(mesh)
bm.free()
mesh.materials.clear()

# Thin to about TRIANGLES (a modifier cannot be applied over shape keys).
if mesh.shape_keys:
    statue.shape_key_clear()
tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
mod = statue.modifiers.new('thin', 'DECIMATE')
mod.ratio = min(1.0, TRIANGLES / tris)
bpy.ops.object.modifier_apply(modifier='thin')
mesh = statue.data
bpy.ops.object.shade_smooth()

# Stand on z = 0 (Blender up), centred over the origin, HEIGHT tall.
zs = [v.co.z for v in mesh.vertices]
xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
k = HEIGHT / (max(zs) - min(zs))
cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
for v in mesh.vertices:
    v.co.x = (v.co.x - cx) * k
    v.co.y = (v.co.y - cy) * k
    v.co.z = (v.co.z - min(zs)) * k
mesh.update()
print('tris', sum(len(p.vertices) - 2 for p in mesh.polygons),
      'half extent x', (max(xs) - min(xs)) / 2 * k, 'y', (max(ys) - min(ys)) / 2 * k,
      'radius', max(math.hypot(v.co.x, v.co.y) for v in mesh.vertices))

bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', export_yup=True, export_apply=True, use_selection=True,
    export_texcoords=False, export_normals=True, export_materials='NONE',
)
