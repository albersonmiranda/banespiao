//VERSION=3
// NDVI for Sentinel-2 L2A with SCL cloud masking - Statistical API
function setup() {
  return {
    input: [
      {
        bands: ['B04', 'B08', 'SCL', 'dataMask']
      }
    ],
    output: [
      {
        id: 'default',
        bands: 1,
        sampleType: 'FLOAT32'
      },
      {
        id: 'dataMask',
        bands: 1
      }
    ]
  };
}

function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  let scl = sample.SCL;
  let isCloud = scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10;
  if (isCloud) {
    return {
      default: [NaN],
      dataMask: [0]
    };
  }
  return {
    default: [ndvi],
    dataMask: [sample.dataMask]
  };
}