/**
 * Pure JavaScript line ball animation manager
 * Optimized with Web Worker for off-main-thread calculations
 * Audio-reactive: Syncs with beat and transient detection
 */

interface Point {
  x: number;
  y: number;
}

interface LineRenderData {
  id: number;
  thickness: number;
  trailElement: SVGPathElement | null;
}

interface AudioReactiveOptions {
  enableBeatSync?: boolean;
  enableTransientSync?: boolean;
  beatSensitivity?: number;
  transientSensitivity?: number;
}

class PureLineBallAnimation {
  private container: HTMLDivElement;
  private svgElement!: SVGSVGElement;
  private circleElement!: SVGCircleElement;
  private worker: Worker | null = null;

  private lineElements: Map<number, LineRenderData> = new Map();
  private animationFrameId: number | null = null;

  private dimensions = { width: 0, height: 0 };
  private gradientOffset = 40;

  // Animation constants
  private readonly CIRCLE_RADIUS = 120;
  private readonly MAX_FLYING_LINES = 15;

  private readonly LINE_SPAWN_INTERVAL = 200;

  private spawnInterval: number | null = null;

  // Audio-reactive mode
  private audioReactiveMode: boolean = false;
  private audioOptions: AudioReactiveOptions = {
    enableBeatSync: true,
    enableTransientSync: true,
    beatSensitivity: 0.4,
    transientSensitivity: 0.3,
  };

  // Rate limiting for audio-reactive spawning
  private lastBeatSpawnTime: number = 0;
  private lastTransientSpawnTime: number = 0;
  private readonly BEAT_SPAWN_COOLDOWN = 150; // ms between beat spawns
  private readonly TRANSIENT_SPAWN_COOLDOWN = 100; // ms between transient spawns
  private readonly AUDIO_SPAWN_CHANCE = 0.3; // 30% chance to spawn on each trigger

  constructor(container: HTMLDivElement, audioReactiveOptions?: AudioReactiveOptions) {
    this.container = container;
    if (audioReactiveOptions) {
      this.audioOptions = { ...this.audioOptions, ...audioReactiveOptions };
    }
    this.initializeContainer();
    this.createSVG();
    this.updateDimensions();
    this.initializeWorker();
    this.startAnimation();
    this.setupResizeListener();
  }

  private initializeContainer() {
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';
    this.container.style.zIndex = '2';
  }

  private createSVG() {
    // Create SVG element
    this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgElement.style.width = '100%';
    this.svgElement.style.height = '100%';
    this.svgElement.style.display = 'block';
    this.svgElement.style.position = 'relative';

    // Create defs for gradients and filters
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'trailBlur');
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '0.5');
    filter.appendChild(blur);
    defs.appendChild(filter);
    this.svgElement.appendChild(defs);

    // Create invisible boundary circle
    this.circleElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.circleElement.setAttribute('stroke', 'none');
    this.circleElement.setAttribute('fill', 'none');
    this.circleElement.setAttribute('opacity', '0');
    this.svgElement.appendChild(this.circleElement);

    this.container.appendChild(this.svgElement);
  }

  private updateDimensions() {
    this.dimensions.width = window.innerWidth;
    this.dimensions.height = window.innerHeight;

    // Update circle position
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    this.circleElement.setAttribute('cx', centerX.toString());
    this.circleElement.setAttribute('cy', centerY.toString());
    this.circleElement.setAttribute('r', this.CIRCLE_RADIUS.toString());

    // Notify worker of dimension change
    if (this.worker) {
      this.worker.postMessage({
        type: 'updateDimensions',
        data: { dimensions: this.dimensions },
      });
    }
  }

  private initializeWorker() {
    // Create worker from the TypeScript file
    // In production, this will be bundled
    this.worker = new Worker(
      new URL('./LineBallAnimationWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Initialize worker with dimensions
    this.worker.postMessage({
      type: 'init',
      data: { dimensions: this.dimensions },
    });

    // Listen for worker messages
    this.worker.addEventListener('message', (e) => {
      this.handleWorkerMessage(e.data);
    });
  }

  private handleWorkerMessage(message: any) {
    const { type, data } = message;

    switch (type) {
      case 'lineCreated':
        this.createLineElement(data.id, data.thickness);
        break;
      case 'update':
        this.renderUpdate(data);
        break;
      case 'fadeOutLine':
        this.fadeOutLineElement(data.id);
        break;
      case 'removeLine':
        this.removeLineElement(data.id);
        break;
    }
  }

  private createLineElement(id: number, thickness: number) {
    const trailElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.svgElement.appendChild(trailElement);

    // Setup gradient
    const gradientId = `gradient-${id}`;
    const defs = this.svgElement.querySelector('defs');

    if (defs && !defs.querySelector(`#${gradientId}`)) {
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      gradient.setAttribute('id', gradientId);
      gradient.setAttribute('x1', '0%');
      gradient.setAttribute('y1', '0%');
      gradient.setAttribute('x2', '100%');
      gradient.setAttribute('y2', '0%');

      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', '#ccc');
      stop1.setAttribute('stop-opacity', '0.9');

      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', '#333');
      stop2.setAttribute('stop-opacity', '0.02');

      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs.appendChild(gradient);

      trailElement.setAttribute('stroke', `url(#${gradientId})`);
      trailElement.setAttribute('stroke-width', thickness.toString());
      trailElement.setAttribute('fill', 'none');
      trailElement.setAttribute('stroke-linecap', 'round');
    }

    this.lineElements.set(id, {
      id,
      thickness,
      trailElement,
    });
  }

  private renderUpdate(data: any) {
    const { lines, gradientOffset } = data;

    // Update gradient
    this.gradientOffset = gradientOffset;
    const parentElement = this.container.parentElement;
    if (parentElement) {
      parentElement.style.background = `linear-gradient(to top, #0a0a0a ${this.gradientOffset}%, #000000)`;
    }

    // Update each line's trail
    lines.forEach((lineData: any) => {
      const lineElement = this.lineElements.get(lineData.id);
      if (lineElement && lineElement.trailElement && lineData.trailPoints.length > 1) {
        const trailPath = lineData.trailPoints.reduce((path: string, point: Point, i: number) =>
          i === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`, '');
        lineElement.trailElement.setAttribute('d', trailPath);
      }
    });
  }

  private fadeOutLineElement(id: number) {
    const lineElement = this.lineElements.get(id);
    if (lineElement && lineElement.trailElement) {
      lineElement.trailElement
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 1000,
          easing: 'ease-out',
          fill: 'forwards',
        })
        .addEventListener('finish', () => {
          this.removeLineElement(id);
        });
    }
  }

  private removeLineElement(id: number) {
    const lineElement = this.lineElements.get(id);
    if (lineElement) {
      if (lineElement.trailElement) {
        lineElement.trailElement.remove();
      }
      this.lineElements.delete(id);
    }
  }

  private setupResizeListener() {
    window.addEventListener('resize', () => {
      this.updateDimensions();
    });
  }

  private startAnimation() {
    this.startLineSpawning();
    this.animate();
  }

  private startLineSpawning() {
    // Generate initial lines
    for (let i = 0; i < this.MAX_FLYING_LINES; i++) {
      setTimeout(() => this.spawnLine(), i * this.LINE_SPAWN_INTERVAL);
    }

    // Continue generating lines
    this.spawnInterval = window.setInterval(() => {
      this.spawnLine();
    }, this.LINE_SPAWN_INTERVAL);
  }

  private spawnLine() {
    if (this.worker) {
      this.worker.postMessage({ type: 'spawnLine' });
    }
  }

  private animate = () => {
    // Send update request to worker
    if (this.worker) {
      this.worker.postMessage({
        type: 'update',
        data: { timestamp: Date.now() },
      });
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  // Audio-reactive methods
  /**
   * Enable audio-reactive mode - adds additional lines on beat/transient detection
   * The automatic spawning continues as normal, audio events trigger EXTRA lines
   */
  public enableAudioReactiveMode(options?: AudioReactiveOptions) {
    if (options) {
      this.audioOptions = { ...this.audioOptions, ...options };
    }
    this.audioReactiveMode = true;
    console.log('🎵 Audio-reactive mode enabled - audio will trigger additional lines');
  }

  /**
   * Disable audio-reactive mode - stops responding to audio events
   */
  public disableAudioReactiveMode() {
    this.audioReactiveMode = false;
    console.log('🎵 Audio-reactive mode disabled');
  }

  /**
   * Handle beat detection from audio analyzer
   * Spawns ADDITIONAL lines based on beat strength (with rate limiting)
   */
  public onBeatDetected = (strength: number) => {
    if (!this.audioReactiveMode || !this.audioOptions.enableBeatSync) {
      return;
    }

    // Check if beat is strong enough
    if (strength < (this.audioOptions.beatSensitivity || 0.4)) {
      return;
    }

    // Rate limiting - check cooldown
    const now = Date.now();
    if (now - this.lastBeatSpawnTime < this.BEAT_SPAWN_COOLDOWN) {
      return;
    }

    // Probabilistic spawning - only spawn 30% of the time to avoid overcrowding
    if (Math.random() > this.AUDIO_SPAWN_CHANCE) {
      return;
    }

    this.lastBeatSpawnTime = now;

    // Spawn 1 additional line on strong beats
    // Don't spawn multiple lines - keep it subtle
    this.spawnLine();
  };

  /**
   * Handle transient detection from audio analyzer
   * Spawns ADDITIONAL lines on high-frequency transients (with rate limiting)
   */
  public onTransientDetected = (intensity: number, frequency: 'low' | 'mid' | 'high') => {
    if (!this.audioReactiveMode || !this.audioOptions.enableTransientSync) {
      return;
    }

    // Only respond to mid and high frequency transients, not low frequency
    if (frequency === 'low') {
      return;
    }

    // Check if transient is strong enough
    if (intensity < (this.audioOptions.transientSensitivity || 0.3)) {
      return;
    }

    // Rate limiting - check cooldown
    const now = Date.now();
    if (now - this.lastTransientSpawnTime < this.TRANSIENT_SPAWN_COOLDOWN) {
      return;
    }

    // Probabilistic spawning - only spawn 30% of the time
    if (Math.random() > this.AUDIO_SPAWN_CHANCE) {
      return;
    }

    this.lastTransientSpawnTime = now;

    // Spawn 1 additional line on transients
    this.spawnLine();
  };

  // Public methods
  public pause() {
    if (this.worker) {
      this.worker.postMessage({ type: 'pause' });
    }
  }

  public resume() {
    if (this.worker) {
      this.worker.postMessage({ type: 'resume' });
    }
  }

  /**
   * Get the center point of the line ball animation
   * Useful for aligning other visual elements
   */
  public getCenterPoint(): { x: number; y: number } {
    return {
      x: this.dimensions.width / 2,
      y: this.dimensions.height / 2,
    };
  }

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.spawnInterval) {
      clearInterval(this.spawnInterval);
    }
    if (this.worker) {
      this.worker.terminate();
    }
    this.container.innerHTML = '';
  }
}

export default PureLineBallAnimation;
