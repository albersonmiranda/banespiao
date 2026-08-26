//VERSION=3
// NDVI for Sentinel-2 L2A - Statistical API
function setup() {
  return {
    input: ['B04', 'B08', 'dataMask'],
    output: [
      { id: 'ndvi_value', bands: 1 },
      { id: 'dataMask', bands: 1 }
    ]
  };
}

function evaluatePixel(samples) {
  let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04);
  return {
    ndvi_value: [ndvi],
    dataMask: [samples.dataMask]
  };
}
