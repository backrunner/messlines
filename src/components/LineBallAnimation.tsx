import { useEffect, useRef, useState } from 'react';
import type { AudioTrack } from '../constants/playlist';
import { PlayState } from '../constants/playlist';

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
  progress: number; // 0-1 along current path segment
  currentPosition: Point;
  direction: Point; // normalized direction vector
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

interface LineBallAnimationProps {
  currentTrack?: AudioTrack | null;
  currentTrackIndex?: number;
  playState?: PlayState;
  isAnimationPaused?: boolean;
}

const LineBallAnimation = ({ currentTrack, currentTrackIndex = 0, playState = PlayState.STOPPED, isAnimationPaused = false }: LineBallAnimationProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const linesRef = useRef<FlyingLine[]>([]);
  const centerLinesRef = useRef<FlyingLine[]>([]); // Lines in the center ball
  const animationFrameRef = useRef<number | null>(null);
  const circleRef = useRef<SVGCircleElement | null>(null);
  const lineIdCounter = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [circleVisible, setCircleVisible] = useState(false);
  const [circleScale, setCircleScale] = useState(1);
  const [gradientOffset, setGradientOffset] = useState(40); // Dynamic gradient position (20%-60% range)
  const [zeroStates, setZeroStates] = useState<{ [key: string]: { isOutline: boolean; opacity: number } }>({}); // Fixed states for zeros
  const [numbersVisible, setNumbersVisible] = useState(false); // Control numbers visibility based on music playback
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const zeroGridRef = useRef<{ [key: string]: { isOutline: boolean; opacity: number } }>({}); // Persistent zero grid
  const isPausedRef = useRef(isAnimationPaused);

  // Sync isAnimationPaused prop with a ref to avoid stale closures in the animation loop
  useEffect(() => {
    isPausedRef.current = isAnimationPaused;

    // When resuming the animation, reset the last update time for all lines to prevent jumping
    if (!isAnimationPaused) {
      const now = Date.now();
      linesRef.current.forEach((line) => {
        line.lastUpdateTime = now;
      });
    }
  }, [isAnimationPaused]);

  // Animation constants
  const CIRCLE_RADIUS = 120; // Standard circle radius for center
  const MAX_LINES = 80; // Increased for dense effect like image
  const MAX_CENTER_LINES = 50; // Higher density for image-like effect
  const MIN_FLYING_LINES = 8; // More flying-in lines
  const MAX_FLYING_LINES = 15; // More maximum flying-in lines
  const CORE_RADIUS = 25; // Dense core area
  const MID_RADIUS = 70; // Medium density area
  const OUTER_RADIUS = 120; // Outer flowing area
  const MIN_THICKNESS = 0.8;
  const MAX_THICKNESS = 4.0;
  const MIN_LENGTH = 30;
  const MAX_LENGTH = 80;
  const TRAIL_MAX_LENGTH = 500; // Much longer trails for dense image-like effect
  const LINE_SPAWN_INTERVAL = 200; // Regular interval for uniform spawning

  // Generate random point outside viewport
  const generateOutsidePoint = (): Point => {
    const side = Math.floor(Math.random() * 4);
    const { width, height } = dimensionsRef.current;
    const buffer = 150;

    switch (side) {
      case 0:
        return { x: Math.random() * width, y: -buffer };
      case 1:
        return { x: width + buffer, y: Math.random() * height };
      case 2:
        return { x: Math.random() * width, y: height + buffer };
      default:
        return { x: -buffer, y: Math.random() * height };
    }
  };

  // Generate artistic spiral path (elliptical spiral with continuous arc)
  const generateMessyPath = (start: Point, end: Point, segments = 1): PathSegment[] => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;

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
  };

  // Generate curved path segment from start to end (ultra-smooth continuous arcs)
  const generatePathSegment = (start: Point, end: Point, curvature = 0.4): PathSegment => {
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
  };

  // Check if point is inside circle
  const isInsideCircle = (point: Point): boolean => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;
    const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
    return distance <= CIRCLE_RADIUS;
  };

  // Check if point is near circle boundary (for bounce detection)
  const isNearBoundary = (point: Point, threshold = 10): boolean => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;
    const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
    return Math.abs(distance - CIRCLE_RADIUS) <= threshold;
  };

  // Calculate bounce reflection off circle boundary
  const calculateBouncePoint = (position: Point, direction: Point): Point => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;

    // Calculate normal vector at collision point
    const normalX = (position.x - centerX) / CIRCLE_RADIUS;
    const normalY = (position.y - centerY) / CIRCLE_RADIUS;

    // Calculate reflection: reflected = incident - 2 * (incident · normal) * normal
    const dotProduct = direction.x * normalX + direction.y * normalY;
    const reflectedX = direction.x - 2 * dotProduct * normalX;
    const reflectedY = direction.y - 2 * dotProduct * normalY;

    // Add some randomization to make bounces more interesting
    const randomAngle = (Math.random() - 0.5) * 0.3;
    const cos = Math.cos(randomAngle);
    const sin = Math.sin(randomAngle);
    const finalX = reflectedX * cos - reflectedY * sin;
    const finalY = reflectedX * sin + reflectedY * cos;

    // Calculate new position (bounce well inward to ensure staying within circle)
    const bounceDistance = CIRCLE_RADIUS * (0.5 + Math.random() * 0.3); // Reduced from 0.6-0.9 to 0.5-0.8
    return {
      x: centerX + finalX * bounceDistance,
      y: centerY + finalY * bounceDistance,
    };
  };

  // Generate random point inside circle for bouncing
  const generateRandomCirclePoint = (): Point => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * (CIRCLE_RADIUS - 30) + 20;

    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
    };
  };

  // Interpolate point along Bezier curve
  const interpolateBezierPoint = (segment: PathSegment, t: number): Point => {
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
  };

  // Calculate direction vector at point along Bezier curve
  const calculateBezierDirection = (segment: PathSegment, t: number): Point => {
    const { start, end, controlPoints } = segment;
    let dx = 0,
      dy = 0;

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
  };

  // Update trail for a flying line with gradient effect
  const updateTrail = (line: FlyingLine, newPosition: Point) => {
    line.trailPoints.push({ ...newPosition });

    // Keep trail within reasonable length
    if (line.trailPoints.length > TRAIL_MAX_LENGTH) {
      line.trailPoints = line.trailPoints.slice(-TRAIL_MAX_LENGTH);
    }

    // Update trail element with gradient
    if (line.trailElement && line.trailPoints.length > 1) {
      const trailPath = line.trailPoints.reduce((path, point, i) => (i === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`), '');
      line.trailElement.setAttribute('d', trailPath);

      // Create gradient definition if it doesn't exist
      if (!line.trailElement.getAttribute('stroke')) {
        // Create a valid CSS identifier
        const gradientId = `gradient-${line.id}`;
        const defs = svgRef.current?.querySelector('defs');
        if (defs && !defs.querySelector(`#${gradientId}`)) {
          const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
          gradient.setAttribute('id', gradientId);
          gradient.setAttribute('x1', '0%');
          gradient.setAttribute('y1', '0%');
          gradient.setAttribute('x2', '100%');
          gradient.setAttribute('y2', '0%');

          const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          stop1.setAttribute('offset', '0%');
          stop1.setAttribute('stop-color', '#ccc'); // Light gray head
          stop1.setAttribute('stop-opacity', '0.9');

          const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          stop2.setAttribute('offset', '100%');
          stop2.setAttribute('stop-color', '#333'); // Dark gray tail
          stop2.setAttribute('stop-opacity', '0.02'); // Much slower fade for longer trail visibility

          gradient.appendChild(stop1);
          gradient.appendChild(stop2);
          defs.appendChild(gradient);
        }

        line.trailElement.setAttribute('stroke', `url(#${gradientId})`);
        line.trailElement.setAttribute('stroke-width', line.thickness.toString());
        line.trailElement.setAttribute('fill', 'none');
        line.trailElement.setAttribute('stroke-linecap', 'round');
        line.trailElement.setAttribute('stroke-linejoin', 'round');
      }
    }
  };

  // Create new flying line with high variety
  const createFlyingLine = (startPoint: Point, targetPoint: Point): FlyingLine => {
    // High variety in line properties
    const thickness = MIN_THICKNESS + Math.random() * (MAX_THICKNESS - MIN_THICKNESS);
    const length = MIN_LENGTH + Math.random() * (MAX_LENGTH - MIN_LENGTH);
    const speed = 0.0015; // Slower uniform speed for all lines

    // Generate single continuous arc path for smooth curves
    const messyPaths = generateMessyPath(startPoint, targetPoint, 1);

    lineIdCounter.current++;
    const line: FlyingLine = {
      id: lineIdCounter.current,
      thickness,
      length,
      path: messyPaths,
      currentPathIndex: 0,
      progress: 0,
      currentPosition: { ...startPoint },
      direction: { x: 0, y: 0 },
      element: null,
      trailElement: null,
      trailPoints: [startPoint],
      state: 'entering',
      creationTime: Date.now(),
      lastUpdateTime: Date.now(),
      speed,
      bounceCount: 0,
    };

    return line;
  };

  // Update flying line position and handle state transitions
  const updateFlyingLine = (line: FlyingLine) => {
    const now = Date.now();
    const deltaTime = now - line.lastUpdateTime;
    line.lastUpdateTime = now;

    if (line.currentPathIndex >= line.path.length) {
      return; // Path completed
    }

    const currentSegment = line.path[line.currentPathIndex];

    // Update progress along current path segment
    line.progress += line.speed * deltaTime;
    if (line.progress >= 1.0) {
      line.progress = 1.0;
    }

    // Calculate new position and direction
    const newPosition = interpolateBezierPoint(currentSegment, line.progress);
    const newDirection = calculateBezierDirection(currentSegment, line.progress);

    line.currentPosition = newPosition;
    line.direction = newDirection;

    // No line element to update - we're only using gradient trails

    // Update trail
    updateTrail(line, newPosition);

    // Handle state transitions
    if (line.progress >= 1.0) {
      // Move to next path segment or change state
      line.currentPathIndex++;
      line.progress = 0;

      if (line.currentPathIndex >= line.path.length) {
        // Path completed - handle state transitions
        if (line.state === 'entering' && isInsideCircle(newPosition)) {
          // Check if center ball has space
          if (centerLinesRef.current.length >= MAX_CENTER_LINES) {
            // Center full - remove oldest lines to make space
            const linesToRemove = Math.min(3, centerLinesRef.current.length);
            for (let i = 0; i < linesToRemove; i++) {
              const oldestLine = centerLinesRef.current.shift();
              if (oldestLine) {
                fadeOutLine(oldestLine);
              }
            }
          }

          // Change state but continue with original path direction
          line.state = 'transitioning';
          line.transitionStartTime = Date.now();
          centerLinesRef.current.push(line);

          // Generate a transition path that gradually curves toward spiral behavior
          generateTransitionPath(line);
        } else if (line.state === 'transitioning') {
          // Check if transition period is complete
          const transitionDuration = 2000; // 2 seconds transition
          const timeSinceTransition = Date.now() - (line.transitionStartTime || 0);

          if (timeSinceTransition >= transitionDuration) {
            line.state = 'in_center';
            generateBouncingPath(line);
          } else {
            generateTransitionPath(line);
          }
        } else if (line.state === 'in_center') {
          generateBouncingPath(line);
        } else if (line.state === 'fading_out') {
          // Line is fading out, don't generate new path
          return;
        } else if (line.state === 'entering') {
          // Continue original entering path
          const centerX = dimensionsRef.current.width / 2;
          const centerY = dimensionsRef.current.height / 2;
          const targetPoint = {
            x: centerX + (Math.random() - 0.5) * CIRCLE_RADIUS * 0.8,
            y: centerY + (Math.random() - 0.5) * CIRCLE_RADIUS * 0.8,
          };
          const segment = generatePathSegment(newPosition, targetPoint, 0.3);
          line.path.push(segment);
        }
      }
    } else if ((line.state === 'in_center' || line.state === 'transitioning') && isNearBoundary(newPosition, 20)) {
      // Increased threshold for earlier detection
      // Hit boundary - create gentle deflection instead of sharp bounce
      const centerX = dimensionsRef.current.width / 2;
      const centerY = dimensionsRef.current.height / 2;

      // Calculate current movement direction
      const currentDirection = line.direction || { x: 1, y: 0 };
      const currentDirectionAngle = Math.atan2(currentDirection.y, currentDirection.x);

      // Create gentle deflection that maintains flow direction
      const deflectionAngle = (Math.random() - 0.5) * Math.PI * 0.4; // Smaller deflection angle
      const gentleDeflectionAngle = currentDirectionAngle + deflectionAngle;

      // Calculate safe target that curves gently inward
      const deflectionDistance = 35 + Math.random() * 25; // 35-60px forward
      const inwardBias = 10 + Math.random() * 15; // 10-25px inward bias

      // Target point that continues forward but curves slightly inward
      const forwardX = newPosition.x + Math.cos(gentleDeflectionAngle) * deflectionDistance;
      const forwardY = newPosition.y + Math.sin(gentleDeflectionAngle) * deflectionDistance;

      // Add inward bias toward center
      const toCenterAngle = Math.atan2(centerY - newPosition.y, centerX - newPosition.x);
      const deflectionTarget = {
        x: forwardX + Math.cos(toCenterAngle) * inwardBias,
        y: forwardY + Math.sin(toCenterAngle) * inwardBias,
      };

      // Ensure target is within safe bounds
      const distanceFromCenter = Math.sqrt((deflectionTarget.x - centerX) ** 2 + (deflectionTarget.y - centerY) ** 2);
      if (distanceFromCenter > CIRCLE_RADIUS - 30) {
        // Project to safe position while maintaining general direction
        const targetAngle = Math.atan2(deflectionTarget.y - centerY, deflectionTarget.x - centerX);
        const safeRadius = CIRCLE_RADIUS - 35;
        deflectionTarget.x = centerX + Math.cos(targetAngle) * safeRadius;
        deflectionTarget.y = centerY + Math.sin(targetAngle) * safeRadius;
      }

      // Create very gentle arc for smooth deflection
      const gentleCurvature = 0.15 + Math.random() * 0.15; // Very gentle curves (0.15-0.3)
      const deflectionPath = generatePathSegment(newPosition, deflectionTarget, gentleCurvature);
      line.path.push(deflectionPath);
      line.bounceCount++;
    }
  };

  // Generate smooth continuous spiral path inside circle
  const generateBouncingPath = (line: FlyingLine) => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;
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
    const targetRadius = Math.max(25, Math.min(currentRadius + spiralRadiusVariation, CIRCLE_RADIUS - 35));

    // Calculate target point using blended angle
    const preliminaryTarget = {
      x: currentPos.x + Math.cos(blendedAngle) * forwardDistance,
      y: currentPos.y + Math.sin(blendedAngle) * forwardDistance,
    };

    // Adjust target to stay within circle if needed
    const targetDistFromCenter = Math.sqrt((preliminaryTarget.x - centerX) ** 2 + (preliminaryTarget.y - centerY) ** 2);

    let targetPoint: Point;
    if (targetDistFromCenter > CIRCLE_RADIUS - 30) {
      // Project target onto safe circle boundary
      const targetAngle = Math.atan2(preliminaryTarget.y - centerY, preliminaryTarget.x - centerX);
      const safeRadius = Math.min(targetRadius, CIRCLE_RADIUS - 35);
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
    const segment = generatePathSegment(currentPos, targetPoint, curvature);
    line.path.push(segment);
  };

  // Generate transition path from original direction to spiral movement
  const generateTransitionPath = (line: FlyingLine) => {
    const centerX = dimensionsRef.current.width / 2;
    const centerY = dimensionsRef.current.height / 2;
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
    if (targetDistanceFromCenter > CIRCLE_RADIUS - 30) {
      const targetAngle = Math.atan2(targetPoint.y - centerY, targetPoint.x - centerX);
      const safeRadius = CIRCLE_RADIUS - 30;
      targetPoint.x = centerX + Math.cos(targetAngle) * safeRadius;
      targetPoint.y = centerY + Math.sin(targetAngle) * safeRadius;
    }

    // Use varying curvature - more curved as transition progresses
    const curvature = 0.2 + transitionProgress * 0.4; // 0.2 to 0.6

    const segment = generatePathSegment(currentPos, targetPoint, curvature);
    line.path.push(segment);
  };

  // Fade out a line directly
  const fadeOutLine = (line: FlyingLine) => {
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
          const lineIndex = linesRef.current.indexOf(line);
          if (lineIndex > -1) {
            linesRef.current.splice(lineIndex, 1);
          }
          // Clean up SVG element
          if (line.trailElement) {
            line.trailElement.remove();
          }
        });
    }
  };

  // Handle music playback state changes for numbers visibility
  useEffect(() => {
    if (playState === PlayState.PLAYING) {
      // 音乐开始播放时，延迟淡入数字
      const fadeInTimer = setTimeout(() => {
        setNumbersVisible(true);
      }, 500); // 0.5秒延迟淡入

      return () => clearTimeout(fadeInTimer);
    } else {
      // 音乐停止或暂停时，立即开始淡出
      setNumbersVisible(false);
    }
  }, [playState]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const newDimensions = { width: window.innerWidth, height: window.innerHeight };
      setDimensions(newDimensions);
      dimensionsRef.current = newDimensions;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize SVG elements and start animation loop
  useEffect(() => {
    if (!dimensions.width || !dimensions.height || !svgRef.current) return;

    const svg = svgRef.current;

    // Clear existing content except circle
    const existingCircle = svg.querySelector('circle');
    const children = Array.from(svg.children);
    children.forEach((child) => {
      if (child.tagName !== 'circle') {
        svg.removeChild(child);
      }
    });

    // If circle doesn't exist, create it
    let circle;
    if (existingCircle) {
      circle = existingCircle;
      circleRef.current = circle;
    } else {
      circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      svg.appendChild(circle);
    }

    // Add defs for filters
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'trailBlur');
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '0.5');
    filter.appendChild(blur);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Create invisible circle for boundary detection (no stroke)
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    circle.setAttribute('cx', centerX.toString());
    circle.setAttribute('cy', centerY.toString());
    circle.setAttribute('r', CIRCLE_RADIUS.toString());
    circle.setAttribute('stroke', 'none'); // No stroke - invisible
    circle.setAttribute('fill', 'none');
    circle.setAttribute('opacity', '0'); // Invisible circle for boundary detection
    circleRef.current = circle;

    // Add circle for boundary detection but don't show it
    svg.appendChild(circle);

    // Don't clear existing lines - only replan unfinished paths
    // Replan paths for lines that haven't reached the circle yet
    linesRef.current.forEach((line) => {
      if (line.state === 'entering') {
        // Recalculate target point based on new dimensions
        const centerX = dimensions.width / 2;
        const centerY = dimensions.height / 2;
        const targetAngle = Math.random() * Math.PI * 2;
        const targetRadius = CIRCLE_RADIUS * (0.5 + Math.random() * 0.4);
        const newTargetPoint = {
          x: centerX + Math.cos(targetAngle) * targetRadius,
          y: centerY + Math.sin(targetAngle) * targetRadius,
        };

        // Generate new path from current position to new target
        const numSegments = 2 + Math.floor(Math.random() * 3);
        const newPaths = generateMessyPath(line.currentPosition, newTargetPoint, numSegments);
        line.path = [newPaths[0]]; // Use first segment, others will be generated dynamically
        line.currentPathIndex = 0;
        line.progress = 0;
      } else if (line.state === 'in_center') {
        // Replan bouncing path with new dimensions
        generateBouncingPath(line);
      }
      // Note: fading_out lines will be automatically removed by the fadeOutLine function
    });

    // Update center lines array to match current lines (exclude fading out)
    centerLinesRef.current = linesRef.current.filter((line) => line.state === 'in_center');

    // Ensure center lines stay within new circle bounds (skip fading out lines)
    centerLinesRef.current.forEach((line) => {
      if (line.state === 'fading_out') return; // Skip lines that are fading out

      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      const distanceFromCenter = Math.sqrt((line.currentPosition.x - centerX) ** 2 + (line.currentPosition.y - centerY) ** 2);

      // If line is outside new circle bounds, move it inside
      if (distanceFromCenter >= CIRCLE_RADIUS - 10) {
        const angle = Math.atan2(line.currentPosition.y - centerY, line.currentPosition.x - centerX);
        const safeRadius = CIRCLE_RADIUS * 0.7;
        line.currentPosition = {
          x: centerX + Math.cos(angle) * safeRadius,
          y: centerY + Math.sin(angle) * safeRadius,
        };
        // Generate new bouncing path
        generateBouncingPath(line);
      }
    });

    // Start individual line spawning with performance control
    const spawnLine = () => {
      // Count currently flying-in lines (entering state)
      const flyingInLines = linesRef.current.filter((line) => line.state === 'entering').length;
      const totalLines = linesRef.current.length;
      const centerLines = centerLinesRef.current.length;

      // Performance protection: strict line limit enforcement
      if (flyingInLines >= MAX_FLYING_LINES) return;

      // If approaching total limit, proactively remove center lines
      if (totalLines >= MAX_LINES) {
        const linesToRemove = Math.min(3, centerLines); // Remove up to 3 lines at once
        for (let i = 0; i < linesToRemove; i++) {
          const oldestLine = centerLinesRef.current.shift();
          if (oldestLine) {
            fadeOutLine(oldestLine);
          }
        }
        return; // Don't spawn new line this cycle, let removal complete first
      }

      const startPoint = generateOutsidePoint();
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      // Create target point near circle
      const targetAngle = Math.random() * Math.PI * 2;
      const targetRadius = CIRCLE_RADIUS * (0.5 + Math.random() * 0.4);
      const targetPoint = {
        x: centerX + Math.cos(targetAngle) * targetRadius,
        y: centerY + Math.sin(targetAngle) * targetRadius,
      };

      const flyingLine = createFlyingLine(startPoint, targetPoint);

      // Create SVG elements (only trail)
      const trailElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(trailElement);

      flyingLine.trailElement = trailElement;

      linesRef.current.push(flyingLine);
    };

    // Spawn initial lines uniformly over time (not in batches)
    const initialSpawnCount = MAX_FLYING_LINES;
    for (let i = 0; i < initialSpawnCount; i++) {
      setTimeout(() => spawnLine(), i * LINE_SPAWN_INTERVAL);
    }

    // Set up performance-aware spawning with strict line count control
    const spawnInterval = setInterval(() => {
      const flyingInLines = linesRef.current.filter((line) => line.state === 'entering').length;
      const totalLines = linesRef.current.length;
      const centerLines = centerLinesRef.current.length;

      // Performance protection: enforce strict limits
      if (totalLines >= MAX_LINES) {
        // Remove excess center lines if over limit
        const excessLines = Math.min(2, centerLines);
        for (let i = 0; i < excessLines; i++) {
          const oldestLine = centerLinesRef.current.shift();
          if (oldestLine) {
            fadeOutLine(oldestLine);
          }
        }
        return; // Skip spawning this cycle
      }

      // Only spawn if we have room and need more flying lines
      if (flyingInLines < MAX_FLYING_LINES && totalLines < MAX_LINES - 2) {
        spawnLine();
      }
    }, LINE_SPAWN_INTERVAL);

    // Animation loop
    const animate = () => {
      // Use the ref to check the current pause state, avoiding the stale closure issue
      if (isPausedRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const now = Date.now();

      // Update breathing gradient effect
      const breathingSpeed = 0.0005; // Much slower breathing
      const breathingAmplitude = 20; // Amplitude of gradient movement (20%)
      const breathing = Math.sin(now * breathingSpeed) * breathingAmplitude;
      const newGradientOffset = 40 + breathing; // Base 40% ± 20% (20% to 60%)
      setGradientOffset(newGradientOffset);

      // Slowly and randomly change zeros between outline/filled (every 8 seconds)
      if (now % 8000 < 16) {
        // Every 8 seconds
        const allKeys = Object.keys(zeroGridRef.current);
        if (allKeys.length > 0) {
          const changeCount = Math.floor(Math.random() * 8) + 3; // 3-10 zeros change at once
          const keysToChange: string[] = [];

          for (let i = 0; i < changeCount && i < allKeys.length; i++) {
            let randomKey;
            do {
              randomKey = allKeys[Math.floor(Math.random() * allKeys.length)];
            } while (keysToChange.includes(randomKey));
            keysToChange.push(randomKey);
          }

          keysToChange.forEach((key) => {
            zeroGridRef.current[key].isOutline = !zeroGridRef.current[key].isOutline;
          });

          setZeroStates({ ...zeroGridRef.current });
        }
      }

      // Random fade in/out effect (every 3 seconds)
      if (now % 3000 < 16) {
        // Every 3 seconds
        const allKeys = Object.keys(zeroGridRef.current);
        if (allKeys.length > 0) {
          const fadeCount = Math.floor(Math.random() * 12) + 5; // 5-16 zeros fade
          const keysToFade: string[] = [];

          for (let i = 0; i < fadeCount && i < allKeys.length; i++) {
            let randomKey;
            do {
              randomKey = allKeys[Math.floor(Math.random() * allKeys.length)];
            } while (keysToFade.includes(randomKey));
            keysToFade.push(randomKey);
          }

          keysToFade.forEach((key) => {
            const currentOpacity = zeroGridRef.current[key].opacity;
            // Toggle between visible (0.3) and nearly invisible (0.05)
            zeroGridRef.current[key].opacity = currentOpacity > 0.15 ? 0.05 : 0.3;
          });

          setZeroStates({ ...zeroGridRef.current });
        }
      }

      // No circle breathing effect needed since circle is invisible

      // Performance monitoring and line management
      const totalLines = linesRef.current.length;
      const centerLines = centerLinesRef.current.length;

      // Emergency cleanup if lines exceed limits (performance protection)
      if (totalLines > MAX_LINES + 5) {
        console.warn(`Line count exceeded limit: ${totalLines}/${MAX_LINES}`);
        const excessLines = Math.min(5, centerLines);
        for (let i = 0; i < excessLines; i++) {
          const oldestLine = centerLinesRef.current.shift();
          if (oldestLine) {
            fadeOutLine(oldestLine);
          }
        }
      }

      // Update all lines
      linesRef.current.forEach((line) => {
        updateFlyingLine(line);
      });

      // Update center lines array to include transitioning and center lines
      centerLinesRef.current = linesRef.current.filter((line) => line.state === 'in_center' || line.state === 'transitioning');

      // Enforce center line limit
      if (centerLinesRef.current.length > MAX_CENTER_LINES) {
        const excess = centerLinesRef.current.length - MAX_CENTER_LINES;
        for (let i = 0; i < excess; i++) {
          const oldestLine = centerLinesRef.current.shift();
          if (oldestLine) {
            fadeOutLine(oldestLine);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      clearInterval(spawnInterval);
    };
  }, [dimensions.width, dimensions.height]);

  // Generate background zeros pattern with overflow and fixed states
  const generateBackgroundZeros = () => {
    const zeros = [];
    const { width, height } = dimensions;
    const fontSize = 120; // Super large font size
    const spacing = fontSize * 0.8; // Spacing between zeros
    const overflow = fontSize; // Overflow distance for full coverage

    // Calculate grid with overflow in all directions
    const startX = -overflow;
    const endX = width + overflow;
    const startY = -overflow;
    const endY = height + overflow;

    const cols = Math.ceil((endX - startX) / spacing);
    const rows = Math.ceil((endY - startY) / spacing);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * spacing;
        const y = startY + row * spacing;
        const zeroKey = `${row}-${col}`;

        // Initialize persistent state if not exists
        if (!(zeroKey in zeroGridRef.current)) {
          zeroGridRef.current[zeroKey] = {
            isOutline: Math.random() < 0.5,
            opacity: 0.3,
          };
        }

        const zeroState = zeroStates[zeroKey] || zeroGridRef.current[zeroKey];

        // Calculate gradient-following color based on vertical position
        const normalizedY = (y - startY) / (endY - startY); // 0 (top) to 1 (bottom)
        const gradientPosition = normalizedY; // 0 at top, 1 at bottom

        // Interpolate color based on gradient position
        // Bottom: lighter gray (#333), Top: darker gray (#111)
        const bottomGray = 0x33; // #333
        const topGray = 0x11; // #111
        const grayValue = Math.round(topGray + (bottomGray - topGray) * gradientPosition);
        const hexGray = grayValue.toString(16).padStart(2, '0');
        const zeroColor = `#${hexGray}${hexGray}${hexGray}`;

        // 显示当前播放音频的序号，如果没有音频则显示0
        const displayNumber = currentTrack ? currentTrackIndex.toString() : '0';

        // 根据音乐播放状态和 numbersVisible 来计算最终透明度
        const finalOpacity = numbersVisible ? zeroState.opacity : 0;

        zeros.push(
          <div
            key={`zero-${zeroKey}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              fontSize: `${fontSize}px`,
              fontFamily: 'Arial Black, sans-serif',
              fontWeight: 900,
              color: zeroState.isOutline ? 'transparent' : zeroColor,
              WebkitTextStroke: zeroState.isOutline ? `2px ${zeroColor}` : 'none',
              userSelect: 'none',
              pointerEvents: 'none',
              opacity: finalOpacity,
              zIndex: 1,
              transition: 'color 1.5s ease-in-out, -webkit-text-stroke 1.5s ease-in-out, opacity 1.2s ease-in-out',
            }}
          >
            {displayNumber}
          </div>
        );
      }
    }

    return zeros;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: `linear-gradient(to top, #0a0a0a ${gradientOffset}%, #000000)`, // Deeper dynamic breathing gradient
        overflow: 'hidden',
      }}
    >
      {/* Background zeros pattern */}
      {dimensions.width && dimensions.height && generateBackgroundZeros()}

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          display: 'block',
          position: 'relative',
          zIndex: 2,
        }}
      />
    </div>
  );
};

export default LineBallAnimation;
