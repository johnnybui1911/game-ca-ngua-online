"""
Turns the knight of Poly Haven's "Chess Set" (CC0) into public/models/horse.glb.

    Blender -b -P scripts/blender/prepare-horse.py -- <chess_set_1k.gltf> <grain-diff.png> <grain-normal.png> <out.glb>

The knight keeps its turned base. It is centred on the origin, stands on y = 0, faces +z (glTF),
is scaled to HEIGHT game units, gets a box-projected UV map whose grain runs up the piece, and one
wood material: a grey grain map (tinted per colour in code) and its normal map.
"""
import math
import sys

import bpy
import bmesh
from mathutils import Vector

HEIGHT = 1.5
GRAIN_TILE = 2.6  # game units covered by one repeat of the grain texture
KNIGHT = 'piece_knight_white_01'

src, diff, nor, out = sys.argv[sys.argv.index('--') + 1:][:4]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.name != KNIGHT:
        bpy.data.objects.remove(o, do_unlink=True)
knight = bpy.data.objects[KNIGHT]
bpy.context.view_layer.objects.active = knight
knight.select_set(True)

# Apply the node transform, then drop it.
knight.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh = knight.data
mesh.materials.clear()

# Scale to HEIGHT (Blender Z is up; glTF export turns it into Y), stand on z = 0, centre the base on x/y = 0.
bb = [knight.matrix_world @ Vector(c) for c in knight.bound_box]
low = min(v.z for v in bb)
height = max(v.z for v in bb) - low
k = HEIGHT / height
base = [v for v in mesh.vertices if v.co.z < low + height * 0.02]
cx = sum(v.co.x for v in base) / len(base)
cy = sum(v.co.y for v in base) / len(base)
for v in mesh.vertices:
    v.co.x = (v.co.x - cx) * k
    v.co.y = (v.co.y - cy) * k
    v.co.z = (v.co.z - low) * k
mesh.update()
print('height', HEIGHT, 'base radius', max(math.hypot(v.co.x, v.co.y) for v in base) * 1.0, 'tris', sum(len(p.vertices) - 2 for p in mesh.polygons))

# Box projection; the grain texture runs along its u axis, so swap u and v to run it up the piece.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.cube_project(cube_size=GRAIN_TILE, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
layer = mesh.uv_layers.active
for loop in layer.data:
    u, v = loop.uv
    loop.uv = (v, u)

bpy.ops.object.shade_smooth()

mat = bpy.data.materials.new('wood')
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodes['Principled BSDF']
color_tex = nodes.new('ShaderNodeTexImage')
color_tex.image = bpy.data.images.load(diff)
links.new(color_tex.outputs['Color'], bsdf.inputs['Base Color'])
normal_tex = nodes.new('ShaderNodeTexImage')
normal_tex.image = bpy.data.images.load(nor)
normal_tex.image.colorspace_settings.name = 'Non-Color'
normal_map = nodes.new('ShaderNodeNormalMap')
links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.5
mesh.materials.append(mat)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_image_format='JPEG',
    export_yup=True,
    export_apply=True,
    use_selection=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
)
