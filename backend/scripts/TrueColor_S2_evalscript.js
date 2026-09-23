//VERSION=3
function setup() {
  return {
    input: ['B04', 'B03', 'B02', 'dataMask'],
    output: { bands: 4, sampleType: 'AUTO' }
  };
}

function evaluatePixel(smp) {
  let rgbLin = [2.5 * smp.B04, 2.5 * smp.B03, 2.5 * smp.B02];
  return [sRGB(rgbLin[0]), sRGB(rgbLin[1]), sRGB(rgbLin[2]), smp.dataMask];
}

function sRGB(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}