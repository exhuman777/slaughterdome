import * as THREE from 'https://esm.sh/three@0.162.0';

// Custom color grading + vignette + scanline shader
export const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignetteIntensity: { value: 0.1 },
    contrast: { value: 1.03 },
    warmth: { value: 0.01 },
    scanlineOpacity: { value: 0.015 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteIntensity;
    uniform float contrast;
    uniform float warmth;
    uniform float scanlineOpacity;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Contrast boost
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;

      // Warm amber tint
      color.r += warmth;
      color.g += warmth * 0.4;

      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = 1.0 - smoothstep(0.3, 0.85, dist) * vignetteIntensity;
      color.rgb *= vignette;

      // Faint scanlines
      float scanline = sin(vUv.y * 800.0 + time * 0.5) * 0.5 + 0.5;
      color.rgb -= scanline * scanlineOpacity;

      color.rgb = clamp(color.rgb, 0.0, 1.0);
      gl_FragColor = color;
    }
  `,
};
