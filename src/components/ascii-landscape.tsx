"use client";

import { useEffect, useRef } from "react";

// Bart Simpson — body (shared across all frames)
const BART_BODY = [
  "    |\\/\\  ,.              ",
  "    /   `' |,-,           ",
  "   /         /_           ",
  " _/            /          ",
  "(.-,--.       /           ",
  "/o/  o \\     /            ",
  "\\_\\    /   _/             ",
  "(__`--'    _)             ",
  " /         |              ",
  "(_____,'    \\             ",
  "   \\_       _\\_           ",
  "     `._..-'   `._        ",
  "      /       ,'  `.      ",
  "    .'|      /      \\     ",
  "    |_|      |      |     ",
  "     ||      |______|     ",
  "     |/        |   |\\     ",
  "     /         |   | \\    ",
  "    /          |   |  \\   ",
  "    `.         |   |   \\  ",
  "    ( `-.._____|   |---i  ",
  "     `.       _|   |  /   ",
  "       |     (_     \\ |   ",
  "       |    |  | | |_)|   ",
];

const BART_LEGS_1 = [
  "       `-+--f--`-^-'--'  ",
  "         |  |   |  |     ",
  "         |  |   |  |     ",
  "      _,(`--'), |  |     ",
  "   .-'   `--'_t(`--'),   ",
  "  /       .-'   `--' |   ",
  "  `-..___/        (_)|   ",
  "         `-.._____..-'   ",
];

const BART_LEGS_2 = [
  "       `-+--f--`-^-'--'  ",
  "         |  |   |  |     ",
  "        /  /     \\  \\    ",
  "      (`--'), _,(`--'),  ",
  "   .-' `--'   `--'_t    ",
  "  /       .-'   .-'     ",
  "  `-..___/   `-(_)|     ",
  "         `-.._____..-'   ",
];

const BART_LEGS_JUMP = [
  "       `-+--f--`-^-'--'  ",
  "         |  |   |  |     ",
  "         |  |   |  |     ",
  "      _,(`--'),(`--'),   ",
  "   .-'  `--'_t `--'     ",
  "  /       .-'    .-'     ",
  "  `-..___/    `-(_)|     ",
  "         `-.._____..-'   ",
];

const BART_RUN_1 = [...BART_BODY, ...BART_LEGS_1];
const BART_RUN_2 = [...BART_BODY, ...BART_LEGS_2];
const BART_JUMP = [...BART_BODY, ...BART_LEGS_JUMP];

// Cactus obstacles
const CACTUS_SMALL = [
  "  |  ",
  " \\|/ ",
  "  |  ",
  "  |  ",
  " _|_ ",
];

const CACTUS_TALL = [
  "  |    ",
  " \\|    ",
  "  |/   ",
  "  |    ",
  " \\|    ",
  "  |    ",
  " _|_   ",
];

const CACTUS_DOUBLE = [
  "  |  |  ",
  " \\|  |/ ",
  "  | \\|  ",
  "  |  |  ",
  " _|_ |  ",
  "     |  ",
  "    _|_ ",
];

// Clouds
const CLOUDS = [
  [
    "     .---.     ",
    "  .-'     '-.  ",
    "-'           '-",
  ],
  [
    "        .____.      ",
    "    .--'      '--.  ",
    " --'              '-",
  ],
  [
    "   .--.    ",
    " .'    '-. ",
    "-'        '-",
  ],
];

// Community thoughts
const THOUGHTS = [
  "{ AI is the future }",
  "< Build together >",
  "[ Innovation starts here ]",
  "// Collaborate & create",
  "/* Join the community */",
  "{ Hack. Learn. Ship. }",
  "< 500+ members strong >",
  "[ Netherlands AI scene ]",
  "// From idea to production",
  "{ Workshop every month }",
  "< Open source first >",
  "[ Deep dives weekly ]",
  "// Code. Connect. Grow.",
  "{ LLMs in production }",
  "< RAG pipelines >",
  "[ Fine-tune everything ]",
  "// AI agents are here",
  "{ Prompt engineering }",
];

interface Cloud {
  x: number;
  y: number;
  speed: number;
  template: string[];
  opacity: number;
}

interface Obstacle {
  x: number;
  template: string[];
  passed: boolean;
}

interface Thought {
  x: number;
  y: number;
  text: string;
  speed: number;
  opacity: number;
}

// Generate mountain height map — one tile that repeats seamlessly
function generateHeightMap(width: number): number[] {
  const TILE = 45;
  const heights: number[] = [];
  // Generate one clean tile, then repeat it for the full width
  const tile: number[] = [];
  for (let x = 0; x < TILE; x++) {
    const t = (x / TILE) * Math.PI * 2;
    const h =
      Math.sin(t) * 5 +
      Math.sin(t * 2 + 1.2) * 4 +
      Math.sin(t * 3) * 2.5 +
      Math.cos(t * 5 + 2.5) * 1.5;
    tile.push(Math.max(10, Math.floor(h + 18)));
  }
  for (let x = 0; x < width; x++) {
    heights.push(tile[x % TILE]!);
  }
  return heights;
}

// Generate mountain landscape as array of strings
function generateMountainLandscape(
  width: number,
  rows: number,
  heights: number[],
): string[] {
  const lines: string[] = [];

  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const h = heights[x]!;
      const surfaceY = rows - h;
      const prevH = heights[((x - 1) + width) % width]!;
      const nextH = heights[(x + 1) % width]!;
      const prevSurfaceY = rows - prevH;
      const nextSurfaceY = rows - nextH;

      const inside = row >= surfaceY;
      const prevInside = row >= prevSurfaceY;
      const nextInside = row >= nextSurfaceY;

      // Dense bottom band — always filled regardless of mountain shape
      const bottomBand = rows - 8;
      if (row >= bottomBand) {
        const bd = row - bottomBand;
        if (bd < 2) {
          const c = ";;;;::;;ii;;:;";
          line += c[(x * 17 + row * 7) % c.length];
        } else if (bd < 4) {
          const c = "iiIIlliiIIlii";
          line += c[(x * 19 + row * 3) % c.length];
        } else if (bd < 6) {
          const c = "IIllTTIIlTTII";
          line += c[(x * 23 + row * 13) % c.length];
        } else {
          const c = "TTTIIITTTlllTT";
          line += c[(x * 29 + row * 11) % c.length];
        }
        continue;
      }

      if (!inside) {
        line += " ";
        continue;
      }

      // Left slope edge
      if (!prevInside) {
        line += "/";
        continue;
      }

      // Right slope edge
      if (!nextInside) {
        line += "\\";
        continue;
      }

      // Interior fill based on depth from surface
      const depth = row - surfaceY;
      const relDepth = depth / Math.max(1, h);

      if (relDepth < 0.1) {
        // Near peak: very sparse, mostly empty with some #
        const v = (x * 7 + row * 13) % 8;
        line += v < 2 ? "#" : " ";
      } else if (relDepth < 0.25) {
        // Upper mountain: sparse hash and slash
        const v = (x * 11 + row * 7) % 7;
        line += v < 1 ? "#" : v < 2 ? "/" : v < 3 ? "\\" : " ";
      } else if (relDepth < 0.4) {
        // Mid mountain: transition to vegetation
        const c = " .  /.. \\. #";
        line += c[(x * 13 + row * 5) % c.length];
      } else if (relDepth < 0.55) {
        // Vegetation starts
        const c = ".::;.,..:.%";
        line += c[(x * 17 + row * 11) % c.length];
      } else if (relDepth < 0.7) {
        // Denser vegetation
        const c = ".:;::;,.;:;";
        line += c[(x * 19 + row * 9) % c.length];
      } else {
        // Dense pre-bottom
        const c = ";;:;i,;;:;ii";
        line += c[(x * 23 + row * 7) % c.length];
      }
    }
    lines.push(line);
  }

  return lines;
}

export function AsciiLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CHAR_H = 12;
    const font = `${CHAR_H - 2}px "Geist Mono", "SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace`;

    // Measure actual character width from the font
    ctx.font = font;
    const CHAR_W = ctx.measureText("M").width || 7;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx!.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    const getWidth = () => canvas.getBoundingClientRect().width;
    const getHeight = () => canvas.getBoundingClientRect().height;
    const getCols = () => Math.ceil(getWidth() / CHAR_W);
    const getRows = () => Math.floor(getHeight() / CHAR_H);

    // Ground position
    const GROUND_Y_RATIO = 0.97;

    // Mountain landscape (static backdrop)
    const LANDSCAPE_ROWS = 26;
    // Generate at least one full tile — the renderer tiles it to fill any screen width
    const initCols = Math.max(getCols() + 40, 90);
    const landscapeHeights = generateHeightMap(initCols);
    const landscapeLines = generateMountainLandscape(
      initCols,
      LANDSCAPE_ROWS,
      landscapeHeights,
    );

    // Bart state — fixed position on the right (clear of heading text)
    const BART_X_RATIO = 0.75;
    let bartY = 0;
    let bartVelocity = 0;
    let isJumping = false;
    let runFrame = 0;
    let frameCount = 0;
    const GRAVITY = 0.06;
    const JUMP_FORCE = -1.2;
    const OBSTACLE_SPEED = 0.6;

    // Obstacles move from right to left towards Bart
    const obstacles: Obstacle[] = [];
    let nextObstacleTimer = 120;
    const obstacleTemplates = [CACTUS_SMALL, CACTUS_TALL, CACTUS_DOUBLE];

    // Clouds
    const clouds: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * getCols() * 1.5,
        y: 1 + Math.random() * (getRows() * 0.18),
        speed: 0.15 + Math.random() * 0.3,
        template: CLOUDS[Math.floor(Math.random() * CLOUDS.length)]!,
        opacity: 0.25 + Math.random() * 0.15,
      });
    }

    // Floating thoughts
    const thoughts: Thought[] = [];
    let nextThoughtTimer = 60;
    let thoughtIndex = 0;

    function draw() {
      const w = getWidth();
      const h = getHeight();
      const c = getCols();
      const r = getRows();
      const groundY = Math.floor(r * GROUND_Y_RATIO);

      ctx!.clearRect(0, 0, w, h);

      const style = getComputedStyle(canvas!);
      const textColor = style.color || "#a1a1aa";

      ctx!.font = font;
      ctx!.textBaseline = "top";

      // --- Clouds (behind mountains) ---
      for (const cloud of clouds) {
        ctx!.globalAlpha = cloud.opacity;
        ctx!.fillStyle = textColor;
        for (let row = 0; row < cloud.template.length; row++) {
          ctx!.fillText(
            cloud.template[row]!,
            cloud.x * CHAR_W,
            (cloud.y + row) * CHAR_H,
          );
        }
        cloud.x -= cloud.speed * 0.12;
        if (cloud.x * CHAR_W < -200) {
          cloud.x = c + 10 + Math.random() * 20;
          cloud.y = 1 + Math.random() * (r * 0.15);
          cloud.template = CLOUDS[Math.floor(Math.random() * CLOUDS.length)]!;
        }
      }

      // --- Floating community thoughts ---
      nextThoughtTimer--;
      if (nextThoughtTimer <= 0) {
        thoughts.push({
          x: c + 5,
          y: 2 + Math.random() * (groundY * 0.35),
          text: THOUGHTS[thoughtIndex % THOUGHTS.length]!,
          speed: 0.4 + Math.random() * 0.6,
          opacity: 0.18 + Math.random() * 0.12,
        });
        thoughtIndex++;
        nextThoughtTimer = 180 + Math.random() * 200;
      }

      for (let i = thoughts.length - 1; i >= 0; i--) {
        const thought = thoughts[i]!;
        ctx!.globalAlpha = thought.opacity;
        ctx!.fillStyle = textColor;
        ctx!.font = `${CHAR_H - 3}px "Geist Mono", monospace`;
        ctx!.fillText(thought.text, thought.x * CHAR_W, thought.y * CHAR_H);
        thought.x -= thought.speed * 0.3;
        if (thought.x * CHAR_W < -thought.text.length * CHAR_W - 50) {
          thoughts.splice(i, 1);
        }
      }
      ctx!.font = font;

      // --- Static mountain landscape ---
      const landscapeBaseY = groundY - LANDSCAPE_ROWS + 2;

      for (let row = 0; row < LANDSCAPE_ROWS; row++) {
        let line = landscapeLines[row]!;
        // Tile the landscape to always fill the full screen width
        while (line.length < c) {
          line += landscapeLines[row]!;
        }
        const visible = line.substring(0, c);

        // Opacity: dimmer at top (distant peaks), brighter at bottom (foreground forest)
        const alphaBase = 0.12 + (row / LANDSCAPE_ROWS) * 0.38;
        ctx!.globalAlpha = alphaBase;
        ctx!.fillStyle = textColor;
        ctx!.fillText(visible, 0, (landscapeBaseY + row) * CHAR_H);
      }

      // --- Ground line (at base of mountains) ---
      ctx!.globalAlpha = 0.5;
      ctx!.fillStyle = textColor;
      const groundLine = "\u2500".repeat(c);
      ctx!.fillText(groundLine, 0, groundY * CHAR_H);

      // --- Bart is stationary on the right (away from text) ---
      const bartX = Math.floor(c * BART_X_RATIO);

      // --- Obstacles spawn on the left and move right towards Bart ---
      nextObstacleTimer--;
      if (nextObstacleTimer <= 0) {
        const template =
          obstacleTemplates[
            Math.floor(Math.random() * obstacleTemplates.length)
          ]!;
        obstacles.push({
          x: -10,
          template,
          passed: false,
        });
        nextObstacleTimer = 120 + Math.random() * 150;
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i]!;
        obs.x += OBSTACLE_SPEED;

        // Draw if on-screen
        if (obs.x > -10 && obs.x < c + 5) {
          ctx!.globalAlpha = 0.55;
          ctx!.fillStyle = textColor;
          const obsH = obs.template.length;
          for (let row = 0; row < obsH; row++) {
            ctx!.fillText(
              obs.template[row]!,
              obs.x * CHAR_W,
              (groundY - obsH + row) * CHAR_H,
            );
          }
        }

        // Auto-jump: obstacle approaching Bart from the left
        const distToObs = bartX - obs.x;
        if (distToObs > 0 && distToObs < 14 && !isJumping && !obs.passed) {
          isJumping = true;
          bartVelocity = JUMP_FORCE;
        }
        if (obs.x > bartX + 5 && !obs.passed) {
          obs.passed = true;
        }
        // Clean up obstacles that passed off-screen right
        if (obs.x > c + 15) {
          obstacles.splice(i, 1);
        }
      }

      // --- Bart Simpson ---
      if (isJumping) {
        bartVelocity += GRAVITY;
        bartY += bartVelocity;
        if (bartY >= 0) {
          bartY = 0;
          bartVelocity = 0;
          isJumping = false;
        }
      }

      frameCount++;
      if (frameCount % 10 === 0) {
        runFrame = runFrame === 0 ? 1 : 0;
      }

      let bartSprite: string[];
      if (isJumping) {
        bartSprite = BART_JUMP;
      } else if (runFrame === 0) {
        bartSprite = BART_RUN_1;
      } else {
        bartSprite = BART_RUN_2;
      }

      const bartH = bartSprite.length;
      const bartDrawY = groundY - bartH + bartY;

      ctx!.globalAlpha = 0.6;
      ctx!.fillStyle = textColor;
      for (let row = 0; row < bartH; row++) {
        ctx!.fillText(
          bartSprite[row]!,
          bartX * CHAR_W,
          (bartDrawY + row) * CHAR_H,
        );
      }

      // --- Subtle "AIT." watermark ---
      ctx!.globalAlpha = 0.1;
      ctx!.font = `bold ${CHAR_H * 3}px "Geist Mono", monospace`;
      ctx!.fillText(
        "AIT.",
        Math.floor(c * 0.55) * CHAR_W,
        Math.floor(groundY * 0.3) * CHAR_H,
      );
      ctx!.font = font;

      ctx!.globalAlpha = 1;
      animFrameRef.current = requestAnimationFrame(draw);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(canvas);

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full text-foreground"
      aria-hidden="true"
    />
  );
}
