"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "./ThemeProvider";

interface LiquidGlassOrbProps {
  className?: string;
  size?: number;
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function checkWebGLSupport() {
  if (typeof window === "undefined") return true;
  try {
    const testCanvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

export function LiquidGlassOrb({ className = "", size = 180 }: LiquidGlassOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();
  const [hasWebGL, setHasWebGL] = useState(checkWebGLSupport);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion || !hasWebGL) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      requestAnimationFrame(() => setHasWebGL(false));
      return;
    }

    if (!gl) {
      requestAnimationFrame(() => setHasWebGL(false));
      return;
    }

    // Vertex Shader: Fullscreen quad
    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_position + 1.0) * 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Fragment Shader: Liquid Glass Refraction Sphere with caustics and chromatic dispersion
    const fsSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_isDark;
      varying vec2 v_uv;

      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
        
        // Gentle organic distortion
        float d = length(p);
        if (d > 0.98) {
          gl_FragColor = vec4(0.0);
          return;
        }

        // 3D sphere normal calculation
        float z = sqrt(max(0.0, 1.0 - d * d));
        vec3 normal = vec3(p.x, p.y, z);

        // Interactive light vector
        vec3 lightDir = normalize(vec3(u_mouse.x * 0.4 + 0.3, -u_mouse.y * 0.4 + 0.6, 0.8));

        // Liquid displacement wave
        float wave = sin(p.x * 4.0 + u_time * 1.2) * cos(p.y * 4.0 + u_time * 1.0) * 0.08;
        normal = normalize(normal + vec3(wave, -wave, 0.0));

        // Specular reflection (liquid glass sheen)
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);

        // Fresnel edge glow (thin-film liquid glass refraction)
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.8);

        // Ambient theme-sensitive emerald tint
        vec3 baseEmerald = u_isDark > 0.5 
          ? vec3(0.06, 0.87, 0.64)  // Vibrant Mint #10b981 / #4edea3
          : vec3(0.02, 0.59, 0.41); // Deep Emerald #059669

        vec3 ambientCore = u_isDark > 0.5
          ? vec3(0.04, 0.08, 0.12)
          : vec3(0.95, 0.98, 0.96);

        // Liquid caustic dispersion (chromatic split)
        float dispersionR = sin(d * 8.0 - u_time * 1.5) * 0.05;
        float dispersionB = cos(d * 8.0 - u_time * 1.5) * 0.05;

        vec3 color = ambientCore + baseEmerald * (fresnel * 0.85 + dispersionR);
        color += vec3(1.0, 1.0, 1.0) * spec * 0.75;
        color.b += dispersionB * 0.4;

        // Smooth glass alpha falloff at rim
        float alpha = smoothstep(0.98, 0.92, d) * (0.65 + fresnel * 0.35);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
      setHasWebGL(false);
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setHasWebGL(false);
      return;
    }

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(program, "a_position");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uIsDark = gl.getUniformLocation(program, "u_isDark");

    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let cachedRect: DOMRect | null = null;
    let lastRectTime = 0;

    const handlePointerMove = (e: MouseEvent) => {
      const now = performance.now();
      if (!cachedRect || now - lastRectTime > 1000) {
        cachedRect = canvas.getBoundingClientRect();
        lastRectTime = now;
      }
      const width = cachedRect.width || size;
      const height = cachedRect.height || size;
      const x = (e.clientX - cachedRect.left) / width - 0.5;
      const y = (e.clientY - cachedRect.top) / height - 0.5;
      targetMouseX = x * 2;
      targetMouseY = y * 2;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    let animationId = 0;
    let isVisible = true;
    let isTabVisible = typeof document !== "undefined" ? !document.hidden : true;
    const startTime = performance.now();

    function render() {
      if (!gl || !canvas || !isVisible || !isTabVisible) {
        animationId = 0;
        return;
      }

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.08;
      mouseY += (targetMouseY - mouseY) * 0.08;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const displayWidth = Math.floor(canvas.clientWidth * dpr);
      const displayHeight = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      }

      gl.useProgram(program);
      gl.enableVertexAttribArray(posAttr);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      const elapsed = (performance.now() - startTime) * 0.001;
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.uniform1f(uIsDark, resolvedTheme === "dark" ? 1.0 : 0.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationId = requestAnimationFrame(render);
    }

    // Efficient viewport & tab visibility observers to pause RAF loop when offscreen
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible && isTabVisible && !animationId) {
          animationId = requestAnimationFrame(render);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isVisible && isTabVisible && !animationId) {
        animationId = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    animationId = requestAnimationFrame(render);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointermove", handlePointerMove);
      if (gl) {
        gl.deleteBuffer(posBuffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, [hasWebGL, reducedMotion, resolvedTheme, size]);

  // Fallback CSS/SVG Liquid Glass sphere if WebGL is unavailable or reduced motion is on
  if (!hasWebGL || reducedMotion) {
    return (
      <div
        className={`relative rounded-full pointer-events-none select-none ${className}`}
        style={{ width: size, height: size }}
      >
        <div
          className={`absolute inset-0 rounded-full transition-all duration-500 ${
            resolvedTheme === "dark"
              ? "bg-gradient-to-br from-emerald-400/25 via-emerald-500/10 to-transparent border border-emerald-400/30 shadow-[0_0_40px_rgba(78,222,163,0.25),inset_0_2px_4px_rgba(255,255,255,0.4)]"
              : "bg-gradient-to-br from-emerald-500/20 via-white/40 to-emerald-600/10 border border-emerald-600/25 shadow-[0_12px_32px_rgba(5,150,105,0.15),inset_0_2px_4px_rgba(255,255,255,0.9)]"
          } backdrop-blur-xl animate-float-slow`}
        />
        <div className="absolute top-3 left-4 w-10 h-6 rounded-full bg-white/40 blur-xs -rotate-25" />
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-full pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-full transition-opacity duration-500"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
