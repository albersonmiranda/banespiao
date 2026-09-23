//VERSION=3
function setup() {
  return {
    input: ['B04', 'B03', 'B02', 'dataMask'],
    output: { bands: 4 }
  };
}

function evaluatePixel(smp) {
  return [sRGB(smp.B04), sRGB(smp.B03), sRGB(smp.B02), smp.dataMask];
}

function sRGB(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}