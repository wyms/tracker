export const fragmentShader = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;

  // Barrel distortion function
  vec2 barrelDistort(vec2 uv) {
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    float distortion = 1.0 + r2 * 0.15 + r2 * r2 * 0.05;
    return centered * distortion + 0.5;
  }

  void main(void) {
    // Apply barrel distortion to UV coordinates
    vec2 distortedUV = barrelDistort(v_textureCoordinates);

    // Discard fragments outside the valid texture range (barrel distortion can push UVs out)
    if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
      out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Chromatic aberration: offset R and B channels slightly
    float aberrationAmount = 0.003;
    vec2 rOffset = vec2(aberrationAmount, 0.0);
    vec2 bOffset = vec2(-aberrationAmount, 0.0);

    float r = texture(colorTexture, distortedUV + rOffset).r;
    float g = texture(colorTexture, distortedUV).g;
    float b = texture(colorTexture, distortedUV + bOffset).b;
    float a = texture(colorTexture, distortedUV).a;

    vec3 color = vec3(r, g, b);

    // Scanline effect: darken every other row
    float scanline = 1.0 - 0.25 * step(0.5, mod(gl_FragCoord.y, 2.0));
    color *= scanline;

    // Subtle vignette
    vec2 center = v_textureCoordinates - 0.5;
    float dist = length(center);
    float vignette = smoothstep(0.75, 0.35, dist);
    color *= vignette;

    out_FragColor = vec4(color, a);
  }
`;
