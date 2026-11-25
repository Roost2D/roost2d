import assert from 'node:assert/strict';
import test from 'node:test';
import { Container, RenderLayer, Texture } from 'pixi.js';
import { RigRuntime } from '@roost2d/rig2d';
import { PixiRigFactory } from '../dist/index.js';

function runtime() {
  const factory = new PixiRigFactory(new Map([['pixel', Texture.EMPTY]]));
  const definition = {
    schema: 'roost2d.rig/v2', id: 'ordered', displayName: 'Ordered', renderOrder: 'slots', defaultSkinId: 'selected',
    bones: [
      { id: 'root', x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
      { id: 'branch-a', parentId: 'root', x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      { id: 'branch-b', parentId: 'root', x: -10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    ],
    slots: [
      { id: 'rear', boneId: 'branch-a', zIndex: 0, defaultAttachmentName: 'art' },
      { id: 'middle', boneId: 'branch-b', zIndex: 1, defaultAttachmentName: 'art' },
      { id: 'front', boneId: 'branch-a', zIndex: 2, defaultAttachmentName: 'art' },
    ],
    // Reverse creation order, and interleave two separate logical branches.
    attachments: [
      { id: 'front-art', slotId: 'front', boneId: 'branch-a', texture: { assetId: 'pixel' }, zIndex: 2 },
      { id: 'rear-art', slotId: 'rear', boneId: 'branch-a', texture: { assetId: 'pixel' }, zIndex: 0 },
      { id: 'middle-art', slotId: 'middle', boneId: 'branch-b', texture: { assetId: 'pixel' }, zIndex: 1 },
    ],
    skins: { selected: { rear: 'rear-art', middle: 'middle-art', front: 'front-art' } },
    attachmentNames: { selected: { rear: { art: 'rear-art' }, middle: { art: 'middle-art' }, front: { art: 'front-art' } } },
  };
  return { factory, rig: new RigRuntime(definition, factory) };
}

test('native Pixi drawing interleaves slots across bone branches without reparenting transforms', () => {
  const { factory, rig } = runtime();
  const stage = new Container(); stage.addChild(factory.root);
  const layer = factory.root.children.find(child => child instanceof RenderLayer);
  assert.ok(layer);
  assert.deepEqual(layer.renderLayerChildren.map(child => child.label), ['rear-art', 'middle-art', 'front-art']);
  const rear = rig.node('attachment', 'rear-art').display;
  const front = rig.node('attachment', 'front-art').display;
  assert.equal(rear.parent, rig.node('bone', 'branch-a').display);
  assert.equal(front.parent, rear.parent, 'global rendering must retain source parenting');
  assert.equal(rear.getGlobalPosition().x, 110);
  assert.equal(rig.node('attachment', 'middle-art').display.getGlobalPosition().x, 90);
  rig.setMirrored(true);
  assert.equal(rear.getGlobalPosition().x, 90);
  assert.equal(rig.node('attachment', 'middle-art').display.getGlobalPosition().x, 110);
  rig.dispose(); assert.equal(layer.renderLayerChildren.length, 0);
  factory.destroyRoot(); stage.destroy();
  assert.equal(Texture.EMPTY.destroyed, false, 'rig teardown never destroys shared texture sources');
});

test('native Pixi ordering replaces layer membership and releases disposed sprites', () => {
  const { factory, rig } = runtime();
  const layer = factory.root.children.find(child => child instanceof RenderLayer);
  const ordered = ['front-art', 'middle-art', 'rear-art'].map(id => rig.node('attachment', id));
  factory.setDrawOrder(ordered);
  assert.deepEqual(layer.renderLayerChildren, ordered.map(node => node.display));
  factory.setDrawOrder(ordered);
  assert.equal(layer.renderLayerChildren.length, 3);
  assert.throws(() => factory.setDrawOrder([rig.node('bone', 'root')]), /attachment sprites/);
  assert.equal(layer.renderLayerChildren.length, 3, 'invalid requests leave the existing order intact');
  rig.dispose(); assert.equal(layer.renderLayerChildren.length, 0); factory.destroyRoot();
});
