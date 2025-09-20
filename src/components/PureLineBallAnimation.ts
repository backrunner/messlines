/**
 * Pure JavaScript line ball animation manager
 * Completely independent from React state management, directly manipulates DOM for optimal performance
 */

interface Point {
  x: number;
  y: number;
}

interface PathSegment {
  start: Point;
  end: Point;
  controlPoints: Point[];
  length: number;
}

interface FlyingLine {
  id: number;
  thickness: number;
  length: number;
  path: PathSegment[];
  currentPathIndex: number;
  progress: number;
  currentPosition: Point;
  direction: Point;
  element: SVGLineElement | null;
  trailElement: SVGPathElement | null;
  trailPoints: Point[];
  state: 'entering' | 'transitioning' | 'in_center' | 'fading_out';
  creationTime: number;
  lastUpdateTime: number;
  speed: number;
  bounceCount: number;
  transitionStartTime?: number;
  originalDirection?: Point;
}

class PureLineBallAnimation {
  private container: HTMLDivElement;
  private svgElement!: SVGSVGElement;
  private circleElement!: SVGCircleElement;

  private lines: FlyingLine[] = [];
  private centerLines: FlyingLine[] = [];
  private animationFrameId: number | null = null;
  private lineIdCounter = 0;

  private dimensions = { width: 0, height: 0 };
  private isPaused = false;
  private gradientOffset = 40;

  // Animation constants
  private readonly CIRCLE_RADIUS = 120;
  private readonly MAX_LINES = 80;
  private readonly MAX_CENTER_LINES = 50;
  private readonly MIN_FLYING_LINES = 8;
  private readonly MAX_FLYING_LINES = 15;
  private readonly MIN_THICKNESS = 0.8;
  private readonly MAX_THICKNESS = 4.0;
  private readonly MIN_LENGTH = 30;
  private readonly MAX_LENGTH = 80;
  private readonly TRAIL_MAX_LENGTH = 500;
  private readonly LINE_SPAWN_INTERVAL = 200;

  private spawnInterval: number | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.initializeContainer();
    this.createSVG();
    this.updateDimensions();
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
  }

  private setupResizeListener() {
    window.addEventListener('resize', () => {
      this.updateDimensions();
      this.repositionLines();
    });
  }

  private repositionLines() {
    // Reposition existing lines to fit new dimensions
    this.lines.forEach(line => {
      if (line.state === 'entering') {
        this.generateNewPath(line);
      } else if (line.state === 'in_center') {
        this.generateBouncingPath(line);
      }
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
      const flyingInLines = this.lines.filter(line => line.state === 'entering').length;
      const totalLines = this.lines.length;

      if (flyingInLines < this.MAX_FLYING_LINES && totalLines < this.MAX_LINES - 2) {
        this.spawnLine();
      }
    }, this.LINE_SPAWN_INTERVAL);
  }

  private spawnLine() {
    const startPoint = this.generateOutsidePoint();
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;

    const targetAngle = Math.random() * Math.PI * 2;
    const targetRadius = this.CIRCLE_RADIUS * (0.5 + Math.random() * 0.4);
    const targetPoint = {
      x: centerX + Math.cos(targetAngle) * targetRadius,
      y: centerY + Math.sin(targetAngle) * targetRadius,
    };

    const line = this.createFlyingLine(startPoint, targetPoint);
    this.lines.push(line);
  }

  private generateOutsidePoint(): Point {
    const side = Math.floor(Math.random() * 4);
    const buffer = 150;

    switch (side) {
      case 0: return { x: Math.random() * this.dimensions.width, y: -buffer };
      case 1: return { x: this.dimensions.width + buffer, y: Math.random() * this.dimensions.height };
      case 2: return { x: Math.random() * this.dimensions.width, y: this.dimensions.height + buffer };
      default: return { x: -buffer, y: Math.random() * this.dimensions.height };
    }
  }

  private createFlyingLine(startPoint: Point, targetPoint: Point): FlyingLine {
    const thickness = this.MIN_THICKNESS + Math.random() * (this.MAX_THICKNESS - this.MIN_THICKNESS);
    const length = this.MIN_LENGTH + Math.random() * (this.MAX_LENGTH - this.MIN_LENGTH);
    const speed = 0.0015;

    const path = this.generateMessyPath(startPoint, targetPoint);

    // Create trail SVG element
    const trailElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.svgElement.appendChild(trailElement);

    this.lineIdCounter++;
    return {
      id: this.lineIdCounter,
      thickness,
      length,
      path,
      currentPathIndex: 0,
      progress: 0,
      currentPosition: { ...startPoint },
      direction: { x: 0, y: 0 },
      element: null,
      trailElement,
      trailPoints: [startPoint],
      state: 'entering',
      creationTime: Date.now(),
      lastUpdateTime: Date.now(),
      speed,
      bounceCount: 0,
    };
  }

  private generateMessyPath(start: Point, end: Point, segments = 1): PathSegment[] {
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;

    // Create random elliptical spiral parameters
    const pathType = Math.random();

    if (pathType < 0.6) {
      // Elliptical spiral approach to center
      const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
      const endAngle = Math.atan2(end.y - centerY, end.x - centerX);

      // Random ellipse parameters for artistic effect
      const ellipseRadiusX = 0.7 + Math.random() * 0.6; // 0.7-1.3 ratio
      const ellipseRadiusY = 0.7 + Math.random() * 0.6; // 0.7-1.3 ratio
      const ellipseRotation = Math.random() * Math.PI; // Random ellipse orientation

      // Spiral parameters
      const spiralTurns = 0.8 + Math.random() * 1.4; // 0.8-2.2 turns
      const totalAngleChange = spiralTurns * Math.PI * 2;

      // Calculate intermediate points along elliptical spiral
      const cp1Angle = startAngle + totalAngleChange * 0.33;
      const cp2Angle = startAngle + totalAngleChange * 0.67;

      // Calculate radii with spiral decay
      const startRadius = Math.sqrt((start.x - centerX) ** 2 + (start.y - centerY) ** 2);
      const endRadius = Math.sqrt((end.x - centerX) ** 2 + (end.y - centerY) ** 2);

      const cp1Radius = startRadius * 0.75 + endRadius * 0.25;
      const cp2Radius = startRadius * 0.25 + endRadius * 0.75;

      // Apply elliptical transformation to control points
      const cp1BaseX = Math.cos(cp1Angle) * cp1Radius * ellipseRadiusX;
      const cp1BaseY = Math.sin(cp1Angle) * cp1Radius * ellipseRadiusY;
      const cp2BaseX = Math.cos(cp2Angle) * cp2Radius * ellipseRadiusX;
      const cp2BaseY = Math.sin(cp2Angle) * cp2Radius * ellipseRadiusY;

      // Rotate ellipse
      const cosRot = Math.cos(ellipseRotation);
      const sinRot = Math.sin(ellipseRotation);

      const controlPoints = [
        {
          x: centerX + (cp1BaseX * cosRot - cp1BaseY * sinRot),
          y: centerY + (cp1BaseX * sinRot + cp1BaseY * cosRot),
        },
        {
          x: centerX + (cp2BaseX * cosRot - cp2BaseY * sinRot),
          y: centerY + (cp2BaseX * sinRot + cp2BaseY * cosRot),
        },
      ];

      return [
        {
          start: { ...start },
          end: { ...end },
          controlPoints,
          length: Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2),
        },
      ];
    } else if (pathType < 0.8) {
      // Artistic flowing curve with random undulation
      const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;

      // Create flowing curve with artistic variation
      const flowIntensity = 200 + Math.random() * 300;
      const flowAngle = Math.atan2(end.y - start.y, end.x - start.x) + Math.PI / 2;
      const flowVariation = (Math.random() - 0.5) * Math.PI * 0.4;

      const cp1Offset = flowIntensity * (0.8 + Math.random() * 0.4);
      const cp2Offset = flowIntensity * (0.8 + Math.random() * 0.4);

      const controlPoints = [
        {
          x: midX + Math.cos(flowAngle + flowVariation) * cp1Offset * 0.7,
          y: midY + Math.sin(flowAngle + flowVariation) * cp1Offset * 0.7,
        },
        {
          x: midX + Math.cos(flowAngle - flowVariation) * cp2Offset * 0.3,
          y: midY + Math.sin(flowAngle - flowVariation) * cp2Offset * 0.3,
        },
      ];

      return [
        {
          start: { ...start },
          end: { ...end },
          controlPoints,
          length: distance,
        },
      ];
    } else {
      // Organic random curve with artistic asymmetry
      const cp1X = start.x + (end.x - start.x) * (0.2 + Math.random() * 0.3);
      const cp1Y = start.y + (end.y - start.y) * (0.2 + Math.random() * 0.3);
      const cp2X = start.x + (end.x - start.x) * (0.5 + Math.random() * 0.3);
      const cp2Y = start.y + (end.y - start.y) * (0.5 + Math.random() * 0.3);

      // Add artistic randomness
      const randomOffset1 = 100 + Math.random() * 250;
      const randomOffset2 = 100 + Math.random() * 250;
      const randomAngle1 = Math.random() * Math.PI * 2;
      const randomAngle2 = Math.random() * Math.PI * 2;

      const controlPoints = [
        {
          x: cp1X + Math.cos(randomAngle1) * randomOffset1,
          y: cp1Y + Math.sin(randomAngle1) * randomOffset1,
        },
        {
          x: cp2X + Math.cos(randomAngle2) * randomOffset2,
          y: cp2Y + Math.sin(randomAngle2) * randomOffset2,
        },
      ];

      return [
        {
          start: { ...start },
          end: { ...end },
          controlPoints,
          length: Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2),
        },
      ];
    }
  }

  private generateNewPath(line: FlyingLine) {
    // Generate new path for line
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    const targetAngle = Math.random() * Math.PI * 2;
    const targetRadius = this.CIRCLE_RADIUS * (0.5 + Math.random() * 0.4);
    const newTarget = {
      x: centerX + Math.cos(targetAngle) * targetRadius,
      y: centerY + Math.sin(targetAngle) * targetRadius,
    };

    line.path = this.generateMessyPath(line.currentPosition, newTarget);
    line.currentPathIndex = 0;
    line.progress = 0;
  }

  private generateBouncingPath(line: FlyingLine) {
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    const currentPos = line.currentPosition;

    // Always consider current direction for smooth continuity
    const currentDirection = line.direction || { x: 1, y: 0 };
    const currentDirectionAngle = Math.atan2(currentDirection.y, currentDirection.x);
    const currentPosAngle = Math.atan2(currentPos.y - centerY, currentPos.x - centerX);
    const currentRadius = Math.sqrt((currentPos.x - centerX) ** 2 + (currentPos.y - centerY) ** 2);

    // Initialize or maintain spiral properties for consistency
    if (!line.originalDirection) {
      line.originalDirection = {
        x: Math.random() < 0.5 ? 1 : -1, // Consistent spiral direction
        y: 0.2 + Math.random() * 0.3, // Consistent spiral tightness (0.2-0.5)
      };
    }

    const spiralDirection = line.originalDirection.x; // Consistent direction
    const baseSpiralTightness = line.originalDirection.y; // Consistent tightness

    // Calculate smooth spiral progression that follows current direction
    const directionWeight = 0.7; // Strong influence from current direction
    const spiralWeight = 0.3; // Moderate spiral influence

    // Smooth spiral angle progression
    const spiralAngleIncrement = baseSpiralTightness * Math.PI * spiralDirection;
    const spiralTargetAngle = currentPosAngle + spiralAngleIncrement;

    // Blend current direction with spiral direction for smooth transition
    const blendedAngle = currentDirectionAngle * directionWeight + spiralTargetAngle * spiralWeight;

    // Calculate target distance - prefer continuing in similar direction
    const forwardDistance = 40 + Math.random() * 30; // 40-70px forward movement
    const spiralRadiusVariation = (Math.random() - 0.5) * 15; // Small radius variation

    // Target position that continues current direction with spiral influence
    const targetRadius = Math.max(25, Math.min(currentRadius + spiralRadiusVariation, this.CIRCLE_RADIUS - 35));

    // Calculate target point using blended angle
    const preliminaryTarget = {
      x: currentPos.x + Math.cos(blendedAngle) * forwardDistance,
      y: currentPos.y + Math.sin(blendedAngle) * forwardDistance,
    };

    // Adjust target to stay within circle if needed
    const targetDistFromCenter = Math.sqrt((preliminaryTarget.x - centerX) ** 2 + (preliminaryTarget.y - centerY) ** 2);

    let targetPoint: Point;
    if (targetDistFromCenter > this.CIRCLE_RADIUS - 30) {
      // Project target onto safe circle boundary
      const targetAngle = Math.atan2(preliminaryTarget.y - centerY, preliminaryTarget.x - centerX);
      const safeRadius = Math.min(targetRadius, this.CIRCLE_RADIUS - 35);
      targetPoint = {
        x: centerX + Math.cos(targetAngle) * safeRadius,
        y: centerY + Math.sin(targetAngle) * safeRadius,
      };
    } else {
      targetPoint = preliminaryTarget;
    }

    // Use moderate curvature for smooth, natural arcs
    const curvature = 0.25 + Math.random() * 0.25; // 0.25-0.5 for gentle curves

    // Create smooth arc path that respects current direction
    const segment = this.generatePathSegment(currentPos, targetPoint, curvature);
    line.path = [segment];
    line.currentPathIndex = 0;
    line.progress = 0;
  }

  // Generate curved path segment from start to end (ultra-smooth continuous arcs)
  private generatePathSegment(start: Point, end: Point, curvature = 0.4): PathSegment {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const intensity = curvature * Math.min(250, distance * 0.6); // Further reduced for ultra-smooth curves

    const curveType = Math.random();
    let controlPoints: Point[] = [];

    // Calculate the primary direction vector for more natural curves
    const directionLength = Math.sqrt(dx * dx + dy * dy);
    const unitDx = dx / directionLength;
    const unitDy = dy / directionLength;

    // Perpendicular vector for curve control
    const perpX = -unitDy;
    const perpY = unitDx;

    if (curveType < 0.6) {
      // Enhanced cubic Bezier curve for ultra-smooth arcs
      const curveOffset1 = (Math.random() - 0.5) * intensity;
      const curveOffset2 = (Math.random() - 0.5) * intensity;

      const cp1x = start.x + dx * 0.3 + perpX * curveOffset1;
      const cp1y = start.y + dy * 0.3 + perpY * curveOffset1;
      const cp2x = start.x + dx * 0.7 + perpX * curveOffset2;
      const cp2y = start.y + dy * 0.7 + perpY * curveOffset2;

      controlPoints = [
        { x: cp1x, y: cp1y },
        { x: cp2x, y: cp2y },
      ];
    } else {
      // Enhanced quadratic Bezier curve for smooth arcs
      const curveOffset = (Math.random() - 0.5) * intensity * 1.2;
      const midX = start.x + dx * 0.5;
      const midY = start.y + dy * 0.5;

      const controlX = midX + perpX * curveOffset;
      const controlY = midY + perpY * curveOffset;

      controlPoints = [{ x: controlX, y: controlY }];
    }

    return {
      start: { ...start },
      end: { ...end },
      controlPoints,
      length: distance,
    };
  }

  private animate = () => {
    if (this.isPaused) {
      this.animationFrameId = requestAnimationFrame(this.animate);
      return;
    }

    const now = Date.now();

    // Update breathing gradient effect
    this.updateBreathingGradient(now);

    // Update all lines
    this.lines.forEach(line => this.updateLine(line));

    // Clean up lines that exceed limits
    this.enforceLimits();

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private updateBreathingGradient(now: number) {
    const breathingSpeed = 0.0005;
    const breathingAmplitude = 20;
    const breathing = Math.sin(now * breathingSpeed) * breathingAmplitude;
    this.gradientOffset = 40 + breathing;

    // Update container's parent element background directly
    const parentElement = this.container.parentElement;
    if (parentElement) {
      parentElement.style.background = `linear-gradient(to top, #0a0a0a ${this.gradientOffset}%, #000000)`;
    }
  }

  private updateLine(line: FlyingLine) {
    const now = Date.now();
    const deltaTime = now - line.lastUpdateTime;
    line.lastUpdateTime = now;

    if (line.currentPathIndex >= line.path.length) return;

    const currentSegment = line.path[line.currentPathIndex];
    line.progress += line.speed * deltaTime;

    if (line.progress >= 1.0) {
      line.progress = 1.0;
    }

    // Calculate new position and direction
    const newPosition = this.interpolateBezierPoint(currentSegment, line.progress);
    const newDirection = this.calculateBezierDirection(currentSegment, line.progress);

    line.currentPosition = newPosition;
    line.direction = newDirection;

    // Update trail
    this.updateTrail(line, newPosition);

    // Check boundary bounce (before state transition)
    if ((line.state === 'in_center' || line.state === 'transitioning') && this.isNearBoundary(newPosition, 20)) {
      // Increase threshold for earlier detection
      // Hit boundary - create gentle deflection instead of sharp bounce
      const centerX = this.dimensions.width / 2;
      const centerY = this.dimensions.height / 2;

      // Calculate current movement direction
      const currentDirection = line.direction || { x: 1, y: 0 };
      const currentDirectionAngle = Math.atan2(currentDirection.y, currentDirection.x);

      // Create gentle deflection, maintaining flow direction
      const deflectionAngle = (Math.random() - 0.5) * Math.PI * 0.4; // Smaller deflection angle
      const gentleDeflectionAngle = currentDirectionAngle + deflectionAngle;

      // Calculate safe target, gently curving inward
      const deflectionDistance = 35 + Math.random() * 25; // 35-60px forward
      const inwardBias = 10 + Math.random() * 15; // 10-25px inward offset

      // Continue forward but slightly curve inward target point
      const forwardX = newPosition.x + Math.cos(gentleDeflectionAngle) * deflectionDistance;
      const forwardY = newPosition.y + Math.sin(gentleDeflectionAngle) * deflectionDistance;

      // Add inward bias toward center
      const toCenterAngle = Math.atan2(centerY - newPosition.y, centerX - newPosition.x);
      const deflectionTarget = {
        x: forwardX + Math.cos(toCenterAngle) * inwardBias,
        y: forwardY + Math.sin(toCenterAngle) * inwardBias,
      };

      // Ensure target is within safe boundaries
      const distanceFromCenter = Math.sqrt((deflectionTarget.x - centerX) ** 2 + (deflectionTarget.y - centerY) ** 2);
      if (distanceFromCenter > this.CIRCLE_RADIUS - 30) {
        // Project to safe position while maintaining general direction
        const targetAngle = Math.atan2(deflectionTarget.y - centerY, deflectionTarget.x - centerX);
        const safeRadius = this.CIRCLE_RADIUS - 35;
        deflectionTarget.x = centerX + Math.cos(targetAngle) * safeRadius;
        deflectionTarget.y = centerY + Math.sin(targetAngle) * safeRadius;
      }

      // Create very gentle arc for smooth deflection
      const gentleCurvature = 0.15 + Math.random() * 0.15; // Very gentle curves (0.15-0.3)
      const deflectionPath = this.generatePathSegment(newPosition, deflectionTarget, gentleCurvature);
      line.path = [deflectionPath];
      line.currentPathIndex = 0;
      line.progress = 0;
      line.bounceCount++;
    }

    // Handle state transitions
    if (line.progress >= 1.0) {
      line.currentPathIndex++;
      line.progress = 0;

      if (line.currentPathIndex >= line.path.length) {
        this.handleLineStateTransition(line);
      }
    }
  }

  private interpolateBezierPoint(segment: PathSegment, t: number): Point {
    const { start, end, controlPoints } = segment;

    if (controlPoints.length === 1) {
      // Quadratic Bezier
      const cp = controlPoints[0];
      const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cp.x + t * t * end.x;
      const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cp.y + t * t * end.y;
      return { x, y };
    } else if (controlPoints.length === 2) {
      // Cubic Bezier
      const cp1 = controlPoints[0];
      const cp2 = controlPoints[1];
      const x = (1 - t) * (1 - t) * (1 - t) * start.x + 3 * (1 - t) * (1 - t) * t * cp1.x + 3 * (1 - t) * t * t * cp2.x + t * t * t * end.x;
      const y = (1 - t) * (1 - t) * (1 - t) * start.y + 3 * (1 - t) * (1 - t) * t * cp1.y + 3 * (1 - t) * t * t * cp2.y + t * t * t * end.y;
      return { x, y };
    }

    // Linear fallback
    const x = start.x + t * (end.x - start.x);
    const y = start.y + t * (end.y - start.y);
    return { x, y };
  }

  // Calculate direction vector at point along Bezier curve
  private calculateBezierDirection(segment: PathSegment, t: number): Point {
    const { start, end, controlPoints } = segment;
    let dx = 0, dy = 0;

    if (controlPoints.length === 1) {
      // Quadratic Bezier derivative
      const cp = controlPoints[0];
      dx = 2 * (1 - t) * (cp.x - start.x) + 2 * t * (end.x - cp.x);
      dy = 2 * (1 - t) * (cp.y - start.y) + 2 * t * (end.y - cp.y);
    } else if (controlPoints.length === 2) {
      // Cubic Bezier derivative
      const cp1 = controlPoints[0];
      const cp2 = controlPoints[1];
      dx = 3 * (1 - t) * (1 - t) * (cp1.x - start.x) + 6 * (1 - t) * t * (cp2.x - cp1.x) + 3 * t * t * (end.x - cp2.x);
      dy = 3 * (1 - t) * (1 - t) * (cp1.y - start.y) + 6 * (1 - t) * t * (cp2.y - cp1.y) + 3 * t * t * (end.y - cp2.y);
    } else {
      // Linear derivative
      dx = end.x - start.x;
      dy = end.y - start.y;
    }

    // Normalize direction vector
    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
  }

  private updateTrail(line: FlyingLine, newPosition: Point) {
    line.trailPoints.push({ ...newPosition });

    if (line.trailPoints.length > this.TRAIL_MAX_LENGTH) {
      line.trailPoints = line.trailPoints.slice(-this.TRAIL_MAX_LENGTH);
    }

    if (line.trailElement && line.trailPoints.length > 1) {
      const trailPath = line.trailPoints.reduce((path, point, i) =>
        i === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`, '');
      line.trailElement.setAttribute('d', trailPath);

      if (!line.trailElement.getAttribute('stroke')) {
        this.setupTrailGradient(line);
      }
    }
  }

  private setupTrailGradient(line: FlyingLine) {
    const gradientId = `gradient-${line.id}`;
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

      if (line.trailElement) {
        line.trailElement.setAttribute('stroke', `url(#${gradientId})`);
        line.trailElement.setAttribute('stroke-width', line.thickness.toString());
        line.trailElement.setAttribute('fill', 'none');
        line.trailElement.setAttribute('stroke-linecap', 'round');
      }
    }
  }

  private handleLineStateTransition(line: FlyingLine) {
    if (line.state === 'entering' && this.isInsideCircle(line.currentPosition)) {
      // Check if center ball has space
      if (this.centerLines.length >= this.MAX_CENTER_LINES) {
        // Center full - remove oldest lines to make space
        const linesToRemove = Math.min(3, this.centerLines.length);
        for (let i = 0; i < linesToRemove; i++) {
          const oldestLine = this.centerLines.shift();
          if (oldestLine) {
            this.fadeOutLine(oldestLine);
          }
        }
      }

      // Change state but continue with original path direction
      line.state = 'transitioning';
      line.transitionStartTime = Date.now();
      this.centerLines.push(line);

      // Generate a transition path that gradually curves toward spiral behavior
      this.generateTransitionPath(line);
    } else if (line.state === 'transitioning') {
      // Check if transition period is complete
      const transitionDuration = 2000; // 2 seconds transition
      const timeSinceTransition = Date.now() - (line.transitionStartTime || 0);

      if (timeSinceTransition >= transitionDuration) {
        line.state = 'in_center';
        this.generateBouncingPath(line);
      } else {
        this.generateTransitionPath(line);
      }
    } else if (line.state === 'in_center') {
      this.generateBouncingPath(line);
    } else if (line.state === 'fading_out') {
      // Line is fading out, don't generate new path
      return;
    } else if (line.state === 'entering') {
      // Continue original entering path
      const centerX = this.dimensions.width / 2;
      const centerY = this.dimensions.height / 2;
      const targetPoint = {
        x: centerX + (Math.random() - 0.5) * this.CIRCLE_RADIUS * 0.8,
        y: centerY + (Math.random() - 0.5) * this.CIRCLE_RADIUS * 0.8,
      };
      const segment = this.generatePathSegment(line.currentPosition, targetPoint, 0.3);
      line.path = [segment];
      line.currentPathIndex = 0;
      line.progress = 0;
    }
  }

  // Generate transition path from original direction to spiral movement
  private generateTransitionPath(line: FlyingLine) {
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    const currentPos = line.currentPosition;

    // Get transition progress (0 to 1)
    const transitionDuration = 2000; // 2 seconds
    const timeSinceTransition = Date.now() - (line.transitionStartTime || Date.now());
    const transitionProgress = Math.min(timeSinceTransition / transitionDuration, 1);

    // Store original direction if not already stored
    if (!line.originalDirection) {
      line.originalDirection = { ...line.direction };
    }

    // Calculate current angle and radius from center
    const currentAngle = Math.atan2(currentPos.y - centerY, currentPos.x - centerX);
    const currentRadius = Math.sqrt((currentPos.x - centerX) ** 2 + (currentPos.y - centerY) ** 2);

    // Gradually transition from original direction to spiral direction
    const originalDirection = line.originalDirection;
    const originalAngle = Math.atan2(originalDirection.y, originalDirection.x);

    // Create spiral target that gradually becomes stronger
    const spiralInfluence = transitionProgress; // 0 to 1
    const originalInfluence = 1 - transitionProgress; // 1 to 0

    // Original direction component (continues initial trajectory)
    const originalTargetDistance = 60 + Math.random() * 40;
    const originalTargetX = currentPos.x + Math.cos(originalAngle) * originalTargetDistance;
    const originalTargetY = currentPos.y + Math.sin(originalAngle) * originalTargetDistance;

    // Spiral direction component (curves toward center and around)
    const spiralAngleOffset = (Math.random() - 0.5) * Math.PI * 0.6;
    const spiralAngle = currentAngle + spiralAngleOffset;
    const spiralRadius = Math.max(25, currentRadius - 10 - Math.random() * 20);
    const spiralTargetX = centerX + Math.cos(spiralAngle) * spiralRadius;
    const spiralTargetY = centerY + Math.sin(spiralAngle) * spiralRadius;

    // Blend original and spiral targets based on transition progress
    const targetPoint = {
      x: originalTargetX * originalInfluence + spiralTargetX * spiralInfluence,
      y: originalTargetY * originalInfluence + spiralTargetY * spiralInfluence,
    };

    // Ensure target is within circle bounds
    const targetDistanceFromCenter = Math.sqrt((targetPoint.x - centerX) ** 2 + (targetPoint.y - centerY) ** 2);
    if (targetDistanceFromCenter > this.CIRCLE_RADIUS - 30) {
      const targetAngle = Math.atan2(targetPoint.y - centerY, targetPoint.x - centerX);
      const safeRadius = this.CIRCLE_RADIUS - 30;
      targetPoint.x = centerX + Math.cos(targetAngle) * safeRadius;
      targetPoint.y = centerY + Math.sin(targetAngle) * safeRadius;
    }

    // Use varying curvature - more curved as transition progresses
    const curvature = 0.2 + transitionProgress * 0.4; // 0.2 to 0.6

    const segment = this.generatePathSegment(currentPos, targetPoint, curvature);
    line.path = [segment];
    line.currentPathIndex = 0;
    line.progress = 0;
  }

  // Fade out a line directly
  private fadeOutLine(line: FlyingLine) {
    line.state = 'fading_out';
    if (line.trailElement) {
      line.trailElement
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 1000,
          easing: 'ease-out',
          fill: 'forwards',
        })
        .addEventListener('finish', () => {
          // Remove the line completely after fade out
          this.removeLine(line);
        });
    }
  }

  private isInsideCircle(point: Point): boolean {
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
    return distance <= this.CIRCLE_RADIUS;
  }

  // Check if point is near circle boundary (for bounce detection)
  private isNearBoundary(point: Point, threshold = 10): boolean {
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.height / 2;
    const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
    return Math.abs(distance - this.CIRCLE_RADIUS) <= threshold;
  }

  private enforceLimits() {
    if (this.lines.length > this.MAX_LINES) {
      const excessLines = this.lines.splice(0, this.lines.length - this.MAX_LINES);
      excessLines.forEach(line => this.removeLine(line));
    }

    if (this.centerLines.length > this.MAX_CENTER_LINES) {
      const excessCenterLines = this.centerLines.splice(0, this.centerLines.length - this.MAX_CENTER_LINES);
      excessCenterLines.forEach(line => this.removeLine(line));
    }
  }

  private removeLine(line: FlyingLine) {
    if (line.trailElement) {
      line.trailElement.remove();
    }

    const lineIndex = this.lines.indexOf(line);
    if (lineIndex > -1) {
      this.lines.splice(lineIndex, 1);
    }

    const centerIndex = this.centerLines.indexOf(line);
    if (centerIndex > -1) {
      this.centerLines.splice(centerIndex, 1);
    }
  }

  // Public methods
  public pause() {
    this.isPaused = true;
  }

  public resume() {
    this.isPaused = false;
    const now = Date.now();
    this.lines.forEach(line => {
      line.lastUpdateTime = now;
    });
  }

  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.spawnInterval) {
      clearInterval(this.spawnInterval);
    }
    this.container.innerHTML = '';
  }
}

export default PureLineBallAnimation;
