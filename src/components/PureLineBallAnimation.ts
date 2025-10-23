/**
 * Pure JavaScript line ball animation manager
 * Optimized with Web Worker for off-main-thread calculations
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

  constructor(container: HTMLDivElement) {
    this.container = container;
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
