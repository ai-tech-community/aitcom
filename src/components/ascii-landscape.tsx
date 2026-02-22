"use client";

import { useEffect, useRef } from "react";

// Dino running frames
const DINO_RUN_1 = [
  "            ____ ",
  "           / .  \\",
  "      ____/  o  |",
  "     /    \\__/\\_/",
  "    |  /\\       ",
  "    | /  \\      ",
  " ___/    |      ",
  "|   |____|      ",
  "|__/   \\        ",
  "       |_)      ",
];

const DINO_RUN_2 = [
  "            ____ ",
  "           / .  \\",
  "      ____/  o  |",
  "     /    \\__/\\_/",
  "    |  /\\       ",
  "    | /  \\      ",
  " ___/    |      ",
  "|   |____|      ",
  "|__/    \\       ",
  "        (_|     ",
];

const DINO_JUMP = [
  "            ____ ",
  "           / ^  \\",
  "      ____/  o  |",
  "     /    \\__/\\_/",
  "    |  /\\       ",
  "    | /  \\      ",
  " ___/    |      ",
  "|   |____|      ",
  "|__/  \\ \\       ",
  "       \\_\\      ",
];

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

// Community thoughts that float by
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

export function AsciiLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CHAR_W = 7.5;
    const CHAR_H = 13;

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
    const getCols = () => Math.floor(getWidth() / CHAR_W);
    const getRows = () => Math.floor(getHeight() / CHAR_H);

    // Dino state
    let dinoY = 0; // offset from ground (0 = on ground)
    let dinoVelocity = 0;
    let isJumping = false;
    let runFrame = 0;
    let frameCount = 0;
    const GRAVITY = 0.4;
    const JUMP_FORCE = -6.5;
    const GROUND_Y_RATIO = 0.78;

    // Obstacles
    const obstacles: Obstacle[] = [];
    let nextObstacleTimer = 120;
    const OBSTACLE_SPEED = 1.8;
    const obstacleTemplates = [CACTUS_SMALL, CACTUS_TALL, CACTUS_DOUBLE];

    // Clouds
    const clouds: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * getCols() * 1.5,
        y: 2 + Math.random() * (getRows() * 0.3),
        speed: 0.15 + Math.random() * 0.3,
        template: CLOUDS[Math.floor(Math.random() * CLOUDS.length)]!,
        opacity: 0.35 + Math.random() * 0.2,
      });
    }

    // Floating thoughts
    const thoughts: Thought[] = [];
    let nextThoughtTimer = 60;
    let thoughtIndex = 0;

    // Ground pattern that scrolls
    let groundOffset = 0;

    function generateGroundLine(colCount: number, offset: number): string {
      const chars = "_.~-._~-.=._~-._.~-=._";
      let line = "";
      for (let x = 0; x < colCount; x++) {
        const idx = (x + Math.floor(offset)) % chars.length;
        line += chars[idx];
      }
      return line;
    }

    function generateSubGround(colCount: number, row: number, offset: number): string {
      let line = "";
      for (let x = 0; x < colCount; x++) {
        const seed = (x + Math.floor(offset * 0.5) + row * 7) % 17;
        if (seed < 3) line += ".";
        else if (seed < 5) line += ":";
        else if (seed < 7) line += ";";
        else if (seed < 9) line += ",";
        else if (seed < 11) line += "'";
        else line += " ";
      }
      return line;
    }

    function draw() {
      const w = getWidth();
      const h = getHeight();
      const c = getCols();
      const r = getRows();
      const groundY = Math.floor(r * GROUND_Y_RATIO);

      ctx!.clearRect(0, 0, w, h);

      const style = getComputedStyle(canvas!);
      const textColor = style.color || "#a1a1aa";
      const font = `${CHAR_H - 2}px "Geist Mono", "SF Mono", "Monaco", "Inconsolata", "Fira Mono", monospace`;

      ctx!.font = font;
      ctx!.textBaseline = "top";

      // --- Clouds ---
      for (const cloud of clouds) {
        ctx!.globalAlpha = cloud.opacity;
        ctx!.fillStyle = textColor;
        for (let row = 0; row < cloud.template.length; row++) {
          ctx!.fillText(cloud.template[row]!, cloud.x * CHAR_W, (cloud.y + row) * CHAR_H);
        }
        cloud.x -= cloud.speed * 0.15;
        if (cloud.x * CHAR_W < -200) {
          cloud.x = c + 10 + Math.random() * 20;
          cloud.y = 2 + Math.random() * (r * 0.25);
          cloud.template = CLOUDS[Math.floor(Math.random() * CLOUDS.length)]!;
        }
      }

      // --- Floating community thoughts ---
      nextThoughtTimer--;
      if (nextThoughtTimer <= 0) {
        thoughts.push({
          x: c + 5,
          y: 3 + Math.random() * (groundY * 0.5),
          text: THOUGHTS[thoughtIndex % THOUGHTS.length]!,
          speed: 0.4 + Math.random() * 0.6,
          opacity: 0.25 + Math.random() * 0.15,
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

      // --- Ground line ---
      groundOffset += OBSTACLE_SPEED * 0.35;
      ctx!.globalAlpha = 0.5;
      ctx!.fillStyle = textColor;

      // Main ground line
      const groundLine = "\u2500".repeat(c);
      ctx!.fillText(groundLine, 0, groundY * CHAR_H);

      // Scrolling ground detail
      ctx!.globalAlpha = 0.35;
      const surfaceLine = generateGroundLine(c, groundOffset);
      ctx!.fillText(surfaceLine, 0, (groundY + 1) * CHAR_H);

      // Sub-ground layers
      ctx!.globalAlpha = 0.25;
      for (let row = 0; row < 5; row++) {
        const subLine = generateSubGround(c, row, groundOffset);
        ctx!.fillText(subLine, 0, (groundY + 2 + row) * CHAR_H);
      }

      // --- Obstacles ---
      nextObstacleTimer--;
      if (nextObstacleTimer <= 0) {
        const template = obstacleTemplates[Math.floor(Math.random() * obstacleTemplates.length)]!;
        obstacles.push({
          x: c + 5,
          template,
          passed: false,
        });
        nextObstacleTimer = 100 + Math.random() * 180;
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i]!;
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
        obs.x -= OBSTACLE_SPEED * 0.35;

        // Auto-jump: dino detects upcoming obstacle
        const dinoX = 12;
        const distToObs = obs.x - dinoX;
        if (distToObs > 0 && distToObs < 18 && !isJumping && !obs.passed) {
          isJumping = true;
          dinoVelocity = JUMP_FORCE;
        }
        if (obs.x < dinoX && !obs.passed) {
          obs.passed = true;
        }

        if (obs.x < -15) {
          obstacles.splice(i, 1);
        }
      }

      // --- Dino ---
      if (isJumping) {
        dinoVelocity += GRAVITY;
        dinoY += dinoVelocity;
        if (dinoY >= 0) {
          dinoY = 0;
          dinoVelocity = 0;
          isJumping = false;
        }
      }

      frameCount++;
      if (frameCount % 8 === 0) {
        runFrame = runFrame === 0 ? 1 : 0;
      }

      let dinoSprite: string[];
      if (isJumping) {
        dinoSprite = DINO_JUMP;
      } else if (runFrame === 0) {
        dinoSprite = DINO_RUN_1;
      } else {
        dinoSprite = DINO_RUN_2;
      }

      const dinoDrawX = 12;
      const dinoH = dinoSprite.length;
      const dinoDrawY = groundY - dinoH + dinoY;

      ctx!.globalAlpha = 0.6;
      ctx!.fillStyle = textColor;
      for (let row = 0; row < dinoH; row++) {
        ctx!.fillText(
          dinoSprite[row]!,
          dinoDrawX * CHAR_W,
          (dinoDrawY + row) * CHAR_H,
        );
      }

      // --- Subtle "AIT." watermark near dino ---
      ctx!.globalAlpha = 0.14;
      ctx!.font = `bold ${CHAR_H * 3}px "Geist Mono", monospace`;
      ctx!.fillText("AIT.", Math.floor(c * 0.6) * CHAR_W, Math.floor(groundY * 0.45) * CHAR_H);
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
