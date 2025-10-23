/**
 * Web Worker for line ball animation calculations
 * Handles all complex mathematical computations off the main thread
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
  trailPoints: Point[];
  state: 'entering' | 'transitioning' | 'in_center' | 'fading_out';
  creationTime: number;
  lastUpdateTime: number;
  speed: number;
  bounceCount: number;
  transitionStartTime?: number;
  originalDirection?: Point;
}

interface WorkerState {
  lines: FlyingLine[];
  centerLines: FlyingLine[];
  lineIdCounter: number;
  dimensions: { width: number; height: number };
  isPaused: boolean;
  gradientOffset: number;
}

class AnimationWorker {
  private state: WorkerState = {
    lines: [],
    centerLines: [],
    lineIdCounter: 0,
    dimensions: { width: 0, height: 0 },
    isPaused: false,
    gradientOffset: 40,
  };

  // Animation constants
  private readonly CIRCLE_RADIUS = 120;
  private readonly MAX_LINES = 80;
  private readonly MAX_CENTER_LINES = 50;
  private readonly MAX_FLYING_LINES = 15;
  private readonly MIN_THICKNESS = 0.8;
  private readonly MAX_THICKNESS = 4.0;
  private readonly MIN_LENGTH = 30;
  private readonly MAX_LENGTH = 80;
  private readonly TRAIL_MAX_LENGTH = 500;

  constructor() {
    this.setupMessageHandler();
  }

  private setupMessageHandler() {
    self.addEventListener('message', (e) => {
      const { type, data } = e.data;

      switch (type) {
        case 'init':
          this.state.dimensions = data.dimensions;
          break;
        case 'updateDimensions':
          this.state.dimensions = data.dimensions;
          this.repositionLines();
          break;
        case 'spawnLine':
          this.spawnLine();
          break;
        case 'update':
          this.update(data.timestamp);
          break;
        case 'pause':
          this.state.isPaused = true;
          break;
        case 'resume':
          this.state.isPaused = false;
          const now = Date.now();
          this.state.lines.forEach(line => {
            line.lastUpdateTime = now;
          });
          break;
      }
    });
  }

  private repositionLines() {
    this.state.lines.forEach(line => {
      if (line.state === 'entering') {
        this.generateNewPath(line);
      } else if (line.state === 'in_center') {
        this.generateBouncingPath(line);
      }
    });
  }

  private spawnLine() {
    const startPoint = this.generateOutsidePoint();
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;

    const targetAngle = Math.random() * Math.PI * 2;
    const targetRadius = this.CIRCLE_RADIUS * (0.5 + Math.random() * 0.4);
    const targetPoint = {
      x: centerX + Math.cos(targetAngle) * targetRadius,
      y: centerY + Math.sin(targetAngle) * targetRadius,
    };

    const line = this.createFlyingLine(startPoint, targetPoint);
    this.state.lines.push(line);

    // Send new line to main thread
    self.postMessage({
      type: 'lineCreated',
      data: {
        id: line.id,
        thickness: line.thickness,
      },
    });
  }

  private generateOutsidePoint(): Point {
    const side = Math.floor(Math.random() * 4);
    const buffer = 150;

    switch (side) {
      case 0: return { x: Math.random() * this.state.dimensions.width, y: -buffer };
      case 1: return { x: this.state.dimensions.width + buffer, y: Math.random() * this.state.dimensions.height };
      case 2: return { x: Math.random() * this.state.dimensions.width, y: this.state.dimensions.height + buffer };
      default: return { x: -buffer, y: Math.random() * this.state.dimensions.height };
    }
  }

  private createFlyingLine(startPoint: Point, targetPoint: Point): FlyingLine {
    const thickness = this.MIN_THICKNESS + Math.random() * (this.MAX_THICKNESS - this.MIN_THICKNESS);
    const length = this.MIN_LENGTH + Math.random() * (this.MAX_LENGTH - this.MIN_LENGTH);
    const speed = 0.0015;

    const path = this.generateMessyPath(startPoint, targetPoint);

    this.state.lineIdCounter++;
    return {
      id: this.state.lineIdCounter,
      thickness,
      length,
      path,
      currentPathIndex: 0,
      progress: 0,
      currentPosition: { ...startPoint },
      direction: { x: 0, y: 0 },
      trailPoints: [startPoint],
      state: 'entering',
      creationTime: Date.now(),
      lastUpdateTime: Date.now(),
      speed,
      bounceCount: 0,
    };
  }

  private generateMessyPath(start: Point, end: Point): PathSegment[] {
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;
    const pathType = Math.random();

    if (pathType < 0.6) {
      // Elliptical spiral approach
      const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
      const ellipseRadiusX = 0.7 + Math.random() * 0.6;
      const ellipseRadiusY = 0.7 + Math.random() * 0.6;
      const ellipseRotation = Math.random() * Math.PI;
      const spiralTurns = 0.8 + Math.random() * 1.4;
      const totalAngleChange = spiralTurns * Math.PI * 2;

      const cp1Angle = startAngle + totalAngleChange * 0.33;
      const cp2Angle = startAngle + totalAngleChange * 0.67;

      const startRadius = Math.sqrt((start.x - centerX) ** 2 + (start.y - centerY) ** 2);
      const endRadius = Math.sqrt((end.x - centerX) ** 2 + (end.y - centerY) ** 2);

      const cp1Radius = startRadius * 0.75 + endRadius * 0.25;
      const cp2Radius = startRadius * 0.25 + endRadius * 0.75;

      const cp1BaseX = Math.cos(cp1Angle) * cp1Radius * ellipseRadiusX;
      const cp1BaseY = Math.sin(cp1Angle) * cp1Radius * ellipseRadiusY;
      const cp2BaseX = Math.cos(cp2Angle) * cp2Radius * ellipseRadiusX;
      const cp2BaseY = Math.sin(cp2Angle) * cp2Radius * ellipseRadiusY;

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
      // Flowing curve
      const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;

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
      // Organic random curve
      const cp1X = start.x + (end.x - start.x) * (0.2 + Math.random() * 0.3);
      const cp1Y = start.y + (end.y - start.y) * (0.2 + Math.random() * 0.3);
      const cp2X = start.x + (end.x - start.x) * (0.5 + Math.random() * 0.3);
      const cp2Y = start.y + (end.y - start.y) * (0.5 + Math.random() * 0.3);

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
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;
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
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;
    const currentPos = line.currentPosition;

    const currentDirection = line.direction || { x: 1, y: 0 };
    const currentDirectionAngle = Math.atan2(currentDirection.y, currentDirection.x);
    const currentPosAngle = Math.atan2(currentPos.y - centerY, currentPos.x - centerX);
    const currentRadius = Math.sqrt((currentPos.x - centerX) ** 2 + (currentPos.y - centerY) ** 2);

    if (!line.originalDirection) {
      line.originalDirection = {
        x: Math.random() < 0.5 ? 1 : -1,
        y: 0.2 + Math.random() * 0.3,
      };
    }

    const spiralDirection = line.originalDirection.x;
    const baseSpiralTightness = line.originalDirection.y;

    const directionWeight = 0.7;
    const spiralWeight = 0.3;

    const spiralAngleIncrement = baseSpiralTightness * Math.PI * spiralDirection;
    const spiralTargetAngle = currentPosAngle + spiralAngleIncrement;

    const blendedAngle = currentDirectionAngle * directionWeight + spiralTargetAngle * spiralWeight;

    const forwardDistance = 40 + Math.random() * 30;
    const spiralRadiusVariation = (Math.random() - 0.5) * 15;

    const targetRadius = Math.max(25, Math.min(currentRadius + spiralRadiusVariation, this.CIRCLE_RADIUS - 35));

    const preliminaryTarget = {
      x: currentPos.x + Math.cos(blendedAngle) * forwardDistance,
      y: currentPos.y + Math.sin(blendedAngle) * forwardDistance,
    };

    const targetDistFromCenter = Math.sqrt((preliminaryTarget.x - centerX) ** 2 + (preliminaryTarget.y - centerY) ** 2);

    let targetPoint: Point;
    if (targetDistFromCenter > this.CIRCLE_RADIUS - 30) {
      const targetAngle = Math.atan2(preliminaryTarget.y - centerY, preliminaryTarget.x - centerX);
      const safeRadius = Math.min(targetRadius, this.CIRCLE_RADIUS - 35);
      targetPoint = {
        x: centerX + Math.cos(targetAngle) * safeRadius,
        y: centerY + Math.sin(targetAngle) * safeRadius,
      };
    } else {
      targetPoint = preliminaryTarget;
    }

    const curvature = 0.25 + Math.random() * 0.25;

    const segment = this.generatePathSegment(currentPos, targetPoint, curvature);
    line.path = [segment];
    line.currentPathIndex = 0;
    line.progress = 0;
  }

  private generatePathSegment(start: Point, end: Point, curvature = 0.4): PathSegment {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const intensity = curvature * Math.min(250, distance * 0.6);

    const curveType = Math.random();
    let controlPoints: Point[] = [];

    const directionLength = Math.sqrt(dx * dx + dy * dy);
    const unitDx = dx / directionLength;
    const unitDy = dy / directionLength;

    const perpX = -unitDy;
    const perpY = unitDx;

    if (curveType < 0.6) {
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

  private update(timestamp: number) {
    if (this.state.isPaused) return;

    const now = Date.now();

    // Update breathing gradient
    this.updateBreathingGradient(now);

    // Update all lines
    const updatedLines: Array<{
      id: number;
      position: Point;
      trailPoints: Point[];
      state: string;
    }> = [];

    this.state.lines.forEach(line => {
      this.updateLine(line, now);
      updatedLines.push({
        id: line.id,
        position: line.currentPosition,
        trailPoints: line.trailPoints,
        state: line.state,
      });
    });

    // Enforce limits
    this.enforceLimits();

    // Send update to main thread
    self.postMessage({
      type: 'update',
      data: {
        lines: updatedLines,
        gradientOffset: this.state.gradientOffset,
        linesToRemove: [],
      },
    });
  }

  private updateBreathingGradient(now: number) {
    const breathingSpeed = 0.0005;
    const breathingAmplitude = 20;
    const breathing = Math.sin(now * breathingSpeed) * breathingAmplitude;
    this.state.gradientOffset = 40 + breathing;
  }

  private updateLine(line: FlyingLine, now: number) {
    const deltaTime = now - line.lastUpdateTime;
    line.lastUpdateTime = now;

    if (line.currentPathIndex >= line.path.length) return;

    const currentSegment = line.path[line.currentPathIndex];
    line.progress += line.speed * deltaTime;

    if (line.progress >= 1.0) {
      line.progress = 1.0;
    }

    const newPosition = this.interpolateBezierPoint(currentSegment, line.progress);
    const newDirection = this.calculateBezierDirection(currentSegment, line.progress);

    line.currentPosition = newPosition;
    line.direction = newDirection;

    // Update trail
    line.trailPoints.push({ ...newPosition });
    if (line.trailPoints.length > this.TRAIL_MAX_LENGTH) {
      line.trailPoints = line.trailPoints.slice(-this.TRAIL_MAX_LENGTH);
    }

    // Check boundary bounce
    if ((line.state === 'in_center' || line.state === 'transitioning') && this.isNearBoundary(newPosition, 20)) {
      this.handleBoundaryBounce(line, newPosition);
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

  private handleBoundaryBounce(line: FlyingLine, newPosition: Point) {
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;

    const currentDirection = line.direction || { x: 1, y: 0 };
    const currentDirectionAngle = Math.atan2(currentDirection.y, currentDirection.x);

    const deflectionAngle = (Math.random() - 0.5) * Math.PI * 0.4;
    const gentleDeflectionAngle = currentDirectionAngle + deflectionAngle;

    const deflectionDistance = 35 + Math.random() * 25;
    const inwardBias = 10 + Math.random() * 15;

    const forwardX = newPosition.x + Math.cos(gentleDeflectionAngle) * deflectionDistance;
    const forwardY = newPosition.y + Math.sin(gentleDeflectionAngle) * deflectionDistance;

    const toCenterAngle = Math.atan2(centerY - newPosition.y, centerX - newPosition.x);
    const deflectionTarget = {
      x: forwardX + Math.cos(toCenterAngle) * inwardBias,
      y: forwardY + Math.sin(toCenterAngle) * inwardBias,
    };

    const distanceFromCenter = Math.sqrt((deflectionTarget.x - centerX) ** 2 + (deflectionTarget.y - centerY) ** 2);
    if (distanceFromCenter > this.CIRCLE_RADIUS - 30) {
      const targetAngle = Math.atan2(deflectionTarget.y - centerY, deflectionTarget.x - centerX);
      const safeRadius = this.CIRCLE_RADIUS - 35;
      deflectionTarget.x = centerX + Math.cos(targetAngle) * safeRadius;
      deflectionTarget.y = centerY + Math.sin(targetAngle) * safeRadius;
    }

    const gentleCurvature = 0.15 + Math.random() * 0.15;
    const deflectionPath = this.generatePathSegment(newPosition, deflectionTarget, gentleCurvature);
    line.path = [deflectionPath];
    line.currentPathIndex = 0;
    line.progress = 0;
    line.bounceCount++;
  }

  private interpolateBezierPoint(segment: PathSegment, t: number): Point {
    const { start, end, controlPoints } = segment;

    if (controlPoints.length === 1) {
      const cp = controlPoints[0];
      const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cp.x + t * t * end.x;
      const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cp.y + t * t * end.y;
      return { x, y };
    } else if (controlPoints.length === 2) {
      const cp1 = controlPoints[0];
      const cp2 = controlPoints[1];
      const x = (1 - t) * (1 - t) * (1 - t) * start.x + 3 * (1 - t) * (1 - t) * t * cp1.x + 3 * (1 - t) * t * t * cp2.x + t * t * t * end.x;
      const y = (1 - t) * (1 - t) * (1 - t) * start.y + 3 * (1 - t) * (1 - t) * t * cp1.y + 3 * (1 - t) * t * t * cp2.y + t * t * t * end.y;
      return { x, y };
    }

    const x = start.x + t * (end.x - start.x);
    const y = start.y + t * (end.y - start.y);
    return { x, y };
  }

  private calculateBezierDirection(segment: PathSegment, t: number): Point {
    const { start, end, controlPoints } = segment;
    let dx = 0, dy = 0;

    if (controlPoints.length === 1) {
      const cp = controlPoints[0];
      dx = 2 * (1 - t) * (cp.x - start.x) + 2 * t * (end.x - cp.x);
      dy = 2 * (1 - t) * (cp.y - start.y) + 2 * t * (end.y - cp.y);
    } else if (controlPoints.length === 2) {
      const cp1 = controlPoints[0];
      const cp2 = controlPoints[1];
      dx = 3 * (1 - t) * (1 - t) * (cp1.x - start.x) + 6 * (1 - t) * t * (cp2.x - cp1.x) + 3 * t * t * (end.x - cp2.x);
      dy = 3 * (1 - t) * (1 - t) * (cp1.y - start.y) + 6 * (1 - t) * t * (cp2.y - cp1.y) + 3 * t * t * (end.y - cp2.y);
    } else {
      dx = end.x - start.x;
      dy = end.y - start.y;
    }

    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
  }

  private handleLineStateTransition(line: FlyingLine) {
    if (line.state === 'entering' && this.isInsideCircle(line.currentPosition)) {
      if (this.state.centerLines.length >= this.MAX_CENTER_LINES) {
        const linesToRemove = Math.min(3, this.state.centerLines.length);
        for (let i = 0; i < linesToRemove; i++) {
          const oldestLine = this.state.centerLines.shift();
          if (oldestLine) {
            this.fadeOutLine(oldestLine);
          }
        }
      }

      line.state = 'transitioning';
      line.transitionStartTime = Date.now();
      this.state.centerLines.push(line);
      this.generateTransitionPath(line);
    } else if (line.state === 'transitioning') {
      const transitionDuration = 2000;
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
      return;
    } else if (line.state === 'entering') {
      const centerX = this.state.dimensions.width / 2;
      const centerY = this.state.dimensions.height / 2;
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

  private generateTransitionPath(line: FlyingLine) {
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;
    const currentPos = line.currentPosition;

    const transitionDuration = 2000;
    const timeSinceTransition = Date.now() - (line.transitionStartTime || Date.now());
    const transitionProgress = Math.min(timeSinceTransition / transitionDuration, 1);

    if (!line.originalDirection) {
      line.originalDirection = { ...line.direction };
    }

    const currentAngle = Math.atan2(currentPos.y - centerY, currentPos.x - centerX);
    const currentRadius = Math.sqrt((currentPos.x - centerX) ** 2 + (currentPos.y - centerY) ** 2);

    const originalDirection = line.originalDirection;
    const originalAngle = Math.atan2(originalDirection.y, originalDirection.x);

    const spiralInfluence = transitionProgress;
    const originalInfluence = 1 - transitionProgress;

    const originalTargetDistance = 60 + Math.random() * 40;
    const originalTargetX = currentPos.x + Math.cos(originalAngle) * originalTargetDistance;
    const originalTargetY = currentPos.y + Math.sin(originalAngle) * originalTargetDistance;

    const spiralAngleOffset = (Math.random() - 0.5) * Math.PI * 0.6;
    const spiralAngle = currentAngle + spiralAngleOffset;
    const spiralRadius = Math.max(25, currentRadius - 10 - Math.random() * 20);
    const spiralTargetX = centerX + Math.cos(spiralAngle) * spiralRadius;
    const spiralTargetY = centerY + Math.sin(spiralAngle) * spiralRadius;

    const targetPoint = {
      x: originalTargetX * originalInfluence + spiralTargetX * spiralInfluence,
      y: originalTargetY * originalInfluence + spiralTargetY * spiralInfluence,
    };

    const targetDistanceFromCenter = Math.sqrt((targetPoint.x - centerX) ** 2 + (targetPoint.y - centerY) ** 2);
    if (targetDistanceFromCenter > this.CIRCLE_RADIUS - 30) {
      const targetAngle = Math.atan2(targetPoint.y - centerY, targetPoint.x - centerX);
      const safeRadius = this.CIRCLE_RADIUS - 30;
      targetPoint.x = centerX + Math.cos(targetAngle) * safeRadius;
      targetPoint.y = centerY + Math.sin(targetAngle) * safeRadius;
    }

    const curvature = 0.2 + transitionProgress * 0.4;

    const segment = this.generatePathSegment(currentPos, targetPoint, curvature);
    line.path = [segment];
    line.currentPathIndex = 0;
    line.progress = 0;
  }

  private fadeOutLine(line: FlyingLine) {
    line.state = 'fading_out';
    self.postMessage({
      type: 'fadeOutLine',
      data: { id: line.id },
    });
  }

  private isInsideCircle(point: Point): boolean {
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;
    const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
    return distance <= this.CIRCLE_RADIUS;
  }

  private isNearBoundary(point: Point, threshold = 10): boolean {
    const centerX = this.state.dimensions.width / 2;
    const centerY = this.state.dimensions.height / 2;
    const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
    return Math.abs(distance - this.CIRCLE_RADIUS) <= threshold;
  }

  private enforceLimits() {
    if (this.state.lines.length > this.MAX_LINES) {
      const excessLines = this.state.lines.splice(0, this.state.lines.length - this.MAX_LINES);
      excessLines.forEach(line => this.removeLine(line));
    }

    if (this.state.centerLines.length > this.MAX_CENTER_LINES) {
      const excessCenterLines = this.state.centerLines.splice(0, this.state.centerLines.length - this.MAX_CENTER_LINES);
      excessCenterLines.forEach(line => this.removeLine(line));
    }
  }

  private removeLine(line: FlyingLine) {
    const lineIndex = this.state.lines.indexOf(line);
    if (lineIndex > -1) {
      this.state.lines.splice(lineIndex, 1);
    }

    const centerIndex = this.state.centerLines.indexOf(line);
    if (centerIndex > -1) {
      this.state.centerLines.splice(centerIndex, 1);
    }

    self.postMessage({
      type: 'removeLine',
      data: { id: line.id },
    });
  }
}

// Initialize worker
new AnimationWorker();
