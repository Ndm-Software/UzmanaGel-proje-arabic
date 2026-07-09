const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeListingImageCrop(rawCrop) {
  if (!rawCrop || typeof rawCrop !== "object") {
    return { x: 50, y: 50, scale: 1 };
  }

  const x = clamp(Number(rawCrop.x) || 50, 0, 100);
  const y = clamp(Number(rawCrop.y) || 50, 0, 100);
  const scale = clamp(Number(rawCrop.scale) || 1, 1, 2.5);

  return { x, y, scale };
}

export function getListingImageStyle(listing) {
  const crop = normalizeListingImageCrop(listing?.imageCrop);

  return {
    objectFit: "cover",
    objectPosition: `${crop.x}% ${crop.y}%`,
    transform: `scale(${crop.scale})`,
    transformOrigin: "center center",
  };
}

export function getListingBackgroundStyle(listing, imageUrl) {
  const crop = normalizeListingImageCrop(listing?.imageCrop);
  const scalePercent = `${crop.scale * 100}%`;

  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundPosition: `${crop.x}% ${crop.y}%`,
    backgroundSize: crop.scale > 1 ? scalePercent : "cover",
  };
}
