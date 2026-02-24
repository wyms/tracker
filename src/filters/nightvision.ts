export const fragmentShader = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;

  // Pseudo-random number generator based on 2D input
  float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main(void) {
    vec4 color = texture(colorTexture, v_textureCoordinates);

    // Convert to luminance using standard perceptual weights
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Boost the luminance to simulate light amplification
    luminance = clamp(luminance * 1.5, 0.0, 1.0);

    // Apply green phosphor tint
    vec3 nightVision = luminance * vec3(0.1, 1.0, 0.1);

    // Film grain noise using texture coordinates as a pseudo-time seed
    // The variation from v_textureCoordinates ensures spatial noise distribution
    float noise = random(v_textureCoordinates * 500.0 + vec2(
      random(v_textureCoordinates.yx * 123.4),
      random(v_textureCoordinates.xy * 567.8)
    ));
    noise = (noise - 0.5) * 0.15;
    nightVision += vec3(noise);

    // Vignette effect: darken edges
    vec2 center = v_textureCoordinates - vec2(0.5);
    float dist = length(center);
    float vignette = smoothstep(0.8, 0.3, dist);
    nightVision *= vignette;

    out_FragColor = vec4(nightVision, color.a);
  }
`;
