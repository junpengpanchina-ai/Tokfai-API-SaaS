/**
 * Unit checks for apps/dmit-api/src/upstream/normalizeImageInputs.ts
 * Invoked by scripts/p817-image-reference-edit-smoke.mjs via tsx.
 */

import {
  normalizeImageInputs,
  primaryImageSourceType,
  resolveImageRequestMode,
} from "../apps/dmit-api/src/upstream/normalizeImageInputs.ts";

const TINY =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function assert(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const withImages = normalizeImageInputs({
  images: [TINY],
  image_urls: ["https://example.com/a.png"],
});
assert(withImages.imagesCount >= 1, "imagesCount >= 1");
assert(
  withImages.images.some((item) => item.sourceType === "data_url"),
  "data_url accepted"
);
assert(primaryImageSourceType(withImages) === "data_url", "primary data_url");

const blobOnly = normalizeImageInputs({
  images: ["blob:https://tokfai.com/x"],
});
assert(blobOnly.imagesCount === 0, "blob blocked → imagesCount 0");
assert(blobOnly.hasBlobBlocked === true, "hasBlobBlocked");
assert(primaryImageSourceType(blobOnly) === "blob_blocked", "primary blob_blocked");

const modeMissing = resolveImageRequestMode({
  bodyMode: "reference_edit",
  prompt: "保留人物主体",
  imagesCount: 0,
});
assert(modeMissing === "reference_edit", "mode reference_edit without images");

const modeText = resolveImageRequestMode({
  bodyMode: undefined,
  prompt: "a mug on a table",
  imagesCount: 0,
});
assert(modeText === "text_to_image", "plain prompt is text_to_image");

console.log("PASS  normalizeImageInputs accepts dataURL / blocks blob / mode rules");
