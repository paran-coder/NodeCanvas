export const COLOR_CONTROLS = {
  brightness: '밝기', contrast: '대비', saturation: '채도', temperature: '색온도'
};

export function colorSettings(value) {
  return Object.fromEntries(Object.keys(COLOR_CONTROLS).map(key => {
    const number = value?.[key];
    return [key, Number.isFinite(number) ? Math.max(-100, Math.min(100, Math.round(number))) : 0];
  }));
}

export function drawColor(canvas, image, settings, maxSide = Infinity) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const {brightness, contrast, saturation, temperature} = colorSettings(settings);
  if (!brightness && !contrast && !saturation && !temperature) return;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const gain = 2 ** (contrast / 100);
  const offset = 128 * (1 - gain) + brightness * 1.28;
  const chroma = 1 + saturation / 100;
  const warmth = temperature * .55;
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i], green = data[i + 1], blue = data[i + 2];
    const gray = red * .2126 + green * .7152 + blue * .0722;
    data[i] = (gray + (red - gray) * chroma) * gain + offset + warmth;
    data[i + 1] = (gray + (green - gray) * chroma) * gain + offset;
    data[i + 2] = (gray + (blue - gray) * chroma) * gain + offset - warmth;
  }
  ctx.putImageData(pixels, 0, 0);
}
