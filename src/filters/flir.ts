export const fragmentShader = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;

  void main(void) {
    vec4 color = texture(colorTexture, v_textureCoordinates);

    // Convert to luminance using standard perceptual weights
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Thermal colormap: black -> purple -> red -> orange -> yellow -> white
    vec3 thermal;

    // Black to purple (0.0 - 0.2)
    vec3 black = vec3(0.0, 0.0, 0.0);
    vec3 purple = vec3(0.5, 0.0, 0.8);
    // Purple to red (0.2 - 0.4)
    vec3 red = vec3(1.0, 0.0, 0.0);
    // Red to orange (0.4 - 0.6)
    vec3 orange = vec3(1.0, 0.5, 0.0);
    // Orange to yellow (0.6 - 0.8)
    vec3 yellow = vec3(1.0, 1.0, 0.0);
    // Yellow to white (0.8 - 1.0)
    vec3 white = vec3(1.0, 1.0, 1.0);

    float t;

    if (luminance < 0.2) {
      t = smoothstep(0.0, 0.2, luminance);
      thermal = mix(black, purple, t);
    } else if (luminance < 0.4) {
      t = smoothstep(0.2, 0.4, luminance);
      thermal = mix(purple, red, t);
    } else if (luminance < 0.6) {
      t = smoothstep(0.4, 0.6, luminance);
      thermal = mix(red, orange, t);
    } else if (luminance < 0.8) {
      t = smoothstep(0.6, 0.8, luminance);
      thermal = mix(orange, yellow, t);
    } else {
      t = smoothstep(0.8, 1.0, luminance);
      thermal = mix(yellow, white, t);
    }

    out_FragColor = vec4(thermal, color.a);
  }
`;
