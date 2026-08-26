//VERSION=3
// Optimized Sentinel-2 L2A True Color
function setup() {
  return {
    input: ['B04', 'B03', 'B02', 'dataMask'],
    output: { bands: 4 }
  };
}

function evaluatePixel(smp) {
  const rgbLin = satEnh(sAdj(smp.B04), sAdj(smp.B03), sAdj(smp.B02));
  return [sRGB(rgbLin[0]), sRGB(rgbLin[1]), sRGB(rgbLin[2]), smp.dataMask];
}

function sAdj(i) {
  return i > 0.28 ? 0.28 / (1.0 - 0.28) * i / (1.0 / (1.0 - 0.28) * i + 0.28 / (1.0 - 0.28)) : i;
}

function satEnh(r, g, b) {
  let avg = (r + g + b) / 3.0;
  let X = 1.15;
  return [avg + X * (r - avg), avg + X * (g - avg), avg + X * (b - avg)];
}

function sRGB(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}
