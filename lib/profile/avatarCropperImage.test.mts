import assert from "node:assert/strict";
import test from "node:test";

import { loadAvatarCropImage } from "./avatarCropperImage.ts";

const validPng = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2zYQAAAAASUVORK5CYII=",
    "base64"
  )
);

class FakeImage {
  static instances: FakeImage[] = [];

  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  decode(width = 128, height = 128) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }
}

test("the cropper creates a fresh object URL after a Strict Mode cleanup", () => {
  const originalImage = globalThis.Image;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const revoked: string[] = [];
  let sequence = 0;

  Object.assign(globalThis, { Image: FakeImage });
  URL.createObjectURL = () => `blob:avatar-${++sequence}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  FakeImage.instances = [];

  try {
    const file = new File([validPng], "avatar.png", { type: "image/png" });
    const loaded: Array<{ sourceUrl: string; width: number; height: number }> = [];
    const errors: Error[] = [];
    const handlers = {
      onLoad(image: HTMLImageElement, sourceUrl: string) {
        loaded.push({
          sourceUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      },
      onError(error: Error) {
        errors.push(error);
      },
    };

    const disposeFirstMount = loadAvatarCropImage(file, handlers);
    disposeFirstMount();
    FakeImage.instances[0]?.decode();

    const disposeSecondMount = loadAvatarCropImage(file, handlers);
    FakeImage.instances[1]?.decode();

    assert.deepEqual(revoked, ["blob:avatar-1"]);
    assert.deepEqual(errors, []);
    assert.deepEqual(loaded, [
      { sourceUrl: "blob:avatar-2", width: 128, height: 128 },
    ]);

    disposeSecondMount();
    assert.deepEqual(revoked, ["blob:avatar-1", "blob:avatar-2"]);
  } finally {
    Object.assign(globalThis, { Image: originalImage });
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test("the cropper rejects decoded images without dimensions", () => {
  const originalImage = globalThis.Image;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const errors: Error[] = [];

  Object.assign(globalThis, { Image: FakeImage });
  URL.createObjectURL = () => "blob:dimensionless-avatar";
  URL.revokeObjectURL = () => undefined;
  FakeImage.instances = [];

  try {
    const file = new File([validPng], "avatar.png", { type: "image/png" });
    const dispose = loadAvatarCropImage(file, {
      onLoad() {
        assert.fail("A dimensionless image must not be accepted.");
      },
      onError(error) {
        errors.push(error);
      },
    });

    FakeImage.instances[0]?.decode(0, 0);
    assert.equal(errors[0]?.name, "AvatarCropImageError");
    dispose();
  } finally {
    Object.assign(globalThis, { Image: originalImage });
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});
