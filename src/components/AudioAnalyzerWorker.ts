/**
 * Web Worker for audio analysis computations
 * Offloads heavy calculations from main thread for better performance
 */

interface AnalysisInput {
  frequencyData: Uint8Array;
  previousFrequencyData: Uint8Array;
  timeData: Uint8Array;
  timestamp: number;
}

interface AnalysisOutput {
  beatStrength: number;
  transientIntensity: number;
  dominantFreq: 'low' | 'mid' | 'high';
  rms: number;
  spectralFlux: number;
  timestamp: number;
}

// Detection parameters
let transientThreshold = 0.3;
let beatThreshold = 0.4;
let transientCooldown = 100;
let beatCooldown = 150;

let lastTransientTime = 0;
let lastBeatTime = 0;
let beatHistory: number[] = [];

// Calculate RMS (Root Mean Square) for volume detection
function calculateRMS(timeData: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const normalized = (timeData[i] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / timeData.length);
}

// Calculate spectral flux for transient detection
function calculateSpectralFlux(currentData: Uint8Array, previousData: Uint8Array): number {
  let flux = 0;
  for (let i = 0; i < currentData.length; i++) {
    const diff = currentData[i] - previousData[i];
    flux += diff > 0 ? diff : 0; // Only consider increasing energy
  }
  return flux / currentData.length;
}

// Detect dominant frequency range
function getDominantFrequencyRange(frequencyData: Uint8Array): 'low' | 'mid' | 'high' {
  const lowEnd = Math.floor(frequencyData.length * 0.1);   // Low: 0-10%
  const midEnd = Math.floor(frequencyData.length * 0.5);   // Mid: 10-50%
  // High: 50-100%

  let lowSum = 0, midSum = 0, highSum = 0;

  for (let i = 0; i < lowEnd; i++) {
    lowSum += frequencyData[i];
  }

  for (let i = lowEnd; i < midEnd; i++) {
    midSum += frequencyData[i];
  }

  for (let i = midEnd; i < frequencyData.length; i++) {
    highSum += frequencyData[i];
  }

  const lowAvg = lowSum / lowEnd;
  const midAvg = midSum / (midEnd - lowEnd);
  const highAvg = highSum / (frequencyData.length - midEnd);

  if (lowAvg > midAvg && lowAvg > highAvg) return 'low';
  if (highAvg > midAvg && highAvg > lowAvg) return 'high';
  return 'mid';
}

// Beat detection algorithm
function detectBeat(rms: number, spectralFlux: number, now: number): number {
  // Composite beat strength metric
  const beatStrength = (rms * 0.6 + spectralFlux * 0.4);

  // Maintain beat history for adaptive threshold
  beatHistory.push(beatStrength);
  if (beatHistory.length > 20) {
    beatHistory.shift();
  }

  // Calculate dynamic threshold
  const avgBeatStrength = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;
  const dynamicThreshold = avgBeatStrength * 1.5; // 1.5x average as threshold

  if (
    beatStrength > Math.max(beatThreshold, dynamicThreshold) &&
    now - lastBeatTime > beatCooldown
  ) {
    lastBeatTime = now;
    return beatStrength;
  }

  return 0;
}

// Transient detection algorithm
function detectTransient(
  rms: number,
  spectralFlux: number,
  now: number
): number {
  // Transient intensity calculation: combines RMS spike and spectral flux
  const transientIntensity = Math.min(rms + spectralFlux * 0.5, 1.0);

  if (
    transientIntensity > transientThreshold &&
    now - lastTransientTime > transientCooldown
  ) {
    lastTransientTime = now;
    return transientIntensity;
  }

  return 0;
}

// Worker message handler
self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data;

  if (type === 'analyze') {
    const input = data as AnalysisInput;

    // Perform all calculations
    const rms = calculateRMS(input.timeData);
    const spectralFlux = calculateSpectralFlux(input.frequencyData, input.previousFrequencyData);
    const dominantFreq = getDominantFrequencyRange(input.frequencyData);

    const beatStrength = detectBeat(rms, spectralFlux, input.timestamp);
    const transientIntensity = detectTransient(rms, spectralFlux, input.timestamp);

    const output: AnalysisOutput = {
      beatStrength,
      transientIntensity,
      dominantFreq,
      rms,
      spectralFlux,
      timestamp: input.timestamp,
    };

    self.postMessage({ type: 'result', data: output });
  } else if (type === 'updateParams') {
    // Allow dynamic parameter updates
    if (data.transientThreshold !== undefined) transientThreshold = data.transientThreshold;
    if (data.beatThreshold !== undefined) beatThreshold = data.beatThreshold;
    if (data.transientCooldown !== undefined) transientCooldown = data.transientCooldown;
    if (data.beatCooldown !== undefined) beatCooldown = data.beatCooldown;
  }
};

// Signal that worker is ready
console.log('🚀 Audio analyzer worker started');
self.postMessage({ type: 'ready' });
