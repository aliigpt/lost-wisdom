// Keeps only the skeleton and animation from a rigged .glb (drops mesh, materials, textures),
// so extra motions (idle, run) are tiny downloads that play on the main character model.
// Usage: node scripts/strip-animation.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const [, , input, output] = process.argv;
const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();
for (const node of root.listNodes()) { node.setMesh(null); node.setSkin(null); }
for (const m of root.listMeshes()) m.dispose();
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
await doc.transform(prune({ keepLeaves: true }));
await io.write(output, doc);
console.log(`${output}: ${root.listAnimations().map(a => a.getName()).join(', ')}`);
