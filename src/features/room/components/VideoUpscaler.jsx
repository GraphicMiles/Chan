import { useEffect, useRef } from 'react'

/**
 * WebGL-based perceptual upscaler / sharpener overlay for direct video streams.
 *
 * True neural 8K re-encoding is not possible in the browser. This component
 * performs real-time GPU sharpening + local contrast enhancement on the already
 * decoded video frames, which gives a "super definition" look for direct links.
 *
 * It is intentionally disabled for YouTube (cross-origin iframe) and only
 * activates for same-origin / CORS-friendly video elements (proxied direct links).
 */

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform vec2 u_textureSize;
  uniform float u_sharpenAmount;
  uniform float u_contrast;
  uniform float u_saturation;

  void main() {
    vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;

    // Center sample
    vec4 color = texture2D(u_image, v_texCoord);

    // 3x3 unsharp mask approximation
    vec4 left  = texture2D(u_image, v_texCoord + vec2(-onePixel.x, 0.0));
    vec4 right = texture2D(u_image, v_texCoord + vec2(onePixel.x, 0.0));
    vec4 up    = texture2D(u_image, v_texCoord + vec2(0.0, -onePixel.y));
    vec4 down  = texture2D(u_image, v_texCoord + vec2(0.0, onePixel.y));

    vec4 blurred = (left + right + up + down) * 0.25;
    vec4 sharpened = color + (color - blurred) * u_sharpenAmount;

    // Contrast
    vec4 contrasted = (sharpened - 0.5) * u_contrast + 0.5;

    // Saturation
    float luminance = dot(contrasted.rgb, vec3(0.299, 0.587, 0.114));
    vec4 saturated = vec4(mix(vec3(luminance), contrasted.rgb, u_saturation), contrasted.a);

    gl_FragColor = clamp(saturated, 0.0, 1.0);
  }
`

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

export function VideoUpscaler({ videoElement, enabled, mode }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const glRef = useRef(null)
  const programRef = useRef(null)
  const textureRef = useRef(null)
  const failedRef = useRef(false)

  useEffect(() => {
    if (!enabled || mode === 'off' || !videoElement || failedRef.current) {
      return
    }

    const video = videoElement
    // Only works with HTMLVideoElement, not YouTube iframe
    if (!(video instanceof HTMLVideoElement)) return

    const canvas = canvasRef.current
    if (!canvas) return

    let gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) {
      gl = canvas.getContext('experimental-webgl')
    }
    if (!gl) {
      failedRef.current = true
      return
    }
    glRef.current = gl

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertexShader || !fragmentShader) {
      failedRef.current = true
      return
    }

    const program = createProgram(gl, vertexShader, fragmentShader)
    if (!program) {
      failedRef.current = true
      return
    }
    programRef.current = program

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]), gl.STATIC_DRAW)

    const texCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0,
    ]), gl.STATIC_DRAW)

    const texture = gl.createTexture()
    textureRef.current = texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const render = () => {
      if (!canvasRef.current || !videoElement || !enabled || mode === 'off') return

      const v = videoElement
      const c = canvasRef.current
      const parent = c.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.floor(rect.width * dpr)
      c.height = Math.floor(rect.height * dpr)
      c.style.width = `${rect.width}px`
      c.style.height = `${rect.height}px`

      gl.viewport(0, 0, c.width, c.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.useProgram(program)

      // Position attribute
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

      // TexCoord attribute
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
      gl.enableVertexAttribArray(texCoordLocation)
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

      // Update texture from video
      try {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v)
      } catch (err) {
        // CORS tainted — disable
        failedRef.current = true
        return
      }

      // Uniforms
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
      gl.uniform2f(gl.getUniformLocation(program, 'u_textureSize'), v.videoWidth || c.width, v.videoHeight || c.height)
      gl.uniform1f(gl.getUniformLocation(program, 'u_sharpenAmount'), mode === '120fps' ? 1.4 : 1.1)
      gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), mode === '120fps' ? 1.25 : 1.12)
      gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), mode === '120fps' ? 1.35 : 1.18)

      gl.drawArrays(gl.TRIANGLES, 0, 6)

      rafRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      try {
        gl.deleteProgram(program)
        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)
        gl.deleteTexture(texture)
        gl.deleteBuffer(positionBuffer)
        gl.deleteBuffer(texCoordBuffer)
      } catch {
        /* ignore */
      }
    }
  }, [enabled, mode, videoElement])

  if (!enabled || mode === 'off' || failedRef.current) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 12,
      }}
    />
  )
}
