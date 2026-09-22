// WebGL2 helpers.

export type GL = WebGL2RenderingContext;

export function compileProgram(gl: GL, vsSrc: string, fsSrc: string, name = 'program'): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, name + '.vs');
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, name + '.fs');
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function compileShader(gl: GL, type: number, src: string, name: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    throw new Error(`compile ${name}: ${log}\n${lines}`);
  }
  return s;
}

export class Shader {
  readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  constructor(readonly gl: GL, vs: string, fs: string, name = 'shader') {
    this.program = compileProgram(gl, vs, fs, name);
  }
  use(): this {
    this.gl.useProgram(this.program);
    return this;
  }
  u(name: string): WebGLUniformLocation | null {
    let l = this.uniforms.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.uniforms.set(name, l);
    }
    return l;
  }
  mat4(name: string, m: Float32Array): void {
    this.gl.uniformMatrix4fv(this.u(name), false, m);
  }
  vec4(name: string, a: number, b: number, c: number, d: number): void {
    this.gl.uniform4f(this.u(name), a, b, c, d);
  }
  vec3(name: string, a: number, b: number, c: number): void {
    this.gl.uniform3f(this.u(name), a, b, c);
  }
  vec2(name: string, a: number, b: number): void {
    this.gl.uniform2f(this.u(name), a, b);
  }
  f(name: string, v: number): void {
    this.gl.uniform1f(this.u(name), v);
  }
  i(name: string, v: number): void {
    this.gl.uniform1i(this.u(name), v);
  }
}

/** Shared quad index buffer: 0,1,2, 0,2,3 per quad. */
export class QuadIndexBuffer {
  buffer: WebGLBuffer;
  capacity = 0;
  constructor(private readonly gl: GL, quads: number) {
    this.buffer = gl.createBuffer()!;
    this.ensure(quads);
  }
  ensure(quads: number): void {
    if (quads <= this.capacity) return;
    const gl = this.gl;
    const cap = Math.max(quads, this.capacity * 2, 1024);
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v;
      idx[i + 1] = v + 1;
      idx[i + 2] = v + 2;
      idx[i + 3] = v;
      idx[i + 4] = v + 2;
      idx[i + 5] = v + 3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.capacity = cap;
  }
}

export function createTexture(gl: GL, w: number, h: number, data: ArrayBufferView | null, opts: { nearest?: boolean; clamp?: boolean } = {}): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const f = opts.nearest !== false ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  const wrap = opts.clamp !== false ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
